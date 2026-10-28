import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { localSupabaseSettings } from './local-supabase.mjs';

const local = localSupabaseSettings();
const client = createClient(local.url, local.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const path = process.argv[2] === 'second' ? 'test-results/ui-fixture-b.json' : 'test-results/ui-fixture.json';
if (process.argv[2] === 'cleanup') {
  for (const fixturePath of ['test-results/ui-fixture.json', 'test-results/ui-fixture-b.json']) {
    if (!existsSync(fixturePath)) continue;
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    if (!fixture.email.startsWith('closet-ui-') || !fixture.email.endsWith('@example.test')) throw new Error('UI 테스트 계정이 아닙니다.');
    const account = await client.auth.admin.getUserById(fixture.id);
    if (account.error || account.data.user.email !== fixture.email) throw new Error('UI 테스트 계정의 ID와 이메일이 일치하지 않습니다.');
    const images = await client.from('item_images').select('storage_path').eq('user_id',fixture.id);
    if (images.error) throw new Error('UI 사진 정리 목록을 읽지 못했습니다.');
    if (images.data.length && (await client.storage.from('wardrobe-private').remove(images.data.map((image) => image.storage_path))).error) throw new Error('UI 테스트 사진을 정리하지 못했습니다.');
    const { error } = await client.auth.admin.deleteUser(fixture.id);
    if (error) throw new Error('UI 테스트 계정을 정리하지 못했습니다.');
    const inbox = await fetch('http://127.0.0.1:54324/api/v1/messages').then((response) => response.json());
    const messages = inbox.messages.filter((message) => message.To.some((recipient) => recipient.Address === fixture.email));
    if (messages.length) await fetch('http://127.0.0.1:54324/api/v1/messages', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: messages.map((message) => message.ID) }) });
    unlinkSync(fixturePath);
  }
  if (existsSync('test-results/ui-recovery.json')) unlinkSync('test-results/ui-recovery.json');
  if (existsSync('test-results/ui-management.json')) unlinkSync('test-results/ui-management.json');
  if (existsSync('test-results/ui-outfit.json')) unlinkSync('test-results/ui-outfit.json');
  process.stdout.write('이번 UI 테스트 계정을 정리했습니다.\n');
} else {
  if (existsSync(path)) throw new Error('이전 UI fixture를 먼저 cleanup하세요.');
  const email = `closet-ui-${randomUUID()}@example.test`;
  const password = `${randomUUID()}aA!9`;
  const { data, error } = await client.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error('UI 테스트 계정을 만들지 못했습니다.');
  mkdirSync('test-results', { recursive: true });
  writeFileSync(path, JSON.stringify({ id: data.user.id, email, password }), { flag: 'wx' });
  process.stdout.write('임시 로컬 UI 테스트 계정을 준비했습니다. 인증값은 출력하지 않았습니다.\n');
}
