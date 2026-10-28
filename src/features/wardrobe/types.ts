import type { Tables } from '@/types/database.generated';

export type WardrobeItem = Tables<'wardrobe_items'>;
export type Category = Tables<'categories'>;
export const seasons = ['spring', 'summer', 'autumn', 'winter'] as const;
export const seasonLabels = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' };
export const lifecycleLabels: Record<string, string> = { active: '보유 중', archived: '보관', sold: '판매', donated: '기부' };
export const wardrobePageSize = 20;

export type WardrobeDraft = {
  name: string; category_slug: string; brand_name: string; color_name: string;
  color_hex: string; size_label: string; material: string; seasons: string[];
  tags: string; purchase_price: string; currency: string; purchased_on: string;
  purchase_url: string; notes: string;
};

export function emptyWardrobeDraft(): WardrobeDraft {
  return { name: '', category_slug: '', brand_name: '', color_name: '', color_hex: '', size_label: '', material: '', seasons: [], tags: '', purchase_price: '', currency: 'KRW', purchased_on: '', purchase_url: '', notes: '' };
}
