import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database.generated';
import { localDockerSupabase } from '../helpers/local-supabase';
import { createColorFavorites } from '../../src/features/color-combinations/favorites';
import { outfitColors, pairKey } from '../../src/features/color-combinations/finder';

const config = localDockerSupabase(); const connection = { url: config.API_URL, key: config.ANON_KEY };
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, db: { retry: false } } as const;
const admin = createClient<Database>(config.API_URL, config.SERVICE_ROLE_KEY, options);
const accounts: { id: string; email: string; password: string; client: ReturnType<typeof createClient<Database>> }[] = [];
const signal = () => new AbortController().signal;
const service = (index = 0, transport?: typeof fetch) => createColorFavorites(accounts[index]!.client, accounts[index]!.id, connection, transport);
const pair = { top: 'sage', bottom: 'white' } as const;
beforeAll(async () => {
  for (let index = 0; index < 2; index++) {
    const email = `color-favorites-${randomUUID()}@example.test`; const password = `${randomUUID()}Aa!9`;
    const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (result.error) throw result.error;
    const client = createClient<Database>(connection.url, connection.key, options);
    accounts.push({ id: result.data.user.id, email, password, client });
    if ((await client.auth.signInWithPassword({ email, password })).error) throw new Error('Fixture login failed');
  }
});
afterAll(async () => { for (const account of accounts) if ((await admin.auth.admin.deleteUser(account.id)).error) throw new Error('Fixture cleanup failed'); });

describe('account color favorites on actual local Supabase', () => {
  it('persists oriented pairs, allows idempotent retries and restores in a fresh login', async () => {
    await service().set(pair, true, signal()); await service().set(pair, true, signal());
    await service().set({ top: 'white', bottom: 'sage' }, true, signal());
    const fresh = createClient<Database>(connection.url, connection.key, options); const account = accounts[0]!;
    expect((await fresh.auth.signInWithPassword({ email: account.email, password: account.password })).error).toBeNull();
    const values = await createColorFavorites(fresh, account.id, connection).list(signal());
    expect(values).toHaveLength(2); expect(values).toContainEqual(pair); expect(values).toContainEqual({ top: 'white', bottom: 'sage' });
    await fresh.auth.signOut({ scope: 'local' });
    await service().set(pair, false, signal()); await service().set(pair, false, signal());
    expect(await service().list(signal())).toEqual([{ top: 'white', bottom: 'sage' }]);
  });
  it('isolates members and denies anonymous access, foreign insert, update and forged timestamps', async () => {
    const a = accounts[0]!; const b = accounts[1]!;
    await service(1).set(pair, true, signal());
    expect((await a.client.from('color_pair_favorites').select().eq('user_id', b.id)).data).toEqual([]);
    expect((await a.client.from('color_pair_favorites').delete().eq('user_id', b.id).select()).data).toEqual([]);
    expect((await a.client.from('color_pair_favorites').insert({ user_id: b.id, top_color: 'black', bottom_color: 'white' })).error?.code).toBe('42501');
    expect((await a.client.from('color_pair_favorites').update({ user_id: b.id }).eq('user_id', a.id)).error?.code).toBe('42501');
    expect((await a.client.from('color_pair_favorites').insert({ user_id: a.id, top_color: 'black', bottom_color: 'white', created_at: new Date().toISOString() })).error?.code).toBe('42501');
    const anon = createClient<Database>(connection.url, connection.key, options);
    expect((await anon.from('color_pair_favorites').select()).error?.code).toBe('42501');
    expect((await anon.from('color_pair_favorites').insert({ user_id: a.id, top_color: 'white', bottom_color: 'black' })).error?.code).toBe('42501');
    expect((await anon.from('color_pair_favorites').delete().eq('user_id', a.id)).error?.code).toBe('42501');
    expect((await a.client.from('color_pair_favorites').insert({ user_id: a.id, top_color: 'unknown', bottom_color: 'white' })).error?.code).toBe('23514');
    expect(await service(1).list(signal())).toEqual([pair]);
  });
  it('pins a write to its original token and rejects wrong owner and cancellation', async () => {
    const a = accounts[0]!; const b = accounts[1]!;
    const initial = (await a.client.auth.getSession()).data.session!; const other = (await b.client.auth.getSession()).data.session!;
    let switched = false;
    const transport: typeof fetch = async (url, init) => { if (!switched) { switched = true; await a.client.auth.setSession(other); } return fetch(url, init); };
    try {
      await service(0, transport).set({ top: 'navy', bottom: 'sand' }, true, signal());
      expect(await service(1).list(signal())).toEqual([pair]);
      await expect(service().list(signal())).rejects.toThrow('session_changed');
    } finally { await a.client.auth.setSession(initial); }
    await expect(createColorFavorites(a.client, b.id, connection).set(pair, false, signal())).rejects.toThrow('session_changed');
    await expect(service().set(pair, true, AbortSignal.abort())).rejects.toThrow('session_changed');
  });
  it('reconciles committed writes after response loss and safely retries them', async () => {
    const lost: typeof fetch = async (url, init) => { const result = await fetch(url, init); if (result.ok) throw new TypeError('response lost'); return result; };
    await expect(service(0, lost).set(pair, true, signal())).rejects.toThrow();
    expect(await service().list(signal())).toContainEqual(pair);
    await service().set(pair, true, signal());
    expect((await service().list(signal())).filter((entry) => entry.top === pair.top && entry.bottom === pair.bottom)).toHaveLength(1);
    await expect(service(0, lost).set(pair, false, signal())).rejects.toThrow();
    expect(await service().list(signal())).not.toContainEqual(pair);
    await service().set(pair, false, signal());
  });
  it('loads every owned favorite across server pages without mixing another member', async () => {
    const before = await service().list(signal()); const existing = new Set(before.map(pairKey));
    const rows = outfitColors.flatMap((top) => outfitColors.map((bottom) => ({ user_id: accounts[0]!.id, top_color: top.id, bottom_color: bottom.id })))
      .filter((row) => !existing.has(pairKey({ top: row.top_color, bottom: row.bottom_color }))).slice(0, 201);
    expect((await accounts[0]!.client.from('color_pair_favorites').insert(rows)).error).toBeNull();
    const values = await service().list(signal());
    expect(values).toHaveLength(before.length + rows.length);
    expect(new Set(values.map(pairKey)).size).toBe(values.length);
    expect(await service(1).list(signal())).toEqual([pair]);
  });
});
