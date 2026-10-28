import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { localSupabaseSettings } from '../../scripts/local-supabase.mjs';

const local = localSupabaseSettings();
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(local.url, local.serviceKey, options);
const anon = createClient(local.url, local.anonKey, options);
const accounts = [];
const uploads = new Map();
const bucket = 'wardrobe-private';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const pathFor = (owner, item) => `${owner}/items/${item}/${randomUUID()}.png`;
let A, B, itemA, itemB, outfitA, outfitB, eventA, pathA, pathB;

function success(result, label) {
  assert.equal(result.error?.code ?? result.error?.message ?? null, null, label);
  return result.data;
}
function denied(result, label) { assert.ok(result.error, label); }
async function clothing(account, name = 'integration fixture') {
  return success(await account.client.from('wardrobe_items').insert({ name, category_slug: 'jacket' }).select().single(), 'own item creation');
}
async function reserve(account, item, order = 0) {
  const path = pathFor(account.id, item.id);
  const image = success(await account.client.from('item_images').insert({ item_id: item.id, storage_path: path, image_order: order }).select().single(), 'own image reservation');
  return { path, image };
}
async function upload(account, path) {
  success(await account.client.storage.from(bucket).upload(path, png, { contentType: 'image/png' }), 'own reserved upload');
  uploads.set(path, account);
}

before(async () => {
  for (let index = 0; index < 2; index++) {
    const email = `closet-integration-${randomUUID()}@example.test`;
    const password = `${randomUUID()}aA!9`;
    const created = success(await admin.auth.admin.createUser({ email, password, email_confirm: true }), 'create local test account');
    const account = { id: created.user.id, email, password, client: createClient(local.url, local.anonKey, options) };
    accounts.push(account);
    success(await account.client.auth.signInWithPassword({ email, password }), 'real password login');
  }
  [A, B] = accounts;
  itemA = await clothing(A);
  itemB = await clothing(B);
  outfitA = success(await admin.from('outfits').insert({ user_id: A.id, name: 'A fixture' }).select().single(), 'seed outfit A');
  outfitB = success(await admin.from('outfits').insert({ user_id: B.id, name: 'B fixture' }).select().single(), 'seed outfit B');
  for (const [account, item, outfit] of [[A, itemA, outfitA], [B, itemB, outfitB]]) {
    success(await admin.from('outfit_items').insert({ user_id: account.id, outfit_id: outfit.id, item_id: item.id, slot: 'outerwear' }), 'seed outfit items');
    const event = success(await admin.from('wear_events').insert({ user_id: account.id, worn_on: '2026-10-28', outfit_id: outfit.id }).select().single(), 'seed wear event');
    success(await admin.from('wear_event_items').insert({ user_id: account.id, wear_event_id: event.id, item_id: item.id }), 'seed snapshot');
    if (account === A) eventA = event;
    success(await account.client.from('import_jobs').insert({ source_url: 'https://example.com/product' }), 'pending import request');
    const reservation = await reserve(account, item);
    await upload(account, reservation.path);
    if (account === A) pathA = reservation.path;
    else pathB = reservation.path;
  }
});

after(async () => {
  for (const account of accounts) {
    const paths = [...uploads.keys()].filter((path) => path.startsWith(`${account.id}/`));
    if (paths.length) success(await admin.storage.from(bucket).remove(paths), 'cleanup test objects');
    // Users created by this run only. Never enumerate/delete unrelated accounts.
    for (const table of ['import_jobs', 'wear_event_items', 'wear_events', 'outfit_items', 'outfits', 'item_images', 'wardrobe_items']) {
      success(await admin.from(table).delete().eq('user_id', account.id), `cleanup ${table}`);
    }
    success(await admin.auth.admin.deleteUser(account.id), 'cleanup test account');
  }
});

