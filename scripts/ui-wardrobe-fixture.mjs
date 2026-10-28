import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { localSupabaseSettings } from './local-supabase.mjs';

const local = localSupabaseSettings();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(local.url, local.serviceKey, options);
const accounts = ['test-results/ui-fixture.json', 'test-results/ui-fixture-b.json'].map((path) => JSON.parse(readFileSync(path, 'utf8')));
for (const account of accounts) {
  if (!account.email.startsWith('closet-ui-') || !account.email.endsWith('@example.test')) throw new Error('UI fixture required');
  const user = await admin.auth.admin.getUserById(account.id);
  if (user.error || user.data.user.email !== account.email) throw new Error('Fixture identity mismatch');
  const existing = await admin.from('wardrobe_items').select('id', { count: 'exact', head: true }).eq('user_id', account.id);
  if (existing.error || existing.count !== 0) throw new Error('Use fresh UI fixtures');
}
const rows = Array.from({ length: 300 }, (_, index) => ({
  user_id: accounts[0].id,
  name: `검증 옷 ${String(index).padStart(3, '0')} · ${['리넨 셔츠', '코튼 티셔츠', '워크 재킷', '긴 제품명과 브랜드 누락 확인용 상의'][index % 4]}`,
  category_slug: ['shirt', 'tshirt', 'jacket', 'tops'][index % 4],
  brand_name: ['알파', '베타', '테스트 브랜드', null][index % 4],
  color_name: ['네이비', '화이트', '블랙', null][index % 4],
  seasons: [['spring', 'autumn'], ['summer'], ['winter'], []][index % 4],
  is_favorite: index % 5 === 0,
  lifecycle_status: ['active', 'archived', 'sold', 'donated'][index % 4],
  purchase_price: index === 0 ? 0 : index % 11 === 0 ? null : index * 100,
  currency: index % 2 === 0 ? 'KRW' : 'USD',
  created_at: '2026-01-01T00:00:00Z',
}));
const inserted = await admin.from('wardrobe_items').insert(rows);
if (inserted.error) throw new Error('UI item setup failed');
if ((await admin.from('wardrobe_items').insert({ user_id: accounts[1].id, name: '타인의 옷', category_slug: 'shirt', brand_name: '타인 비공개 브랜드', color_name: '타인 비공개 색상' })).error) throw new Error('B setup failed');
const client = createClient(local.url, local.anonKey, options);
if ((await client.auth.signInWithPassword({ email: accounts[0].email, password: accounts[0].password })).error) throw new Error('Fixture sign-in failed');
const ids = new Set();
const elapsed = [];
for (let page = 0; page < 15; page++) {
  const started = performance.now();
  const result = await client.rpc('search_wardrobe_items', { p_owner: accounts[0].id }, { count: 'exact' }).range(page * 20, page * 20 + 19);
  elapsed.push(performance.now() - started);
  if (result.error || result.count !== 300 || result.data.length !== 20) throw new Error('Pagination fixture verification failed');
  for (const item of result.data) { if (ids.has(item.id)) throw new Error('Repeated page item'); ids.add(item.id); }
}
const metrics = { rows: ids.size, requests: elapsed.length, maxMs: Math.round(Math.max(...elapsed)), meanMs: Math.round(elapsed.reduce((sum, value) => sum + value, 0) / elapsed.length) };
writeFileSync('test-results/wardrobe-pagination-metrics.json', JSON.stringify(metrics, null, 2));
process.stdout.write(`Local fixture pagination: ${JSON.stringify(metrics)}\n`);
