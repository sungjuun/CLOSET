import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.generated';
import { createWardrobeRepository } from '../wardrobe/repository';
import { defaultFilters, type WardrobeFilters } from '../wardrobe/filters';
import { outfitDraftSchema, rootCategory, selectionProblem, slotCategories, type OutfitDraft, type OutfitSlot } from './draft';

export class OutfitSelectionError extends Error {
  constructor(public readonly code: string) { super(code); }
}
export function selectionErrorMessage(error: unknown) {
  if (error instanceof OutfitSelectionError) {
    if (error.code === 'unavailable') return '선택할 수 없는 옷입니다. 목록을 새로고침하고 다른 옷을 선택해 주세요.';
    if (error.code === 'changed') return '선택한 옷의 상태나 분류가 바뀌었습니다. 경고가 있는 슬롯을 교체하거나 제거해 주세요.';
    if (error.code === 'invalid_category') return '현재 슬롯에 맞는 분류를 선택해 주세요.';
  }
  return '옷 정보를 확인하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.';
}

// Public read service boundary: O01 does not write outfits/outfit_items.
export function createOutfitSelectionService(client: SupabaseClient<Database>, owner: string) {
  const wardrobe = createWardrobeRepository(client, owner);
  async function selected(ids: string[], signal?: AbortSignal) {
    if (!ids.length) return [];
    if (ids.length > 7) throw new OutfitSelectionError('changed');
    let query = client.from('wardrobe_items').select('*').eq('user_id', owner).in('id', [...new Set(ids)]);
    if (signal) query = query.abortSignal(signal);
    const result = await query;
    if (result.error) throw result.error;
    return result.data;
  }
  return {
    selected,
    async candidates(slot: OutfitSlot, page: number, filters: WardrobeFilters = defaultFilters, signal?: AbortSignal) {
      const categories = await wardrobe.categories(signal);
      const category = filters.category || slotCategories[slot];
      if (rootCategory(category, categories) !== slotCategories[slot]) throw new OutfitSelectionError('invalid_category');
      return wardrobe.list(page, signal, { ...filters, category, status: 'active' });
    },
    async choose(slot: OutfitSlot, id: string, signal?: AbortSignal) {
      const [item, categories] = await Promise.all([wardrobe.get(id, signal), wardrobe.categories(signal)]);
      if (!item || selectionProblem(item, slot, owner, categories)) throw new OutfitSelectionError('unavailable');
      return { item, categories };
    },
    async validate(draft: OutfitDraft, signal?: AbortSignal) {
      const parsed = outfitDraftSchema.parse(draft);
      const [items, categories] = await Promise.all([selected(Object.values(parsed.items), signal), wardrobe.categories(signal)]);
      for (const [slot, id] of Object.entries(parsed.items)) {
        if (selectionProblem(items.find((item) => item.id === id), slot as OutfitSlot, owner, categories)) throw new OutfitSelectionError('changed');
      }
      return { ...parsed, items: Object.entries(parsed.items).map(([slot, item_id]) => ({ slot: slot as OutfitSlot, position: 0, item_id })) };
    },
  };
}
