import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database.generated';
import { createBrandService } from '../../src/features/brands/service';
import { createWardrobeRepository } from '../../src/features/wardrobe/repository';
import { wardrobeDraftSchema } from '../../src/features/wardrobe/schemas';
import { emptyWardrobeDraft } from '../../src/features/wardrobe/types';
import { makePng } from '../helpers/png';

const settings = JSON.parse(execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', shell: process.platform === 'win32', stdio: ['pipe', 'pipe', 'ignore'] }));
if (!['http://127.0.0.1:54321', 'http://localhost:54321'].includes(settings.API_URL)) throw new Error('Local API required');
const connection = { url: settings.API_URL as string, key: settings.ANON_KEY as string };
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, db: { retry: false } } as const;
const admin = createClient<Database>(connection.url, settings.SERVICE_ROLE_KEY, options);
const accounts: { id: string; client: ReturnType<typeof createClient<Database>> }[] = [];
const service = (index = 0, transport?: typeof fetch) => createBrandService(accounts[index]!.client, accounts[index]!.id, connection, transport);
const image = () => ({ bytes: makePng(0), width: 96, height: 64, mime: 'image/png' as const });
beforeAll(async () => {
  for (let i = 0; i < 2; i++) {
    const email = `closet-brands-${randomUUID()}@example.test`;
    const password = `${randomUUID()}aA!9`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error('Brand fixture setup failed');
    const client = createClient<Database>(connection.url, connection.key, options);
    accounts.push({ id: created.data.user.id, client });
    if ((await client.auth.signInWithPassword({ email, password })).error) throw new Error('Brand fixture login failed');
  }
});
afterAll(async () => {
  for (const account of accounts) {
    const folders = await admin.from('brands').select('id').eq('user_id', account.id);
    if (folders.error) throw folders.error;
    for (const brand of folders.data) {
      const prefix = `${account.id}/brands/${brand.id}`;
      const files = await admin.storage.from('brand-private').list(prefix);
      if (files.error) throw files.error;
      if (files.data.length && (await admin.storage.from('brand-private').remove(files.data.map((file) => `${prefix}/${file.name}`))).error) throw new Error('Brand storage cleanup failed');
    }
    if ((await admin.auth.admin.deleteUser(account.id)).error) throw new Error('Brand fixture cleanup failed');
  }
});

