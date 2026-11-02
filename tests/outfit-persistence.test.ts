import { describe, expect, it } from 'vitest';
import { emptyOutfitDraft, draftEntries } from '../src/features/outfits/draft';
import { outfitPayload, outfitToDraft, outfitErrorMessage } from '../src/features/outfits/repository';
import type { SavedOutfit } from '../src/features/outfits/catalog';

const garment = '11111111-1111-4111-8111-111111111111';
describe('outfit persistence boundary', () => {
  it('normalizes fields and excludes caller-supplied ownership and timestamps', () => {
    const payload = outfitPayload({ ...emptyOutfitDraft(), name: '  출근  ', tags: '봄, 봄, 파랑', memo: ' 메모 ', items: { top: garment }, user_id: 'foreign', updated_at: 'forged' } as Parameters<typeof outfitPayload>[0]);
    expect(payload).toEqual({ name: '출근', memo: '메모', occasion: '', tags: ['봄', '파랑'], seasons: [], is_favorite: false, items: [{ slot: 'top', item_id: garment, position: 0 }] });
  });
  it('never silently drops unsupported layers while opening a saved outfit', () => {
    const outfit = { name: '코디', memo: null, occasion: null, tags: ['봄'], seasons: ['spring'], is_favorite: true, outfit_items: [{ slot: 'top', item_id: garment, position: 0 }] } as SavedOutfit;
    expect(outfitToDraft(outfit)).toMatchObject({ memo: '', tags: '봄', items: { top: garment }, isFavorite: true });
    expect(() => outfitToDraft({ ...outfit, outfit_items: [...outfit.outfit_items, { ...outfit.outfit_items[0]!, position: 1 }] })).toThrow('unsupported_layout');
    expect(outfit.outfit_items).toHaveLength(1);
  });
  it('loads unsorted layer positions and writes the same real IDs in inner-to-outer order', () => {
    const coat = '22222222-2222-4222-8222-222222222222';
    const outfit = { name: '재킷과 코트', memo: null, occasion: null, tags: [], seasons: [], is_favorite: false, outfit_items: [{ slot: 'outerwear', item_id: coat, position: 1 }, { slot: 'outerwear', item_id: garment, position: 0 }] } as unknown as SavedOutfit;
    expect(outfitPayload(outfitToDraft(outfit)).items).toEqual([outfit.outfit_items[1], outfit.outfit_items[0]]);
    expect(draftEntries(outfitToDraft(outfit))).toHaveLength(2);
    for (const slot of ['bottom', 'shoes', 'bag']) expect(() => outfitToDraft({ ...outfit, outfit_items: outfit.outfit_items.map(entry => ({ ...entry, slot })) })).toThrow('unsupported_layout');
    expect(() => outfitToDraft({ ...outfit, outfit_items: [{ ...outfit.outfit_items[0]!, position: 2 }] })).toThrow('unsupported_layout');
  });
  it('distinguishes stale writes, garment changes and uncertain network results without exposing server details', () => {
    expect(outfitErrorMessage({ code: '40001' })).toContain('입력은 유지');
    expect(outfitErrorMessage({ code: 'PT409' })).toContain('입력은 유지');
    expect(outfitErrorMessage({ code: 'P0003' })).toContain('교체하거나 제거');
    expect(outfitErrorMessage(new Error('secret server trace'))).not.toContain('secret');
  });
});
