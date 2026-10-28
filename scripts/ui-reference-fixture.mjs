// Disposable local UI fixture. Original vector garments, no user/reference photos.
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import { localSupabaseSettings } from './local-supabase.mjs';

const sharp = createRequire(import.meta.url)(process.env.CLOSET_SHARP_MODULE || 'sharp');
const local = localSupabaseSettings();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(local.url, local.serviceKey, options);
const fixture = JSON.parse(readFileSync('test-results/ui-fixture.json', 'utf8'));
if (!fixture.email.startsWith('closet-ui-') || !fixture.email.endsWith('@example.test')) throw new Error('UI fixture required');
const account = await admin.auth.admin.getUserById(fixture.id);
if (account.error || account.data.user.email !== fixture.email) throw new Error('Fixture mismatch');
const count = await admin.from('wardrobe_items').select('id', { count: 'exact', head: true }).eq('user_id', fixture.id);
if (count.error || count.count !== 0) throw new Error('Fresh fixture required');
const rows = [
  ['French Work Jacket - Navy', 'jacket', 'STUDIO', '네이비', '#172330', 'jacket'],
  ['Reversible Bomber - Light Brown', 'bomber_jacket', 'FIELD', '브라운', '#51463D', 'bomber'],
  ['Reversible Bomber - Light Sage', 'bomber_jacket', 'FIELD', '세이지', '#999E8C', 'bomber'],
  ['Collar Cardigan - Dark Navy', 'cardigan', 'ARCHIVE', '네이비', '#182536', 'jacket'],
  ['Light Down Jacket - Grey', 'padded_jacket', 'NORTH STUDIO', '그레이', '#89938A', 'puffer'],
  ['Suede Chore Coat - Choco Brown', 'jacket', 'FORM', '브라운', '#51483D', 'jacket'],
  ['Scout Jacket - Dark Blue', 'jacket', 'ROUGH STUDIO', '네이비', '#354C5E', 'bomber'],
  ['Air Nylon B.D.U Jacket - Black', 'jacket', 'HOURS', '블랙', '#282B29', 'jacket'],
  ['Stand Collar Jacket - Khaki', 'jacket', 'THE STUDIO', '베이지', '#A19783', 'jacket'],
  ['Soutien Collar Blouson - Charcoal', 'jacket', 'ANOTHER DAY', '차콜', '#4C514D', 'bomber'],
  ['Daily Oxford Shirt - Ivory', 'shirt', 'STUDIO', '아이보리', '#D8D2C4', 'jacket'],
  ['Cotton T-shirt - Black', 'tshirt', 'FORM', '블랙', '#242525', 'tee'],
  ['Wide Slacks - Khaki', 'slacks', 'ARCHIVE', '카키', '#92836C', 'pants'],
  ['Straight Denim - Black', 'denim', 'FIELD', '블랙', '#292B2C', 'pants'],
  ['Everyday Sneakers - Black', 'sneakers', 'DAILY', '블랙', '#242829', 'shoes'],
];
const categories = await admin.from('categories').select('slug');
if (categories.error) throw categories.error;
const allowed = new Set(categories.data.map((category) => category.slug));
const items = rows.map(([name, category_slug, brand_name, color_name, color_hex, shape], index) => ({ id: crypto.randomUUID(), user_id: fixture.id, name, category_slug: allowed.has(category_slug) ? category_slug : 'jacket', brand_name, color_name, color_hex, seasons: ['spring', 'autumn'], is_favorite: false, created_at: new Date(Date.now() - index * 1000).toISOString(), shape }));
if ((await admin.from('wardrobe_items').insert(items.map(({ shape: _shape, ...item }) => item))).error) throw new Error('Garment fixture failed');
const client = createClient(local.url, local.anonKey, options);
if ((await client.auth.signInWithPassword({ email: fixture.email, password: fixture.password })).error) throw new Error('Fixture login failed');