test('all personal tables and the invoker stats view isolate A and B', async () => {
  for (const account of [A, B]) {
    for (const table of ['profiles', 'wardrobe_items', 'item_images', 'outfits', 'outfit_items', 'wear_events', 'wear_event_items', 'import_jobs', 'item_wear_stats']) {
      const rows = success(await account.client.from(table).select('*'), `${table} read`);
      assert.ok(rows.length > 0, `${table} fixture exists`);
      assert.ok(rows.every((row) => (table === 'profiles' ? row.id : row.user_id) === account.id), `${table} owner isolation`);
    }
  }
  const rows = success(await A.client.from('wardrobe_items').update({ name: 'attack' }).eq('id', itemB.id).select(), 'cross-owner UPDATE has no visible target');
  assert.equal(rows.length, 0);
  denied(await A.client.from('wardrobe_items').insert({ name: 'spoof', category_slug: 'tops', user_id: B.id }), 'spoofed owner rejected');
  denied(await A.client.from('wardrobe_items').update({ user_id: B.id }).eq('id', itemA.id), 'owner reassignment rejected');
  denied(await A.client.from('wardrobe_items').delete().eq('id', itemA.id), 'hard delete closed');
});

test('anonymous callers can only read the global categories', async () => {
  assert.ok(success(await anon.from('categories').select('*'), 'anonymous categories').length > 0);
  for (const table of ['profiles', 'wardrobe_items', 'item_images', 'outfits', 'outfit_items', 'wear_events', 'wear_event_items', 'import_jobs', 'item_wear_stats']) {
    denied(await anon.from(table).select('*'), `anonymous ${table} rejected`);
  }
  denied(await A.client.from('categories').insert({ slug: randomUUID(), label_ko: 'attack' }), 'global category writes rejected');
});

test('composite FKs reject cross-owner links even for a caller bypassing RLS', async () => {
  for (const [table, input] of [
    ['outfit_items', { user_id: A.id, outfit_id: outfitA.id, item_id: itemB.id, slot: 'top' }],
    ['outfit_items', { user_id: A.id, outfit_id: outfitB.id, item_id: itemA.id, slot: 'top' }],
    ['wear_event_items', { user_id: A.id, wear_event_id: eventA.id, item_id: itemB.id }],
    ['wear_events', { user_id: A.id, worn_on: '2026-10-28', outfit_id: outfitB.id }],
  ]) {
    const result = await admin.from(table).insert(input);
    assert.equal(result.error?.code, '23503', `${table} composite FK`);
  }
  denied(await A.client.from('item_images').insert({ item_id: itemB.id, storage_path: pathFor(A.id, itemB.id) }), 'cross-owner image link rejected');
  denied(await A.client.from('outfits').insert({ user_id: A.id, name: 'empty outfit' }), 'outfit writes closed until atomic RPC');
  denied(await A.client.from('wear_events').insert({ user_id: A.id, worn_on: '2026-10-28' }), 'wear writes closed until snapshot RPC');
  assert.equal((await admin.from('outfit_items').update({ item_id: itemB.id }).eq('outfit_id', outfitA.id)).error?.code, '23503', 'cross-owner outfit UPDATE FK');
  assert.equal((await admin.from('wear_event_items').update({ item_id: itemB.id }).eq('wear_event_id', eventA.id)).error?.code, '23503', 'cross-owner snapshot UPDATE FK');
});

test('private Storage denies foreign reads, writes, signed URLs, moves and deletion', async () => {
  denied(await A.client.storage.from(bucket).download(pathB), 'foreign download');
  denied(await anon.storage.from(bucket).download(pathA), 'anonymous download');
  denied(await A.client.storage.from(bucket).createSignedUrl(pathB, 60), 'foreign signed URL');
  denied(await A.client.storage.from(bucket).upload(pathB, png, { contentType: 'image/png', upsert: true }), 'foreign overwrite');
  denied(await A.client.storage.from(bucket).move(pathB, pathFor(A.id, itemA.id)), 'foreign move');
  const listing = success(await A.client.storage.from(bucket).list(`${B.id}/items/${itemB.id}`), 'foreign listing returns no objects');
  assert.equal(listing.length, 0);
  await A.client.storage.from(bucket).remove([pathB]);
  success(await B.client.storage.from(bucket).download(pathB), 'foreign file survived deletion attempt');
  success(await A.client.storage.from(bucket).download(pathA), 'own file readable');
});

