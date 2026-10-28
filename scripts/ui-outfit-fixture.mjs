import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { makePng } from '../tests/helpers/png.ts';
import { localSupabaseSettings } from './local-supabase.mjs';

const local = localSupabaseSettings();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(local.url, local.serviceKey, options);
const fixtures = ['test-results/ui-fixture.json', 'test-results/ui-fixture-b.json'].map((path) => JSON.parse(readFileSync(path, 'utf8')));
for (const fixture of fixtures) {
  if (!fixture.email.startsWith('closet-ui-') || !fixture.email.endsWith('@example.test')) throw new Error('UI fixture required');
  const account = await admin.auth.admin.getUserById(fixture.id);
  if (account.error || account.data.user.email !== fixture.email) throw new Error('Fixture mismatch');
}
if (['archive', 'activate'].includes(process.argv[2])) {
  const stored = JSON.parse(readFileSync('test-results/ui-outfit.json', 'utf8'));
  const updated = await admin.from('wardrobe_items').update({ lifecycle_status: process.argv[2] === 'archive' ? 'archived' : 'active' }).eq('id', stored.shirtId).eq('user_id', fixtures[0].id).select('id');
  if (updated.error || updated.data.length !== 1) throw new Error('State fixture failed');
  process.stdout.write('임시 선택 의류의 상태를 변경했습니다.\n');
} else {
  const count = await admin.from('wardrobe_items').select('id', { count: 'exact', head: true }).eq('user_id', fixtures[0].id);
  if (count.error || count.count !== 0) throw new Error('Fresh fixture required');
  const rows = Array.from({ length: 21 }, (_, index) => ({ id: crypto.randomUUID(), name: `검증 상의 ${String(index).padStart(2, '0')}`, category_slug: 'shirt', brand_name: index % 2 ? '베타' : '알파', color_name: '네이비', seasons: ['spring', 'autumn'], is_favorite: index % 2 === 0 }));
  for (const [category_slug, name] of [['jacket', '검증 아우터'], ['slacks', '검증 하의'], ['sneakers', '검증 신발'], ['onepiece', '검증 원피스'], ['bags', '검증 가방'], ['accessories', '검증 액세서리']]) rows.push({ id: crypto.randomUUID(), name, category_slug, brand_name: '알파', color_name: '네이비', seasons: ['spring'], is_favorite: true });
  const created = await admin.from('wardrobe_items').insert(rows.map((row) => ({ ...row, user_id: fixtures[0].id })));
  if (created.error) throw created.error;
  for (const state of ['archived', 'sold', 'donated', 'deleted', 'foreign']) {
    if ((await admin.from('wardrobe_items').insert({ user_id: state === 'foreign' ? fixtures[1].id : fixtures[0].id, name: `선택 불가 ${state}`, category_slug: 'shirt', lifecycle_status: ['deleted', 'foreign'].includes(state) ? 'active' : state, deleted_at: state === 'deleted' ? new Date().toISOString() : null })).error) throw new Error('Excluded fixture failed');
  }
  const client = createClient(local.url, local.anonKey, options);
  if ((await client.auth.signInWithPassword({ email: fixtures[0].email, password: fixtures[0].password })).error) throw new Error('Fixture login failed');
  for (const [index, row] of [rows[0], rows[1], ...rows.slice(21)].entries()) {
    const imageId = crypto.randomUUID();
    const reserved = await client.rpc('reserve_item_image', { p_item_id: row.id, p_image_id: imageId, p_extension: 'png' });
    if (reserved.error) throw new Error('Photo reservation failed');
    if ((await client.storage.from('wardrobe-private').upload(reserved.data.storage_path, makePng(index % 2, 400, 400), { contentType: 'image/png' })).error) throw new Error('Photo upload failed');
    if ((await client.rpc('complete_item_image', { p_image_id: imageId })).error) throw new Error('Photo complete failed');
  }
  writeFileSync('test-results/ui-outfit.json', JSON.stringify({ shirtId: rows[0].id }));
  process.stdout.write('코디 선택용 임시 의류/사진과 제외 상태를 준비했습니다. 코디는 저장하지 않았습니다.\n');
}
