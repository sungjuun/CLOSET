import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database.generated';
import { localDockerSupabase } from '../helpers/local-supabase';
import { createRecommendationService, recommendedDraft } from '../../src/features/recommendations/service';
import { recommendationSlots, recommendOutfits, type RecommendationOptions } from '../../src/features/recommendations/engine';
import { slotCategories } from '../../src/features/outfits/draft';

const config = localDockerSupabase(); const connection = { url: config.API_URL, key: config.ANON_KEY };
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, db: { retry: false } } as const;
const admin = createClient<Database>(connection.url, config.SERVICE_ROLE_KEY, options);
const accounts: { id: string; client: ReturnType<typeof createClient<Database>> }[] = [];
const inventory: Record<string, string> = {}; const paths: string[] = [];
const signal = () => new AbortController().signal;
const service = (index = 0, transport?: typeof fetch) => createRecommendationService(accounts[index]!.client, accounts[index]!.id, connection, transport);
const recOptions: RecommendationOptions = { season: '', style: '', count: 4, includeOuterwear: true, locks: {}, seed: 'local-fixture' };
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')).buffer;
const image = { bytes: png, width: 1, height: 1, kind: 'item-board' as const };
beforeAll(async () => {
  for (let index = 0; index < 2; index++) {
    const email = `recommendations-${randomUUID()}@example.test`; const password = `${randomUUID()}Aa!9`;
    const result = await admin.auth.admin.createUser({ email, password, email_confirm: true }); if (result.error) throw result.error;
    const client = createClient<Database>(connection.url, connection.key, options); accounts.push({ id: result.data.user.id, client });
    if ((await client.auth.signInWithPassword({ email, password })).error) throw new Error('Fixture login failed');
  }
  const rows = recommendationSlots.flatMap((slot) => Array.from({ length: slot === 'top' ? 40 : slot === 'bottom' ? 3 : 1 }, (_, index) => {
    const id = randomUUID(); inventory[`${slot}-${index}`] = id;
    return { id, user_id: accounts[0]!.id, category_slug: slotCategories[slot], name: `fixture ${slot} ${index}`, color_hex: index % 2 ? '#FFFFFF' : '#202D49', secondary_color_hexes: ['#EEEEEE'], tags: ['미니멀'], material: 'cotton', purchase_url: 'https://example.test/private-purchase', notes: 'private notes' };
  }));
  if ((await admin.from('wardrobe_items').insert(rows)).error) throw new Error('Fixture garments failed');
  for (const [key, owner, status, deleted] of [['foreign', accounts[1]!.id, 'active', null], ['archived', accounts[0]!.id, 'archived', null], ['deleted', accounts[0]!.id, 'active', new Date().toISOString()]] as const) {
    const id = randomUUID(); inventory[key] = id;
    const result = await admin.from('wardrobe_items').insert({ id, user_id: owner, category_slug: 'tops', name: key, lifecycle_status: status, deleted_at: deleted }); if (result.error) throw result.error;
  }
});
afterAll(async () => {
  if (paths.length) { const result = await admin.storage.from('outfit-renders-private').remove(paths); if (result.error) throw result.error; }
  for (const account of accounts) if ((await admin.auth.admin.deleteUser(account.id)).error) throw new Error('Fixture cleanup failed');
});
async function saved() {
  const rows = await service().candidates(recOptions, signal()); const outfit = recommendOutfits(rows, accounts[0]!.id, recOptions).outfits[0]!;
  const draft = recommendedDraft(outfit, '추천 저장 테스트', recOptions); const stored = await service().save(randomUUID(), null, draft, signal());
  await service().setPresentation(stored.id, stored.updated_at, 'items', 'regular', signal()); return { outfit, draft, stored };
}
async function reservation(stored: Awaited<ReturnType<typeof saved>>['stored'], mode = 'items', preset = 'regular', kind = 'item-board') {
  const id = randomUUID(); const result = await accounts[0]!.client.rpc('reserve_outfit_render', { p_id: id, p_outfit: stored.id, p_expected: stored.updated_at, p_mode: mode, p_preset: preset, p_kind: kind });
  if (result.error) throw result.error; paths.push(result.data.storage_path); return result.data;
}
describe('recommendations and render security on real local Supabase', () => {
  it('returns only owned active six-slot garments, bounded per slot, with locked IDs and no private notes', async () => {
    const rows = await service().candidates(recOptions, signal()); const tops = rows.filter((row) => row.slot === 'top');
    expect(tops).toHaveLength(32); expect(tops[0]?.available_count).toBe(40);
    expect(rows.every((row) => row.user_id === accounts[0]!.id && row.lifecycle_status === 'active' && !row.deleted_at)).toBe(true);
    expect(rows.some((row) => ['foreign', 'archived', 'deleted'].some((key) => inventory[key] === row.id))).toBe(false);
    expect(rows[0]).not.toHaveProperty('notes'); expect(rows[0]).not.toHaveProperty('purchase_url');
    const absent = Object.values(inventory).find((id) => !tops.some((row) => row.id === id) && Object.entries(inventory).some(([key, value]) => key.startsWith('top-') && value === id))!;
    expect((await service().candidates({ ...recOptions, locks: { top: absent } }, signal())).some((row) => row.id === absent)).toBe(true);
    await expect(service().candidates({ ...recOptions, locks: { top: inventory.foreign! } }, signal())).rejects.toMatchObject({ code: 'P0003' });
    expect((await createClient<Database>(connection.url, connection.key, options).rpc('recommendation_candidates')).error?.code).toBe('42501');
  });
  it('saves real garment IDs using existing outfits and restores mode, preset and private PNG', async () => {
    const { stored, outfit } = await saved();
    const links = await accounts[0]!.client.from('outfit_items').select('item_id').eq('outfit_id', stored.id);
    expect(links.data?.map((row) => row.item_id).sort()).toEqual(Object.values(outfit.items).map((item) => item!.id).sort());
    await service().setPresentation(stored.id, stored.updated_at, 'mannequin', 'broad', signal());
    const id = randomUUID(); paths.push(`${accounts[0]!.id}/${stored.id}/${id}.png`);
    await service().storeImage(id, stored.id, stored.updated_at, 'mannequin', 'broad', { ...image, kind: 'mannequin-sample' }, signal());
    const result = await service().presentation(stored.id, stored.updated_at, signal());
    expect(result?.prefs).toMatchObject({ view_mode: 'mannequin', body_preset: 'broad', render_id: id }); expect(result?.asset?.render_kind).toBe('mannequin-sample');
    expect((await fetch(result!.signedUrl!)).ok).toBe(true);
  });
  it('isolates members, forbids direct metadata writes, and rejects foreign RPCs and files', async () => {
    const { stored } = await saved(); const asset = await reservation(stored); const b = accounts[1]!.client;
    expect((await b.from('outfit_presentations').select().eq('outfit_id', stored.id)).data).toEqual([]);
    expect((await b.from('outfit_render_assets').select().eq('id', asset.id)).data).toEqual([]);
    expect((await b.rpc('set_outfit_presentation', { p_outfit: stored.id, p_expected: stored.updated_at, p_mode: 'items', p_preset: 'regular' })).error?.code).toBe('P0002');
    expect((await b.rpc('complete_outfit_render', { p_id: asset.id })).error?.code).toBe('P0002');
    expect((await accounts[0]!.client.from('outfit_presentations').update({ view_mode: 'mannequin' }).eq('outfit_id', stored.id)).error?.code).toBe('42501');
    expect((await b.storage.from('outfit-renders-private').upload(asset.storage_path, png, { contentType: 'image/png' })).error).toBeTruthy();
    expect((await accounts[0]!.client.storage.from('outfit-renders-private').upload(asset.storage_path, png, { contentType: 'image/png' })).error).toBeNull();
    expect((await b.storage.from('outfit-renders-private').download(asset.storage_path)).error).toBeTruthy();
    expect((await b.storage.from('outfit-renders-private').createSignedUrl(asset.storage_path, 60)).error).toBeTruthy();
    expect((await b.storage.from('outfit-renders-private').remove([asset.storage_path])).data).toEqual([]);
    expect((await accounts[0]!.client.storage.from('outfit-renders-private').download(asset.storage_path)).error).toBeNull();
    expect((await createClient<Database>(connection.url, connection.key, options).from('outfit_render_assets').select()).error?.code).toBe('42501');
  });
  it('rejects unreserved paths, overwrites, missing files and invented AI render kinds', async () => {
    const { stored } = await saved(); const asset = await reservation(stored); const a = accounts[0]!.client;
    expect((await a.rpc('complete_outfit_render', { p_id: asset.id })).error?.code).toBe('P0002');
    expect((await a.storage.from('outfit-renders-private').upload(`${accounts[0]!.id}/${stored.id}/${randomUUID()}.png`, png, { contentType: 'image/png' })).error).toBeTruthy();
    expect((await a.rpc('reserve_outfit_render', { p_id: randomUUID(), p_outfit: stored.id, p_expected: stored.updated_at, p_mode: 'items', p_preset: 'regular', p_kind: 'ai-try-on' })).error?.code).toBe('22023');
    expect((await a.storage.from('outfit-renders-private').upload(asset.storage_path, png, { contentType: 'image/png' })).error).toBeNull();
    expect((await a.storage.from('outfit-renders-private').upload(asset.storage_path, png, { contentType: 'image/png', upsert: true })).error).toBeTruthy();
  });
  it('refuses stale outfit versions, changed presentation and inactive garments', async () => {
    const { stored, draft } = await saved(); const asset = await reservation(stored); const a = accounts[0]!.client;
    await a.storage.from('outfit-renders-private').upload(asset.storage_path, png, { contentType: 'image/png' });
    await service().setPresentation(stored.id, stored.updated_at, 'mannequin', 'slim', signal());
    expect((await a.rpc('complete_outfit_render', { p_id: asset.id })).error?.code).toBe('40001');
    await service().setPresentation(stored.id, stored.updated_at, 'items', 'regular', signal());
    const top = draft.items.top!; await admin.from('wardrobe_items').update({ lifecycle_status: 'archived' }).eq('id', top);
    expect((await a.rpc('complete_outfit_render', { p_id: asset.id })).error?.code).toBe('P0003');
    await admin.from('wardrobe_items').update({ lifecycle_status: 'active' }).eq('id', top);
    await admin.from('wardrobe_items').update({ category_slug: 'shoes' }).eq('id', top);
    expect((await a.rpc('complete_outfit_render', { p_id: asset.id })).error?.code).toBe('P0003');
    await admin.from('wardrobe_items').update({ category_slug: 'tops' }).eq('id', top);
    expect((await a.rpc('complete_outfit_render', { p_id: asset.id })).error).toBeNull();
    const edited = await service().save(stored.id, stored.updated_at, { ...draft, name: '수정' }, signal());
    expect((await service().presentation(stored.id, edited.updated_at, signal()))?.asset).toBeNull();
    expect((await a.rpc('complete_outfit_render', { p_id: asset.id })).error?.code).toBe('40001');
    await expect(service().setPresentation(stored.id, stored.updated_at, 'items', 'regular', signal())).rejects.toMatchObject({ code: '40001' });
  });
  it('reconciles a lost upload response with identical immutable bytes and retries completion', async () => {
    const { stored } = await saved(); const id = randomUUID(); paths.push(`${accounts[0]!.id}/${stored.id}/${id}.png`); let lost = false;
    const transport: typeof fetch = async (input, init) => { const result = await fetch(input, init); if (!lost && String(input).includes('/storage/v1/object/outfit-renders-private/') && init?.method === 'POST' && result.ok) { lost = true; throw new TypeError('Simulated response loss'); } return result; };
    const ready = await service(0, transport).storeImage(id, stored.id, stored.updated_at, 'items', 'regular', image, signal());
    expect(lost).toBe(true); expect(ready.status).toBe('ready');
    expect((await service().storeImage(id, stored.id, stored.updated_at, 'items', 'regular', image, signal())).id).toBe(id);
    const different = new Uint8Array(png.slice(0)); different[different.length - 1] = 0;
    await expect(service().storeImage(id, stored.id, stored.updated_at, 'items', 'regular', { ...image, bytes: different.buffer }, signal())).rejects.toThrow('different_render_file');
    await expect(service().storeImage(id, stored.id, stored.updated_at, 'mannequin', 'slim', image, signal())).rejects.toBeTruthy();
  });
  it('validates secondary colors on owned wardrobe writes and rejects wrong owner/cancellation', async () => {
    const a = accounts[0]!.client; const id = inventory['top-0']!;
    expect((await a.from('wardrobe_items').update({ secondary_color_hexes: ['#123456', '#ABCDEF'] }).eq('id', id)).error).toBeNull();
    expect((await a.from('wardrobe_items').update({ secondary_color_hexes: ['invalid'] }).eq('id', id)).error?.code).toBe('23514');
    expect((await a.from('wardrobe_items').update({ secondary_color_hexes: ['#000000', '#111111', '#222222', '#333333'] }).eq('id', id)).error?.code).toBe('23514');
    await expect(createRecommendationService(a, accounts[1]!.id, connection).candidates(recOptions, signal())).rejects.toMatchObject({ code: 'session_changed' });
    await expect(service().candidates(recOptions, AbortSignal.abort())).rejects.toMatchObject({ code: 'session_changed' });
  });
  it('pins candidate requests to the starting member when the current login changes', async () => {
    const a = accounts[0]!.client; const original = (await a.auth.getSession()).data.session!; const other = (await accounts[1]!.client.auth.getSession()).data.session!;
    let switched = false;
    const transport: typeof fetch = async (input, init) => { if (!switched) { switched = true; await a.auth.setSession(other); } return fetch(input, init); };
    try {
      const result = await service(0, transport).candidates(recOptions, signal()); expect(result.length).toBeGreaterThan(0); expect(result.every((item) => item.user_id === accounts[0]!.id)).toBe(true);
      await expect(service().candidates(recOptions, signal())).rejects.toMatchObject({ code: 'session_changed' });
    } finally { await a.auth.setSession(original); }
  });
});
