import { spawnSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const target = JSON.parse(readFileSync('deployment/target.json', 'utf8'));
const result = spawnSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'projects', 'api-keys', '--project-ref', target.supabaseProjectRef, '--reveal', '--output', 'json'], { encoding: 'utf8' });
if (result.status !== 0) throw new Error('CLI 로그인이 필요합니다.');
const keys = JSON.parse(result.stdout);
const publicKey = keys.find(key => key.type === 'publishable')?.api_key;
const secret = keys.find(key => key.type === 'secret')?.api_key;
assert(publicKey && secret);
const client = key => createClient(target.supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = client(secret), anon = client(publicKey);
const created = [];
const settings = await fetch(target.supabaseUrl + '/auth/v1/settings', { headers: { apikey: publicKey } });
assert.equal(settings.status, 200);
const config = await settings.json();
assert.equal(config.disable_signup, true, 'Public signup must stay disabled');
assert.equal(config.external.email, true, 'Email password login must stay enabled');
for (const bucket of ['wardrobe-private', 'brand-private']) {
  const { data, error } = await admin.storage.getBucket(bucket);
  assert.ifError(error); assert.equal(data.public, false); assert.equal(data.file_size_limit, 5242880);
}
try {
  const members = [];
  for (let i = 0; i < 2; i++) {
    const email = `closet-hosted-check-${randomUUID()}@example.test`;
    const password = randomBytes(24).toString('base64url') + '!a9';
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(error); created.push({ id: data.user.id, email });
    const session = client(publicKey);
    assert.ifError((await session.auth.signInWithPassword({ email, password })).error);
    for (const table of ['wardrobe_items', 'outfits', 'brands']) {
      const read = await session.from(table).select('*');
      assert.ifError(read.error); assert.equal(read.data.length, 0, 'A new member must not see imported data');
    }
    members.push({ session, id: data.user.id });
  }
  const itemId = randomUUID();
  const { data, error } = await members[0].session.from('wardrobe_items').insert({ id: itemId, user_id: members[0].id, name: 'Hosted isolation fixture', category_slug: 'tshirt' }).select();
  assert.ifError(error); assert.equal(data.length, 1);
  const outsider = await members[1].session.from('wardrobe_items').select('*').eq('id', itemId);
  assert.ifError(outsider.error); assert.equal(outsider.data.length, 0);
  const forged = await members[1].session.from('wardrobe_items').insert({ id: randomUUID(), user_id: members[0].id, name: 'Must fail', category_slug: 'tshirt' });
  assert(forged.error, 'Cross-member writes must fail');
  for (const table of ['wardrobe_items', 'outfits', 'brands', 'profiles']) {
    const read = await anon.from(table).select('*');
    assert(read.error || read.data.length === 0, 'Anonymous reads must not expose private data');
  }
  console.log('Hosted checks passed: password login, signup restriction, 2-member RLS, anonymous isolation, private buckets.');
} finally {
  for (const fixture of created) {
    const { data, error } = await admin.auth.admin.getUserById(fixture.id);
    assert.ifError(error); assert.equal(data.user.email, fixture.email);
    assert(fixture.email.startsWith('closet-hosted-check-') && fixture.email.endsWith('@example.test'));
    assert.ifError((await admin.auth.admin.deleteUser(fixture.id)).error);
  }
  if (created.length) console.log('Only temporary hosted test accounts were cleaned up.');
}
