import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database.generated';
import { createCategoryService, readMemberCategories } from '../../src/features/categories/service';
import { completeCategoryOrder, customCategorySlug, isRetiredCategory } from '../../src/features/categories/model';
import { createWardrobeRepository } from '../../src/features/wardrobe/repository';
import { defaultFilters } from '../../src/features/wardrobe/filters';
import { createOutfitRepository } from '../../src/features/outfits/repository';
import { emptyOutfitDraft } from '../../src/features/outfits/draft';
import { createWearRepository } from '../../src/features/wear/repository';
import { localDockerSupabase } from '../helpers/local-supabase';

const settings = localDockerSupabase();
if (!['http://127.0.0.1:54321', 'http://localhost:54321'].includes(settings.API_URL)) throw new Error('Local API required');
const connection = { url: settings.API_URL as string, key: settings.ANON_KEY as string };
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, db: { retry: false } } as const;
const admin = createClient<Database>(connection.url, settings.SERVICE_ROLE_KEY, options);
const anon = createClient<Database>(connection.url, connection.key, options);
const accounts: { id: string; client: ReturnType<typeof createClient<Database>> }[] = [];
const service = (index = 0, transport?: typeof fetch) => createCategoryService(accounts[index]!.client, accounts[index]!.id, connection, transport);
const list = (index = 0) => readMemberCategories(accounts[index]!.client, accounts[index]!.id);
const add = (name: string, parent = 'tops', index = 0) => service(index).save({ slug: customCategorySlug(randomUUID()), name, parent, active: true });
beforeAll(async () => {
  for (let i = 0; i < 2; i++) {
    const email = `closet-categories-${randomUUID()}@example.test`; const password = `${randomUUID()}aA!9`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error('Category fixture setup failed');
    const client = createClient<Database>(connection.url, connection.key, options);
    accounts.push({ id: created.data.user.id, client });
    if ((await client.auth.signInWithPassword({ email, password })).error) throw new Error('Category fixture login failed');
  }
});
afterAll(async () => {
  for (const account of accounts) {
    if ((await admin.auth.admin.deleteUser(account.id)).error) throw new Error('Category fixture cleanup failed');
    expect((await admin.from('categories').select('slug').eq('user_id', account.id)).data).toEqual([]);
    expect((await admin.from('category_preferences').select('category_slug').eq('user_id', account.id)).data).toEqual([]);
  }
});

