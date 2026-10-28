import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database.generated';
import { createOutfitCatalog, defaultOutfitCatalogFilters } from '../../src/features/outfits/catalog';

const settings = JSON.parse(execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', shell: process.platform === 'win32', stdio: ['pipe', 'pipe', 'ignore'] }));
if (!['http://127.0.0.1:54321', 'http://localhost:54321'].includes(settings.API_URL)) throw new Error('Local API required');
const options = { auth: { persistSession: false, autoRefreshToken: false }, db: { retry: false } } as const;
const admin = createClient<Database>(settings.API_URL, settings.SERVICE_ROLE_KEY, options);
const accounts: { id: string; client: ReturnType<typeof createClient<Database>> }[] = [];
const specialName = '100%_special,"\\look';
const specialBrand = 'ACME%,_"\\line';
const specialTag = '태그%,_"\\봄';
const outfitIds: string[] = [];
const mutableItems: string[] = [];
let linkedId = '';
beforeAll(async () => {
  for (let index = 0; index < 2; index++) {
    const email = `closet-catalog-${randomUUID()}@example.test`;
    const password = `${randomUUID()}aA!9`;
    const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (result.error || !result.data.user) throw new Error('Fixture setup failed');
    const client = createClient<Database>(settings.API_URL, settings.ANON_KEY, options);
    accounts.push({ id: result.data.user.id, client });
    if ((await client.auth.signInWithPassword({ email, password })).error) throw new Error('Fixture login failed');
  }
  const owner = accounts[0]!.id;
  const inserted = await admin.from('outfits').insert(Array.from({ length: 14 }, (_, index) => ({ user_id: owner, name: index === 0 ? specialName : `Look ${index}`, memo: index === 1 ? 'unique memo phrase' : null, seasons: index < 7 ? ['spring'] : ['winter'], tags: index === 0 ? [specialTag] : index === 1 || index === 2 ? ['출근', '스타일'] : [], is_favorite: index === 1 || index === 8, created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString() }))).select('id,name');
  if (inserted.error) throw inserted.error;
  outfitIds.push(...Array.from({ length: 14 }, (_, index) => inserted.data.find((row) => row.name === (index === 0 ? specialName : `Look ${index}`))!.id));
  const excluded = await admin.from('outfits').insert([{ user_id: owner, name: 'deleted', tags: ['휴지통태그'], deleted_at: new Date().toISOString() }, { user_id: accounts[1]!.id, name: 'foreign', tags: ['타인태그'] }]).select('id,name,user_id');
  if (excluded.error) throw excluded.error;
  const item = await admin.from('wardrobe_items').insert({ user_id: owner, name: 'catalog shirt', category_slug: 'shirt', brand_name: specialBrand }).select('id').single();
  if (item.error) throw item.error;
  linkedId = item.data.id;
  if ((await admin.from('outfit_items').insert({ user_id: owner, item_id: linkedId, outfit_id: inserted.data.find((row) => row.name === specialName)!.id, slot: 'top' })).error) throw new Error('Nested fixture failed');
  const garments = [
    { brand: 'TEAM', category: 'shirt', slot: 'top', outfit: outfitIds[1]!, owner, archived: false, deleted: false },
    { brand: 'TEAM', category: 'shoes', slot: 'shoes', outfit: outfitIds[1]!, owner, archived: false, deleted: false },
    { brand: '가방공방', category: 'bags', slot: 'bag', outfit: outfitIds[2]!, owner, archived: true, deleted: false },
    { brand: '삭제옷브랜드', category: 'shirt', slot: 'top', outfit: outfitIds[3]!, owner, archived: false, deleted: true },
    { brand: '삭제코디전용', category: 'shirt', slot: 'top', outfit: excluded.data.find((row) => row.name === 'deleted')!.id, owner, archived: false, deleted: false },
    { brand: '타인브랜드', category: 'shirt', slot: 'top', outfit: excluded.data.find((row) => row.name === 'foreign')!.id, owner: accounts[1]!.id, archived: false, deleted: false },
  ];
  for (const garment of garments) {
    const clothing = await admin.from('wardrobe_items').insert({ user_id: garment.owner, name: '검색용 옷', category_slug: garment.category, brand_name: garment.brand, lifecycle_status: garment.archived ? 'archived' : 'active', deleted_at: garment.deleted ? new Date().toISOString() : null }).select('id').single();
    if (clothing.error) throw clothing.error;
    mutableItems.push(clothing.data.id);
    const entry = await admin.from('outfit_items').insert({ user_id: garment.owner, item_id: clothing.data.id, outfit_id: garment.outfit, slot: garment.slot });
    if (entry.error) throw entry.error;
  }
  if ((await admin.from('wardrobe_items').insert({ user_id: owner, name: '코디 미사용 의류', category_slug: 'shirt', brand_name: '미사용브랜드' })).error) throw new Error('Unlinked fixture failed');
});
afterAll(async () => { for (const account of accounts) { const result = await admin.auth.admin.deleteUser(account.id); if (result.error) throw result.error; } });

it('pages own non-deleted outfits with nested garments and independent total', async () => {
  const a = accounts[0]!;
  const catalog = createOutfitCatalog(a.client, a.id);
  const first = await catalog.list(0, defaultOutfitCatalogFilters);
  const second = await catalog.list(1, defaultOutfitCatalogFilters);
  expect(first.items).toHaveLength(12); expect(second.items).toHaveLength(2);
  expect(first.total).toBe(14); expect(first.allTotal).toBe(14);
  expect(new Set([...first.items, ...second.items].map((row) => row.id)).size).toBe(14);
  const linked = [...first.items, ...second.items].find((row) => row.name === specialName)!;
  expect(linked.outfit_items[0]?.item?.id).toBe(linkedId);
  const spring = await catalog.list(0, { ...defaultOutfitCatalogFilters, season: 'spring' });
  expect(spring.total).toBe(7); expect(spring.allTotal).toBe(14);
  expect((await catalog.list(10, defaultOutfitCatalogFilters)).items).toEqual([]);
});

it('treats search wildcards and PostgREST grammar as literal text and searches memo', async () => {
  const a = accounts[0]!;
  const catalog = createOutfitCatalog(a.client, a.id);
  for (const search of ['%', '_special', ',"\\', specialName]) {
    const result = await catalog.list(0, { ...defaultOutfitCatalogFilters, search });
    expect(result.total).toBe(1); expect(result.items[0]?.name).toBe(specialName);
  }
  expect((await catalog.list(0, { ...defaultOutfitCatalogFilters, search: 'unique memo phrase' })).total).toBe(1);
});

it('keeps owner override, anonymous access, invalid pages and aborted reads closed', async () => {
  const a = accounts[0]!;
  expect((await createOutfitCatalog(a.client, accounts[1]!.id).list(0, defaultOutfitCatalogFilters)).items).toEqual([]);
  const anonymous = createClient<Database>(settings.API_URL, settings.ANON_KEY, options);
  await expect(createOutfitCatalog(anonymous, a.id).list(0, defaultOutfitCatalogFilters)).rejects.toBeDefined();
  await expect(createOutfitCatalog(a.client, a.id).list(-1, defaultOutfitCatalogFilters)).rejects.toThrow();
  await expect(createOutfitCatalog(a.client, a.id).list(0, defaultOutfitCatalogFilters, AbortSignal.abort())).rejects.toBeDefined();
});

it('searches literal tag and brand substrings without duplicate outfits or trimming nested compositions', async () => {
  const a = accounts[0]!; const catalog = createOutfitCatalog(a.client, a.id);
  for (const search of ['스타일', 'team', '  TeAm  ', '가방공방', 'ACME%', specialBrand, specialTag]) {
    const result = await catalog.list(0, { ...defaultOutfitCatalogFilters, search });
    expect(result.total).toBe(search === '스타일' ? 2 : 1);
    expect(new Set(result.items.map((row) => row.id)).size).toBe(result.total);
  }
  const team = await catalog.list(0, { ...defaultOutfitCatalogFilters, search: 'TEAM' });
  expect(team.items[0]?.outfit_items).toHaveLength(2);
  const bag = await catalog.list(0, { ...defaultOutfitCatalogFilters, brand: '가방공방' });
  expect(bag.items[0]?.outfit_items[0]?.slot).toBe('bag');
  expect(bag.items[0]?.outfit_items[0]?.item?.lifecycle_status).toBe('archived');
  for (const search of ['타인브랜드', '타인태그', '삭제옷브랜드', '삭제코디전용', '휴지통태그', '미사용브랜드']) expect((await catalog.list(0, { ...defaultOutfitCatalogFilters, search })).total).toBe(0);
});

it('combines exact brand/tag, season, favorite and free text with AND and retains the independent total', async () => {
  const a = accounts[0]!; const catalog = createOutfitCatalog(a.client, a.id);
  const filters = { ...defaultOutfitCatalogFilters, brand: 'TEAM', tag: '출근', season: 'spring' as const, favoriteOnly: true, search: 'unique memo' };
  const match = await catalog.list(0, filters);
  expect(match.total).toBe(1); expect(match.allTotal).toBe(14); expect(match.items[0]?.id).toBe(outfitIds[1]);
  expect((await catalog.list(0, { ...filters, season: 'winter' })).items).toEqual([]);
  expect((await catalog.list(0, { ...filters, tag: '스타' })).total).toBe(0);
  expect((await catalog.list(0, { ...filters, brand: 'TE' })).total).toBe(0);
  expect((await catalog.list(0, { ...defaultOutfitCatalogFilters, favoriteOnly: true })).total).toBe(2);
  expect((await catalog.list(0, { ...defaultOutfitCatalogFilters, tag: specialTag, brand: specialBrand })).total).toBe(1);
});

it('returns distinct options only from own non-deleted saved outfits and visible linked clothes', async () => {
  const a = accounts[0]!; const catalog = createOutfitCatalog(a.client, a.id);
  expect(await catalog.filterOptions()).toEqual({ brands: [specialBrand, 'TEAM', '가방공방'], tags: ['스타일', '출근', specialTag] });
  expect(await createOutfitCatalog(a.client, accounts[1]!.id).filterOptions()).toEqual({ brands: [], tags: [] });
  expect(await createOutfitCatalog(accounts[1]!.client, accounts[1]!.id).filterOptions()).toEqual({ brands: ['타인브랜드'], tags: ['타인태그'] });
  const anonymous = createClient<Database>(settings.API_URL, settings.ANON_KEY, options);
  await expect(createOutfitCatalog(anonymous, a.id).filterOptions()).rejects.toBeDefined();
  await expect(catalog.filterOptions(AbortSignal.abort())).rejects.toBeDefined();
});

it('uses stable server pagination for many brand matches and deterministic recent/updated/name ordering', async () => {
  const a = accounts[0]!; const catalog = createOutfitCatalog(a.client, a.id);
  // Link the same garment into many own outfits; the current page must still be 12+2 outfits.
  const linked = await admin.from('outfit_items').insert(outfitIds.slice(1).map((outfit_id) => ({ user_id: a.id, outfit_id, item_id: linkedId, slot: 'top', position: 1 })));
  if (linked.error) throw linked.error;
  try {
    const filters = { ...defaultOutfitCatalogFilters, brand: specialBrand, sort: 'name' as const };
    const first = await catalog.list(0, filters); const second = await catalog.list(1, filters);
    expect(first.items).toHaveLength(12); expect(second.items).toHaveLength(2); expect(first.total).toBe(14);
    expect(new Set([...first.items, ...second.items].map((row) => row.id)).size).toBe(14);
    expect((await catalog.list(0, filters)).items.map((row) => row.id)).toEqual(first.items.map((row) => row.id));
    expect((await catalog.list(50, filters)).total).toBe(14);
    const updated = await a.client.rpc('save_outfit', { p_id: outfitIds[0]!, p_expected: (await a.client.from('outfits').select('updated_at').eq('id', outfitIds[0]!).single()).data!.updated_at,
      p_draft: { name: specialName, memo: '', occasion: '', tags: [specialTag], seasons: ['spring'], is_favorite: false, items: [{ slot: 'top', item_id: linkedId, position: 0 }] } });
    if (updated.error) throw updated.error;
    expect((await catalog.list(0, { ...defaultOutfitCatalogFilters, sort: 'updated' })).items[0]?.id).toBe(outfitIds[0]);
    expect((await catalog.list(0, { ...defaultOutfitCatalogFilters, sort: 'recent' })).items[0]?.id).not.toBe(outfitIds[0]);
    const oldest = await catalog.list(0, { ...defaultOutfitCatalogFilters, sort: 'oldest' });
    expect(oldest.items[0]?.id).toBe(outfitIds[0]);
  } finally {
    const removed = await admin.from('outfit_items').delete().eq('user_id', a.id).eq('item_id', linkedId).eq('position', 1);
    if (removed.error) throw removed.error;
  }
});

it('reflects garment brand/deletion changes in both search and options while preserving outfit counts', async () => {
  const a = accounts[0]!; const catalog = createOutfitCatalog(a.client, a.id); const id = mutableItems[2]!;
  try {
    if ((await a.client.from('wardrobe_items').update({ brand_name: '바뀐브랜드' }).eq('id', id)).error) throw new Error('Brand update failed');
    expect((await catalog.list(0, { ...defaultOutfitCatalogFilters, search: '가방공방' })).total).toBe(0);
    expect((await catalog.list(0, { ...defaultOutfitCatalogFilters, brand: '바뀐브랜드' })).items[0]?.id).toBe(outfitIds[2]);
    expect((await catalog.filterOptions()).brands).toContain('바뀐브랜드');
    if ((await a.client.from('wardrobe_items').update({ deleted_at: new Date().toISOString() }).eq('id', id)).error) throw new Error('Soft delete failed');
    expect((await catalog.list(0, { ...defaultOutfitCatalogFilters, search: '바뀐브랜드' })).total).toBe(0);
    expect((await catalog.filterOptions()).brands).not.toContain('바뀐브랜드');
    expect((await catalog.list(0, defaultOutfitCatalogFilters)).allTotal).toBe(14);
  } finally { if ((await a.client.from('wardrobe_items').update({ brand_name: '가방공방', deleted_at: null }).eq('id', id)).error) throw new Error('Fixture restore failed'); }
});

it('rejects invalid direct RPC filters and does not interpret filter text as SQL or wildcard syntax', async () => {
  const a = accounts[0]!;
  for (const patch of [{ p_search: 'a'.repeat(201) }, { p_brand: 'a'.repeat(121) }, { p_tag: 'a'.repeat(41) }, { p_sort: 'created_at;drop table outfits' }, { p_season: 'unknown' }]) {
    expect((await a.client.rpc('search_outfits', { p_owner: a.id, ...patch })).error?.code).toBe('22023');
  }
  const response = await fetch(`${settings.API_URL}/rest/v1/rpc/search_outfits`, { method: 'POST', headers: { apikey: settings.ANON_KEY, Authorization: `Bearer ${(await a.client.auth.getSession()).data.session!.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_owner: a.id, p_tag: null }) });
  expect((await response.json()).code).toBe('22023');
  expect((await createOutfitCatalog(a.client, a.id).list(0, { ...defaultOutfitCatalogFilters, search: "'); select * from outfits; --" })).total).toBe(0);
});

it('paginates 300 outfits with several matching garments and recounts a page removed by another session', async () => {
  const a = accounts[0]!; const catalog = createOutfitCatalog(a.client, a.id);
  const ids = Array.from({ length: 300 }, () => randomUUID());
  try {
    const inserted = await admin.from('outfits').insert(ids.map((id, index) => ({ id, user_id: a.id, name: `대량검증-${String(index).padStart(3, '0')}`, tags: ['대량검증'], seasons: ['spring'], is_favorite: index % 10 === 0 })));
    if (inserted.error) throw inserted.error;
    const linked = await admin.from('outfit_items').insert(ids.flatMap((outfit_id) => [
      { outfit_id, user_id: a.id, item_id: mutableItems[0]!, slot: 'top' },
      { outfit_id, user_id: a.id, item_id: mutableItems[1]!, slot: 'shoes' },
    ]));
    if (linked.error) throw linked.error;
    const filters = { ...defaultOutfitCatalogFilters, tag: '대량검증', brand: 'TEAM', sort: 'name' as const };
    const first = await catalog.list(0, filters); const last = await catalog.list(24, filters);
    expect(first.total).toBe(300); expect(first.allTotal).toBe(314);
    expect(first.items).toHaveLength(12); expect(last.items).toHaveLength(12);
    expect(first.items[0]?.name).toBe('대량검증-000'); expect(last.items[11]?.name).toBe('대량검증-299');
    expect(first.items.every((row) => row.outfit_items.length === 2)).toBe(true);
    expect((await catalog.list(0, { ...filters, favoriteOnly: true })).total).toBe(30);
    const deleted = await admin.from('outfits').update({ deleted_at: new Date().toISOString() }).eq('user_id', a.id).in('id', ids.slice(288));
    if (deleted.error) throw deleted.error;
    const gone = await catalog.list(24, filters);
    expect(gone).toMatchObject({ items: [], total: 288, allTotal: 302 });
    expect((await catalog.list(23, filters)).items[11]?.name).toBe('대량검증-287');
  } finally {
    const removed = await admin.from('outfits').delete().eq('user_id', a.id).contains('tags', ['대량검증']);
    if (removed.error) throw removed.error;
  }
});
