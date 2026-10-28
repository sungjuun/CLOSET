import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { localSupabaseSettings } from './local-supabase.mjs';
import { makePng } from '../tests/helpers/png.ts';

const local = localSupabaseSettings();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(local.url, local.serviceKey, options);
const fixture = JSON.parse(readFileSync('test-results/ui-fixture.json', 'utf8'));
if (!fixture.email.startsWith('closet-ui-') || !fixture.email.endsWith('@example.test')) throw new Error('UI fixture required');
const account = await admin.auth.admin.getUserById(fixture.id);
if (account.error || account.data.user.email !== fixture.email) throw new Error('Fixture mismatch');
if (process.argv[2] === 'conflict') {
  const record = JSON.parse(readFileSync('test-results/ui-management.json', 'utf8'));
  const updated = await admin.from('wardrobe_items').update({ notes: '다른 기기에서 저장한 최신 메모' }).eq('id', record.itemId).eq('user_id', fixture.id).select('id');
  if (updated.error || updated.data.length !== 1) throw new Error('Conflict fixture failed');
  process.stdout.write('임시 의류에 다른 기기의 변경을 재현했습니다.\n');
} else {
  const count = await admin.from('wardrobe_items').select('id', { count: 'exact', head: true }).eq('user_id', fixture.id);
  if (count.error || count.count !== 0) throw new Error('Use a fresh UI fixture');
  const client = createClient(local.url, local.anonKey, options);
  if ((await client.auth.signInWithPassword({ email: fixture.email, password: fixture.password })).error) throw new Error('Fixture login failed');
  const created = await client.from('wardrobe_items').insert({ name: '관리 검증 리넨 셔츠', category_slug: 'shirt', brand_name: '테스트 브랜드', color_name: '네이비', size_label: 'M', purchase_price: 59000, currency: 'KRW', seasons: ['spring', 'autumn'], notes: '수정 전 메모' }).select('*').single();
  if (created.error) throw created.error;
  const itemId = created.data.id;
  const photoId = crypto.randomUUID();
  const reserved = await client.rpc('reserve_item_image', { p_item_id: itemId, p_image_id: photoId, p_extension: 'png' });
  if (reserved.error) throw new Error('Photo fixture reservation failed');
  if ((await client.storage.from('wardrobe-private').upload(reserved.data.storage_path, makePng(1, 400, 600), { contentType: 'image/png' })).error) throw new Error('Photo fixture upload failed');
  if ((await client.rpc('complete_item_image', { p_image_id: photoId })).error) throw new Error('Photo fixture completion failed');
  const outfit = await admin.from('outfits').insert({ user_id: fixture.id, name: '연결 확인용 출근 코디' }).select('id').single();
  if (outfit.error) throw outfit.error;
  if ((await admin.from('outfit_items').insert({ user_id: fixture.id, outfit_id: outfit.data.id, item_id: itemId, slot: 'top' })).error) throw new Error('Outfit fixture failed');
  const event = await admin.from('wear_events').insert({ user_id: fixture.id, worn_on: '2026-10-28' }).select('id').single();
  if (event.error) throw event.error;
  if ((await admin.from('wear_event_items').insert({ user_id: fixture.id, wear_event_id: event.data.id, item_id: itemId })).error) throw new Error('Wear fixture failed');
  writeFileSync('test-results/ui-management.json', JSON.stringify({ itemId }));
  process.stdout.write('옷·사진·코디·착용 연결이 있는 임시 UI 데이터를 준비했습니다.\n');
}
