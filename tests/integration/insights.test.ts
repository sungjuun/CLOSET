import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database.generated';
import { createInsightRepository } from '../../src/features/insights/repository';
import { insightSummarySchema, type InsightScope } from '../../src/features/insights/model';
import { createWearRepository } from '../../src/features/wear/repository';

const settings = JSON.parse(execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', shell: process.platform === 'win32', stdio: ['pipe', 'pipe', 'ignore'] }));
if (!['http://127.0.0.1:54321', 'http://localhost:54321'].includes(settings.API_URL)) throw new Error('Local API required');
const connection = { url: settings.API_URL as string, key: settings.ANON_KEY as string };
const options = { auth: { persistSession: false, autoRefreshToken: false }, db: { retry: false } } as const;
const admin = createClient<Database>(connection.url, settings.SERVICE_ROLE_KEY, options);
const accounts: { id: string; client: ReturnType<typeof createClient<Database>> }[] = [];
const ids: Record<string, string> = {};
const scope: InsightScope = { asOf: '2026-10-28', period: '30' };
function repo(index = 0, transport: typeof fetch = fetch) { const a = accounts[index]!; return createInsightRepository(a.client, a.id, connection, transport); }
function wear(index = 0) { const a = accounts[index]!; return createWearRepository(a.client, a.id, connection); }
async function record(date: string, items: string[], index = 0) { return wear(index).record(randomUUID(), { kind: 'items', wornOn: date, memo: '', itemIds: items }); }
async function patch(id: string, values: Database['public']['Tables']['wardrobe_items']['Update']) { const result = await admin.from('wardrobe_items').update(values).eq('id', id); if (result.error) throw result.error; }
beforeAll(async () => {
  for (let index = 0; index < 2; index++) {
    const email = `closet-insights-${randomUUID()}@example.test`; const password = `${randomUUID()}aA!9`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error('Fixture account failed');
    const client = createClient<Database>(connection.url, connection.key, options);
    accounts.push({ id: created.data.user.id, client });
    if ((await client.auth.signInWithPassword({ email, password })).error) throw new Error('Fixture login failed');
  }
  const fixtures = [
    { key: 'a', category: 'shirt', brand: 'TEAM', price: 120, currency: 'KRW' },
    { key: 'b', category: 'shoes', brand: 'ZERO', price: 0, currency: 'KRW' },
    { key: 'c', category: 'bags', brand: null, price: null, currency: 'USD' },
    { key: 'd', category: 'coat', brand: 'TEAM', price: 200, currency: 'USD' },
    { key: 'e', category: 'denim', brand: 'PAST', price: 60, currency: 'KRW' },
    { key: 'f', category: 'accessories', brand: 'FUTURE', price: 50, currency: 'EUR' },
    { key: 'g', category: 'shirt', brand: '특수%,_"\\브랜드', price: 10, currency: 'KRW' },
    { key: 'h', category: 'onepiece', brand: 'NEVER', price: null, currency: 'KRW' },
    { key: 'trash', category: 'shirt', brand: '휴지통', price: 999, currency: 'KRW' },
  ];
  for (const [index, item] of fixtures.entries()) {
    ids[item.key] = randomUUID();
    const result = await admin.from('wardrobe_items').insert({ id: ids[item.key]!, user_id: accounts[0]!.id, name: item.key === 'g' ? '격식 %,_"\\셔츠' : `통계 옷 ${item.key}`, category_slug: item.category, brand_name: item.brand, purchase_price: item.price, currency: item.currency, created_at: new Date(Date.UTC(2026, 0, index + 1)).toISOString() });
    if (result.error) throw result.error;
  }
  await record('2026-07-30', [ids.a!]); await record('2026-07-31', [ids.a!]); await record('2026-09-28', [ids.a!]);
  await record('2026-09-29', [ids.a!, ids.b!, ids.c!]); await record('2026-10-28', [ids.a!, ids.b!]); await record('2026-10-28', [ids.a!]);
  await record('2026-06-01', [ids.d!]); await record('2026-07-31', [ids.e!]); await record('2026-10-29', [ids.f!]); await record('2026-10-10', [ids.trash!]);
  const deleted = await record('2026-10-27', [ids.a!]); await wear().remove(deleted.id, deleted.updated_at);
  await patch(ids.d!, { lifecycle_status: 'archived' }); await patch(ids.e!, { lifecycle_status: 'sold' }); await patch(ids.f!, { lifecycle_status: 'donated' }); await patch(ids.trash!, { deleted_at: '2026-10-28T00:00:00Z' });
  ids.foreign = randomUUID();
  const other = await admin.from('wardrobe_items').insert({ id: ids.foreign, user_id: accounts[1]!.id, name: '타인 통계', category_slug: 'shirt', brand_name: '타인브랜드', currency: 'JPY', purchase_price: 700 });
  if (other.error) throw other.error;
  await record('2026-10-28', [ids.foreign], 1);
});
afterAll(async () => { for (const a of accounts) { const result = await admin.auth.admin.deleteUser(a.id); if (result.error) throw result.error; } });

describe('owner-scoped insights on actual local DB', () => {
  it('counts inclusive 30/90/all-time event windows without future or deleted records', async () => {
    const service = repo(); const recent = await service.summary(scope);
    expect(recent).toMatchObject({ as_of: scope.asOf, start_on: '2026-09-29', days: 30, wardrobe: { total: 8, active: 5, archived: 1, sold: 1, donated: 1, recorded: 3, unrecorded: 5, never_recorded: 3 }, wear: { events: 4, days: 3, garment_uses: 7 } });
    expect(await service.summary({ ...scope, period: '90' })).toMatchObject({ start_on: '2026-07-31', wardrobe: { recorded: 4, unrecorded: 4 }, wear: { events: 7, days: 5 } });
    expect(await service.summary({ ...scope, period: 'all' })).toMatchObject({ start_on: null, wardrobe: { total: 8, recorded: 5, unrecorded: 3, never_recorded: 3 }, wear: { events: 9, days: 7 } });
  });
  it('keeps currencies separate, excludes unknown prices, and includes known zero prices', async () => {
    const data = await repo().summary(scope);
    expect(data.wardrobe).toMatchObject({ priced: 6, unpriced: 2 });
    expect(data.costs).toEqual([{ currency: 'EUR', amount: 50, priced_items: 1 }, { currency: 'KRW', amount: 190, priced_items: 4 }, { currency: 'USD', amount: 200, priced_items: 1 }]);
    expect(data.costs.some((cost) => cost.currency === 'JPY')).toBe(false);
  });
  it('uses lifetime wear through the reference date for cost even when a short period has no wear', async () => {
    const recent = await repo().items(0, scope, { mode: 'all', search: '' });
    const a = recent.items.find((item) => item.item_id === ids.a)!;
    expect(a).toMatchObject({ period_wear_count: 3, lifetime_wear_count: 6, cost_per_wear: 20, last_worn_on: '2026-10-28' });
    expect(recent.items.find((item) => item.item_id === ids.b)).toMatchObject({ purchase_price: 0, lifetime_wear_count: 2, cost_per_wear: 0 });
    expect(recent.items.find((item) => item.item_id === ids.c)).toMatchObject({ purchase_price: null, lifetime_wear_count: 1, cost_per_wear: null });
    expect(recent.items.find((item) => item.item_id === ids.e)).toMatchObject({ period_wear_count: 0, lifetime_wear_count: 1, cost_per_wear: 60 });
    expect(recent.items.find((item) => item.item_id === ids.f)).toMatchObject({ lifetime_wear_count: 0, cost_per_wear: null, last_worn_on: null });
    expect((await repo().items(0, { ...scope, period: 'all' }, { mode: 'all', search: '' })).items.find((item) => item.item_id === ids.a)?.cost_per_wear).toBe(a.cost_per_wear);
  });
  it('distinguishes unrecorded-in-period from never recorded and provides stable most/recent lists', async () => {
    const service = repo(); const most = await service.items(0, scope, { mode: 'most', search: '' });
    expect(most.items.map((item) => item.item_id)).toEqual([ids.a, ids.b, ids.c]);
    expect((await service.items(0, scope, { mode: 'unrecorded', search: '' })).total).toBe(5);
    expect((await service.items(0, { ...scope, period: 'all' }, { mode: 'unrecorded', search: '' })).total).toBe(3);
    expect((await service.items(0, scope, { mode: 'recent', search: '' })).items[0]?.item_id).toBe(ids.h);
    expect((await service.items(0, scope, { mode: 'all', search: 'team' })).total).toBe(2);
    for (const search of ['%', '%,_', '"\\', '격식 %,_"\\셔츠']) {
      const found = await service.items(0, scope, { mode: 'all', search });
      expect(found.total).toBe(1); expect(found.items[0]?.item_id).toBe(ids.g);
    }
    expect((await service.items(0, scope, { mode: 'all', search: "');select * from wardrobe_items;--" })).total).toBe(0);
  });
  it('groups subcategories into roots and reports unknown brands without mixing in trashed inventory', async () => {
    const data = await repo().summary(scope);
    expect(data.categories.find((category) => category.slug === 'tops')).toMatchObject({ name: '상의', count: 2 });
    expect(data.categories.reduce((sum, category) => sum + category.count, 0)).toBe(8);
    expect(data.brands.find((brand) => brand.name === 'TEAM')?.count).toBe(2);
    expect(data.brands.find((brand) => brand.name === null)?.count).toBe(1);
    expect(data.brands.some((brand) => brand.name === '휴지통' || brand.name === '타인브랜드')).toBe(false);
    expect(data.brands.reduce((sum, brand) => sum + brand.count, data.other_brand_count)).toBe(8);
  });
  it('handles leap-day boundaries and reference dates independently of current inventory registration dates', async () => {
    const events = [];
    try {
      events.push(await record('2024-01-31', [ids.a!]), await record('2024-02-01', [ids.a!]), await record('2024-03-01', [ids.a!]));
      expect(await repo().summary({ asOf: '2024-03-01', period: '30' })).toMatchObject({ start_on: '2024-02-01', wardrobe: { total: 8 }, wear: { events: 2, days: 2 } });
      expect(await repo().summary({ asOf: '2024-02-29', period: '30' })).toMatchObject({ start_on: '2024-01-31', wear: { events: 2, days: 2 } });
      expect(await repo().summary({ asOf: '1900-01-01', period: '90' })).toMatchObject({ start_on: '1900-01-01', wardrobe: { never_recorded: 8 }, wear: { events: 0 } });
    } finally { for (const event of events) await wear().remove(event.id, event.updated_at); }
  });
  it('reflects record edit/delete, price changes and garment trash/restore without rewriting history', async () => {
    const event = await record('2026-10-28', [ids.g!]);
    try {
      expect((await repo().items(0, scope, { mode: 'all', search: '격식' })).items[0]).toMatchObject({ lifetime_wear_count: 1, cost_per_wear: 10 });
      await patch(ids.g!, { purchase_price: 30 });
      expect((await repo().items(0, scope, { mode: 'all', search: '격식' })).items[0]?.cost_per_wear).toBe(30);
      const moved = await wear().update(event.id, event.updated_at, { kind: 'keep', wornOn: '2026-09-28', memo: '' });
      expect((await repo().items(0, scope, { mode: 'all', search: '격식' })).items[0]).toMatchObject({ period_wear_count: 0, lifetime_wear_count: 1 });
      await patch(ids.g!, { deleted_at: '2026-10-28T00:00:00Z' });
      expect((await repo().summary(scope)).wardrobe.total).toBe(7);
      await wear().remove(event.id, moved.updated_at);
      expect((await repo().summary(scope)).wear.events).toBe(4);
    } finally { await patch(ids.g!, { deleted_at: null, purchase_price: 10 }); const current = await wear().get(event.id); if (current) await wear().remove(current.id, current.updated_at); }
    expect((await repo().summary(scope)).wardrobe.total).toBe(8);
  });
  it('isolates both users, denies anonymous execution and refuses changed-owner or cancelled service calls', async () => {
    const a = accounts[0]!; const b = accounts[1]!;
    expect(await repo(1).summary(scope)).toMatchObject({ wardrobe: { total: 1, recorded: 1 }, wear: { events: 1 }, costs: [{ currency: 'JPY', amount: 700, priced_items: 1 }] });
    const direct = await a.client.rpc('wardrobe_insights', { p_owner: b.id, p_as_of: scope.asOf, p_days: 30 });
    if (direct.error) throw direct.error;
    expect(insightSummarySchema.parse(direct.data)).toMatchObject({ wardrobe: { total: 0 }, wear: { events: 0 }, categories: [], costs: [], brands: [] });
    expect((await a.client.rpc('insight_item_stats', { p_owner: b.id, p_as_of: scope.asOf, p_mode: 'all' })).data).toEqual([]);
    const anonymous = createClient<Database>(connection.url, connection.key, options);
    expect((await anonymous.rpc('wardrobe_insights', { p_owner: a.id, p_as_of: scope.asOf })).error?.code).toBe('42501');
    expect((await anonymous.rpc('insight_item_stats', { p_owner: a.id, p_as_of: scope.asOf })).error?.code).toBe('42501');
    await expect(createInsightRepository(b.client, a.id, connection).summary(scope)).rejects.toMatchObject({ code: 'session_changed' });
    await expect(repo().summary(scope, AbortSignal.abort())).rejects.toMatchObject({ code: 'session_changed' });
    await expect(repo().items(0, scope, { mode: 'all', search: '' }, AbortSignal.abort())).rejects.toMatchObject({ code: 'session_changed' });
    await expect(repo().items(-1, scope, { mode: 'all', search: '' })).rejects.toMatchObject({ code: 'invalid_page' });
  });
  it('pins the starting account token even if the shared client switches during a read', async () => {
    const a = accounts[0]!; const b = accounts[1]!;
    const original = (await a.client.auth.getSession()).data.session!; const next = (await b.client.auth.getSession()).data.session!;
    let switched = false;
    const pinned = repo(0, async (url, init) => { if (!switched) { switched = true; if ((await a.client.auth.setSession(next)).error) throw new Error('Fixture session failed'); } return fetch(url, init); });
    try { expect((await pinned.summary(scope)).wardrobe.total).toBe(8); }
    finally { if ((await a.client.auth.setSession(original)).error) throw new Error('Session restore failed'); }
  });
  it('rejects invalid raw scope/mode/null inputs', async () => {
    const a = accounts[0]!;
    for (const p_days of [0, -1, 31, 365]) expect((await a.client.rpc('wardrobe_insights', { p_owner: a.id, p_as_of: scope.asOf, p_days })).error?.code).toBe('22023');
    expect((await a.client.rpc('insight_item_stats', { p_owner: a.id, p_as_of: scope.asOf, p_mode: 'sql' })).error?.code).toBe('22023');
    expect((await a.client.rpc('insight_item_stats', { p_owner: a.id, p_as_of: scope.asOf, p_search: 'a'.repeat(201) })).error?.code).toBe('22023');
    for (const p_as_of of ['infinity', '-infinity', '1899-12-31', '10000-01-01']) expect((await a.client.rpc('wardrobe_insights', { p_owner: a.id, p_as_of })).error?.code).toBe('22023');
    const session = (await a.client.auth.getSession()).data.session!;
    const response = await fetch(`${connection.url}/rest/v1/rpc/wardrobe_insights`, { method: 'POST', headers: { apikey: connection.key, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_owner: a.id, p_as_of: null }) });
    expect((await response.json()).code).toBe('22023');
  });
  it('aggregates more than the API row limit and pages items without losing brand or currency totals', async () => {
    const a = accounts[0]!; const service = repo();
    try {
      const inserted = await admin.from('wardrobe_items').insert(Array.from({ length: 1005 }, (_, index) => ({ user_id: a.id, name: `대량통계 ${String(index).padStart(4, '0')}`, category_slug: 'shirt', brand_name: `대량브랜드${index % 12}`, purchase_price: 1, currency: 'KRW', tags: ['대량통계검증'] })));
      if (inserted.error) throw inserted.error;
      const summary = await service.summary(scope);
      expect(summary.wardrobe.total).toBe(1013);
      expect(summary.categories.find((category) => category.slug === 'tops')?.count).toBe(1007);
      expect(summary.costs.find((cost) => cost.currency === 'KRW')).toMatchObject({ amount: 1195, priced_items: 1009 });
      expect(summary.brands).toHaveLength(10);
      expect(summary.other_brand_count).toBeGreaterThan(0);
      expect(summary.brands.reduce((sum, brand) => sum + brand.count, summary.other_brand_count)).toBe(1013);
      const first = await service.items(0, scope, { mode: 'all', search: '대량통계' }); const last = await service.items(50, scope, { mode: 'all', search: '대량통계' });
      expect(first.total).toBe(1005); expect(first.items).toHaveLength(20); expect(last.items).toHaveLength(5);
      expect(first.items[0]?.name).toBe('대량통계 0000'); expect(last.items[4]?.name).toBe('대량통계 1004');
      expect(await service.items(100, scope, { mode: 'all', search: '대량통계' })).toEqual({ items: [], total: 1005 });
    } finally { const cleaned = await admin.from('wardrobe_items').delete().eq('user_id', a.id).contains('tags', ['대량통계검증']); if (cleaned.error) throw cleaned.error; }
  });
  it('returns genuine empty own summaries and lists after the last visible garment and event are removed', async () => {
    const event = (await wear(1).list(0, { start: scope.asOf, end: scope.asOf })).items[0]!;
    try {
      await wear(1).remove(event.id, event.updated_at);
      await patch(ids.foreign!, { deleted_at: '2026-10-28T00:00:00Z' });
      expect(await repo(1).summary(scope)).toMatchObject({ wardrobe: { total: 0, recorded: 0, unrecorded: 0, never_recorded: 0, priced: 0, unpriced: 0 }, wear: { events: 0, days: 0, garment_uses: 0 }, costs: [], categories: [], brands: [], other_brand_count: 0 });
      expect(await repo(1).items(0, scope, { mode: 'all', search: '' })).toEqual({ items: [], total: 0 });
    } finally {
      await patch(ids.foreign!, { deleted_at: null });
      const restored = await admin.from('wear_events').update({ deleted_at: null }).eq('id', event.id).eq('user_id', accounts[1]!.id);
      if (restored.error) throw restored.error;
    }
  });
});
