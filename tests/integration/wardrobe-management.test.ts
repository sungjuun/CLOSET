import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database.generated';
import { createWardrobeRepository } from '../../src/features/wardrobe/repository';
import { wardrobeDraftSchema } from '../../src/features/wardrobe/schemas';
import { emptyWardrobeDraft } from '../../src/features/wardrobe/types';
import { itemToDraft } from '../../src/features/wardrobe/editing';
import { createPhotoService } from '../../src/features/wardrobe/photos/service';
import { makePng } from '../helpers/png';

const settings = JSON.parse(execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', shell: process.platform === 'win32', stdio: ['pipe', 'pipe', 'ignore'] }));
if (!['http://127.0.0.1:54321', 'http://localhost:54321'].includes(settings.API_URL)) throw new Error('Local API required');
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, db: { retry: false } } as const;
const admin = createClient<Database>(settings.API_URL, settings.SERVICE_ROLE_KEY, options);
const accounts: { id: string; email: string; password: string; client: ReturnType<typeof createClient<Database>> }[] = [];
const input = (name: string) => wardrobeDraftSchema.parse({ ...emptyWardrobeDraft(), name, category_slug: 'shirt' });

beforeAll(async () => {
  for (let index = 0; index < 2; index++) {
    const email = `closet-management-${randomUUID()}@example.test`;
    const password = `${randomUUID()}aA!9`;
    const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (result.error || !result.data.user) throw new Error('Fixture setup failed');
    const client = createClient<Database>(settings.API_URL, settings.ANON_KEY, options);
    accounts.push({ id: result.data.user.id, email, password, client });
    if ((await client.auth.signInWithPassword({ email, password })).error) throw new Error('Fixture login failed');
  }
});
afterAll(async () => {
  for (const account of accounts) {
    const images = await admin.from('item_images').select('storage_path').eq('user_id', account.id);
    if (images.error) throw new Error('Fixture image query failed');
    if (images.data.length && (await admin.storage.from('wardrobe-private').remove(images.data.map((image) => image.storage_path))).error) throw new Error('Fixture image cleanup failed');
    if ((await admin.auth.admin.deleteUser(account.id)).error) throw new Error('Fixture cleanup failed');
  }
});

