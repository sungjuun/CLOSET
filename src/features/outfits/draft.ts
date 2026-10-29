import { z } from 'zod';
import type { Category, WardrobeItem } from '../wardrobe/types';
import { seasons } from '../wardrobe/types';

export const slots = ['outerwear', 'top', 'bottom', 'shoes', 'onepiece', 'bag', 'accessory'] as const;
export type OutfitSlot = typeof slots[number];
export const slotLabels: Record<OutfitSlot, string> = { outerwear: '아우터', top: '상의', bottom: '하의', shoes: '신발', onepiece: '원피스·셋업', bag: '가방', accessory: '액세서리' };
export const slotCategories: Record<OutfitSlot, string> = { outerwear: 'outerwear', top: 'tops', bottom: 'bottoms', shoes: 'shoes', onepiece: 'onepiece', bag: 'bags', accessory: 'accessories' };
export function slotDisplayLabel(slot: OutfitSlot, categories: readonly Category[]) {
  return categories.find((category) => category.slug === slotCategories[slot])?.label_ko ?? slotLabels[slot];
}
export type OutfitDraft = { name: string; memo: string; occasion: string; tags: string; seasons: string[]; isFavorite: boolean; items: Partial<Record<OutfitSlot, string>> };
export function emptyOutfitDraft(): OutfitDraft { return { name: '', memo: '', occasion: '', tags: '', seasons: [], isFavorite: false, items: {} }; }
export function hasDraftChanges(draft: OutfitDraft) {
  return Boolean(draft.name || draft.memo || draft.occasion || draft.tags || draft.seasons.length || draft.isFavorite || Object.keys(draft.items).length);
}
export function rootCategory(slug: string, categories: readonly Category[]): string | null {
  const seen = new Set<string>();
  let current = categories.find((category) => category.slug === slug);
  while (current) {
    if (seen.has(current.slug)) return null;
    seen.add(current.slug);
    if (!current.parent_slug) return current.slug;
    current = categories.find((category) => category.slug === current!.parent_slug);
  }
  return null;
}
export function selectionProblem(item: WardrobeItem | undefined, slot: OutfitSlot, owner: string, categories: readonly Category[]) {
  if (!item || item.user_id !== owner) return '옷을 찾을 수 없거나 접근할 수 없습니다.';
  if (item.deleted_at) return '휴지통으로 이동한 옷입니다. 다른 옷으로 교체하거나 제거해 주세요.';
  if (item.lifecycle_status !== 'active') return '보관·판매·기부 상태의 옷입니다. 다른 옷으로 교체하거나 제거해 주세요.';
  if (rootCategory(item.category_slug, categories) !== slotCategories[slot]) return '이 슬롯에 맞는 옷 종류가 아닙니다.';
  return null;
}
export function chooseItem(draft: OutfitDraft, slot: OutfitSlot, item: WardrobeItem, owner: string, categories: readonly Category[]) {
  const problem = selectionProblem(item, slot, owner, categories);
  if (problem) throw new Error(problem);
  if (Object.entries(draft.items).some(([other, id]) => other !== slot && id === item.id)) throw new Error('같은 옷을 중복으로 선택할 수 없습니다.');
  return { ...draft, items: { ...draft.items, [slot]: item.id } };
}
export function removeItem(draft: OutfitDraft, slot: OutfitSlot): OutfitDraft {
  const items = { ...draft.items }; delete items[slot];
  return { ...draft, items };
}
export const outfitDraftSchema = z.object({
  name: z.string().trim().min(1, '코디 이름을 입력해 주세요.').max(160, '코디 이름은 160자 이하로 입력해 주세요.'),
  memo: z.string().trim().max(5000, '메모는 5000자 이하로 입력해 주세요.'),
  occasion: z.string().trim().max(80, '상황은 80자 이하로 입력해 주세요.'),
  tags: z.string().transform((text) => [...new Set(text.split(',').map((tag) => tag.trim()).filter(Boolean))]).pipe(z.array(z.string().max(40, '태그 하나는 40자 이하로 입력해 주세요.')).max(20, '태그는 20개까지 입력할 수 있습니다.')),
  seasons: z.array(z.enum(seasons)).max(4).transform((values) => [...new Set(values)]),
  isFavorite: z.boolean(),
  items: z.partialRecord(z.enum(slots), z.uuid())
    .refine((items) => Object.keys(items).length > 0, '옷을 최소 1개 선택해 주세요.')
    .refine((items) => new Set(Object.values(items)).size === Object.values(items).length, '같은 옷을 중복으로 선택할 수 없습니다.'),
});
