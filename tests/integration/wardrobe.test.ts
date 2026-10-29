import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database.generated';
import { createWardrobeRepository } from '../../src/features/wardrobe/repository';
import { wardrobeDraftSchema } from '../../src/features/wardrobe/schemas';
import { emptyWardrobeDraft, wardrobePageSize } from '../../src/features/wardrobe/types';
import { defaultFilters, type WardrobeFilters } from '../../src/features/wardrobe/filters';

// Read local CLI output in memory; no remote endpoints or printed credentials.
const status = JSON.parse(execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', shell: process.platform === 'win32', stdio: ['pipe', 'pipe', 'ignore'] }));
if (!['http://127.0.0.1:54321', 'http://localhost:54321'].includes(status.API_URL)) throw new Error('Local loopback API required');
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient<Database>(status.API_URL, status.SERVICE_ROLE_KEY, options);
const accounts: { id: string; email: string; password: string; client: ReturnType<typeof createClient<Database>> }[] = [];

beforeAll(async () => {
  for (let index = 0; index < 2; index++) {
    const email = `closet-repository-${randomUUID()}@example.test`;
    const password = `${randomUUID()}aA!9`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error('Fixture setup failed');
    const client = createClient<Database>(status.API_URL, status.ANON_KEY, options);
    const account = { id: created.data.user.id, email, password, client };
    accounts.push(account);
    if ((await client.auth.signInWithPassword({ email, password })).error) throw new Error('Fixture login failed');
  }
});
afterAll(async () => {
  for (const account of accounts) {
    if ((await admin.auth.admin.deleteUser(account.id)).error) throw new Error('Fixture cleanup failed');
  }
});

describe('actual wardrobe repository', () => {
  it('enforces KRW for omitted defaults, explicit inserts, updates and profile defaults', async () => {
    const a = accounts[0]!;
    const item = await a.client.from('wardrobe_items').insert({ name: '원화 경계 검증', category_slug: 'shirt', purchase_price: 125000 }).select('*').single();
    if (item.error) throw item.error;
    expect(item.data.currency).toBe('KRW');
    for (const currency of ['USD', 'EUR', 'JPY']) {
      const invalid = await a.client.from('wardrobe_items').insert({ name: '외화 차단 검증', category_slug: 'shirt', currency, purchase_price: 10 });
      expect(invalid.error?.code).toBe('23514');
    }
    const update = await a.client.from('wardrobe_items').update({ currency: 'USD', purchase_price: 999 }).eq('id', item.data.id);
    expect(update.error?.code).toBe('23514');
    const profile = await a.client.from('profiles').update({ default_currency: 'USD' }).eq('id', a.id);
    expect(profile.error?.code).toBe('23514');
    const saved = await createWardrobeRepository(a.client, a.id).get(item.data.id);
    expect(saved).toMatchObject({ currency: 'KRW', purchase_price: 125000 });
  });
  it('saves optional fields, re-reads them, and returns no foreign item', async () => {
    const [a, b] = accounts;
    if (!a || !b) throw new Error('Missing fixtures');
    const repository = createWardrobeRepository(a.client, a.id);
    const id = randomUUID();
    const input = wardrobeDraftSchema.parse({ ...emptyWardrobeDraft(), name: '통합 검증 셔츠', category_slug: 'shirt', brand_name: '테스트 브랜드', purchase_price: '125,000.50', currency: 'KRW', purchased_on: '2024-02-29', purchase_url: 'https://example.com/item', seasons: ['spring', 'autumn'], tags: '출근,캐주얼', notes: '개인 메모 보존 검증' });
    const saved = await repository.create(id, input);
    expect(saved.user_id).toBe(a.id);
    expect(saved.purchase_price).toBe(125000.5);
    expect((await repository.get(id))?.notes).toBe(input.notes);
    expect(await createWardrobeRepository(b.client, b.id).get(id)).toBeNull();
    const retry = await repository.create(id, input);
    expect(retry.id).toBe(id);
    await expect(repository.create(id, { ...input, name: 'different content' })).rejects.toMatchObject({ code: 'duplicate_request' });
  });
  it('paginates consistently and excludes soft-deleted items', async () => {
    const a = accounts[0];
    if (!a) throw new Error('Missing fixture');
    const repo = createWardrobeRepository(a.client, a.id);
    const result = await a.client.from('wardrobe_items').insert(Array.from({ length: wardrobePageSize + 1 }, (_, index) => ({ name: `페이지 검증 ${index}`, category_slug: 'tops' }))).select('*');
    if (result.error || !result.data) throw new Error('Pagination fixture setup failed');
    const first = await repo.list(0);
    const second = await repo.list(1);
    expect(first.items.length).toBe(wardrobePageSize);
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(first.total);
    const deleted = result.data[0]!;
    if ((await a.client.from('wardrobe_items').update({ deleted_at: new Date().toISOString() }).eq('id', deleted.id)).error) throw new Error('Soft delete fixture failed');
    expect(await repo.get(deleted.id)).toBeNull();
    expect((await repo.list(0)).total).toBe(first.total - 1);
    expect((await createWardrobeRepository(accounts[1]!.client, accounts[1]!.id).list(0)).total).toBe(0);
  });
  it('recovers a committed insert whose response was lost without duplicating it', async () => {
    const a = accounts[0]!;
    let lost = false;
    const client = createClient<Database>(status.API_URL, status.ANON_KEY, { ...options, global: { fetch: async (url, init) => {
      const response = await fetch(url, init);
      if (!lost && String(url).includes('/rest/v1/wardrobe_items') && init?.method === 'POST' && response.ok) { lost = true; throw new TypeError('simulated lost response after commit'); }
      return response;
    } } });
    if ((await client.auth.signInWithPassword({ email: a.email, password: a.password })).error) throw new Error('Fixture login failed');
    const repository = createWardrobeRepository(client, a.id);
    const id = randomUUID();
    const input = wardrobeDraftSchema.parse({ ...emptyWardrobeDraft(), name: '응답 유실 검증', category_slug: 'tops' });
    await expect(repository.create(id, input)).rejects.toBeTruthy();
    expect((await repository.create(id, input)).id).toBe(id);
    const result = await a.client.from('wardrobe_items').select('id', { count: 'exact' }).eq('id', id);
    expect(result.count).toBe(1);
  });
  it('rejects an invalid category and cancels an already-aborted request', async () => {
    const a = accounts[0]!;
    const repo = createWardrobeRepository(a.client, a.id);
    await expect(repo.create(randomUUID(), wardrobeDraftSchema.parse({ ...emptyWardrobeDraft(), name: '잘못된 분류', category_slug: 'not-a-category' }))).rejects.toMatchObject({ code: '23503' });
    const controller = new AbortController();
    controller.abort();
    await expect(repo.list(0, controller.signal)).rejects.toBeTruthy();
  });

  it('searches and paginates 300 real rows without duplicates, returning exact filtered counts', async () => {
    const a = accounts[0]!;
    const rows = Array.from({ length: 300 }, (_, index) => ({
      name: `W03-${String(index).padStart(3, '0')} 긴 제품명과 한글 검색 검증`,
      category_slug: ['shirt', 'tshirt', 'jacket', 'tops'][index % 4]!,
      brand_name: ['Alpha', 'Beta', '한글 브랜드', null][index % 4] ?? null,
      color_name: ['네이비', '화이트', '블랙', null][index % 4] ?? null,
      seasons: [['spring', 'autumn'], ['summer'], ['winter'], []][index % 4]!,
      is_favorite: index % 5 === 0,
      lifecycle_status: ['active', 'archived', 'sold', 'donated'][index % 4]!,
      purchase_price: index === 0 ? 0 : index % 11 === 0 ? null : index * 100,
      currency: 'KRW',
      created_at: '2026-01-01T00:00:00Z',
    }));
    const added = await a.client.from('wardrobe_items').insert(rows);
    if (added.error) throw added.error;
    const deleted = await a.client.from('wardrobe_items').insert({ name: 'W03-deleted', category_slug: 'shirt', brand_name: '삭제된 브랜드', deleted_at: new Date().toISOString() });
    if (deleted.error) throw deleted.error;
    const b = accounts[1]!;
    if ((await b.client.from('wardrobe_items').insert({ name: 'W03-foreign', category_slug: 'shirt', brand_name: '타인 비공개 브랜드', color_name: '타인 비공개 색상' })).error) throw new Error('Foreign fixture failed');
    const repo = createWardrobeRepository(a.client, a.id);
    const ids = new Set<string>();
    const timings: number[] = [];
    for (let page = 0; page < 15; page++) {
      const started = performance.now();
      const result = await repo.list(page, undefined, { ...defaultFilters, search: 'W03-' });
      timings.push(performance.now() - started);
      expect(result.total).toBe(300);
      expect(result.items).toHaveLength(20);
      for (const item of result.items) { expect(ids.has(item.id)).toBe(false); ids.add(item.id); }
    }
    expect(ids.size).toBe(300);
    const counts: [Partial<WardrobeFilters>, number][] = [
      [{ category: 'tops' }, 225], [{ category: 'shirt' }, 75], [{ category: 'outerwear' }, 75],
      [{ brand: '한글 브랜드' }, 75], [{ color: '화이트' }, 75], [{ season: 'autumn' }, 75],
      [{ favoriteOnly: true }, 60], [{ status: 'sold' }, 75],
      [{ category: 'tops', brand: 'Alpha', color: '네이비', season: 'spring', favoriteOnly: true, status: 'active' }, 15],
      [{ category: 'shoes' }, 0],
    ];
    for (const [patch, count] of counts) expect((await repo.list(0, undefined, { ...defaultFilters, search: 'W03-', ...patch })).total).toBe(count);
    console.info(`W03 local 300-row pagination: 15 requests, max ${Math.round(Math.max(...timings))}ms, mean ${Math.round(timings.reduce((sum, value) => sum + value, 0) / timings.length)}ms`);
  });

  it('sorts stably, preserves zero prices, groups currencies and puts missing prices last', async () => {
    const a = accounts[0]!;
    const repo = createWardrobeRepository(a.client, a.id);
    if ((await a.client.from('wardrobe_items').insert([1, 2, 3].map((day) => ({ name: `moment-${day}`, category_slug: 'shirt', created_at: `2025-01-0${day}T00:00:00Z` })))).error) throw new Error('Chronological fixture failed');
    for (const sort of ['recent', 'oldest'] as const) expect((await repo.list(0, undefined, { ...defaultFilters, search: 'moment-', sort })).items.map((item) => item.name)).toEqual(sort === 'recent' ? ['moment-3', 'moment-2', 'moment-1'] : ['moment-1', 'moment-2', 'moment-3']);
    const first = await repo.list(0, undefined, { ...defaultFilters, search: 'W03-', sort: 'name' });
    expect(first.items[0]?.name).toContain('W03-000');
    expect((await repo.list(14, undefined, { ...defaultFilters, search: 'W03-', sort: 'name' })).items.at(-1)?.name).toContain('W03-299');
    for (const sort of ['price_asc', 'price_desc', 'brand', 'oldest'] as const) {
      const all = [];
      for (let page = 0; page < 15; page++) all.push(...(await repo.list(page, undefined, { ...defaultFilters, search: 'W03-', sort })).items);
      expect(new Set(all.map((item) => item.id)).size).toBe(300);
      expect((await repo.list(0, undefined, { ...defaultFilters, search: 'W03-', sort })).items.map((item) => item.id)).toEqual(all.slice(0, 20).map((item) => item.id));
      if (sort.startsWith('price_')) {
        const known = all.filter((item) => item.purchase_price !== null);
        expect(all.slice(known.length).every((item) => item.purchase_price === null)).toBe(true);
        const prices = known.map((item) => item.purchase_price!);
        expect(prices).toEqual([...prices].sort((left, right) => sort === 'price_asc' ? left - right : right - left));
        expect(known.every((item) => item.currency === 'KRW')).toBe(true);
        expect(known.some((item) => item.purchase_price === 0)).toBe(true);
      }
      if (sort === 'brand') {
        const nullAt = all.findIndex((item) => item.brand_name === null);
        expect(nullAt).toBeGreaterThan(0);
        expect(all.slice(nullAt).every((item) => item.brand_name === null)).toBe(true);
      }
    }
  });

  it('treats special characters literally and isolates filter options and direct RPC access', async () => {
    const a = accounts[0]!;
    const b = accounts[1]!;
    const repo = createWardrobeRepository(a.client, a.id);
    if ((await a.client.from('wardrobe_items').insert({ name: '문자 %,_.("),\\ 테스트', category_slug: 'shirt' })).error) throw new Error('Literal search fixture failed');
    for (const search of ['%', '_', ',_.("),', '\\']) expect((await repo.list(0, undefined, { ...defaultFilters, search })).total).toBe(1);
    expect((await repo.list(0, undefined, { ...defaultFilters, search: 'ALPHA' })).total).toBe(75);
    expect((await repo.list(0, undefined, { ...defaultFilters, search: '네이비' })).total).toBe(75);
    expect((await repo.list(0, undefined, { ...defaultFilters, search: '"),user_id.neq.null' })).total).toBe(0);
    const options = await repo.filterOptions();
    expect(options.brands).toContain('한글 브랜드');
    expect(options.brands).not.toContain('타인 비공개 브랜드');
    expect(options.brands).not.toContain('삭제된 브랜드');
    expect(options.colors).not.toContain('타인 비공개 색상');
    const mismatched = createWardrobeRepository(a.client, b.id);
    expect((await mismatched.list(0)).total).toBe(0);
    expect((await mismatched.filterOptions()).brands).toEqual([]);
    const anonymous = createClient<Database>(status.API_URL, status.ANON_KEY, optionsForAnonymous());
    expect((await anonymous.rpc('search_wardrobe_items', { p_owner: a.id })).error?.code).toBe('42501');
    expect((await anonymous.rpc('wardrobe_filter_options', { p_owner: a.id })).error?.code).toBe('42501');
    expect((await a.client.rpc('search_wardrobe_items', { p_owner: a.id, p_sort: 'injected' })).error?.code).toBe('22023');
  });

  it('returns a new count when a previously valid last page disappears', async () => {
    const a = accounts[0]!;
    const repo = createWardrobeRepository(a.client, a.id);
    if ((await a.client.from('wardrobe_items').insert(Array.from({ length: 21 }, (_, index) => ({ name: `shrink-${index}`, category_slug: 'shirt' })))).error) throw new Error('Shrink fixture failed');
    const filters = { ...defaultFilters, search: 'shrink-' };
    const last = await repo.list(1, undefined, filters);
    expect(last.items).toHaveLength(1);
    if ((await a.client.from('wardrobe_items').update({ deleted_at: new Date().toISOString() }).eq('id', last.items[0]!.id)).error) throw new Error('Shrink removal failed');
    const result = await repo.list(1, undefined, filters);
    expect(result.total).toBe(20);
    expect(result.items).toEqual([]);
  });
});

function optionsForAnonymous() { return { auth: { persistSession: false, autoRefreshToken: false } }; }
