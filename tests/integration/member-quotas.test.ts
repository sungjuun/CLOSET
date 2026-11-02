import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database, Json } from '../../src/types/database.generated';
import { localDockerSupabase } from '../helpers/local-supabase';
import { readMemberUsage, assertUploadCapacity } from '../../src/features/usage/model';
const settings = localDockerSupabase(); const opt = { auth: { persistSession: false, autoRefreshToken: false }, db: { retry: false } } as const;
const admin = createClient<Database>(settings.API_URL, settings.SERVICE_ROLE_KEY, opt);
const accounts: { id: string; client: ReturnType<typeof createClient<Database>>; paths: { bucket: string; path: string }[] }[] = [];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
async function account(wardrobe = 300, bytes = 104857600, files = 500) {
  const email = `closet-quota-${randomUUID()}@example.test`; const password = `${randomUUID()}Aa!9`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true }); if (created.error) throw created.error;
  const client = createClient<Database>(settings.API_URL, settings.ANON_KEY, opt); const a = { id: created.data.user.id, client, paths: [] as { bucket: string; path: string }[] }; accounts.push(a);
  if ((await client.auth.signInWithPassword({ email, password })).error) throw new Error('Fixture login failed');
  const changed = spawnSync('docker', ['exec', 'supabase_db_closet', 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c', `insert into app_private.member_limits(user_id,wardrobe_limit,media_bytes_limit,media_files_limit) values('${a.id}',${wardrobe},${bytes},${files});`], { encoding: 'utf8' });
  if (changed.status !== 0) throw new Error(changed.stderr); return a;
}
async function garment(a: typeof accounts[number]) { const r = await a.client.from('wardrobe_items').insert({ name: '한도 검증 옷', category_slug: 'shirt' }).select('id').single(); if (r.error) throw r.error; return r.data.id; }
async function photo(a: typeof accounts[number], item: string, bytes: Uint8Array = png) {
  const r = await a.client.rpc('reserve_item_image', { p_item_id: item, p_image_id: randomUUID(), p_extension: 'png' }); if (r.error) throw r.error;
  a.paths.push({ bucket: 'wardrobe-private', path: r.data.storage_path });
  return a.client.storage.from('wardrobe-private').upload(r.data.storage_path, bytes, { contentType: 'image/png' });
}
afterAll(async () => { for (const a of accounts) { for (const bucket of ['wardrobe-private', 'brand-private', 'outfit-renders-private']) { const paths = a.paths.filter(x => x.bucket === bucket).map(x => x.path); if (paths.length && (await admin.storage.from(bucket).remove(paths)).error) throw new Error('Media cleanup failed'); } if ((await admin.auth.admin.deleteUser(a.id)).error) throw new Error('Account cleanup failed'); } });
describe('member quotas on the real local database and Storage API', () => {
  it('returns only the signed-in member usage, rejects anonymous and forged owner reads', async () => {
    const a = await account(); const b = await account(); await garment(a);
    expect(await readMemberUsage(a.client, a.id)).toMatchObject({ user_id: a.id, wardrobe_count: 1, wardrobe_limit: 300, media_bytes: 0, media_bytes_limit: 104857600, media_files_limit: 500 });
    expect((await readMemberUsage(b.client, b.id)).wardrobe_count).toBe(0);
    await expect(readMemberUsage(a.client, b.id)).rejects.toMatchObject({ code: 'session_changed' });
    expect((await createClient<Database>(settings.API_URL, settings.ANON_KEY, opt).rpc('member_usage')).error?.code).toBe('42501');
    expect((await a.client.schema('app_private' as 'public').from('member_limits' as 'wardrobe_items').select('*')).error).toBeTruthy();
  });
  it('serializes concurrent garment creation, counts trash, and allows edits at the limit', async () => {
    const a = await account(2); const attempts = await Promise.all(Array.from({ length: 3 }, () => a.client.from('wardrobe_items').insert({ name: '동시 등록', category_slug: 'shirt' }).select('id')));
    expect(attempts.filter(r => !r.error)).toHaveLength(2); expect(attempts.find(r => r.error)?.error?.code).toBe('PT413');
    const id = attempts.find(r => !r.error)!.data![0]!.id;
    expect((await a.client.from('wardrobe_items').update({ name: '변경 유지', deleted_at: new Date().toISOString() }).eq('id', id)).error).toBeNull();
    expect((await readMemberUsage(a.client, a.id)).wardrobe_count).toBe(2);
    await expect(garment(a)).rejects.toMatchObject({ code: 'PT413' });
    expect((await a.client.from('wardrobe_items').insert([{ name: '한도1', category_slug: 'shirt' }, { name: '한도2', category_slug: 'shirt' }])).error?.code).toBe('PT413');
  });
  it('rejects over-limit backup restoration atomically, including preview mode', async () => {
    const a = await account(1); await garment(a);
    const exported = await a.client.rpc('export_member_backup'); expect(exported.error).toBeNull();
    const source = exported.data as { owner: string; profile: Json; tables: Record<string, { id?: string; [key: string]: Json | undefined }[]> };
    const first = source.tables.wardrobe_items![0]!;
    const payload = { ...source, format: 'closet-backup', version: 1, kind: 'data', files: [], tables: { ...source.tables, wardrobe_items: [...source.tables.wardrobe_items!, { ...first, id: randomUUID(), name: '복원 한도 초과' }] } };
    for (const preview of [true, false]) expect((await a.client.rpc('restore_member_backup', { p_payload: payload as unknown as Json, p_dry_run: preview })).error?.code).toBe('PT413');
    expect((await readMemberUsage(a.client, a.id)).wardrobe_count).toBe(1);
  });
  it('enforces aggregate file count across wardrobe and brand buckets even without the frontend guard', async () => {
    const a = await account(300, 104857600, 1); const item = await garment(a);
    expect((await photo(a, item)).error).toBeNull();
    const brand = await a.client.rpc('save_brand', { p_id: randomUUID(), p_name: 'quota brand' }); if (brand.error) throw brand.error;
    const path = `${a.id}/brands/${brand.data.id}/${randomUUID()}.png`; a.paths.push({ bucket: 'brand-private', path });
    expect((await a.client.storage.from('brand-private').upload(path, png, { contentType: 'image/png' })).error).toBeTruthy();
    await expect(assertUploadCapacity(a.client, 'brand-private', path, png.length)).rejects.toMatchObject({ code: 'PT413' });
    const usage = await readMemberUsage(a.client, a.id); expect(usage.media_files).toBe(1); expect(usage.media_bytes).toBe(png.length);
    // Retry checks exclude an existing immutable path; actual byte validation remains in its service.
    await expect(assertUploadCapacity(a.client, 'wardrobe-private', a.paths[0]!.path, png.length)).resolves.toBeUndefined();
  });
  it('enforces exact byte budgets through real multipart uploads', async () => {
    const a = await account(300, 12 * 1024 * 1024, 10); const item = await garment(a); const bytes = new Uint8Array(4 * 1024 * 1024); bytes.set(png);
    for (let n = 0; n < 3; n++) expect((await photo(a, item, bytes)).error, `upload ${n}`).toBeNull();
    expect((await readMemberUsage(a.client, a.id)).media_bytes).toBe(12 * 1024 * 1024);
    expect((await photo(a, item)).error).toBeTruthy();
  });
  it('allows only one concurrent upload into the last shared file slot', async () => {
    const a = await account(300, 104857600, 1); const items = await Promise.all([garment(a), garment(a)]);
    const uploads = await Promise.all(items.map(item => photo(a, item))); expect(uploads.filter(r => !r.error)).toHaveLength(1); expect((await readMemberUsage(a.client, a.id)).media_files).toBe(1);
  });
  it('rejects invalid sizes and foreign paths without leaking other members capacity', async () => {
    const a = await account(); const b = await account(); const path = `${b.id}/items/${randomUUID()}/${randomUUID()}.png`;
    await expect(assertUploadCapacity(a.client, 'wardrobe-private', path, png.length)).rejects.toMatchObject({ code: 'PT413' });
    for (const bytes of [0, -1, 5242881]) await expect(assertUploadCapacity(a.client, 'wardrobe-private', `${a.id}/items/${randomUUID()}/${randomUUID()}.png`, bytes)).rejects.toMatchObject({ code: '22023' });
  });
});
