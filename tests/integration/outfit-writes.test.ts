import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database, Json } from '../../src/types/database.generated';
import { emptyOutfitDraft, slotCategories, slots, type OutfitDraft } from '../../src/features/outfits/draft';
import { createOutfitRepository, outfitPayload } from '../../src/features/outfits/repository';
import { createOutfitCatalog, defaultOutfitCatalogFilters } from '../../src/features/outfits/catalog';

const settings = JSON.parse(execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', shell: process.platform === 'win32', stdio: ['pipe', 'pipe', 'ignore'] }));
if (!['http://127.0.0.1:54321', 'http://localhost:54321'].includes(settings.API_URL)) throw new Error('Local API required');
const connection = { url: settings.API_URL as string, key: settings.ANON_KEY as string };
const options = { auth: { persistSession: false, autoRefreshToken: false }, db: { retry: false } } as const;
const admin = createClient<Database>(connection.url, settings.SERVICE_ROLE_KEY, options);
const accounts: { id: string; client: ReturnType<typeof createClient<Database>> }[] = [];
const ids: Record<string, string> = {};
function repo(index = 0, transport: typeof fetch = fetch) { const a = accounts[index]!; return createOutfitRepository(a.client, a.id, connection, transport); }
function draft(name = '저장 코디'): OutfitDraft { return { ...emptyOutfitDraft(), name, memo: '메모', tags: '봄, 파랑', seasons: ['spring'], items: { top: ids.top! } }; }
async function patchItem(id: string, changes: Database['public']['Tables']['wardrobe_items']['Update']) { const result = await admin.from('wardrobe_items').update(changes).eq('id', id); if (result.error) throw result.error; }
async function lockedTransaction(sql: string) {
  const process = spawn('docker', ['exec', '-i', 'supabase_db_closet', 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres']);
  const closed = new Promise<number | null>((resolve) => process.on('close', resolve));
  let output = '';
  let timeout: ReturnType<typeof setTimeout>;
  try {
    await new Promise<void>((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('Fixture lock timeout')), 5000);
      process.on('error', reject);
      process.stdout.on('data', (chunk) => { output += String(chunk); if (output.includes('LOCK_READY')) resolve(); });
      process.stdin.write(`begin; ${sql}; select 'LOCK_READY';\n`);
    });
  } catch (error) { process.stdin.end('rollback;\n'); process.kill(); throw error; }
  finally { clearTimeout(timeout!); }
  return { commit: async () => { process.stdin.end('commit;\n'); expect(await closed).toBe(0); }, rollback: () => { if (!process.stdin.destroyed) process.stdin.end('rollback;\n'); process.kill(); } };
}
beforeAll(async () => {
  for (let index = 0; index < 2; index++) {
    const email = `closet-writes-${randomUUID()}@example.test`; const password = `${randomUUID()}aA!9`;
    const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (result.error || !result.data.user) throw new Error('Fixture setup failed');
    const client = createClient<Database>(connection.url, connection.key, options);
    accounts.push({ id: result.data.user.id, client });
    if ((await client.auth.signInWithPassword({ email, password })).error) throw new Error('Fixture login failed');
  }
  for (const slot of slots) {
    ids[slot] = randomUUID();
    const result = await admin.from('wardrobe_items').insert({ id: ids[slot], user_id: accounts[0]!.id, name: `저장 ${slot}`, category_slug: slotCategories[slot] });
    if (result.error) throw result.error;
  }
  ids.foreign = randomUUID();
  if ((await admin.from('wardrobe_items').insert({ id: ids.foreign, user_id: accounts[1]!.id, name: '타인 옷', category_slug: 'shirt' })).error) throw new Error('Foreign fixture failed');
});
afterAll(async () => { for (const a of accounts) { const result = await admin.auth.admin.deleteUser(a.id); if (result.error) throw result.error; } });

describe('atomic outfit writes on actual local Supabase', () => {
  it('persists all seven slots and metadata, refreshes the catalog, and replaces the entire composition', async () => {
    const service = repo(); const id = randomUUID();
    const input = { ...draft('일곱 슬롯'), occasion: '출근', isFavorite: true, items: Object.fromEntries(slots.map((slot) => [slot, ids[slot]!])) };
    const saved = await service.save(id, null, input);
    expect(saved).toMatchObject({ id, user_id: accounts[0]!.id, name: input.name, is_favorite: true, tags: ['봄', '파랑'] });
    expect((await service.get(id))?.outfit_items).toHaveLength(7);
    expect((await createOutfitCatalog(accounts[0]!.client, accounts[0]!.id).list(0, { ...defaultOutfitCatalogFilters, search: input.name })).items[0]?.id).toBe(id);
    const updated = await service.save(id, saved.updated_at, draft('한 슬롯으로 변경'));
    expect(updated.updated_at).not.toBe(saved.updated_at);
    expect((await service.get(id))?.outfit_items.map((row) => row.item_id)).toEqual([ids.top]);
  });
  it('rejects empty, duplicate, malformed, layered and owner-injected raw RPC payloads without creating rows', async () => {
    const payload = outfitPayload(draft());
    const cases: Json[] = [null, [], { ...payload, name: '' }, { ...payload, items: [] }, { ...payload, memo: null }, { ...payload, user_id: accounts[1]!.id },
      { ...payload, tags: [null] }, { ...payload, seasons: ['unknown'] }, { ...payload, items: [payload.items[0]!, payload.items[0]!] },
      { ...payload, items: [{ slot: 'top', item_id: ids.top!, position: 1 }] }, { ...payload, items: [{ slot: 'unknown', item_id: ids.top!, position: 0 }] },
      { ...payload, items: [{ slot: 'top', item_id: 'not-a-uuid', position: 0 }] }, { ...payload, items: [{ slot: 'top', item_id: ids.top!, position: null }] }];
    for (const p_draft of cases) {
      const id = randomUUID(); const result = await accounts[0]!.client.rpc('save_outfit', { p_id: id, p_draft });
      expect(result.error, JSON.stringify(p_draft)).toBeTruthy();
      expect(await repo().get(id)).toBeNull();
    }
  });
  it('rolls back both metadata and slots when any garment is unavailable, misclassified or foreign', async () => {
    const service = repo(); const id = randomUUID(); const saved = await service.save(id, null, draft('원본 유지'));
    for (const item of [ids.foreign!, ids.shoes!, randomUUID()]) {
      await expect(service.save(id, saved.updated_at, { ...draft('실패한 교체'), items: { top: item } })).rejects.toMatchObject({ code: 'P0003' });
      expect(await service.get(id)).toMatchObject({ name: '원본 유지', updated_at: saved.updated_at, outfit_items: [{ item_id: ids.top }] });
    }
    for (const changes of [{ lifecycle_status: 'archived' }, { lifecycle_status: 'sold' }, { lifecycle_status: 'donated' }, { lifecycle_status: 'active', category_slug: 'shoes' }, { category_slug: 'tops', deleted_at: new Date().toISOString() }]) {
      await patchItem(ids.top!, changes);
      await expect(service.save(id, saved.updated_at, draft('변경된 의류'))).rejects.toMatchObject({ code: 'P0003' });
    }
    await patchItem(ids.top!, { lifecycle_status: 'active', category_slug: 'tops', deleted_at: null });
    expect((await service.get(id))?.name).toBe('원본 유지');
  });
  it('allows one winner for concurrent edits and refuses stale deletion or copying', async () => {
    const service = repo(); const id = randomUUID(); const saved = await service.save(id, null, draft('동시 수정'));
    const results = await Promise.allSettled([service.save(id, saved.updated_at, draft('첫 변경')), service.save(id, saved.updated_at, draft('두번째 변경'))]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { code: '40001' } });
    await expect(service.remove(id, saved.updated_at)).rejects.toMatchObject({ code: '40001' });
    await expect(service.copy(id, saved.updated_at, randomUUID())).rejects.toMatchObject({ code: '40001' });
    const current = await service.get(id);
    expect(current?.outfit_items).toHaveLength(1);
  });
  it('serializes simultaneous first creates and retries lost create/update/copy responses without duplicates', async () => {
    const id = randomUUID(); const service = repo();
    const created = await Promise.all([service.save(id, null, draft('재시도')), service.save(id, null, draft('재시도'))]);
    expect(created[0]?.updated_at).toBe(created[1]?.updated_at);
    let lost = false;
    const lossy = repo(0, async (input, init) => { const response = await fetch(input, init); if (!lost && String(input).includes('/rpc/')) { lost = true; throw new TypeError('Simulated lost commit response'); } return response; });
    const secondId = randomUUID();
    await expect(lossy.save(secondId, null, draft('응답 유실'))).rejects.toBeTruthy();
    const before = await service.get(secondId);
    expect((await lossy.save(secondId, null, draft('응답 유실'))).updated_at).toBe(before?.updated_at);
    lost = false;
    await expect(lossy.save(secondId, before!.updated_at, draft('수정 응답 유실'))).rejects.toBeTruthy();
    const edited = await service.get(secondId);
    expect((await lossy.save(secondId, before!.updated_at, draft('수정 응답 유실'))).updated_at).toBe(edited?.updated_at);
    lost = false; const copyId = randomUUID();
    await expect(lossy.copy(secondId, edited!.updated_at, copyId)).rejects.toBeTruthy();
    const copied = await service.get(copyId);
    expect((await lossy.copy(secondId, edited!.updated_at, copyId)).updated_at).toBe(copied?.updated_at);
    expect(copied?.name).toBe('수정 응답 유실 (복사)');
    expect(copied?.outfit_items.map((row) => row.item_id)).toEqual([ids.top]);
  });
  it('keeps cross-account, anonymous and direct table writes closed and aborts expired session operations', async () => {
    const a = accounts[0]!; const b = accounts[1]!; const id = randomUUID(); const saved = await repo().save(id, null, draft('비공개 코디'));
    expect(await repo(1).get(id)).toBeNull();
    await expect(repo(1).save(id, saved.updated_at, { ...draft(), items: { top: ids.foreign! } })).rejects.toMatchObject({ code: 'P0002' });
    await expect(repo(1).copy(id, saved.updated_at, randomUUID())).rejects.toMatchObject({ code: 'P0002' });
    await expect(repo(1).remove(id, saved.updated_at)).rejects.toMatchObject({ code: 'P0002' });
    const anonymous = createClient<Database>(connection.url, connection.key, options);
    expect((await anonymous.rpc('save_outfit', { p_id: randomUUID(), p_draft: outfitPayload(draft()) })).error?.code).toBe('42501');
    for (const table of ['outfits', 'outfit_items'] as const) {
      expect((await a.client.from(table).delete().eq('id', id)).error?.code).toBe('42501');
    }
    expect((await a.client.from('outfits').update({ name: '우회' }).eq('id', id)).error?.code).toBe('42501');
    await expect(createOutfitRepository(b.client, a.id, connection).save(randomUUID(), null, draft())).rejects.toMatchObject({ code: 'session_changed' });
    await expect(repo().save(randomUUID(), null, draft(), AbortSignal.abort())).rejects.toMatchObject({ code: 'session_changed' });
  });
  it('holds garment validation locks until commit and rejects a concurrently committed inactive garment', async () => {
    const id = randomUUID(); const a = accounts[0]!;
    const payload = JSON.stringify(outfitPayload(draft('트랜잭션 잠금'))).replaceAll("'", "''");
    const writer = await lockedTransaction(`set local role authenticated; select set_config('request.jwt.claim.sub','${a.id}',true); select public.save_outfit('${id}',null,'${payload}'::jsonb)`);
    try {
      let changed = false;
      const archive = patchItem(ids.top!, { lifecycle_status: 'archived' }).then(() => { changed = true; });
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(changed).toBe(false);
      await writer.commit(); await archive;
      expect((await repo().get(id))?.outfit_items).toHaveLength(1);
    } finally { writer.rollback(); await patchItem(ids.top!, { lifecycle_status: 'active' }); }
    const updater = await lockedTransaction(`update public.wardrobe_items set lifecycle_status='archived' where id='${ids.top!}' and user_id='${a.id}'`);
    try {
      let finished = false;
      const save = repo().save(randomUUID(), null, draft('동시 비활성 거부')).then(() => ({ code: 'unexpected_success' }), (error: unknown) => error).finally(() => { finished = true; });
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(finished).toBe(false);
      await updater.commit();
      expect(await save).toMatchObject({ code: 'P0003' });
    } finally { updater.rollback(); await patchItem(ids.top!, { lifecycle_status: 'active' }); }
  });
  it('pins the starting account token if the shared client changes accounts during a write', async () => {
    const a = accounts[0]!; const b = accounts[1]!;
    const original = (await a.client.auth.getSession()).data.session!;
    const next = (await b.client.auth.getSession()).data.session!;
    let switched = false; const id = randomUUID();
    const service = repo(0, async (input, init) => {
      if (!switched) { switched = true; if ((await a.client.auth.setSession(next)).error) throw new Error('Fixture session switch failed'); }
      return fetch(input, init);
    });
    try {
      expect((await service.save(id, null, draft('세션 고정'))).user_id).toBe(a.id);
      expect((await b.client.from('outfits').select('id').eq('id', id)).data).toEqual([]);
    } finally { if ((await a.client.auth.setSession(original)).error) throw new Error('Fixture session restore failed'); }
  });
  it('renames only the name while retaining metadata, unavailable garments and wear references', async () => {
    const service = repo(); const id = randomUUID();
    const saved = await service.save(id, null, { ...draft('이름만 수정 전'), occasion: '출근', isFavorite: true });
    const before = (await service.get(id))!;
    const worn = await admin.from('wear_events').insert({ user_id: accounts[0]!.id, worn_on: '2026-10-29', outfit_id: id }).select('id').single();
    if (worn.error) throw worn.error;
    try {
      await patchItem(ids.top!, { lifecycle_status: 'archived' });
      const renamed = await service.rename(id, saved.updated_at, '  이름만 수정 후  ');
      expect(renamed).toEqual({ ...saved, name: '이름만 수정 후', updated_at: renamed.updated_at });
      expect(renamed.updated_at).not.toBe(saved.updated_at);
      const after = (await service.get(id))!;
      expect(after.outfit_items.map(({ item: _item, ...entry }) => entry)).toEqual(before.outfit_items.map(({ item: _item, ...entry }) => entry));
      expect((await accounts[0]!.client.from('wear_events').select('outfit_id').eq('id', worn.data.id)).data).toEqual([{ outfit_id: id }]);
      const found = await createOutfitCatalog(accounts[0]!.client, accounts[0]!.id).list(0, { ...defaultOutfitCatalogFilters, search: '이름만 수정 후' });
      expect(found.items.map((row) => row.id)).toEqual([id]);
      await expect(service.remove(id, saved.updated_at)).rejects.toMatchObject({ code: '40001' });
    } finally { await patchItem(ids.top!, { lifecycle_status: 'active' }); }
  });
  it('validates rename ownership, expected versions and names and serializes concurrent renames', async () => {
    const id = randomUUID(); const service = repo(); const saved = await service.save(id, null, draft('이름 충돌 시작'));
    await expect(repo(1).rename(id, saved.updated_at, '타인 수정')).rejects.toMatchObject({ code: 'P0002' });
    const anonymous = createClient<Database>(connection.url, connection.key, options);
    expect((await anonymous.rpc('rename_outfit', { p_id: id, p_expected: saved.updated_at, p_name: '익명 수정' })).error?.code).toBe('42501');
    for (const name of ['', '   ', 'a'.repeat(161)]) {
      expect((await accounts[0]!.client.rpc('rename_outfit', { p_id: id, p_expected: saved.updated_at, p_name: name })).error?.code).toBe('22023');
    }
    const results = await Promise.allSettled([service.rename(id, saved.updated_at, '이름 경합 A'), service.rename(id, saved.updated_at, '이름 경합 B')]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { code: '40001' } });
    const current = (await service.get(id))!;
    expect((await service.rename(id, saved.updated_at, current.name)).updated_at).toBe(current.updated_at);
    await service.remove(id, current.updated_at);
    await expect(service.rename(id, current.updated_at, '삭제 후 수정')).rejects.toMatchObject({ code: 'P0002' });
    await expect(service.rename(id, current.updated_at, '취소', AbortSignal.abort())).rejects.toMatchObject({ code: 'session_changed' });
    await expect(createOutfitRepository(accounts[1]!.client, accounts[0]!.id, connection).rename(id, current.updated_at, '계정 변경')).rejects.toMatchObject({ code: 'session_changed' });
  });
  it('retries a lost rename response without changing the composition or repeating the write', async () => {
    const service = repo(); const id = randomUUID(); const saved = await service.save(id, null, draft('이름 응답 유실 전'));
    let lost = false;
    const lossy = repo(0, async (input, init) => {
      const response = await fetch(input, init);
      if (!lost && String(input).includes('/rpc/rename_outfit')) { lost = true; throw new TypeError('Simulated lost rename response'); }
      return response;
    });
    await expect(lossy.rename(id, saved.updated_at, '이름 응답 유실 후')).rejects.toBeTruthy();
    const committed = (await service.get(id))!;
    const retry = await lossy.rename(id, saved.updated_at, '이름 응답 유실 후');
    expect(retry.name).toBe('이름 응답 유실 후');
    expect(retry.updated_at).toBe(committed.updated_at);
    expect(committed.outfit_items.map((row) => row.item_id)).toEqual([ids.top]);
  });
  it('soft-deletes with confirmation version, keeps garments and wear snapshots, and makes repeated deletion safe', async () => {
    const service = repo(); const id = randomUUID(); const saved = await service.save(id, null, draft('기록 보존'));
    const catalog = createOutfitCatalog(accounts[0]!.client, accounts[0]!.id);
    const filters = { ...defaultOutfitCatalogFilters, search: '기록 보존' };
    const before = await catalog.list(0, filters);
    expect(before.items.map((outfit) => outfit.id)).toEqual([id]);
    const worn = await admin.from('wear_events').insert({ user_id: accounts[0]!.id, worn_on: '2026-10-28', outfit_id: id }).select('id').single();
    if (worn.error) throw worn.error;
    if ((await admin.from('wear_event_items').insert({ wear_event_id: worn.data.id, user_id: accounts[0]!.id, item_id: ids.top! })).error) throw new Error('Wear fixture failed');
    const deleted = await service.remove(id, saved.updated_at);
    expect(deleted.deleted_at).not.toBeNull();
    const after = await catalog.list(0, filters);
    expect(after.items).toEqual([]);
    expect(after.total).toBe(0);
    expect(after.allTotal).toBe(before.allTotal - 1);
    expect((await service.remove(id, saved.updated_at)).updated_at).toBe(deleted.updated_at);
    expect(await service.get(id)).toBeNull();
    await expect(service.save(id, saved.updated_at, draft('복구 우회'))).rejects.toMatchObject({ code: 'P0002' });
    expect((await accounts[0]!.client.from('wear_event_items').select('item_id').eq('wear_event_id', worn.data.id)).data).toEqual([{ item_id: ids.top }]);
    expect((await accounts[0]!.client.from('wardrobe_items').select('id').eq('id', ids.top!)).data).toHaveLength(1);
  });
});
