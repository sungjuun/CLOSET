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
  const inserted = await admin.from('outfits').insert(Array.from({ length: 14 }, (_, index) => ({ user_id: owner, name: index === 0 ? specialName : `Look ${index}`, memo: index === 1 ? 'unique memo phrase' : null, seasons: index < 7 ? ['spring'] : ['winter'] }))).select('id,name');
  if (inserted.error) throw inserted.error;
  if ((await admin.from('outfits').insert([{ user_id: owner, name: 'deleted', deleted_at: new Date().toISOString() }, { user_id: accounts[1]!.id, name: 'foreign' }])).error) throw new Error('Excluded fixture failed');
  const item = await admin.from('wardrobe_items').insert({ user_id: owner, name: 'catalog shirt', category_slug: 'shirt' }).select('id').single();
  if (item.error) throw item.error;
  linkedId = item.data.id;
  if ((await admin.from('outfit_items').insert({ user_id: owner, item_id: linkedId, outfit_id: inserted.data.find((row) => row.name === specialName)!.id, slot: 'top' })).error) throw new Error('Nested fixture failed');
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