function garment(color, shape) {
  const jacket = `<path d="M160 102 121 113 99 157 78 291 115 304 139 214 140 333Q210 343 280 333L281 214 305 304 342 291 321 157 299 113 260 102Z" fill="url(#fabric)" stroke="#151A1B" stroke-opacity=".4" stroke-width="2"/><path d="m160 102 50 27 50-27-16-12h-68Z" fill="${color}"/><path d="m160 102 31 48 19-21 19 21 31-48" fill="${color}" stroke="#FFFFFF" stroke-opacity=".12"/><path d="M210 130v205M147 220h42v39h-42ZM234 220h40v39h-40ZM141 327h139" fill="none" stroke="#000" stroke-opacity=".23" stroke-width="2"/>${[158,188,218,248,278,308].map((y) => `<circle cx="213" cy="${y}" r="2.7" fill="#9CA09C" opacity=".65"/>`).join('')}<rect x="199" y="105" width="22" height="9" rx="1" fill="#DEDCD2"/>`;
  const bomber = `<path d="m161 106-42 15-26 52-16 120 37 10 24-98 4 124q68 15 136 0l4-124 24 98 37-10-16-120-26-52-42-15q-47 29-94 0Z" fill="url(#fabric)" stroke="#202523" stroke-opacity=".5" stroke-width="2"/><path d="M210 126v207M146 236l34-12M239 224l35 12" stroke="#151919" stroke-width="3" opacity=".6"/><path d="M164 106q46 37 92 0M143 328q67 10 134 0M78 289l37 10M306 299l37-10" stroke="#30352F" stroke-width="10" fill="none"/>`;
  const tee = `<path d="m162 107-55 25-32 63 49 24 24-37-4 145h133l-4-145 24 37 49-24-32-63-55-25q-48 39-97 0Z" fill="url(#fabric)"/><path d="M162 107q49 46 97 0" fill="none" stroke="#0D1214" stroke-width="8"/>`;
  const pants = `<path d="m150 80-18 257 63 4 16-173 17 173 62-4-19-257Z" fill="url(#fabric)" stroke="#30352F" stroke-width="2"/><path d="M152 95h116M211 84v83M154 112l26 24M265 112l-26 24M162 163l-13 166M258 163l14 166" fill="none" stroke="#1C2425" stroke-opacity=".4" stroke-width="2"/>`;
  const shoes = `<path d="m92 214 41-57 46 19 27 55 83 17 34 24-4 29H88l-7-28Z" fill="url(#fabric)" stroke="#151A1B" stroke-width="3"/><path d="m139 196 64 35M132 207l65 35M125 219l66 33M87 285h233" stroke="#A8AEAC" stroke-width="6"/><path d="M113 256q58-21 112 6" stroke="#4F5652" stroke-width="4" fill="none"/>`;
  const puffer = jacket + `<path d="M139 167h142M139 198h142M139 228h142M139 258h142M139 288h142" stroke="#000" opacity=".23" stroke-width="2"/><path d="m165 104-2-25q49-34 94 0l-1 25" fill="${color}" stroke="#30352F" stroke-opacity=".4"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="420" viewBox="0 0 420 420"><defs><linearGradient id="fabric" x1="0" x2="1"><stop stop-color="${color}"/><stop offset=".42" stop-color="${color}"/><stop offset=".48" stop-color="#FFF" stop-opacity=".12"/><stop offset=".55" stop-color="${color}"/><stop offset="1" stop-color="${color}"/></linearGradient><filter id="shadow"><feDropShadow dx="0" dy="7" stdDeviation="5" flood-opacity=".16"/></filter></defs><g filter="url(#shadow)">${({ jacket, bomber, tee, pants, shoes, puffer })[shape] || jacket}</g></svg>`;
}
for (const item of items) {
  const imageId = crypto.randomUUID();
  const reserved = await client.rpc('reserve_item_image', { p_item_id: item.id, p_image_id: imageId, p_extension: 'png' });
  if (reserved.error) throw reserved.error;
  const png = await sharp(Buffer.from(garment(item.color_hex, item.shape))).png().toBuffer();
  if ((await client.storage.from('wardrobe-private').upload(reserved.data.storage_path, png, { contentType: 'image/png' })).error) throw new Error('Photo upload failed');
  if ((await client.rpc('complete_item_image', { p_image_id: imageId })).error) throw new Error('Photo completion failed');
}
for (const [index, name] of ['간절기 #12', '간절기 #11', '주말의 가벼운 산책'].entries()) {
  const created = await admin.from('outfits').insert({ user_id: fixture.id, name, seasons: index === 2 ? ['summer'] : ['spring', 'autumn'], tags: [index === 2 ? '데일리' : '캐주얼'], memo: 'UI 확인을 위한 임시 코디입니다.' }).select('id').single();
  if (created.error) throw created.error;
  const indexes = index === 0 ? [7, 11, 13, 14] : index === 1 ? [3, 10, 12, 14] : [null, 10, 12, 14];
  const slots = ['outerwear', 'top', 'bottom', 'shoes'];
  if ((await admin.from('outfit_items').insert(indexes.flatMap((itemIndex, slotIndex) => itemIndex === null ? [] : [{ user_id: fixture.id, outfit_id: created.data.id, item_id: items[itemIndex].id, slot: slots[slotIndex] }]))).error) throw new Error('Outfit slots failed');
}
console.log('레퍼런스 레이아웃용 임시 의류 15개/사진/코디 3개를 준비했습니다.');