describe('member category directory on actual local Supabase', () => {
  it('reproduces the reported duplicate-name rejection and saves a genuinely new name', async () => {
    const row = await add('반팔');
    await expect(service().save({ slug: row.slug, parent: 'tops', name: '티셔츠', active: true, expected: row.updated_at })).rejects.toMatchObject({ code: '23505' });
    expect((await list()).find((entry) => entry.slug === row.slug)?.label_ko).toBe('반팔');
    const changed = await service().save({ slug: row.slug, parent: 'tops', name: '테스트 반팔', active: true, expected: row.updated_at });
    expect(changed.label_ko).toBe('테스트 반팔');
    expect((await list()).find((entry) => entry.slug === row.slug)?.label_ko).toBe(changed.label_ko);
  });
  it('deletes an empty custom leaf, preserves a retry result, and blocks creation/edit resurrection', async () => {
    const row = await add('삭제할 분류');
    const removed = await service().remove(row);
    expect(removed).toMatchObject({ category_slug: row.slug, parent_slug: 'tops', target_slug: 'tops', moved_items: 0 });
    expect((await list()).some((entry) => entry.slug === row.slug)).toBe(false);
    expect((await accounts[0]!.client.from('category_preferences').select().eq('category_slug', row.slug)).data).toEqual([]);
    expect(await service().remove(row)).toEqual(removed);
    await expect(service().remove(row, 'tshirt')).rejects.toMatchObject({ code: '40001' });
    await expect(service().save({ slug: row.slug, parent: 'tops', name: row.label_ko, active: true })).rejects.toMatchObject({ code: 'P0002' });
    await expect(service().save({ slug: row.slug, parent: 'tops', name: '재생성', active: true, expected: row.updated_at })).rejects.toMatchObject({ code: 'P0002' });
    expect((await add(row.label_ko)).slug).not.toBe(row.slug);
  });
  it('merges into an existing sibling while preserving active/trashed garments, outfits and wear snapshots', async () => {
    const row = await add('합칠 개인 분류');
    const a = accounts[0]!;
    const clothes = await a.client.from('wardrobe_items').insert([{ name: '분류 이동 옷', category_slug: row.slug }, { name: '휴지통 분류 이동 옷', category_slug: row.slug }]).select();
    if (clothes.error || clothes.data.length !== 2) throw new Error('Merge fixture failed');
    const first = clothes.data[0]!; const second = clothes.data[1]!;
    const outfit = await createOutfitRepository(a.client, a.id, connection).save(randomUUID(), null, { ...emptyOutfitDraft(), name: '분류 합치기 코디', items: { top: first.id } });
    const event = await createWearRepository(a.client, a.id, connection).record(randomUUID(), { kind: 'items', wornOn: '2026-10-29', memo: '분류 이전 기록', itemIds: [first.id, second.id] });
    if ((await a.client.from('wardrobe_items').update({ deleted_at: new Date().toISOString() }).eq('id', second.id)).error) throw new Error('Trash fixture failed');
    const result = await service().remove(row, 'tshirt');
    expect(result.moved_items).toBe(2);
    const after = await a.client.from('wardrobe_items').select().in('id', [first.id, second.id]);
    expect(after.data?.every((item) => item.category_slug === 'tshirt')).toBe(true);
    expect(after.data?.find((item) => item.id === second.id)?.deleted_at).not.toBeNull();
    expect((await a.client.from('outfit_items').select('item_id').eq('outfit_id', outfit.id)).data).toEqual([{ item_id: first.id }]);
    expect((await a.client.from('wear_event_items').select('item_id').eq('wear_event_id', event.id)).data?.map((item) => item.item_id).sort()).toEqual([first.id, second.id].sort());
    const repeated = await service().remove(row, 'tshirt');
    expect(repeated).toEqual(result);
  });
  it('moves a connected garment into its parent on ordinary deletion and rejects invalid targets atomically', async () => {
    const row = await add('상위로 이동'); const a = accounts[0]!;
    const clothing = await a.client.from('wardrobe_items').insert({ name: '상위 분류 옷', category_slug: row.slug }).select().single();
    if (clothing.error) throw clothing.error;
    await expect(service().remove(row, 'shoes')).rejects.toMatchObject({ code: '22023' });
    await expect(service().remove(row, row.slug)).rejects.toMatchObject({ code: '22023' });
    expect((await a.client.from('wardrobe_items').select('category_slug').eq('id', clothing.data.id).single()).data?.category_slug).toBe(row.slug);
    expect((await list()).some((entry) => entry.slug === row.slug)).toBe(true);
    expect((await service().remove(row)).moved_items).toBe(1);
    expect((await a.client.from('wardrobe_items').select('category_slug').eq('id', clothing.data.id).single()).data?.category_slug).toBe('tops');
  });
  it('rejects foreign/root categories, anonymous calls and direct tombstone writes', async () => {
    const row = await add('삭제 권한'); const foreign = await add('타인 대상', 'tops', 1);
    await expect(service(1).remove(row)).rejects.toMatchObject({ code: '42501' });
    await expect(service().remove(row, foreign.slug)).rejects.toMatchObject({ code: '22023' });
    expect((await accounts[0]!.client.rpc('delete_member_category', { p_slug: 'tops', p_expected: '1970-01-01T00:00:00Z' })).error?.code).toBe('42501');
    expect((await anon.rpc('delete_member_category', { p_slug: row.slug, p_expected: row.updated_at })).error?.code).toBe('42501');
    expect((await anon.from('category_deletions').select()).error?.code).toBe('42501');
    expect((await accounts[0]!.client.from('category_deletions').insert({ category_slug: row.slug, parent_slug: 'tops', target_slug: 'tops', moved_items: 0, user_id: accounts[0]!.id })).error?.code).toBe('42501');
    await service().remove(row);
    expect((await accounts[1]!.client.from('category_deletions').select().eq('category_slug', row.slug)).data).toEqual([]);
    expect((await accounts[0]!.client.from('category_deletions').delete().eq('category_slug', row.slug)).error?.code).toBe('42501');
    await service(1).remove(foreign);
  });
  it('handles stale/concurrent deletion and a lost commit response without duplicate moves', async () => {
    const row = await add('삭제 충돌');
    const changed = await service().save({ slug: row.slug, parent: row.parent_slug, name: '삭제 충돌 최신', active: true, expected: row.updated_at });
    await expect(service().remove(row)).rejects.toMatchObject({ code: '40001' });
    const results = await Promise.allSettled([service().remove(changed), service().save({ slug: changed.slug, parent: changed.parent_slug, name: '삭제 경합 수정', active: true, expected: changed.updated_at })]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const retry = await add('삭제 응답 유실');
    let lost = false;
    const transport: typeof fetch = async (url, init) => { const response = await fetch(url, init); if (!lost && response.ok && String(url).includes('/rpc/delete_member_category')) { lost = true; throw new TypeError('response lost'); } return response; };
    await expect(service(0, transport).remove(retry)).rejects.toBeTruthy();
    expect(lost).toBe(true);
    expect((await service().remove(retry)).category_slug).toBe(retry.slug);
    const controller = new AbortController(); controller.abort();
    await expect(service().remove(changed, undefined, controller.signal)).rejects.toMatchObject({ code: 'session_changed' });
  });
  it('personalizes templates without changing shared or other-member labels', async () => {
    const before = await list();
    expect(before.filter((row) => !row.parent_slug)).toHaveLength(7);
    const root = before.find((row) => row.slug === 'tops')!;
    const saved = await service().save({ slug: root.slug, parent: null, name: '내 상의', active: true, expected: root.updated_at });
    expect(saved).toMatchObject({ slug: 'tops', label_ko: '내 상의', is_custom: false });
    expect(saved.updated_at).not.toBe(root.updated_at);
    expect((await list(1)).find((row) => row.slug === 'tops')?.label_ko).toBe(root.label_ko);
    expect((await anon.from('categories').select('label_ko').eq('slug', 'tops').single()).data?.label_ko).toBe(root.label_ko);
    expect((await accounts[0]!.client.rpc('member_categories', { p_owner: accounts[1]!.id })).data).toEqual([]);
  });
  it('isolates custom leaves and forbids direct or anonymous writes', async () => {
    const row = await add('개인 후드티');
    expect(row).toMatchObject({ is_custom: true, parent_slug: 'tops', is_active: true });
    expect((await list(1)).some((entry) => entry.slug === row.slug)).toBe(false);
    expect((await anon.from('categories').select().eq('slug', row.slug)).data).toEqual([]);
    expect((await accounts[1]!.client.from('categories').select().eq('slug', row.slug)).data).toEqual([]);
    expect((await accounts[1]!.client.from('category_preferences').select()).data).toEqual([]);
    expect((await accounts[0]!.client.from('categories').insert({ slug: customCategorySlug(randomUUID()), label_ko: '직접 쓰기', parent_slug: 'tops', user_id: accounts[0]!.id })).error?.code).toBe('42501');
    expect((await accounts[0]!.client.from('category_preferences').insert({ user_id: accounts[0]!.id, category_slug: 'tops', label_ko: '직접 수정' })).error?.code).toBe('42501');
    expect((await accounts[0]!.client.from('category_preferences').update({ is_active: false }).eq('category_slug', 'tops')).error?.code).toBe('42501');
    expect((await accounts[0]!.client.from('category_preferences').delete().eq('category_slug', 'tops')).error?.code).toBe('42501');
    expect((await accounts[0]!.client.from('categories').delete().eq('slug', row.slug)).error?.code).toBe('42501');
    expect((await anon.rpc('member_categories', { p_owner: accounts[0]!.id })).error?.code).toBe('42501');
    expect((await anon.rpc('reorder_member_categories', { p_parent: '', p_expected: [], p_order: [] })).error?.code).toBe('42501');
    expect((await anon.rpc('save_member_category', { p_slug: row.slug, p_label: '익명', p_active: true })).error?.code).toBe('42501');
    await expect(service(1).save({ slug: row.slug, parent: 'tops', name: '탈취', active: true, expected: row.updated_at })).rejects.toMatchObject({ code: '42501' });
    expect((await add('개인 후드티', 'tops', 1)).slug).not.toBe(row.slug);
  });
  it('keeps custom garments, root searches, saved outfits and insight labels valid after rename/hide', async () => {
    let row = await add('코디용 셔츠');
    const owner = accounts[0]!;
    const created = await owner.client.from('wardrobe_items').insert({ name: '개인 분류 옷', category_slug: row.slug }).select().single();
    if (created.error) throw created.error;
    const item = created.data;
    const outfitRepo = createOutfitRepository(owner.client, owner.id, connection);
    const draft = { ...emptyOutfitDraft(), name: '개인 분류 코디', items: { top: item.id } };
    const outfit = await outfitRepo.save(randomUUID(), null, draft);
    row = await service().save({ slug: row.slug, parent: row.parent_slug, name: '숨긴 셔츠', active: false, expected: row.updated_at });
    const root = (await list()).find((entry) => entry.slug === 'tops')!;
    await service().save({ slug: root.slug, parent: null, name: '내 상의', active: false, expected: root.updated_at });
    expect((await outfitRepo.save(outfit.id, outfit.updated_at, { ...draft, name: '숨겨도 코디 수정 가능' })).id).toBe(outfit.id);
    const repo = createWardrobeRepository(owner.client, owner.id);
    expect((await repo.list(0, undefined, { ...defaultFilters, category: 'tops' })).items.some((entry) => entry.id === item.id)).toBe(true);
    expect((await owner.client.from('wardrobe_items').update({ name: '숨겨도 옷 수정 가능' }).eq('id', item.id)).error).toBeNull();
    const insights = await owner.client.rpc('wardrobe_insights', { p_owner: owner.id, p_as_of: '2026-10-29' });
    expect(insights.error).toBeNull();
    expect(JSON.stringify(insights.data)).toContain('내 상의');
    const foreign = await accounts[1]!.client.from('wardrobe_items').insert({ name: '타인 분류 옷', category_slug: row.slug });
    expect(foreign.error?.code).toBe('23503');
    expect((await admin.from('wardrobe_items').insert({ user_id: accounts[1]!.id, name: '서버도 소유자 검사', category_slug: row.slug })).error?.code).toBe('23503');
  });
  it('validates names, duplicate siblings, fixed parents and immutable canonical roots', async () => {
    const owner = accounts[0]!;
    await add('Duplicate');
    await expect(add(' duplicate ')).rejects.toMatchObject({ code: '23505' });
    const row = await add('다른 종류 동명', 'shoes');
    await add('다른 종류 동명', 'bags');
    await expect(service().save({ slug: row.slug, parent: 'tops', name: row.label_ko, active: true, expected: row.updated_at })).rejects.toMatchObject({ code: '22023' });
    for (const [name, parent] of [['', 'tops'], ['가'.repeat(81), 'tops'], ['새 대분류', ''], ['중첩 분류', row.slug]]) {
      expect((await owner.client.rpc('save_member_category', { p_slug: customCategorySlug(randomUUID()), p_label: name!, p_active: true, p_parent: parent! })).error?.code).toBe('22023');
    }
    expect((await owner.client.rpc('save_member_category', { p_slug: 'new-root', p_label: '새 종류', p_active: true })).error?.code).toBe('22023');
    expect((await admin.from('categories').insert({ slug: customCategorySlug(randomUUID()), label_ko: '잘못된 중첩', parent_slug: row.slug, user_id: owner.id })).error?.code).toBe('23514');
  });
  it('reorders complete sibling groups atomically and rejects stale or malformed orders', async () => {
    const roots = (await list()).filter((row) => !row.parent_slug);
    const expected = roots.map((row) => row.slug); const order = [...expected].reverse();
    const reordered = await service().reorder(null, expected, order);
    expect(reordered.filter((row) => !row.parent_slug).map((row) => row.slug)).toEqual(order);
    expect(reordered.find((row) => row.slug === 'tops')?.updated_at).not.toBe(roots.find((row) => row.slug === 'tops')?.updated_at);
    expect((await list()).filter((row) => !row.parent_slug).map((row) => row.slug)).toEqual(order);
    expect((await list(1)).filter((row) => !row.parent_slug).map((row) => row.slug)).toEqual(expected);
    expect((await list()).find((row) => row.slug === 'tops')).toMatchObject({ label_ko: '내 상의', is_active: false });
    await expect(service().reorder(null, expected, order)).rejects.toMatchObject({ code: '40001' });
    for (const invalid of [order.slice(1), order.map(() => order[0]!), [...order.slice(1), 'foreign']]) {
      await expect(service().reorder(null, order, invalid)).rejects.toMatchObject({ code: '22023' });
    }
    const children = (await list()).filter((row) => row.parent_slug === 'tops').map((row) => row.slug);
    await service().reorder('tops', children, [...children].reverse());
    expect((await list()).filter((row) => row.parent_slug === 'tops').map((row) => row.slug)).toEqual([...children].reverse());
    const nullElement = await accounts[0]!.client.rpc('reorder_member_categories', { p_parent: '', p_expected: order, p_order: [null, ...order.slice(1)] as unknown as string[] });
    expect(nullElement.error?.code).toBe('22023');
    expect((await list()).filter((row) => !row.parent_slug).map((row) => row.slug)).toEqual(order);
  });
  it('saves a six-type drag order while preserving the retired root and member isolation', async () => {
    const roots = (await list()).filter((row) => row.parent_slug === null);
    const expected = roots.filter((row) => !isRetiredCategory(row)).map((row) => row.slug);
    const order = [...expected.slice(1), expected[0]!];
    const complete = completeCategoryOrder(roots, expected, order)!;
    expect(expected).toHaveLength(6);
    expect(complete).toHaveLength(7);
    expect(complete.indexOf('onepiece')).toBe(roots.findIndex((row) => row.slug === 'onepiece'));
    const otherBefore = (await list(1)).filter((row) => row.parent_slug === null).map((row) => row.slug);
    const result = await service().reorder(null, roots.map((row) => row.slug), complete);
    expect(result.filter((row) => row.parent_slug === null && !isRetiredCategory(row)).map((row) => row.slug)).toEqual(order);
    expect(result.find((row) => row.slug === 'onepiece')).toBeDefined();
    expect((await list(1)).filter((row) => row.parent_slug === null).map((row) => row.slug)).toEqual(otherBefore);
    await expect(service().reorder(null, roots.map((row) => row.slug), complete)).rejects.toMatchObject({ code: '40001' });
  });
  it('rejects stale edits and handles response loss without duplicating or overwriting', async () => {
    const row = await add('동시 변경 시작');
    const input = { slug: row.slug, parent: row.parent_slug, active: true, expected: row.updated_at };
    const results = await Promise.allSettled([service().save({ ...input, name: '동시 변경 A' }), service().save({ ...input, name: '동시 변경 B' })]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { code: '40001' } });
    let lost = false;
    const transport: typeof fetch = async (url, init) => { const response = await fetch(url, init); if (!lost && response.ok) { lost = true; throw new TypeError('response lost'); } return response; };
    const fresh = { slug: customCategorySlug(randomUUID()), name: '응답 유실', parent: 'tops', active: true };
    await expect(service(0, transport).save(fresh)).rejects.toBeTruthy();
    expect(lost).toBe(true);
    const recovered = await service().save(fresh);
    expect((await list()).filter((entry) => entry.slug === fresh.slug)).toHaveLength(1);
    const renamed = await service().save({ ...fresh, name: '응답 유실 수정', expected: recovered.updated_at });
    expect((await service().save({ ...fresh, name: renamed.label_ko, expected: recovered.updated_at })).updated_at).toBe(renamed.updated_at);
    await expect(service().save({ ...fresh, name: '오래된 입력', expected: recovered.updated_at })).rejects.toMatchObject({ code: '40001' });
  });
  it('paginates directories larger than the API limit', async () => {
    const rows = Array.from({ length: 1005 }, (_, position) => ({ slug: customCategorySlug(randomUUID()), label_ko: `목록${position}`, parent_slug: 'tops', user_id: accounts[0]!.id, position }));
    if ((await admin.from('categories').insert(rows)).error) throw new Error('Bulk category setup failed');
    try { expect((await list()).filter((row) => row.label_ko.startsWith('목록'))).toHaveLength(1005); }
    finally { for (let start = 0; start < rows.length; start += 100) if ((await admin.from('categories').delete().in('slug', rows.slice(start, start + 100).map((row) => row.slug))).error) throw new Error('Bulk category cleanup failed'); }
  });
  it('pins the starting token and refuses changed sessions or pre-cancelled requests', async () => {
    const a = accounts[0]!; const b = accounts[1]!;
    const original = (await a.client.auth.getSession()).data.session!; const other = (await b.client.auth.getSession()).data.session!;
    let swapped = false;
    const transport: typeof fetch = async (url, init) => { if (!swapped) { swapped = true; await a.client.auth.setSession({ access_token: other.access_token, refresh_token: other.refresh_token }); } return fetch(url, init); };
    const slug = customCategorySlug(randomUUID());
    try {
      await service(0, transport).save({ slug, name: '시작 계정 유지', parent: 'tops', active: true });
      expect((await list(1)).some((row) => row.slug === slug)).toBe(false);
      await expect(service().save({ slug, name: '잘못된 계정', parent: 'tops', active: true })).rejects.toMatchObject({ code: 'session_changed' });
    } finally { await a.client.auth.setSession({ access_token: original.access_token, refresh_token: original.refresh_token }); }
    const controller = new AbortController(); controller.abort();
    await expect(service().save({ slug, name: '취소', parent: 'tops', active: true }, controller.signal)).rejects.toMatchObject({ code: 'session_changed' });
  });
  it('deletes a template only for its member and preserves garments, images, outfits and wear records', async () => {
    const a = accounts[0]!; const b = accounts[1]!;
    const row = (await list()).find(item => item.slug === 'jacket')!;
    const otherRow = (await list(1)).find(item => item.slug === row.slug)!;
    const inserted = await a.client.from('wardrobe_items').insert([{ name: '기본 재킷', category_slug: row.slug }, { name: '휴지통 재킷', category_slug: row.slug }]).select();
    if (inserted.error || inserted.data.length !== 2) throw new Error('Template garment fixture failed');
    const [first, trashed] = inserted.data;
    const foreign = await b.client.from('wardrobe_items').insert({ name: '다른 회원 재킷', category_slug: row.slug }).select().single();
    if (foreign.error) throw foreign.error;
    const path = `${a.id}/items/${first!.id}/${randomUUID()}.jpg`;
    const photo = await a.client.from('item_images').insert({ item_id: first!.id, storage_path: path }).select().single();
    if (photo.error) throw photo.error;
    const repo = createOutfitRepository(a.client, a.id, connection);
    const draft = { ...emptyOutfitDraft(), name: '재킷 코디', items: { outerwear: first!.id } };
    const outfit = await repo.save(randomUUID(), null, draft);
    const event = await createWearRepository(a.client, a.id, connection).record(randomUUID(), { kind: 'items', wornOn: '2026-10-30', memo: '기본 분류 삭제 전', itemIds: [first!.id] });
    if ((await a.client.from('wardrobe_items').update({ deleted_at: new Date().toISOString() }).eq('id', trashed!.id)).error) throw new Error('Trash fixture failed');
    const deleted = await service().remove(row);
    expect(deleted).toMatchObject({ category_slug: 'jacket', target_slug: 'outerwear', moved_items: 2 });
    expect(await service().remove(row)).toEqual(deleted);
    expect((await list()).some(item => item.slug === row.slug)).toBe(false);
    expect((await list(1)).find(item => item.slug === row.slug)).toEqual(otherRow);
    expect((await a.client.from('wardrobe_items').select().in('id', inserted.data.map(item => item.id))).data).toEqual(expect.arrayContaining([expect.objectContaining({ id: first!.id, category_slug: 'outerwear', deleted_at: null }), expect.objectContaining({ id: trashed!.id, category_slug: 'outerwear', deleted_at: expect.any(String) })]));
    expect((await b.client.from('wardrobe_items').select('category_slug').eq('id', foreign.data.id).single()).data?.category_slug).toBe('jacket');
    expect((await a.client.from('item_images').select('storage_path').eq('id', photo.data.id).single()).data?.storage_path).toBe(path);
    expect((await a.client.from('outfit_items').select('item_id').eq('outfit_id', outfit.id)).data).toEqual([{ item_id: first!.id }]);
    expect((await a.client.from('wear_event_items').select('item_id').eq('wear_event_id', event.id)).data).toEqual([{ item_id: first!.id }]);
    expect((await repo.save(outfit.id, outfit.updated_at, { ...draft, name: '분류 삭제 후 수정' })).id).toBe(outfit.id);
    expect((await admin.from('categories').select('slug').eq('slug', 'jacket').single()).data?.slug).toBe('jacket');
    await expect(service().save({ slug: row.slug, parent: row.parent_slug, name: '복구 시도', active: true, expected: row.updated_at })).rejects.toMatchObject({ code: 'P0002' });
    expect((await a.client.from('wardrobe_items').insert({ name: '오래된 선택지', category_slug: 'jacket' })).error?.code).toBe('23503');
    expect((await a.client.from('wardrobe_items').update({ category_slug: 'jacket' }).eq('id', first!.id)).error?.code).toBe('23503');
    const replacement = await add(row.label_ko, 'outerwear');
    expect(replacement.slug).not.toBe(row.slug);
    const secondDelete = await service(1).remove(otherRow);
    expect(secondDelete.moved_items).toBe(1);
    expect((await a.client.from('category_deletions').select().eq('category_slug', row.slug)).data).toHaveLength(1);
    expect((await b.client.from('category_deletions').select().eq('category_slug', row.slug)).data).toHaveLength(1);
  });
  it('rejects stale template deletes and deleted merge destinations, and recovers a lost response', async () => {
    const row = (await list()).find(item => item.slug === 'coat')!;
    const changed = await service().save({ slug: row.slug, parent: row.parent_slug, name: '나의 코트', active: true, expected: row.updated_at });
    await expect(service().remove(row)).rejects.toMatchObject({ code: '40001' });
    const custom = await add('삭제된 대상으로 합치기', 'outerwear');
    await expect(service().remove(custom, 'jacket')).rejects.toMatchObject({ code: '22023' });
    expect((await list()).some(item => item.slug === custom.slug)).toBe(true);
    let lost = false;
    const transport: typeof fetch = async (url, init) => { const response = await fetch(url, init); if (!lost && response.ok && String(url).includes('/rpc/delete_member_category')) { lost = true; throw new TypeError('lost template response'); } return response; };
    await expect(service(0, transport).remove(changed)).rejects.toBeTruthy();
    expect(lost).toBe(true);
    expect((await service().remove(changed)).category_slug).toBe('coat');
    expect((await list(1)).some(item => item.slug === 'coat')).toBe(true);
    const current = (await list()).filter(item => item.parent_slug === 'outerwear').map(item => item.slug);
    await expect(service().reorder('outerwear', [row.slug, ...current], [...current, row.slug])).rejects.toMatchObject({ code: '40001' });
    await service().reorder('outerwear', current, [...current].reverse());
    expect((await list()).filter(item => item.parent_slug === 'outerwear').map(item => item.slug)).toEqual([...current].reverse());
  });
});