describe('actual private brand directory', () => {
  it('creates, deduplicates, separates owners and rejects direct/anonymous writes', async () => {
    const brand = await service().save(randomUUID(), '  재사용 브랜드  ');
    expect(brand.name).toBe('재사용 브랜드');
    expect((await service().save(brand.id, brand.name)).id).toBe(brand.id);
    await expect(service().save(randomUUID(), brand.name)).rejects.toMatchObject({ code: '23505' });
    expect((await service(1).save(randomUUID(), brand.name)).user_id).toBe(accounts[1]!.id);
    expect((await service(1).list()).some((row) => row.id === brand.id)).toBe(false);
    expect((await accounts[1]!.client.from('brands').select().eq('id', brand.id)).data).toEqual([]);
    await expect(service(1).save(brand.id, '탈취', brand.updated_at)).rejects.toMatchObject({ code: '42501' });
    expect((await accounts[0]!.client.from('brands').insert({ name: '직접 쓰기' })).error?.code).toBe('42501');
    expect((await accounts[0]!.client.from('brands').update({ image_path: 'fake' }).eq('id', brand.id)).error?.code).toBe('42501');
    expect((await accounts[0]!.client.from('brands').delete().eq('id', brand.id)).error?.code).toBe('42501');
    const anon = createClient<Database>(connection.url, connection.key, options);
    expect((await anon.from('brands').select()).error?.code).toBe('42501');
    expect((await anon.rpc('save_brand', { p_id: randomUUID(), p_name: '익명' })).error?.code).toBe('42501');
  });
  it('links selected identity, ignores forged display names, renames search cache, changes and clears selection', async () => {
    const a = accounts[0]!;
    const brand = await service().save(randomUUID(), '연결 전 브랜드');
    const input = wardrobeDraftSchema.parse({ ...emptyWardrobeDraft(), name: '브랜드 선택 옷', category_slug: 'shirt', brand_id: brand.id, brand_name: '위조된 이름' });
    const repo = createWardrobeRepository(a.client, a.id);
    const clothing = await repo.create(randomUUID(), input);
    const extra = await repo.create(randomUUID(), { ...input, name: '휴지통 브랜드 옷' });
    await repo.softDelete(extra.id, extra.updated_at);
    expect(clothing).toMatchObject({ brand_id: brand.id, brand_name: brand.name });
    expect((await repo.create(clothing.id, input)).id).toBe(clothing.id);
    const renamed = await service().save(brand.id, '연결 후 브랜드', brand.updated_at);
    const current = await repo.get(clothing.id);
    expect(current?.brand_name).toBe(renamed.name);
    expect((await a.client.from('wardrobe_items').select('brand_name').eq('id', extra.id).single()).data?.brand_name).toBe(renamed.name);
    expect((await repo.filterOptions()).brands).toContain(renamed.name);
    expect((await a.client.rpc('insight_item_stats', { p_owner: a.id, p_as_of: '2026-10-28', p_mode: 'all', p_search: renamed.name })).data?.some((row) => row.item_id === clothing.id)).toBe(true);
    if (!current) throw new Error('Missing item');
    const second = await service().save(randomUUID(), '두 번째 브랜드');
    const changed = await repo.update(current.id, current.updated_at, { ...input, brand_id: second.id });
    expect(changed).toMatchObject({ brand_id: second.id, brand_name: second.name });
    const cleared = await repo.update(changed.id, changed.updated_at, { ...input, brand_id: null, brand_name: null });
    expect(cleared).toMatchObject({ brand_id: null, brand_name: null });
    const foreign = await service(1).save(randomUUID(), '타인 전용');
    await expect(repo.create(randomUUID(), { ...input, brand_id: foreign.id })).rejects.toMatchObject({ code: '23503' });
    expect((await a.client.from('wardrobe_items').update({ brand_id: foreign.id }).eq('id', cleared.id)).error?.code).toBe('23503');
    // Older API clients can still read/write their own unlinked legacy text.
    const legacy = await repo.create(randomUUID(), { ...input, brand_id: null, brand_name: '기존 텍스트' });
    expect(legacy).toMatchObject({ brand_id: null, brand_name: '기존 텍스트' });
  });
  it('keeps CAS conflicts and concurrent renames from silently overwriting a brand', async () => {
    const brand = await service().save(randomUUID(), '충돌 시작');
    const results = await Promise.allSettled([service().save(brand.id, '충돌 A', brand.updated_at), service().save(brand.id, '충돌 B', brand.updated_at)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    await expect(service().save(brand.id, '오래된 수정', brand.updated_at)).rejects.toMatchObject({ code: '40001' });
    expect((await accounts[0]!.client.rpc('save_brand', { p_id: randomUUID(), p_name: ' '.repeat(3) })).error?.code).toBe('22023');
    expect((await accounts[0]!.client.rpc('save_brand', { p_id: randomUUID(), p_name: 'x'.repeat(121) })).error?.code).toBe('22023');
  });
  it('stores private logos, denies foreign access/overwrite, replaces and removes old objects', async () => {
    let brand = await service().save(randomUUID(), '로고 브랜드');
    const uploaded = await service().upload(brand, randomUUID(), image());
    expect(uploaded.cleanupPending).toBe(false);
    brand = uploaded.brand;
    if (!brand.image_path) throw new Error('Missing logo');
    const oldPath = brand.image_path;
    const urls = await service().images([brand]);
    const url = urls[brand.image_path];
    expect(Boolean(url)).toBe(true);
    const response = await fetch(url!);
    expect(response.ok).toBe(true);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(image().bytes));
    const foreign = accounts[1]!.client.storage.from('brand-private');
    expect((await foreign.createSignedUrl(brand.image_path, 60)).error).not.toBeNull();
    expect((await fetch(`${connection.url}/storage/v1/object/public/brand-private/${brand.image_path}`)).ok).toBe(false);
    await expect(service(1).upload(brand, randomUUID(), image())).rejects.toBeTruthy();
    expect((await accounts[0]!.client.storage.from('brand-private').upload(brand.image_path, image().bytes, { contentType: 'image/png', upsert: true })).error).not.toBeNull();
    await accounts[0]!.client.storage.from('brand-private').remove([brand.image_path]);
    expect((await accounts[0]!.client.storage.from('brand-private').download(brand.image_path)).error).toBeNull();
    brand = (await service().upload(brand, randomUUID(), image())).brand;
    expect(brand.image_path).not.toBe(oldPath);
    expect((await admin.storage.from('brand-private').download(oldPath)).error).not.toBeNull();
    const removedPath = brand.image_path!;
    const removed = await service().removeImage(brand);
    expect(removed.brand.image_path).toBeNull();
    expect((await admin.storage.from('brand-private').download(removedPath)).error).not.toBeNull();
  });
  it('rejects fake/missing/foreign paths and oversized or unsuitable image types', async () => {
    const brand = await service().save(randomUUID(), '이미지 경계');
    const a = accounts[0]!;
    const missing = `${a.id}/brands/${brand.id}/${randomUUID()}.png`;
    expect((await a.client.rpc('set_brand_image', { p_id: brand.id, p_path: missing, p_expected: brand.updated_at })).error?.code).toBe('23514');
    expect((await a.client.rpc('set_brand_image', { p_id: brand.id, p_path: `${accounts[1]!.id}/brands/${brand.id}/${randomUUID()}.png`, p_expected: brand.updated_at })).error?.code).toBe('22023');
    expect((await a.client.storage.from('brand-private').upload(`${a.id}/brands/${randomUUID()}/${randomUUID()}.png`, image().bytes, { contentType: 'image/png' })).error).not.toBeNull();
    expect((await a.client.storage.from('brand-private').upload(missing.replace('.png', '.svg'), '<svg/>', { contentType: 'image/svg+xml' })).error).not.toBeNull();
    expect((await a.client.storage.from('brand-private').upload(missing, new ArrayBuffer(5242881), { contentType: 'image/png' })).error).not.toBeNull();
  });
  it('retries committed image responses safely and refuses overwriting a different file', async () => {
    const brand = await service().save(randomUUID(), '재시도 로고');
    const id = randomUUID();
    let lost = false;
    const transport: typeof fetch = async (url, init) => {
      const response = await fetch(url, init);
      if (!lost && String(url).includes('/rpc/set_brand_image') && response.ok) { lost = true; throw new TypeError('simulated response loss'); }
      return response;
    };
    await expect(service(0, transport).upload(brand, id, image())).rejects.toBeTruthy();
    expect(lost).toBe(true);
    const retried = await service().upload(brand, id, image());
    expect(retried.brand.image_path).toContain(id);
    await expect(service().upload(brand, id, { ...image(), bytes: makePng(1) })).rejects.toMatchObject({ code: 'different_file' });
  });
  it('does not truncate the selection directory at the API row limit', async () => {
    const owner = accounts[0]!.id;
    const rows = Array.from({ length: 1005 }, (_, index) => ({ id: randomUUID(), user_id: owner, name: `전체브랜드${String(index).padStart(4, '0')}` }));
    const created = await admin.from('brands').insert(rows);
    if (created.error) throw created.error;
    try { expect((await service().list()).filter((row) => row.name.startsWith('전체브랜드'))).toHaveLength(1005); }
    finally {
      for (let offset = 0; offset < rows.length; offset += 100) {
        if ((await admin.from('brands').delete().eq('user_id', owner).in('id', rows.slice(offset, offset + 100).map((row) => row.id))).error) throw new Error('Bulk brand cleanup failed');
      }
    }
  });
  it('pins the starting token during transport and cancels before a request', async () => {
    const a = accounts[0]!;
    const b = accounts[1]!;
    const original = (await a.client.auth.getSession()).data.session!;
    const next = (await b.client.auth.getSession()).data.session!;
    let swapped = false;
    const transport: typeof fetch = async (url, init) => {
      if (!swapped) { swapped = true; await a.client.auth.setSession({ access_token: next.access_token, refresh_token: next.refresh_token }); }
      return fetch(url, init);
    };
    try {
      expect((await createBrandService(a.client, a.id, connection, transport).list()).every((row) => row.user_id === a.id)).toBe(true);
      expect(swapped).toBe(true);
      await expect(service().list()).rejects.toMatchObject({ code: 'session_changed' });
    } finally { await a.client.auth.setSession({ access_token: original.access_token, refresh_token: original.refresh_token }); }
    const controller = new AbortController(); controller.abort();
    await expect(service().list(controller.signal)).rejects.toMatchObject({ code: 'session_changed' });
  });
});