test('uploads require exact existing reservations and immutable paths', async () => {
  denied(await A.client.storage.from(bucket).upload(pathFor(A.id, itemA.id), png, { contentType: 'image/png' }), 'unreserved own path');
  denied(await A.client.from('item_images').insert({ item_id: itemA.id, storage_path: pathFor(B.id, itemA.id), image_order: 1 }), 'foreign prefix');
  denied(await A.client.from('item_images').insert({ item_id: itemA.id, storage_path: `${A.id}/items/${itemA.id}/../bad.png`, image_order: 1 }), 'path traversal');
  denied(await A.client.from('item_images').delete().eq('storage_path', pathA), 'cannot orphan uploaded object');
  denied(await A.client.from('item_images').update({ storage_path: pathFor(A.id, itemA.id) }).eq('storage_path', pathA), 'path cannot be reassigned');
  denied(await A.client.storage.from(bucket).update(pathA, png, { contentType: 'image/png' }), 'object replacement closed');
});

test('five image slots hold under concurrent requests, MIME and size limits apply', async () => {
  const item = await clothing(A, 'quota fixture');
  const paths = [];
  for (let slot = 0; slot < 4; slot++) paths.push((await reserve(A, item, slot)).path);
  const candidates = [pathFor(A.id, item.id), pathFor(A.id, item.id)];
  const race = await Promise.all(candidates.map((path) => A.client.from('item_images').insert({ item_id: item.id, image_order: 4, storage_path: path }).select().single()));
  assert.equal(race.filter((result) => !result.error).length, 1, 'one concurrent claimant wins');
  paths.push(race.find((result) => !result.error).data.storage_path);
  denied(await A.client.from('item_images').insert({ item_id: item.id, storage_path: pathFor(A.id, item.id), image_order: 5 }), 'sixth slot');
  denied(await A.client.storage.from(bucket).upload(paths[0], '<svg/>', { contentType: 'image/svg+xml' }), 'unsupported MIME');
  denied(await A.client.storage.from(bucket).upload(paths[0], new Uint8Array(5242881), { contentType: 'image/png' }), 'oversized image');
  for (const path of paths) await upload(A, path);
  assert.equal(success(await A.client.storage.from(bucket).list(`${A.id}/items/${item.id}`), 'quota list').length, 5);
});

