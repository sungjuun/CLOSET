import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database.generated';
import { localSupabaseSettings } from '../../scripts/local-supabase.mjs';
import { createThemeService } from '../../src/features/settings/service';
import { createThemeController } from '../../src/features/settings/controller';
import { createSettingsStore } from '../../src/features/settings/store';

const settings = localSupabaseSettings();
const connection = { url: settings.url, key: settings.anonKey };
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, db: { retry: false } } as const;
const admin = createClient<Database>(settings.url, settings.serviceKey, options);
const accounts: { id: string; email: string; password: string; client: ReturnType<typeof createClient<Database>> }[] = [];
const signal = () => new AbortController().signal;
const service = (index = 0, transport?: typeof fetch) => createThemeService(accounts[index]!.client, accounts[index]!.id, connection, transport);
beforeAll(async () => {
  for (let i = 0; i < 2; i++) {
    const email = `closet-settings-${randomUUID()}@example.test`; const password = `${randomUUID()}aA!9`;
    const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (result.error || !result.data.user) throw new Error('Settings fixture setup failed');
    const client = createClient<Database>(settings.url, settings.anonKey, options);
    accounts.push({ id: result.data.user.id, email, password, client });
    if ((await client.auth.signInWithPassword({ email, password })).error) throw new Error('Settings fixture login failed');
  }
});
afterAll(async () => { for (const account of accounts) if ((await admin.auth.admin.deleteUser(account.id)).error) throw new Error('Settings fixture cleanup failed'); });

describe('persistent account themes on actual local Supabase', () => {
  it('persists all supported colors and restores them in a fresh login without changing profile fields', async () => {
    const account = accounts[0]!;
    expect((await account.client.from('profiles').update({ display_name: '테마 테스트' }).eq('id', account.id)).error).toBeNull();
    for (const theme of ['white', 'beige', 'brown'] as const) expect(await service().save(theme, signal())).toBe(theme);
    const freshClient = createClient<Database>(settings.url, settings.anonKey, options);
    if ((await freshClient.auth.signInWithPassword({ email: account.email, password: account.password })).error) throw new Error('Fresh login failed');
    const store = createSettingsStore(); store.getState().scope(account.id);
    const controller = createThemeController(account.id, createThemeService(freshClient, account.id, connection), store);
    await controller.load(); expect(store.getState()).toMatchObject({ theme: 'brown', status: 'ready' });
    controller.dispose();
    expect((await account.client.from('profiles').select('display_name,default_currency').eq('id', account.id).single()).data).toEqual({ display_name: '테마 테스트', default_currency: 'KRW' });
    await freshClient.auth.signOut({ scope: 'local' });
  });
  it('separates members, denies foreign changes and rejects unsupported colors', async () => {
    const a = accounts[0]!; const b = accounts[1]!;
    await service(1).save('beige', signal());
    expect(await service().load(signal())).toBe('brown');
    expect((await a.client.from('profiles').update({ theme: 'white' }).eq('id', b.id).select('id')).data).toEqual([]);
    expect(await service(1).load(signal())).toBe('beige');
    expect((await a.client.from('profiles').update({ theme: 'unsupported' }).eq('id', a.id)).error?.code).toBe('23514');
    const anon = createClient<Database>(settings.url, settings.anonKey, options);
    expect((await anon.from('profiles').select()).error?.code).toBe('42501');
    await expect(createThemeService(a.client, b.id, connection).save('white', signal())).rejects.toThrow('session_changed');
  });
  it('pins the initial identity even when the shared auth session changes during a save', async () => {
    const a = accounts[0]!; const b = accounts[1]!;
    const original = (await a.client.auth.getSession()).data.session!; const other = (await b.client.auth.getSession()).data.session!;
    let switched = false;
    const transport: typeof fetch = async (url, init) => {
      if (!switched) { switched = true; await a.client.auth.setSession({ access_token: other.access_token, refresh_token: other.refresh_token }); }
      return fetch(url, init);
    };
    try {
      expect(await service(0, transport).save('white', signal())).toBe('white');
      expect(await service(1).load(signal())).toBe('beige');
      await expect(service().load(signal())).rejects.toThrow('session_changed');
    } finally { await a.client.auth.setSession({ access_token: original.access_token, refresh_token: original.refresh_token }); }
  });
  it('reconciles a committed save after response loss and rejects a pre-cancelled write', async () => {
    const transport: typeof fetch = async (url, init) => { const response = await fetch(url, init); if (response.ok) throw new TypeError('response lost'); return response; };
    await expect(service(0, transport).save('brown', signal())).rejects.toBeTruthy();
    expect(await service().load(signal())).toBe('brown');
    const controller = new AbortController(); controller.abort();
    await expect(service().save('white', controller.signal)).rejects.toThrow('session_changed');
    expect(await service().load(signal())).toBe('brown');
  });
});
