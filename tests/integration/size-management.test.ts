import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bodyDraft, parseBodyDraft, prioritizeBrand } from '../../src/features/sizes/model';
import { createSizeService } from '../../src/features/sizes/service';
import type { Database } from '../../src/types/database.generated';
import { localDockerSupabase } from '../helpers/local-supabase';

const config = localDockerSupabase();
const connection = { url: config.API_URL, key: config.ANON_KEY };
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, db: { retry: false } } as const;
const admin = createClient<Database>(connection.url, config.SERVICE_ROLE_KEY, options);
const accounts: { id: string; client: ReturnType<typeof createClient<Database>> }[] = [];
const signal = () => new AbortController().signal;
const brand = { brand_name: '유니클로', garment_type: '티셔츠', size_label: 'M', fit_note: '여유 있음' };

function service(index = 0, fetcher?: typeof fetch) {
  const { id, client } = accounts[index]!;
  return createSizeService(client, id, connection, fetcher);
}

beforeAll(async () => {
  for (let index = 0; index < 2; index++) {
    const email = `sizes-${randomUUID()}@example.test`;
    const password = `${randomUUID()}Aa!9`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    const client = createClient<Database>(connection.url, connection.key, options);
    accounts.push({ id: created.data.user.id, client });
    const login = await client.auth.signInWithPassword({ email, password });
    if (login.error) throw login.error;
  }
});

afterAll(async () => {
  for (const account of accounts) {
    const result = await admin.auth.admin.deleteUser(account.id);
    if (result.error) throw result.error;
  }
});

describe('member size management', () => {
  it('persists optional measurements and protects a newer edit from stale writes', async () => {
    const sizes = service();
    expect((await sizes.load(signal())).body).toBeNull();
    const values = parseBodyDraft({ ...bodyDraft(null), height_cm: '174,5', foot_length_mm: '265' });
    await sizes.save({ kind: 'body', base: null, values }, signal());
    const original = (await sizes.load(signal())).body!;
    expect(original).toMatchObject({ height_cm: 174.5, foot_length_mm: 265, chest_cm: null, revision: 1 });
    const grouped = parseBodyDraft({ ...bodyDraft(original), waist_cm: '78', foot_length_mm: '', outerwear_length_cm: '75,5', top_length_cm: '66', bottom_length_cm: '103', bottom_rise_cm: '28.5' });
    await sizes.save({ kind: 'body', base: original, values: grouped }, signal());
    await expect(sizes.save({ kind: 'body', base: original, values }, signal())).rejects.toMatchObject({ code: 'size_conflict' });
    expect((await sizes.load(signal())).body).toMatchObject({ height_cm: 174.5, waist_cm: 78, foot_length_mm: null, outerwear_length_cm: 75.5, top_length_cm: 66, bottom_length_cm: 103, bottom_rise_cm: 28.5, bottom_hem_width_cm: null, revision: 2 });
    const legacyEdit = await accounts[0]!.client.from('member_body_measurements').update({ height_cm: 175 }).eq('user_id', original.user_id).select().single();
    expect(legacyEdit.error).toBeNull();
    expect(legacyEdit.data).toMatchObject({ height_cm: 175, outerwear_length_cm: 75.5, top_length_cm: 66, revision: 3 });
    expect(() => parseBodyDraft({ ...bodyDraft(original), foot_length_mm: '265.5' })).toThrow('정수');
    expect(() => parseBodyDraft({ ...bodyDraft(original), outerwear_sleeve_length_cm: '61.25' })).toThrow('아우터의 소매길이');
    expect((await accounts[0]!.client.from('member_body_measurements').update({ bottom_hem_width_cm: 18.12 }).eq('user_id', original.user_id)).error?.code).toBe('23514');
  });

  it('adds, edits and deletes an owned size record, with the chosen brand listed first', async () => {
    const sizes = service();
    const id = randomUUID();
    const secondId = randomUUID();
    await sizes.save({ kind: 'brand', id, base: null, values: brand }, signal());
    await sizes.save({ kind: 'brand', id: secondId, base: null, values: { brand_name: 'NIKE', garment_type: '운동화', size_label: '270', fit_note: '' } }, signal());
    const records = (await sizes.load(signal())).brands;
    expect(prioritizeBrand(records, ' nike ')[0]).toMatchObject({ id: secondId, fit_note: null });
    const original = records.find((record) => record.id === id)!;
    await sizes.save({ kind: 'brand', id, base: original, values: { ...brand, size_label: 'L' } }, signal());
    await expect(sizes.save({ kind: 'remove', base: original }, signal())).rejects.toMatchObject({ code: 'size_conflict' });
    const latest = (await sizes.load(signal())).brands.find((record) => record.id === id)!;
    expect(latest).toMatchObject({ size_label: 'L', revision: 2 });
    await sizes.save({ kind: 'remove', base: latest }, signal());
    expect((await sizes.load(signal())).brands.map((record) => record.id)).toEqual([secondId]);
  });

  it('keeps both tables private and rejects forged ownership or revision fields', async () => {
    const a = accounts[0]!;
    const b = accounts[1]!;
    const id = randomUUID();
    await service(1).save({ kind: 'body', base: null, values: parseBodyDraft({ ...bodyDraft(null), waist_cm: '82' }) }, signal());
    await service(1).save({ kind: 'brand', id, base: null, values: brand }, signal());
    expect((await a.client.from('member_body_measurements').select().eq('user_id', b.id)).data).toEqual([]);
    expect((await a.client.from('member_brand_sizes').delete().eq('id', id).select()).data).toEqual([]);
    expect((await a.client.from('member_brand_sizes').insert({ ...brand, id: randomUUID(), user_id: b.id })).error?.code).toBe('42501');
    expect((await a.client.from('member_body_measurements').update({ revision: 100 }).eq('user_id', a.id)).error?.code).toBe('42501');
    const anon = createClient<Database>(connection.url, connection.key, options);
    expect((await anon.from('member_body_measurements').select()).error).not.toBeNull();
    expect((await anon.from('member_brand_sizes').select()).error).not.toBeNull();
    await expect(createSizeService(a.client, b.id, connection).load(signal())).rejects.toMatchObject({ code: 'session_changed' });
    expect((await service(1).load(signal())).brands).toHaveLength(1);
  });

  it('does not create duplicate records when retrying a write after a lost response', async () => {
    const id = randomUUID();
    const change = { kind: 'brand', id, base: null, values: brand } as const;
    const lost: typeof fetch = async (input, init) => {
      const result = await fetch(input, init);
      if (result.ok) throw new TypeError('response lost');
      return result;
    };
    await expect(service(0, lost).save(change, signal())).rejects.toBeDefined();
    await expect(service().save(change, signal())).rejects.toMatchObject({ code: '23505' });
    expect((await service().load(signal())).brands.filter((record) => record.id === id)).toHaveLength(1);
  });
});
