import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database, Json } from '../../src/types/database.generated';
import { createBackupService } from '../../src/features/backup/service';
import { fullArchive, loadBackup, type LoadedBackup } from '../../src/features/backup/model';
import { makePng } from '../helpers/png';

const settings = JSON.parse(execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', shell: process.platform === 'win32', stdio: ['pipe', 'pipe', 'ignore'] }));
if (!['http://127.0.0.1:54321', 'http://localhost:54321'].includes(settings.API_URL)) throw new Error('Local API required');
const connection = { url: settings.API_URL as string, key: settings.ANON_KEY as string };
const options = { auth: { persistSession: false, autoRefreshToken: false }, db: { retry: false } } as const;
const admin = createClient<Database>(connection.url, settings.SERVICE_ROLE_KEY, options);
const accounts: { id: string; client: ReturnType<typeof createClient<Database>> }[] = [];
const assets: { bucket: string; path: string }[] = [];
let loaded: LoadedBackup;
let photoItem: string;
const service = (index = 0) => createBackupService(accounts[index]!.client, accounts[index]!.id, connection);
function ok<T extends { data: unknown; error: unknown }>(response: T): NonNullable<T['data']> { if (response.error) throw response.error; return response.data as NonNullable<T['data']>; }
async function removeFiles() { for (const file of assets) ok(await admin.storage.from(file.bucket).remove([file.path])); }
async function clearRecords() {
  for (const table of ['outfit_presentations', 'outfit_render_assets', 'item_images', 'wear_event_items', 'wear_events', 'outfit_items', 'outfits', 'wardrobe_items', 'category_preferences', 'category_deletions', 'categories', 'brands', 'color_pair_favorites'] as const) ok(await admin.from(table).delete().eq('user_id', accounts[0]!.id));
}
beforeAll(async () => {
  for (let i = 0; i < 2; i++) {
    const email = `closet-backup-${randomUUID()}@example.test`; const password = `${randomUUID()}aA!9`;
    const created = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true }));
    const client = createClient<Database>(connection.url, connection.key, options);
    accounts.push({ id: created.user!.id, client }); ok(await client.auth.signInWithPassword({ email, password }));
  }
  const owner = accounts[0]!.id;
  const brand = randomUUID(); const item = randomUUID(); photoItem = item; const outfit = randomUUID(); const event = randomUUID(); const image = randomUUID(); const render = randomUUID();
  const category = `u_${randomUUID()}`;
  const logoPath = `${owner}/brands/${brand}/${randomUUID()}.png`;
  ok(await admin.from('categories').insert({ slug: category, user_id: owner, parent_slug: 'tops', label_ko: '백업 분류', position: 999 }));
  ok(await admin.from('category_preferences').insert({ category_slug: 'tops', user_id: owner, label_ko: '내 상의', position: 20 }));
  ok(await admin.from('category_deletions').insert({ category_slug: 'padding', user_id: owner, parent_slug: 'outerwear', target_slug: 'outerwear', moved_items: 0 }));
  ok(await admin.from('brands').insert({ id: brand, user_id: owner, name: 'BACKUP TEST', image_path: logoPath }));
  ok(await admin.from('wardrobe_items').insert({ id: item, user_id: owner, name: '백업용 니트', category_slug: category, brand_id: brand, color_name: '네이비', color_hex: '#202B48', secondary_color_hexes: ['#FFFFFF'], purchase_price: 120000, seasons: ['autumn'], notes: '보존할 메모' }));
  const savedOutfit = ok(await admin.from('outfits').insert({ id: outfit, user_id: owner, name: '백업 코디' }).select().single());
  ok(await admin.from('outfit_items').insert({ user_id: owner, outfit_id: outfit, item_id: item, slot: 'top', position: 0 }));
  ok(await admin.from('wear_events').insert({ id: event, user_id: owner, worn_on: '2026-10-30', outfit_id: outfit, memo: '착용 당시 기록' }));
  ok(await admin.from('wear_event_items').insert({ user_id: owner, wear_event_id: event, item_id: item }));
  const photoPath = `${owner}/items/${item}/${image}.png`; const renderPath = `${owner}/${outfit}/${render}.png`;
  ok(await admin.from('item_images').insert({ id: image, user_id: owner, item_id: item, storage_path: photoPath, upload_status: 'ready', is_primary: true }));
  ok(await admin.from('outfit_render_assets').insert({ id: render, user_id: owner, outfit_id: outfit, outfit_version: savedOutfit.updated_at, requested_mode: 'items', body_preset: 'regular', render_kind: 'item-board', storage_path: renderPath, status: 'ready' }));
  ok(await admin.from('outfit_presentations').insert({ user_id: owner, outfit_id: outfit, render_id: render, view_mode: 'items' }));
  ok(await admin.from('color_pair_favorites').insert({ user_id: owner, top_color: 'navy', bottom_color: 'white' }));
  assets.push({ bucket: 'brand-private', path: logoPath }, { bucket: 'wardrobe-private', path: photoPath }, { bucket: 'outfit-renders-private', path: renderPath });
  for (const file of assets) ok(await admin.storage.from(file.bucket).upload(file.path, makePng(0), { contentType: 'image/png' }));
});
afterAll(async () => {
  await removeFiles();
  for (const account of accounts) { await account.client.auth.signOut(); ok(await admin.auth.admin.deleteUser(account.id)); }
});
describe('actual account backup and restore', () => {
  it('exports one consistent owner snapshot with original photos, logos, renders, graph and no credentials', async () => {
    loaded = await service().export('full');
    expect(loaded.backup.files).toHaveLength(3);
    expect(loaded.backup.tables.wardrobe_items).toHaveLength(1);
    expect(loaded.backup.tables.wear_event_items[0]!.item_id).toBe(photoItem);
    expect(JSON.stringify(loaded.backup)).not.toMatch(/access_token|refresh_token|service_role|password|signedUrl/);
    const roundTrip = await loadBackup(fullArchive(loaded), accounts[0]!.id);
    expect(roundTrip.backup).toEqual(loaded.backup);
    expect((await service(1).export('full')).backup.tables.wardrobe_items).toHaveLength(0);
    const json = await service().export('data');
    expect(json.backup.files).toHaveLength(0);
    expect(json.backup.tables.item_images).toHaveLength(0);
    expect(json.backup.tables.brands[0]!.image_path).toBeNull();
    expect((await service().restore(json, true, null)).tables.wardrobe_items!.added).toBe(0);
  });
  it('previews without saving, restores missing rows/files and retries without duplicates', async () => {
    await removeFiles(); await clearRecords();
    const preview = await service().restore(loaded, true, null);
    expect(preview.tables.wardrobe_items!.added).toBe(1);
    expect(ok(await admin.from('wardrobe_items').select('id').eq('user_id', accounts[0]!.id))).toHaveLength(0);
    const restored = await service().restore(loaded, false, null);
    expect(restored.preview).toBe(false);
    expect((await service().export('full')).backup.tables).toEqual(loaded.backup.tables);
    const retry = await service().restore(loaded, false, null);
    expect(Object.values(retry.tables).every(row => row.added === 0)).toBe(true);
    for (const file of loaded.backup.files) expect(new Uint8Array(await ok(await accounts[0]!.client.storage.from(file.bucket).download(file.path)).arrayBuffer())).toEqual(loaded.files[file.file]);
  });
  it('repairs missing files on retry but never overwrites an existing object', async () => {
    const file = loaded.backup.files.find(file => file.bucket === 'wardrobe-private')!;
    ok(await admin.storage.from(file.bucket).remove([file.path]));
    expect((await accounts[0]!.client.storage.from(file.bucket).upload(file.path, makePng(0), { contentType: 'image/png' })).error).not.toBeNull();
    await service().restore(loaded, false, null);
    expect((await accounts[0]!.client.storage.from(file.bucket).upload(file.path, makePng(1), { upsert: true, contentType: 'image/png' })).error).not.toBeNull();
    expect((await accounts[1]!.client.storage.from(file.bucket).download(file.path)).error).not.toBeNull();
  });
  it('reports an interrupted photo transfer and resumes it with the same archive', async () => {
    const photo = loaded.backup.files.find(file => file.bucket === 'wardrobe-private')!;
    ok(await admin.storage.from(photo.bucket).remove([photo.path]));
    const transport = globalThis.fetch;
    vi.stubGlobal('fetch', ((input, init) => {
      const url = String(input);
      if (init?.method === 'POST' && url.includes('/storage/v1/object/wardrobe-private/')) return Promise.reject(new Error('Simulated offline upload'));
      return transport(input, init);
    }) as typeof fetch);
    try { await expect(service().restore(loaded, false, null)).rejects.toMatchObject({ code: 'media' }); }
    finally { vi.unstubAllGlobals(); }
    expect(ok(await admin.from('wardrobe_items').select('id').eq('user_id', accounts[0]!.id))).toHaveLength(1);
    await service().restore(loaded, false, null);
    expect((await service().export('full')).backup.files).toHaveLength(3);
  });
  it('rejects foreign archives/rows/identities, anonymous execution and tampered media before metadata writes', async () => {
    await expect(service(1).restore(loaded, false, null)).rejects.toMatchObject({ code: 'owner' });
    const altered = structuredClone(loaded.backup);
    altered.tables.brands[0]!.user_id = accounts[1]!.id;
    expect((await accounts[0]!.client.rpc('restore_member_backup', { p_payload: altered as unknown as Json })).error?.code).toBe('42501');
    const badIdentity = structuredClone(loaded.backup);
    const foreign = ok(await admin.from('brands').insert({ user_id: accounts[1]!.id, name: 'FOREIGN' }).select().single());
    badIdentity.tables.brands[0]!.id = foreign.id;
    expect((await accounts[0]!.client.rpc('restore_member_backup', { p_payload: badIdentity as unknown as Json })).error?.code).toBe('42501');
    const anon = createClient<Database>(connection.url, connection.key, options);
    expect((await anon.rpc('export_member_backup')).error?.code).toBe('42501');
    expect((await anon.rpc('restore_member_backup', { p_payload: loaded.backup as unknown as Json })).error?.code).toBe('42501');
    expect(ok(await accounts[1]!.client.from('backup_file_restores').select())).toHaveLength(0);
    expect((await accounts[0]!.client.from('backup_file_restores').insert({ user_id: accounts[0]!.id, bucket: 'wardrobe-private', path: `${accounts[0]!.id}/fake`, size: 1, mime: 'image/png', sha256: 'a'.repeat(64), expires_at: new Date(Date.now()+60000).toISOString() })).error?.code).toBe('42501');
    const file = loaded.backup.files[0]!;
    await expect(service().restore({ backup: loaded.backup, files: { ...loaded.files, [file.file]: new Uint8Array(makePng(1)) } }, false, null)).rejects.toMatchObject({ code: 'invalid' });
  });
  it('rolls back the whole metadata transaction on changed/duplicate records and broken references', async () => {
    const changed = structuredClone(loaded.backup);
    const newBrand = randomUUID();
    changed.tables.brands.push({ ...changed.tables.brands[0]!, id: newBrand, name: 'MUST ROLLBACK', image_path: null });
    changed.tables.wardrobe_items[0]!.notes = '덮어쓰기 시도';
    expect((await accounts[0]!.client.rpc('restore_member_backup', { p_payload: changed as unknown as Json, p_dry_run: false })).error?.code).toBe('PT409');
    expect(ok(await admin.from('brands').select('id').eq('id', newBrand))).toHaveLength(0);
    expect(ok(await admin.from('wardrobe_items').select('notes').eq('id', photoItem).single()).notes).toBe('보존할 메모');
    const duplicate = structuredClone(loaded.backup); duplicate.tables.wardrobe_items.push(duplicate.tables.wardrobe_items[0]!);
    expect((await accounts[0]!.client.rpc('restore_member_backup', { p_payload: duplicate as unknown as Json })).error?.code).toBe('22023');
    const broken = structuredClone(loaded.backup); broken.tables.wear_event_items.push({ ...broken.tables.wear_event_items[0]!, item_id: randomUUID() });
    expect((await accounts[0]!.client.rpc('restore_member_backup', { p_payload: broken as unknown as Json, p_dry_run: false })).error?.code).toBe('23503');
  });
  it('restores selected profile fields only with a current preview version and rejects a switched session', async () => {
    const archive = structuredClone(loaded.backup); archive.profile.display_name = '복원한 프로필'; archive.profile.theme = 'dark';
    const version = await service().profileVersion();
    await service().restore({ ...loaded, backup: archive }, true, version);
    expect(ok(await admin.from('profiles').select('display_name').eq('id', accounts[0]!.id).single()).display_name).not.toBe('복원한 프로필');
    await service().restore({ ...loaded, backup: archive }, false, version);
    expect(ok(await admin.from('profiles').select('display_name,theme').eq('id', accounts[0]!.id).single())).toMatchObject({ display_name: '복원한 프로필', theme: 'dark' });
    await expect(service().restore({ ...loaded, backup: archive }, false, version)).rejects.toMatchObject({ code: 'PT409' });
    const mismatched = createBackupService(accounts[0]!.client, accounts[1]!.id, connection);
    await expect(mismatched.export('data')).rejects.toMatchObject({ code: 'session_changed' });
  });
});
