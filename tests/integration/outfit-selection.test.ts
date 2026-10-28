import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database.generated';
import { createOutfitSelectionService } from '../../src/features/outfits/selection';
import { emptyOutfitDraft, slotCategories, slots } from '../../src/features/outfits/draft';
import { defaultFilters } from '../../src/features/wardrobe/filters';

const settings = JSON.parse(execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', shell: process.platform === 'win32', stdio: ['pipe', 'pipe', 'ignore'] }));
if (!['http://127.0.0.1:54321', 'http://localhost:54321'].includes(settings.API_URL)) throw new Error('Local API required');
const options = { auth: { persistSession: false, autoRefreshToken: false }, db: { retry: false } } as const;
const admin = createClient<Database>(settings.API_URL, settings.SERVICE_ROLE_KEY, options);
const accounts: { id: string; client: ReturnType<typeof createClient<Database>> }[] = [];
const ids: Record<string, string> = {};
beforeAll(async () => {
  for (let index = 0; index < 2; index++) {
    const email = `closet-selection-${randomUUID()}@example.test`;
    const password = `${randomUUID()}aA!9`;
    const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (result.error || !result.data.user) throw new Error('Fixture setup failed');
    const client = createClient<Database>(settings.API_URL, settings.ANON_KEY, options);
    accounts.push({ id: result.data.user.id, client });
    if ((await client.auth.signInWithPassword({ email, password })).error) throw new Error('Fixture login failed');
  }
  for (const slot of slots) {
    ids[slot] = randomUUID();
    const result = await accounts[0]!.client.from('wardrobe_items').insert({ id: ids[slot], name: `선택 ${slot}`, category_slug: slotCategories[slot] });
    if (result.error) throw result.error;
  }
  for (const status of ['archived', 'sold', 'donated', 'deleted', 'foreign']) {
    ids[status] = randomUUID();
    const result = await admin.from('wardrobe_items').insert({ id: ids[status], user_id: status === 'foreign' ? accounts[1]!.id : accounts[0]!.id, name: `제외 ${status}`, category_slug: 'shirt', lifecycle_status: status === 'deleted' || status === 'foreign' ? 'active' : status, deleted_at: status === 'deleted' ? new Date().toISOString() : null });
    if (result.error) throw result.error;
  }
});
afterAll(async () => { for (const account of accounts) if ((await admin.auth.admin.deleteUser(account.id)).error) throw new Error('Fixture cleanup failed'); });

describe('actual outfit selection read service', () => {
  it('paginates only own active matching clothes, overriding an inactive-status filter', async () => {
    const a = accounts[0]!;
    const service = createOutfitSelectionService(a.client, a.id);
    const inserted = await a.client.from('wardrobe_items').insert(Array.from({ length: 21 }, (_, index) => ({ name: `picker-page-${index}`, category_slug: 'shirt', brand_name: '선택 브랜드' })));
    if (inserted.error) throw inserted.error;
    const filters = { ...defaultFilters, search: 'picker-page-', status: 'sold' as const };
    const first = await service.candidates('top', 0, filters);
    const second = await service.candidates('top', 1, filters);
    expect(first.total).toBe(21);
    expect(first.items).toHaveLength(20);
    expect(second.items).toHaveLength(1);
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(21);
    const all = await service.candidates('top', 0);
    expect(all.total).toBe(22);
    expect(all.items.every((item) => item.user_id === a.id && item.lifecycle_status === 'active' && item.deleted_at === null)).toBe(true);
    expect((await service.candidates('outerwear', 0)).total).toBe(1);
    await expect(service.candidates('top', 0, { ...defaultFilters, category: 'shoes' })).rejects.toMatchObject({ code: 'invalid_category' });
  });
  it('freshly checks all seven slots and rejects foreign/inactive/deleted/wrong-slot choices', async () => {
    const a = accounts[0]!;
    const service = createOutfitSelectionService(a.client, a.id);
    for (const slot of slots) expect((await service.choose(slot, ids[slot]!)).item.id).toBe(ids[slot]);
    for (const state of ['archived', 'sold', 'donated', 'deleted', 'foreign']) await expect(service.choose('top', ids[state]!)).rejects.toMatchObject({ code: 'unavailable' });
    await expect(service.choose('shoes', ids.top!)).rejects.toMatchObject({ code: 'unavailable' });
    expect(await service.selected([ids.foreign!])).toEqual([]);
    expect((await service.selected([ids.deleted!]))[0]?.deleted_at).not.toBeNull();
  });
  it('rechecks state/category changes, emits slot position zero, and never persists a draft', async () => {
    const a = accounts[0]!;
    const service = createOutfitSelectionService(a.client, a.id);
    const id = randomUUID();
    if ((await a.client.from('wardrobe_items').insert({ id, name: '선택 후 변경', category_slug: 'shirt' })).error) throw new Error('Recheck fixture failed');
    const draft = { ...emptyOutfitDraft(), name: '메모리 코디', memo: '개인 메모', items: { top: id } };
    expect((await service.validate(draft)).items).toEqual([{ slot: 'top', position: 0, item_id: id }]);
    for (const patch of [{ lifecycle_status: 'archived' }, { lifecycle_status: 'active', category_slug: 'shoes' }, { category_slug: 'shirt', deleted_at: new Date().toISOString() }]) {
      if ((await admin.from('wardrobe_items').update(patch).eq('id', id).eq('user_id', a.id)).error) throw new Error('Recheck update failed');
      await expect(service.validate(draft)).rejects.toMatchObject({ code: 'changed' });
    }
    await expect(service.validate({ ...draft, items: { top: ids.foreign! } })).rejects.toMatchObject({ code: 'changed' });
    for (const table of ['outfits', 'outfit_items'] as const) expect((await admin.from(table).select('*', { count: 'exact', head: true }).eq('user_id', a.id)).count).toBe(0);
    expect((await a.client.from('outfits').insert({ user_id: a.id, name: '직접 쓰기 차단' })).error?.code).toBe('42501');
  });
  it('cancels network requests and keeps mismatched/foreign owner reads empty', async () => {
    const a = accounts[0]!;
    const service = createOutfitSelectionService(a.client, a.id);
    const controller = new AbortController(); controller.abort();
    await expect(service.choose('top', ids.top!, controller.signal)).rejects.toBeTruthy();
    await expect(service.selected([ids.top!], controller.signal)).rejects.toBeTruthy();
    expect(await createOutfitSelectionService(accounts[1]!.client, a.id).selected([ids.top!])).toEqual([]);
  });
});
