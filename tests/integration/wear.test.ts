import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database.generated';
import { createWearRepository } from '../../src/features/wear/repository';
import type { WearRecordInput } from '../../src/features/wear/model';
import { createOutfitRepository, outfitPayload } from '../../src/features/outfits/repository';
import { emptyOutfitDraft } from '../../src/features/outfits/draft';

const settings = JSON.parse(execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', shell: process.platform === 'win32', stdio: ['pipe', 'pipe', 'ignore'] }));
if (!['http://127.0.0.1:54321', 'http://localhost:54321'].includes(settings.API_URL)) throw new Error('Local API required');
const connection = { url: settings.API_URL as string, key: settings.ANON_KEY as string };
const options = { auth: { persistSession: false, autoRefreshToken: false }, db: { retry: false } } as const;
const admin = createClient<Database>(connection.url, settings.SERVICE_ROLE_KEY, options);
const accounts: { id: string; client: ReturnType<typeof createClient<Database>> }[] = [];
const clothes: string[] = [];
let foreign = '';
function wear(index = 0, transport: typeof fetch = fetch) { const a = accounts[index]!; return createWearRepository(a.client, a.id, connection, transport); }
function outfits() { const a = accounts[0]!; return createOutfitRepository(a.client, a.id, connection); }
function manual(wornOn = '2026-10-01', itemIds = [clothes[0]!, clothes[2]!]): WearRecordInput { return { kind: 'items', wornOn, itemIds, memo: '착용 메모' }; }
function outfitInput(source: { id: string; updated_at: string }, wornOn = '2026-10-02'): WearRecordInput { return { kind: 'outfit', wornOn, memo: '코디 기록', outfitId: source.id, outfitVersion: source.updated_at }; }
function outfitDraft(top = clothes[0]!) { return { ...emptyOutfitDraft(), name: '착용 원본 코디', items: { top, shoes: clothes[2]! } }; }
async function newOutfit() { return outfits().save(randomUUID(), null, outfitDraft()); }
async function newClothes(count = 1, price: number | null = null) {
  const result = await admin.from('wardrobe_items').insert(Array.from({ length: count }, () => ({ user_id: accounts[0]!.id, name: '착용 검증 의류', category_slug: 'shirt', purchase_price: price }))).select('id');
  if (result.error) throw result.error;
  return result.data.map((row) => row.id);
}
async function transaction(sql: string) {
  const child = spawn('docker', ['exec', '-i', 'supabase_db_closet', 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres']);
  const closed = new Promise<number | null>((resolve) => child.on('close', resolve));
  let output = ''; let timeout: ReturnType<typeof setTimeout>;
  try {
    await new Promise<void>((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('Fixture transaction timeout')), 5000);
      child.on('error', reject);
      child.stdout.on('data', (chunk) => { output += String(chunk); if (output.includes('LOCK_READY')) resolve(); });
      child.stdin.write(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${accounts[0]!.id}',true); ${sql}; select 'LOCK_READY';\n`);
    });
  } catch (error) { child.stdin.end('rollback;\n'); child.kill(); throw error; }
  finally { clearTimeout(timeout!); }
  return { commit: async () => { child.stdin.end('commit;\n'); expect(await closed).toBe(0); }, close: () => { if (!child.stdin.destroyed) child.stdin.end('rollback;\n'); child.kill(); } };
}
beforeAll(async () => {
  for (let index = 0; index < 2; index++) {
    const email = `closet-wear-${randomUUID()}@example.test`; const password = `${randomUUID()}aA!9`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error('Fixture account failed');
    const client = createClient<Database>(connection.url, connection.key, options);
    accounts.push({ id: created.data.user.id, client });
    if ((await client.auth.signInWithPassword({ email, password })).error) throw new Error('Fixture login failed');
  }
  const items = await admin.from('wardrobe_items').insert(['shirt', 'shirt', 'shoes'].map((category_slug) => ({ user_id: accounts[0]!.id, name: '착용 의류', category_slug }))).select('id,category_slug');
  if (items.error) throw items.error;
  clothes.push(...items.data.filter((item) => item.category_slug === 'shirt').map((item) => item.id), items.data.find((item) => item.category_slug === 'shoes')!.id);
  const other = await admin.from('wardrobe_items').insert({ user_id: accounts[1]!.id, name: '타인 의류', category_slug: 'shirt' }).select('id').single();
  if (other.error) throw other.error; foreign = other.data.id;
});
afterAll(async () => { for (const a of accounts) { const result = await admin.auth.admin.deleteUser(a.id); if (result.error) throw result.error; } });

describe('actual atomic wear snapshots', () => {
  it('records manual garments and several events for the same outfit/day as independent snapshots', async () => {
    const source = await newOutfit(); const service = wear();
    const first = await service.record(randomUUID(), manual());
    expect(first).toMatchObject({ worn_on: '2026-10-01', memo: '착용 메모', outfit_id: null, source_outfit_id: null, source_outfit_updated_at: null });
    expect((await service.get(first.id))?.wear_event_items.map((row) => row.item_id).sort()).toEqual([clothes[0], clothes[2]].sort());
    const a = await service.record(randomUUID(), outfitInput(source, '2026-10-03'));
    const b = await service.record(randomUUID(), outfitInput(source, '2026-10-03'));
    const nextDay = await service.record(randomUUID(), outfitInput(source, '2026-10-04'));
    expect(new Set([a.id, b.id, nextDay.id]).size).toBe(3);
    expect(a).toMatchObject({ outfit_id: source.id, source_outfit_id: source.id, source_outfit_updated_at: source.updated_at });
    expect((await service.list(0, { start: '2026-10-03', end: '2026-10-03' })).total).toBe(2);
  });
  it('preserves the recorded composition and exact retry across outfit edits, soft deletion and hard deletion', async () => {
    const source = await newOutfit(); const service = wear(); const id = randomUUID(); const input = outfitInput(source);
    const saved = await service.record(id, input);
    const updated = await outfits().save(source.id, source.updated_at, outfitDraft(clothes[1]!));
    await expect(service.record(id, outfitInput(updated))).rejects.toMatchObject({ code: '40001' });
    await outfits().remove(source.id, updated.updated_at);
    expect((await service.get(id))?.wear_event_items.map((row) => row.item_id).sort()).toEqual([clothes[0], clothes[2]].sort());
    expect((await service.record(id, input)).updated_at).toBe(saved.updated_at);
    if ((await admin.from('outfits').delete().eq('id', source.id).eq('user_id', accounts[0]!.id)).error) throw new Error('Fixture hard delete failed');
    const unlinked = await service.get(id);
    expect(unlinked).toMatchObject({ outfit_id: null, source_outfit_id: source.id, source_outfit_updated_at: source.updated_at, created_at: saved.created_at });
    // FK unlinking invokes the existing updated_at trigger. The retry itself
    // must leave that current version untouched.
    expect((await service.record(id, input)).updated_at).toBe(unlinked?.updated_at);
    await expect(service.record(id, { kind: 'items', wornOn: input.wornOn, memo: input.memo, itemIds: [clothes[0]!, clothes[2]!] })).rejects.toMatchObject({ code: '40001' });
    expect((await service.get(id))?.wear_event_items).toHaveLength(2);
  });
  it('rejects old outfit versions and unavailable sources without any partial event', async () => {
    const source = await newOutfit(); const service = wear();
    const changed = await outfits().save(source.id, source.updated_at, outfitDraft(clothes[1]!));
    const id = randomUUID();
    await expect(service.record(id, outfitInput(source))).rejects.toMatchObject({ code: '40001' });
    expect(await service.get(id)).toBeNull();
    await outfits().remove(source.id, changed.updated_at);
    await expect(service.record(id, outfitInput(changed))).rejects.toMatchObject({ code: 'P0002' });
    const empty = await admin.from('outfits').insert({ user_id: accounts[0]!.id, name: '기존 빈 코디' }).select('id,updated_at').single();
    if (empty.error) throw empty.error;
    await expect(service.record(id, outfitInput(empty.data))).rejects.toMatchObject({ code: '22023' });
    expect(await service.get(id)).toBeNull();
  });
  it('refuses foreign/missing/inactive/deleted garments and leaves no metadata or snapshot rows', async () => {
    const service = wear(); const bad = (await newClothes())[0]!;
    for (const changes of [{ lifecycle_status: 'archived' }, { lifecycle_status: 'sold' }, { lifecycle_status: 'donated' }, { lifecycle_status: 'active', deleted_at: '2026-10-01T00:00:00Z' }]) {
      const updated = await admin.from('wardrobe_items').update(changes).eq('id', bad);
      if (updated.error) throw updated.error;
      const id = randomUUID();
      await expect(service.record(id, manual('2026-10-05', [clothes[0]!, bad]))).rejects.toMatchObject({ code: 'P0003' });
      expect(await service.get(id)).toBeNull();
      expect((await accounts[0]!.client.from('wear_event_items').select('item_id').eq('wear_event_id', id)).data).toEqual([]);
    }
    for (const item of [foreign, randomUUID()]) await expect(service.record(randomUUID(), manual('2026-10-05', [item]))).rejects.toMatchObject({ code: 'P0003' });
    const source = await newOutfit();
    const unavailable = await admin.from('wardrobe_items').update({ lifecycle_status: 'archived' }).eq('id', clothes[0]!);
    if (unavailable.error) throw unavailable.error;
    try { await expect(service.record(randomUUID(), outfitInput(source))).rejects.toMatchObject({ code: 'P0003' }); }
    finally { if ((await admin.from('wardrobe_items').update({ lifecycle_status: 'active' }).eq('id', clothes[0]!)).error) throw new Error('Restore failed'); }
  });
  it('validates raw RPC date/selection/null/length inputs and accepts the fifty-garment boundary', async () => {
    const a = accounts[0]!; const source = await newOutfit();
    const base = { p_id: randomUUID(), p_worn_on: '2026-10-06', p_items: [clothes[0]!] };
    const invalid: Record<string, unknown>[] = [
      { p_id: null }, { p_worn_on: null }, { p_worn_on: 'infinity' }, { p_worn_on: '1899-12-31' }, { p_worn_on: '10000-01-01' }, { p_worn_on: '2026-02-29' },
      { p_memo: null }, { p_memo: 'a'.repeat(5001) }, { p_items: [] }, { p_items: null }, { p_items: [null] }, { p_items: [clothes[0], clothes[0]] },
      { p_items: Array.from({ length: 51 }, () => randomUUID()) }, { p_outfit: source.id, p_outfit_expected: source.updated_at }, { p_outfit: source.id, p_items: null }, { p_outfit_expected: source.updated_at },
    ];
    const session = (await a.client.auth.getSession()).data.session!;
    for (const patch of invalid) {
      const response = await fetch(`${connection.url}/rest/v1/rpc/record_wear_event`, { method: 'POST', headers: { apikey: connection.key, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...base, ...patch }) });
      expect(response.ok, JSON.stringify(patch)).toBe(false);
      expect(await wear().get(base.p_id)).toBeNull();
    }
    const many = await newClothes(50);
    const saved = await wear().record(randomUUID(), manual('2026-10-06', many));
    expect((await wear().get(saved.id))?.wear_event_items).toHaveLength(50);
  });
  it('retries lost responses and concurrent creates without duplicates and rejects changed requests', async () => {
    const service = wear(); const id = randomUUID(); const input = manual('2026-10-07');
    const saved = await Promise.all([service.record(id, input), service.record(id, { ...input, itemIds: [clothes[2]!, clothes[0]!] } as WearRecordInput)]);
    expect(saved[0]?.updated_at).toBe(saved[1]?.updated_at);
    expect((await service.get(id))?.wear_event_items).toHaveLength(2);
    await expect(service.record(id, manual('2026-10-08'))).rejects.toMatchObject({ code: '40001' });
    await expect(service.record(id, { ...input, memo: '다른 요청' })).rejects.toMatchObject({ code: '40001' });
    await expect(service.record(id, manual('2026-10-07', [clothes[1]!]))).rejects.toMatchObject({ code: '40001' });
    let lost = false;
    const lossy = wear(0, async (url, init) => { const response = await fetch(url, init); if (!lost && String(url).includes('/rpc/')) { lost = true; throw new TypeError('Simulated lost response'); } return response; });
    const secondId = randomUUID(); const source = await newOutfit(); const outfit = outfitInput(source, '2026-10-07');
    await expect(lossy.record(secondId, outfit)).rejects.toBeTruthy();
    const existing = await service.get(secondId);
    await outfits().save(source.id, source.updated_at, outfitDraft(clothes[1]!));
    expect((await lossy.record(secondId, outfit)).updated_at).toBe(existing?.updated_at);
    const collision = randomUUID();
    const results = await Promise.allSettled([service.record(collision, manual('2026-10-08')), service.record(collision, manual('2026-10-09'))]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { code: '40001' } });
  });
  it('isolates both accounts and denies anonymous and direct writes to events and snapshots', async () => {
    const a = accounts[0]!; const b = accounts[1]!; const source = await newOutfit(); const saved = await wear().record(randomUUID(), manual('2026-10-10'));
    expect(await wear(1).get(saved.id)).toBeNull();
    expect((await wear(1).list(0, { start: '2026-10-01', end: '2026-10-31' })).items).toEqual([]);
    await expect(wear(1).record(saved.id, manual('2026-10-10', [foreign]))).rejects.toMatchObject({ code: 'P0002' });
    await expect(wear(1).record(randomUUID(), outfitInput(source))).rejects.toMatchObject({ code: 'P0002' });
    const anonymous = createClient<Database>(connection.url, connection.key, options);
    expect((await anonymous.rpc('record_wear_event', { p_id: randomUUID(), p_worn_on: '2026-10-10', p_items: [clothes[0]!] })).error?.code).toBe('42501');
    expect((await anonymous.from('wear_events').select('*')).error?.code).toBe('42501');
    expect((await a.client.from('wear_events').insert({ user_id: a.id, worn_on: '2026-10-10' })).error?.code).toBe('42501');
    expect((await a.client.from('wear_events').update({ memo: '직접 변경' }).eq('id', saved.id)).error?.code).toBe('42501');
    expect((await a.client.from('wear_events').delete().eq('id', saved.id)).error?.code).toBe('42501');
    expect((await a.client.from('wear_event_items').insert({ user_id: a.id, wear_event_id: saved.id, item_id: clothes[1]! })).error?.code).toBe('42501');
    expect((await a.client.from('wear_event_items').update({ item_id: clothes[1]! }).eq('wear_event_id', saved.id)).error?.code).toBe('42501');
    expect((await a.client.from('wear_event_items').delete().eq('wear_event_id', saved.id)).error?.code).toBe('42501');
    await expect(createWearRepository(b.client, a.id, connection).list(0, { start: '2026-10-01', end: '2026-10-31' })).rejects.toMatchObject({ code: 'session_changed' });
  });
  it('pages inclusive date ranges and returns corrected totals after a fixture event disappears', async () => {
    const service = wear(); const events = await Promise.all(Array.from({ length: 21 }, () => service.record(randomUUID(), manual('2024-02-29'))));
    await service.record(randomUUID(), manual('2024-02-28')); await service.record(randomUUID(), manual('2024-03-01'));
    const range = { start: '2024-02-29', end: '2024-02-29' };
    const first = await service.list(0, range); const last = await service.list(1, range);
    expect(first.total).toBe(21); expect(first.items).toHaveLength(20); expect(last.items).toHaveLength(1);
    expect(new Set([...first.items, ...last.items].map((row) => row.id)).size).toBe(21);
    expect((await service.list(0, range)).items.map((row) => row.id)).toEqual(first.items.map((row) => row.id));
    expect((await service.list(0, { start: '2024-02-28', end: '2024-02-29' })).total).toBe(22);
    expect((await service.list(50, range))).toEqual({ items: [], total: 21 });
    if ((await admin.from('wear_events').delete().eq('user_id', accounts[0]!.id).eq('id', events[0]!.id)).error) throw new Error('Fixture deletion failed');
    expect(await service.list(1, range)).toEqual({ items: [], total: 20 });
  });
  it('rejects cancelled and invalid queries and pins the starting account during recording', async () => {
    const a = accounts[0]!; const b = accounts[1]!; const service = wear();
    await expect(service.record(randomUUID(), manual(), AbortSignal.abort())).rejects.toMatchObject({ code: 'session_changed' });
    await expect(service.get(randomUUID(), AbortSignal.abort())).rejects.toMatchObject({ code: 'session_changed' });
    await expect(service.list(-1, { start: '2026-10-01', end: '2026-10-31' })).rejects.toMatchObject({ code: 'invalid_page' });
    await expect(service.list(0, { start: '2026-10-01', end: '2026-10-31' }, AbortSignal.abort())).rejects.toMatchObject({ code: 'session_changed' });
    await expect(service.list(0, { start: '2026-10-31', end: '2026-10-01' })).rejects.toBeTruthy();
    const original = (await a.client.auth.getSession()).data.session!; const next = (await b.client.auth.getSession()).data.session!;
    let switched = false;
    const pinned = wear(0, async (url, init) => { if (!switched) { switched = true; if ((await a.client.auth.setSession(next)).error) throw new Error('Session fixture failed'); } return fetch(url, init); });
    try { expect((await pinned.record(randomUUID(), manual('2026-10-11'))).user_id).toBe(a.id); }
    finally { if ((await a.client.auth.setSession(original)).error) throw new Error('Session restore failed'); }
  });
  it('locks outfit composition until recording commits, and rejects an outfit edit committed first', async () => {
    const source = await newOutfit(); const id = randomUUID();
    const recording = await transaction(`select public.record_wear_event('${id}','2026-10-12','', '${source.id}','${source.updated_at}',null)`);
    try {
      let changed = false;
      const edit = outfits().save(source.id, source.updated_at, outfitDraft(clothes[1]!)).then((value) => { changed = true; return value; });
      await new Promise((resolve) => setTimeout(resolve, 150)); expect(changed).toBe(false);
      await recording.commit(); await edit;
      expect((await wear().get(id))?.wear_event_items.map((row) => row.item_id).sort()).toEqual([clothes[0], clothes[2]].sort());
    } finally { recording.close(); }
    const current = await outfits().get(source.id);
    const payload = JSON.stringify(outfitPayload(outfitDraft())).replaceAll("'", "''");
    const editing = await transaction(`select public.save_outfit('${source.id}','${current!.updated_at}','${payload}'::jsonb)`);
    try {
      let finished = false; const deniedId = randomUUID();
      const pending = wear().record(deniedId, outfitInput(current!)).then(() => ({ code: 'unexpected_success' }), (error: unknown) => error).finally(() => { finished = true; });
      await new Promise((resolve) => setTimeout(resolve, 150)); expect(finished).toBe(false);
      await editing.commit(); expect(await pending).toMatchObject({ code: '40001' });
      expect(await wear().get(deniedId)).toBeNull();
    } finally { editing.close(); }
  });
  it('holds manual garment validation locks until commit and retains history after the garment is archived', async () => {
    const id = randomUUID(); const item = (await newClothes())[0]!;
    const recording = await transaction(`select public.record_wear_event('${id}','2026-10-13','',null,null,array['${item}']::uuid[])`);
    try {
      let changed = false;
      const archive = Promise.resolve(accounts[0]!.client.from('wardrobe_items').update({ lifecycle_status: 'archived' }).eq('id', item)).then((result) => { if (result.error) throw result.error; changed = true; });
      await new Promise((resolve) => setTimeout(resolve, 150)); expect(changed).toBe(false);
      await recording.commit(); await archive;
      expect(await wear().get(id)).toMatchObject({ wear_event_items: [{ item_id: item, item: { lifecycle_status: 'archived' } }] });
      await expect(wear().record(randomUUID(), manual('2026-10-13', [item]))).rejects.toMatchObject({ code: 'P0003' });
      const original = await wear().get(id);
      const retry = { kind: 'items' as const, wornOn: '2026-10-13', itemIds: [item], memo: '' };
      expect((await wear().record(id, retry)).updated_at).toBe(original?.updated_at);
      if ((await accounts[0]!.client.from('wardrobe_items').update({ deleted_at: '2026-10-14T00:00:00Z' }).eq('id', item)).error) throw new Error('Fixture soft delete failed');
      expect(await wear().get(id)).toMatchObject({ wear_event_items: [{ item_id: item, item: { deleted_at: '2026-10-14T00:00:00+00:00' } }] });
      expect((await wear().record(id, retry)).updated_at).toBe(original?.updated_at);
    } finally { recording.close(); }
  });
  it('updates existing wear counts and cost-per-wear once per event, including repeated same-day wear', async () => {
    const item = (await newClothes(1, 120))[0]!; const a = accounts[0]!;
    async function stats() { const result = await a.client.from('item_wear_stats').select('wear_count,last_worn_on,cost_per_wear').eq('item_id', item).single(); if (result.error) throw result.error; return result.data; }
    expect(await stats()).toMatchObject({ wear_count: 0, cost_per_wear: null });
    const id = randomUUID(); const input = manual('2026-10-14', [item]);
    await wear().record(id, input); await wear().record(id, input);
    expect(await stats()).toMatchObject({ wear_count: 1, cost_per_wear: 120, last_worn_on: '2026-10-14' });
    await wear().record(randomUUID(), input);
    expect(await stats()).toMatchObject({ wear_count: 2, cost_per_wear: 60 });
  });
});