describe('actual wardrobe management', () => {
  it('updates optional fields/nulls/zero and excludes privileged extra fields', async () => {
    const a = accounts[0]!;
    const repo = createWardrobeRepository(a.client, a.id);
    const original = await repo.create(randomUUID(), input('수정 전'));
    const changed = wardrobeDraftSchema.parse({ ...emptyWardrobeDraft(), name: '수정 후', category_slug: 'jacket', brand_name: '새 브랜드', color_name: '블랙', color_hex: '#202020', size_label: 'M', material: '면', seasons: ['autumn'], tags: '출근,주말', purchase_price: '0', currency: 'KRW', purchased_on: '2024-02-29', notes: '수정 메모', purchase_url: 'https://example.com/item' });
    const updated = await repo.update(original.id, original.updated_at, { ...changed, user_id: accounts[1]!.id, is_favorite: true, lifecycle_status: 'sold' } as typeof changed);
    expect(updated).toMatchObject(changed);
    expect(updated.user_id).toBe(a.id);
    expect(updated.is_favorite).toBe(false);
    expect(updated.lifecycle_status).toBe('active');
    expect(updated.updated_at).not.toBe(original.updated_at);
    const cleared = await repo.update(updated.id, updated.updated_at, input('필드 비우기'));
    expect(cleared.purchase_price).toBeNull();
    expect(cleared.notes).toBeNull();
    expect(cleared.seasons).toEqual([]);
    expect((await repo.get(cleared.id))?.name).toBe('필드 비우기');
  });

  it('allows only one conflicting edit and synchronizes independent sessions on refetch', async () => {
    const a = accounts[0]!;
    const second = createClient<Database>(settings.API_URL, settings.ANON_KEY, options);
    if ((await second.auth.signInWithPassword({ email: a.email, password: a.password })).error) throw new Error('Second session failed');
    const firstRepo = createWardrobeRepository(a.client, a.id);
    const secondRepo = createWardrobeRepository(second, a.id);
    const item = await firstRepo.create(randomUUID(), input('동시 수정 원본'));
    const results = await Promise.allSettled([firstRepo.update(item.id, item.updated_at, input('기기 A 수정')), secondRepo.update(item.id, item.updated_at, input('기기 B 수정'))]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const current = (await firstRepo.get(item.id))!;
    expect((await secondRepo.get(item.id))?.name).toBe(current.name);
    const favorite = await secondRepo.setFavorite(item.id, current.updated_at, true);
    expect((await firstRepo.get(item.id))?.is_favorite).toBe(true);
    await expect(firstRepo.setStatus(item.id, current.updated_at, 'archived')).rejects.toMatchObject({ code: 'conflict' });
    expect((await firstRepo.get(item.id))?.updated_at).toBe(favorite.updated_at);
  });

  it('recovers committed edit/favorite/status/delete/restore responses with the same desired result', async () => {
    const a = accounts[0]!;
    const normal = createWardrobeRepository(a.client, a.id);
    let item = await normal.create(randomUUID(), input('응답 유실 원본'));
    let armed = false;
    const client = createClient<Database>(settings.API_URL, settings.ANON_KEY, { ...options, global: { fetch: async (url, init) => {
      const response = await fetch(url, init);
      if (armed && String(url).includes('/rest/v1/wardrobe_items') && init?.method === 'PATCH' && response.ok) { armed = false; throw new TypeError('simulated lost response'); }
      return response;
    } } });
    if ((await client.auth.signInWithPassword({ email: a.email, password: a.password })).error) throw new Error('Retry session failed');
    const repo = createWardrobeRepository(client, a.id);
    const operations = [
      (version: string) => repo.update(item.id, version, input('응답 유실 수정')),
      (version: string) => repo.setFavorite(item.id, version, true),
      (version: string) => repo.setStatus(item.id, version, 'archived'),
      (version: string) => repo.softDelete(item.id, version),
      (version: string) => repo.restore(item.id, version),
    ];
    for (const operation of operations) {
      const version = item.updated_at;
      armed = true;
      await expect(operation(version)).rejects.toBeTruthy();
      const beforeRetry = await a.client.from('wardrobe_items').select('*').eq('id', item.id).single();
      if (beforeRetry.error) throw beforeRetry.error;
      item = await operation(version);
      expect(item.updated_at).toBe(beforeRetry.data.updated_at);
    }
    expect(item.deleted_at).toBeNull();
    expect(item.lifecycle_status).toBe('archived');
  });

  it('preserves private photos, outfit links and wear snapshots across status/delete/restore', async () => {
    const a = accounts[0]!;
    const repo = createWardrobeRepository(a.client, a.id);
    let item = await repo.create(randomUUID(), input('연결 기록 보존'));
    const photoService = createPhotoService(a.client, a.id, { url: settings.API_URL, key: settings.ANON_KEY });
    const photo = await photoService.upload(item.id, randomUUID(), { bytes: makePng(), width: 96, height: 64, mime: 'image/png' });
    for (let index = 0; index < 3; index++) {
      const outfit = await admin.from('outfits').insert({ user_id: a.id, name: `연결 코디 ${index}`, deleted_at: index === 2 ? new Date().toISOString() : null }).select('id').single();
      if (outfit.error) throw outfit.error;
      if ((await admin.from('outfit_items').insert({ user_id: a.id, outfit_id: outfit.data.id, item_id: item.id, slot: 'top' })).error) throw new Error('Outfit fixture failed');
    }
    for (let index = 0; index < 2; index++) {
      const event = await admin.from('wear_events').insert({ user_id: a.id, worn_on: '2026-10-28', memo: `과거 기록 ${index}` }).select('id').single();
      if (event.error) throw event.error;
      if ((await admin.from('wear_event_items').insert({ user_id: a.id, wear_event_id: event.data.id, item_id: item.id })).error) throw new Error('Wear fixture failed');
    }
    expect(await repo.usage(item.id)).toMatchObject({ outfit_count: 2, wear_count: 2, outfit_names: ['연결 코디 0', '연결 코디 1'] });
    item = await repo.setStatus(item.id, item.updated_at, 'archived');
    await expect(photoService.upload(item.id, randomUUID(), { bytes: makePng(), width: 96, height: 64, mime: 'image/png' })).rejects.toBeTruthy();
    item = await repo.softDelete(item.id, item.updated_at);
    expect(await repo.get(item.id)).toBeNull();
    expect((await repo.trash(0)).items.some((row) => row.id === item.id)).toBe(true);
    expect((await repo.usage(item.id)).wear_count).toBe(2);
    const downloaded = await a.client.storage.from('wardrobe-private').download(photo.storage_path);
    expect(downloaded.error).toBeNull();
    expect(await downloaded.data!.arrayBuffer()).toEqual(makePng());
    await expect(repo.update(item.id, item.updated_at, input('삭제 후 수정 시도'))).rejects.toMatchObject({ code: 'item_unavailable' });
    item = await repo.restore(item.id, item.updated_at);
    expect(item.lifecycle_status).toBe('archived');
    expect((await repo.get(item.id))?.name).toBe('연결 기록 보존');
    expect((await repo.usage(item.id)).outfit_count).toBe(2);
    expect((await photoService.list([item.id]))[0]?.id).toBe(photo.id);
  });

  it('denies foreign mutations, usage and trash, and anonymous usage RPC', async () => {
    const a = accounts[0]!;
    const b = accounts[1]!;
    const repo = createWardrobeRepository(a.client, a.id);
    const item = await repo.create(randomUUID(), input('A 비공개 옷'));
    const foreign = createWardrobeRepository(b.client, b.id);
    for (const operation of [() => foreign.update(item.id, item.updated_at, input('침입')), () => foreign.setFavorite(item.id, item.updated_at, true), () => foreign.setStatus(item.id, item.updated_at, 'sold'), () => foreign.softDelete(item.id, item.updated_at), () => foreign.restore(item.id, item.updated_at)]) await expect(operation()).rejects.toMatchObject({ code: 'item_unavailable' });
    expect(await foreign.usage(item.id)).toMatchObject({ outfit_count: 0, wear_count: 0, outfit_names: [] });
    expect((await foreign.trash(0)).total).toBe(0);
    expect((await repo.get(item.id))?.name).toBe('A 비공개 옷');
    const anon = createClient<Database>(settings.API_URL, settings.ANON_KEY, options);
    expect((await anon.rpc('wardrobe_item_usage', { p_owner: a.id, p_item: item.id })).error?.code).toBe('42501');
    expect(await foreign.usage(item.id)).toMatchObject({ outfit_names: [] });
  });

  it('paginates trash and adjusts its count after restoration', async () => {
    const a = accounts[0]!;
    const repo = createWardrobeRepository(a.client, a.id);
    const added = await a.client.from('wardrobe_items').insert(Array.from({ length: 21 }, (_, index) => ({ name: `휴지통 ${index}`, category_slug: 'shirt', deleted_at: '2026-10-28T00:00:00Z' })));
    if (added.error) throw added.error;
    const first = await repo.trash(0);
    const last = await repo.trash(1);
    expect(first.total).toBe(21);
    expect(first.items).toHaveLength(20);
    expect(last.items).toHaveLength(1);
    expect(new Set([...first.items, ...last.items].map((item) => item.id)).size).toBe(21);
    await repo.restore(last.items[0]!.id, last.items[0]!.updated_at);
    expect(await repo.trash(1)).toEqual({ items: [], total: 20 });
  });

  it('refuses aborted or changed-owner operations', async () => {
    const a = accounts[0]!;
    const repo = createWardrobeRepository(a.client, a.id);
    const item = await repo.create(randomUUID(), input('취소 검증'));
    const aborted = new AbortController(); aborted.abort();
    await expect(repo.setFavorite(item.id, item.updated_at, true, aborted.signal)).rejects.toMatchObject({ code: 'session_changed' });
    await expect(createWardrobeRepository(accounts[1]!.client, a.id).softDelete(item.id, item.updated_at)).rejects.toMatchObject({ code: 'session_changed' });
    expect((await repo.get(item.id))?.is_favorite).toBe(false);
    expect(wardrobeDraftSchema.parse(itemToDraft(item)).name).toBe(item.name);
  });
});
