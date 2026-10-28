import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database.generated';
import { createWearRepository } from '../../src/features/wear/repository';
import { createWardrobeRepository } from '../../src/features/wardrobe/repository';
import { createOutfitRepository } from '../../src/features/outfits/repository';
import { emptyOutfitDraft } from '../../src/features/outfits/draft';

const settings = JSON.parse(execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', shell: process.platform === 'win32', stdio: ['pipe', 'pipe', 'ignore'] }));
if (!['http://127.0.0.1:54321', 'http://localhost:54321'].includes(settings.API_URL)) throw new Error('Local API required');
const connection = { url: settings.API_URL as string, key: settings.ANON_KEY as string };
const options = { auth: { persistSession: false, autoRefreshToken: false }, db: { retry: false } } as const;
const admin = createClient<Database>(connection.url, settings.SERVICE_ROLE_KEY, options);
const accounts: { id: string; client: ReturnType<typeof createClient<Database>> }[] = [];
const clothes: string[] = [];
let foreign = '';
function repo(index = 0, transport: typeof fetch = fetch) { const a = accounts[index]!; return createWearRepository(a.client, a.id, connection, transport); }
function manual(date = '2026-10-01', ids = [clothes[0]!]) { return { kind: 'items' as const, wornOn: date, memo: '원본 기록', itemIds: ids }; }
async function locked(sql: string) {
  const child = spawn('docker', ['exec', '-i', 'supabase_db_closet', 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres']);
  const closed = new Promise<number | null>((resolve) => child.on('close', resolve));
  let output = ''; let timeout: ReturnType<typeof setTimeout>;
  try {
    await new Promise<void>((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('Fixture lock timeout')), 5000);
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
    const email = `closet-calendar-${randomUUID()}@example.test`; const password = `${randomUUID()}aA!9`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error('Fixture account failed');
    const client = createClient<Database>(connection.url, connection.key, options);
    accounts.push({ id: created.data.user.id, client });
    if ((await client.auth.signInWithPassword({ email, password })).error) throw new Error('Fixture login failed');
  }
  const items = await admin.from('wardrobe_items').insert(Array.from({ length: 3 }, () => ({ user_id: accounts[0]!.id, name: '달력 검증 의류', category_slug: 'shirt', purchase_price: 120 }))).select('id');
  if (items.error) throw items.error; clothes.push(...items.data.map((row) => row.id));
  const b = await admin.from('wardrobe_items').insert({ user_id: accounts[1]!.id, name: '타인 의류', category_slug: 'shirt' }).select('id').single();
  if (b.error) throw b.error; foreign = b.data.id;
});
afterAll(async () => { for (const a of accounts) { const result = await admin.auth.admin.deleteUser(a.id); if (result.error) throw result.error; } });

describe('wear calendar CRUD on actual local DB', () => {
  it('edits metadata with keep mode while preserving inactive and trashed historical garments', async () => {
    const service = repo(); const saved = await service.record(randomUUID(), manual());
    const changed = await admin.from('wardrobe_items').update({ lifecycle_status: 'archived', deleted_at: '2026-10-01T00:00:00Z' }).eq('id', clothes[0]!);
    if (changed.error) throw changed.error;
    try {
      const updated = await service.update(saved.id, saved.updated_at, { kind: 'keep', wornOn: '2026-09-30', memo: '고친 메모' });
      expect(updated).toMatchObject({ worn_on: '2026-09-30', memo: '고친 메모' });
      expect(updated.updated_at > saved.updated_at).toBe(true);
      expect((await service.get(saved.id))?.wear_event_items.map((row) => row.item_id)).toEqual([clothes[0]]);
      expect((await service.selectedItems([clothes[0]!]))[0]?.deleted_at).not.toBeNull();
      expect((await service.update(saved.id, saved.updated_at, { kind: 'keep', wornOn: '2026-09-30', memo: '고친 메모' })).updated_at).toBe(updated.updated_at);
    } finally { if ((await admin.from('wardrobe_items').update({ lifecycle_status: 'active', deleted_at: null }).eq('id', clothes[0]!)).error) throw new Error('Fixture restore failed'); }
  });
  it('replaces only the explicitly edited event snapshot without changing another event or an outfit', async () => {
    const a = accounts[0]!; const service = repo(); const outfits = createOutfitRepository(a.client, a.id, connection);
    const source = await outfits.save(randomUUID(), null, { ...emptyOutfitDraft(), name: '기록 교체 코디', items: { top: clothes[0]! } });
    const first = await service.record(randomUUID(), manual()); const second = await service.record(randomUUID(), manual());
    const manualEdit = await service.update(first.id, first.updated_at, manual('2026-10-01', [clothes[1]!]));
    expect((await service.get(first.id))?.wear_event_items.map((row) => row.item_id)).toEqual([clothes[1]]);
    expect((await service.get(second.id))?.wear_event_items.map((row) => row.item_id)).toEqual([clothes[0]]);
    const chosen = { kind: 'outfit' as const, wornOn: '2026-10-02', memo: '코디로 교체', outfitId: source.id, outfitVersion: source.updated_at };
    const fromOutfit = await service.update(first.id, manualEdit.updated_at, chosen);
    expect(fromOutfit.source_outfit_id).toBe(source.id);
    await outfits.save(source.id, source.updated_at, { ...emptyOutfitDraft(), name: '바뀐 원본', items: { top: clothes[2]! } });
    expect((await service.update(first.id, manualEdit.updated_at, chosen)).updated_at).toBe(fromOutfit.updated_at);
    expect((await service.get(first.id))?.wear_event_items.map((row) => row.item_id)).toEqual([clothes[0]]);
    expect((await outfits.get(source.id))?.outfit_items[0]?.item_id).toBe(clothes[2]);
  });
  it('rolls back date, memo and snapshot changes for unavailable, foreign or stale source replacements', async () => {
    const service = repo(); const saved = await service.record(randomUUID(), manual());
    for (const id of [foreign, randomUUID()]) await expect(service.update(saved.id, saved.updated_at, manual('2026-11-01', [id]))).rejects.toMatchObject({ code: 'P0003' });
    if ((await admin.from('wardrobe_items').update({ lifecycle_status: 'sold' }).eq('id', clothes[1]!)).error) throw new Error('Fixture status failed');
    try { await expect(service.update(saved.id, saved.updated_at, manual('2026-11-01', [clothes[1]!]))).rejects.toMatchObject({ code: 'P0003' }); }
    finally { if ((await admin.from('wardrobe_items').update({ lifecycle_status: 'active' }).eq('id', clothes[1]!)).error) throw new Error('Restore failed'); }
    const a = accounts[0]!; const outfits = createOutfitRepository(a.client, a.id, connection);
    const source = await outfits.save(randomUUID(), null, { ...emptyOutfitDraft(), name: '버전 검증 코디', items: { top: clothes[0]! } });
    await outfits.save(source.id, source.updated_at, { ...emptyOutfitDraft(), name: '바뀐 코디', items: { top: clothes[2]! } });
    await expect(service.update(saved.id, saved.updated_at, { kind: 'outfit', wornOn: '2026-11-01', memo: '', outfitId: source.id, outfitVersion: source.updated_at })).rejects.toMatchObject({ code: '40001' });
    expect(await service.get(saved.id)).toMatchObject({ worn_on: saved.worn_on, memo: saved.memo, updated_at: saved.updated_at, wear_event_items: [{ item_id: clothes[0] }] });
  });
  it('serializes concurrent edits and refuses stale deletion', async () => {
    const service = repo(); const saved = await service.record(randomUUID(), manual());
    const results = await Promise.allSettled([
      service.update(saved.id, saved.updated_at, { kind: 'keep', wornOn: saved.worn_on, memo: '한쪽 변경' }),
      service.update(saved.id, saved.updated_at, { kind: 'keep', wornOn: saved.worn_on, memo: '다른 변경' }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { code: '40001' } });
    await expect(service.remove(saved.id, saved.updated_at)).rejects.toMatchObject({ code: '40001' });
  });
  it('retries lost edit and delete responses without extra writes or resurrection', async () => {
    const service = repo(); const input = manual('2026-10-03'); const saved = await service.record(randomUUID(), input);
    let lost = false;
    const lossy = repo(0, async (url, init) => { const response = await fetch(url, init); if (!lost && String(url).includes('/rpc/')) { lost = true; throw new TypeError('Simulated lost response'); } return response; });
    const edit = { kind: 'keep' as const, wornOn: '2026-10-04', memo: '응답 유실 수정' };
    await expect(lossy.update(saved.id, saved.updated_at, edit)).rejects.toBeTruthy();
    const current = await service.get(saved.id);
    expect((await lossy.update(saved.id, saved.updated_at, edit)).updated_at).toBe(current?.updated_at);
    lost = false;
    await expect(lossy.remove(saved.id, current!.updated_at)).rejects.toBeTruthy();
    const tombstone = await lossy.remove(saved.id, current!.updated_at);
    expect(tombstone.deleted_at).not.toBeNull();
    expect((await lossy.remove(saved.id, current!.updated_at)).updated_at).toBe(tombstone.updated_at);
    expect(await service.get(saved.id)).toBeNull();
    await expect(service.record(saved.id, input)).rejects.toMatchObject({ code: 'P0002' });
    await expect(service.update(saved.id, current!.updated_at, edit)).rejects.toMatchObject({ code: 'P0002' });
  });
  it('moves calendar day counts across months and excludes deleted events from counts, stats and garment usage', async () => {
    const a = accounts[0]!; const service = repo();
    const fresh = await admin.from('wardrobe_items').insert({ user_id: a.id, name: '집계 검증 옷', category_slug: 'shirt', purchase_price: 120 }).select('id').single();
    if (fresh.error) throw fresh.error;
    const input = manual('2024-02-29', [fresh.data.id]);
    const first = await service.record(randomUUID(), input); const second = await service.record(randomUUID(), input);
    expect(await service.dayCounts({ start: '2024-02-01', end: '2024-02-29' })).toEqual([{ worn_on: '2024-02-29', event_count: 2 }]);
    const moved = await service.update(first.id, first.updated_at, { kind: 'keep', wornOn: '2024-03-01', memo: '' });
    expect(await service.dayCounts({ start: '2024-02-01', end: '2024-03-01' })).toEqual([{ worn_on: '2024-02-29', event_count: 1 }, { worn_on: '2024-03-01', event_count: 1 }]);
    await service.remove(first.id, moved.updated_at);
    expect(await service.dayCounts({ start: '2024-03-01', end: '2024-03-31' })).toEqual([]);
    const stats = await a.client.from('item_wear_stats').select('wear_count,cost_per_wear,last_worn_on').eq('item_id', fresh.data.id).single();
    expect(stats.data).toMatchObject({ wear_count: 1, cost_per_wear: 120, last_worn_on: '2024-02-29' });
    expect(await createWardrobeRepository(a.client, a.id).usage(fresh.data.id)).toMatchObject({ wear_count: 1 });
    await service.remove(second.id, second.updated_at);
    expect((await a.client.from('item_wear_stats').select('wear_count,cost_per_wear,last_worn_on').eq('item_id', fresh.data.id).single()).data).toMatchObject({ wear_count: 0, cost_per_wear: null, last_worn_on: null });
    expect(await createWardrobeRepository(a.client, a.id).usage(fresh.data.id)).toMatchObject({ wear_count: 0 });
  });
  it('excludes tombstones from list paging and summarizes dates independently of the selected page', async () => {
    const service = repo(); const saved = await Promise.all(Array.from({ length: 21 }, () => service.record(randomUUID(), manual('2023-12-31'))));
    const range = { start: '2023-12-31', end: '2023-12-31' };
    expect((await service.list(1, range)).items).toHaveLength(1);
    expect(await service.dayCounts(range)).toEqual([{ worn_on: '2023-12-31', event_count: 21 }]);
    await service.remove(saved[0]!.id, saved[0]!.updated_at);
    expect(await service.list(1, range)).toEqual({ items: [], total: 20 });
    expect(await service.dayCounts(range)).toEqual([{ worn_on: '2023-12-31', event_count: 20 }]);
  });
  it('denies foreign, anonymous, private-creator and direct table mutations', async () => {
    const a = accounts[0]!; const b = accounts[1]!; const saved = await repo().record(randomUUID(), manual());
    await expect(repo(1).update(saved.id, saved.updated_at, { kind: 'keep', wornOn: saved.worn_on, memo: '타인 변경' })).rejects.toMatchObject({ code: 'P0002' });
    await expect(repo(1).remove(saved.id, saved.updated_at)).rejects.toMatchObject({ code: 'P0002' });
    expect(await repo(1).dayCounts({ start: '2026-10-01', end: '2026-10-31' })).toEqual([]);
    expect((await a.client.rpc('wear_day_counts', { p_owner: b.id, p_start: '2026-10-01', p_end: '2026-10-31' })).data).toEqual([]);
    const anonymous = createClient<Database>(connection.url, connection.key, options);
    expect((await anonymous.rpc('update_wear_event', { p_id: saved.id, p_expected: saved.updated_at, p_worn_on: saved.worn_on })).error?.code).toBe('42501');
    expect((await anonymous.rpc('delete_wear_event', { p_id: saved.id, p_expected: saved.updated_at })).error?.code).toBe('42501');
    expect((await anonymous.rpc('wear_day_counts', { p_owner: a.id, p_start: '2026-10-01', p_end: '2026-10-31' })).error?.code).toBe('42501');
    expect((await a.client.from('wear_events').update({ deleted_at: null }).eq('id', saved.id)).error?.code).toBe('42501');
    const denied = execFileSync('docker', ['exec', 'supabase_db_closet', 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-c', "select has_function_privilege('authenticated','app_private.record_wear_event(uuid,date,text,uuid,timestamptz,uuid[])','execute');"], { encoding: 'utf8' });
    expect(denied.trim()).toBe('f');
  });
  it('validates raw editing modes, bounds and dates without changing an existing snapshot', async () => {
    const a = accounts[0]!; const saved = await repo().record(randomUUID(), manual());
    const input = { p_id: saved.id, p_expected: saved.updated_at, p_worn_on: saved.worn_on };
    for (const patch of [{ p_mode: 'unsafe' }, { p_mode: 'items', p_items: [] }, { p_mode: 'items', p_items: [clothes[0]!, clothes[0]!] }, { p_mode: 'outfit' }, { p_mode: 'keep', p_items: [clothes[0]!] }, { p_memo: 'a'.repeat(5001) }]) {
      expect((await a.client.rpc('update_wear_event', { ...input, ...patch })).error?.code).toBe('22023');
    }
    for (const range of [{ p_start: '2026-10-31', p_end: '2026-10-01' }, { p_start: '2024-01-01', p_end: '2025-01-01' }, { p_start: 'infinity', p_end: 'infinity' }]) expect((await a.client.rpc('wear_day_counts', { p_owner: a.id, ...range })).error).toBeTruthy();
    expect(await repo().get(saved.id)).toMatchObject({ updated_at: saved.updated_at, wear_event_items: [{ item_id: clothes[0] }] });
  });
  it('cancels changed-owner requests and returns only owned selected garment details, including historical states', async () => {
    const a = accounts[0]!; const b = accounts[1]!; const saved = await repo().record(randomUUID(), manual());
    await expect(repo().update(saved.id, saved.updated_at, { kind: 'keep', wornOn: saved.worn_on, memo: '' }, AbortSignal.abort())).rejects.toMatchObject({ code: 'session_changed' });
    await expect(repo().remove(saved.id, saved.updated_at, AbortSignal.abort())).rejects.toMatchObject({ code: 'session_changed' });
    await expect(repo().dayCounts({ start: '2026-10-01', end: '2026-10-31' }, AbortSignal.abort())).rejects.toMatchObject({ code: 'session_changed' });
    expect(await repo().selectedItems([foreign])).toEqual([]);
    expect((await repo().selectedItems([clothes[0]!]))[0]?.user_id).toBe(a.id);
    await expect(createWearRepository(b.client, a.id, connection).remove(saved.id, saved.updated_at)).rejects.toMatchObject({ code: 'session_changed' });
  });
  it('locks explicit composition edits against outfit writes and stale event deletion', async () => {
    const a = accounts[0]!; const service = repo(); const outfits = createOutfitRepository(a.client, a.id, connection);
    const source = await outfits.save(randomUUID(), null, { ...emptyOutfitDraft(), name: '잠금 코디', items: { top: clothes[1]! } });
    const saved = await service.record(randomUUID(), manual('2026-10-15'));
    const editing = await locked(`select public.update_wear_event('${saved.id}','${saved.updated_at}','2026-10-15','잠금 수정','outfit','${source.id}','${source.updated_at}',null)`);
    try {
      let changed = false; let deleted = false;
      const change = outfits.save(source.id, source.updated_at, { ...emptyOutfitDraft(), name: '변경된 잠금 코디', items: { top: clothes[2]! } }).then((value) => { changed = true; return value; });
      const remove = service.remove(saved.id, saved.updated_at).then(() => ({ code: 'unexpected_success' }), (error: unknown) => error).finally(() => { deleted = true; });
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(changed).toBe(false); expect(deleted).toBe(false);
      await editing.commit(); await change;
      expect(await remove).toMatchObject({ code: '40001' });
      expect((await service.get(saved.id))?.wear_event_items.map((entry) => entry.item_id)).toEqual([clothes[1]]);
    } finally { editing.close(); }
  });
});