test('upload authorization holds its reservation until the SQL transaction ends', async () => {
  const item = await clothing(A, 'reservation lock fixture');
  const reservation = await reserve(A, item);
  const transaction = spawn('docker', ['exec', '-i', 'supabase_db_closet', 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres']);
  let output = '';
  let timeout;
  const closed = new Promise((resolve) => transaction.on('close', resolve));
  try {
    const ready = new Promise((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('local transaction did not acquire its reservation')), 5000);
      transaction.on('error', reject);
      transaction.stdout.on('data', (chunk) => {
        output += chunk.toString();
        if (output.includes('LOCK_READY')) resolve();
      });
    });
    // UUIDs and canonical generated paths from this fixture only; no external SQL input.
    transaction.stdin.write(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${A.id}',true); select app_private.storage_image_allowed('${reservation.path}',true); select 'LOCK_READY';\n`);
    await ready;
    clearTimeout(timeout);
    assert.ok(output.includes('t\n'), 'upload permission granted');
    let removed = false;
    const deletion = Promise.resolve(A.client.from('item_images').delete().eq('id', reservation.image.id)).then((result) => { removed = true; return result; });
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(removed, false, 'concurrent deletion waits for upload authorization');
    transaction.stdin.end('commit;\n');
    assert.equal(await closed, 0, 'upload authorization transaction committed');
    success(await deletion, 'unused reservation can be removed after transaction');
    denied(await A.client.storage.from(bucket).upload(reservation.path, png, { contentType: 'image/png' }), 'removed reservation cannot authorize a late upload');
  } finally {
    clearTimeout(timeout);
    if (!transaction.stdin.destroyed) transaction.stdin.end('rollback;\n');
    transaction.kill();
  }
});

test('inactive/deleted items deny new files while existing images remain private and readable', async () => {
  const item = await clothing(A, 'archived fixture');
  const existing = await reserve(A, item);
  const pending = await reserve(A, item, 1);
  await upload(A, existing.path);
  success(await A.client.from('wardrobe_items').update({ lifecycle_status: 'archived' }).eq('id', item.id), 'archive item');
  success(await A.client.storage.from(bucket).download(existing.path), 'archived own image remains readable');
  denied(await A.client.storage.from(bucket).upload(pending.path, png, { contentType: 'image/png' }), 'upload to archived item');
  denied(await A.client.from('item_images').insert({ item_id: item.id, storage_path: pathFor(A.id, item.id), image_order: 2 }), 'new archived reservation');
  success(await A.client.from('wardrobe_items').update({ lifecycle_status: 'active', deleted_at: new Date().toISOString() }).eq('id', item.id), 'soft delete item');
  denied(await A.client.storage.from(bucket).upload(pending.path, png, { contentType: 'image/png' }), 'upload to deleted item');
});

test('import status/server results and invalid domain values cannot be spoofed', async () => {
  denied(await A.client.from('import_jobs').insert({ source_url: 'https://example.com', status: 'completed', item_id: itemA.id }), 'server results cannot be supplied');
  denied(await A.client.from('import_jobs').insert({ source_url: 'http://localhost/internal' }), 'HTTP import URL');
  denied(await A.client.from('import_jobs').update({ status: 'completed' }).eq('user_id', A.id), 'server-only status');
  for (const invalid of [{ color_hex: 'red' }, { currency: 'krw' }, { seasons: ['unknown'] }, { purchase_price: -1 }, { tags: [null] }]) {
    denied(await A.client.from('wardrobe_items').update(invalid).eq('id', itemA.id), 'invalid domain rejected');
  }
});

test('outfit changes do not rewrite historical wear snapshots', async () => {
  success(await admin.from('outfit_items').delete().eq('outfit_id', outfitA.id), 'edit fixture outfit');
  const snapshot = success(await A.client.from('wear_event_items').select('item_id').eq('wear_event_id', eventA.id), 'historical snapshot');
  assert.deepEqual(snapshot.map((row) => row.item_id), [itemA.id]);
  success(await admin.from('outfits').delete().eq('id', outfitA.id), 'delete fixture outfit');
  const event = success(await A.client.from('wear_events').select('outfit_id').eq('id', eventA.id).single(), 'history after outfit deletion');
  assert.equal(event.outfit_id, null);
  assert.equal(success(await A.client.from('wear_event_items').select('item_id').eq('wear_event_id', eventA.id), 'snapshot survives').length, 1);
});

test('password login, session restoration, local logout and closed public signup', async () => {
  const memory = new Map();
  const auth = { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false,
    storageKey: `test-${randomUUID()}`, storage: {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => { memory.set(key, value); },
      removeItem: (key) => { memory.delete(key); },
    },
  };
  const first = createClient(local.url, local.anonKey, { auth });
  denied(await first.auth.signInWithPassword({ email: A.email, password: randomUUID() }), 'wrong password');
  success(await first.auth.signInWithPassword({ email: A.email, password: A.password }), 'valid login');
  const restored = createClient(local.url, local.anonKey, { auth });
  const restoredSession = success(await restored.auth.getSession(), 'restored session').session;
  assert.equal(restoredSession.user.id, A.id);
  assert.equal(success(await restored.auth.getUser(), 'server validates restored session').user.id, A.id);
  success(await restored.auth.signOut({ scope: 'local' }), 'local logout');
  assert.equal(success(await restored.auth.getSession(), 'signed-out session').session, null);
  denied(await first.auth.refreshSession({ refresh_token: restoredSession.refresh_token }), 'revoked refresh token cannot restore a session');
  assert.equal(success(await first.auth.getSession(), 'failed refresh clears session').session, null);
  const signup = await anon.auth.signUp({ email: `closed-${randomUUID()}@example.test`, password: `${randomUUID()}aA!9` });
  assert.equal(signup.error?.code, 'signup_disabled', 'public signup stays disabled');
});

test('real recovery email completes PKCE, changes a disposable password and rejects replay', async () => {
  const email = `closet-recovery-${randomUUID()}@example.test`;
  const password = `${randomUUID()}aA!9`;
  const created = success(await admin.auth.admin.createUser({ email, password, email_confirm: true }), 'create recovery test account');
  const recovery = createClient(local.url, local.anonKey, { auth: { ...options.auth, flowType: 'pkce', persistSession: true, storageKey: `recovery-${randomUUID()}` } });
  accounts.push({ id: created.user.id, client: recovery });
  success(await recovery.auth.resetPasswordForEmail(email, { redirectTo: 'http://localhost:8081/auth/callback' }), 'request reset');
  let emailMessage;
  for (let attempt = 0; attempt < 20 && !emailMessage; attempt++) {
    const inbox = await fetch('http://127.0.0.1:54324/api/v1/messages').then((response) => response.json());
    emailMessage = inbox.messages.find((message) => message.To.some((recipient) => recipient.Address === email));
    if (!emailMessage) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(emailMessage, 'local recovery email delivered');
  const body = await fetch(`http://127.0.0.1:54324/api/v1/message/${emailMessage.ID}`).then((response) => response.json());
  const link = (body.HTML || body.Text).match(/https?:\/\/[^\s"<>]+\/auth\/v1\/verify[^\s"<>]*/)?.[0]?.replaceAll('&amp;', '&');
  assert.ok(link, 'recovery verification link present');
  const verified = await fetch(link, { redirect: 'manual' });
  const redirect = new URL(verified.headers.get('location'));
  assert.equal(redirect.origin, 'http://localhost:8081');
  assert.equal(redirect.pathname, '/auth/callback');
  const code = redirect.searchParams.get('code');
  assert.ok(code, 'PKCE authorization code returned');
  const events = [];
  const { data: listener } = recovery.auth.onAuthStateChange((event) => { events.push(event); });
  success(await recovery.auth.exchangeCodeForSession(code), 'exchange PKCE code');
  assert.ok(events.includes('PASSWORD_RECOVERY'), 'recovery event emitted');
  listener.subscription.unsubscribe();
  const replacement = `${randomUUID()}bB!8`;
  success(await recovery.auth.updateUser({ password: replacement }), 'update disposable password');
  const login = createClient(local.url, local.anonKey, options);
  success(await login.auth.signInWithPassword({ email, password: replacement }), 'login using new password');
  denied(await recovery.auth.exchangeCodeForSession(code), 'code replay rejected');
  // Remove this test email only; leave unrelated local inbox messages intact.
  await fetch(`http://127.0.0.1:54324/api/v1/messages`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: [emailMessage.ID] }) });
});

test('auth account cascade can remove related outfits and wear snapshots after files are cleaned', async () => {
  const created = success(await admin.auth.admin.createUser({ email: `closet-cascade-${randomUUID()}@example.test`, password: `${randomUUID()}aA!9`, email_confirm: true }), 'create cascade fixture');
  const id = created.user.id;
  accounts.push({ id, client: anon });
  const item = success(await admin.from('wardrobe_items').insert({ user_id: id, name: 'cascade fixture', category_slug: 'tops' }).select().single(), 'cascade item');
  const outfit = success(await admin.from('outfits').insert({ user_id: id, name: 'cascade fixture' }).select().single(), 'cascade outfit');
  success(await admin.from('outfit_items').insert({ user_id: id, outfit_id: outfit.id, item_id: item.id, slot: 'top' }), 'cascade relation');
  const event = success(await admin.from('wear_events').insert({ user_id: id, worn_on: '2026-10-28', outfit_id: outfit.id }).select().single(), 'cascade event');
  success(await admin.from('wear_event_items').insert({ user_id: id, wear_event_id: event.id, item_id: item.id }), 'cascade snapshot');
  success(await admin.auth.admin.deleteUser(id), 'account deletion with complete relation graph');
  accounts.pop();
  assert.equal(success(await admin.from('wardrobe_items').select('id').eq('user_id', id), 'cascade result').length, 0);
});
