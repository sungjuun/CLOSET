import { describe, expect, it } from 'vitest';
import { chooseItem, emptyOutfitDraft, hasDraftChanges, outfitDraftSchema, removeItem, rootCategory, selectionProblem, slotCategories, slots } from '../src/features/outfits/draft';
import type { Category, WardrobeItem } from '../src/features/wardrobe/types';

const owner = '00000000-0000-4000-8000-000000000001';
const id = '00000000-0000-4000-8000-000000000002';
const replacement = '00000000-0000-4000-8000-000000000003';
const categories = [...new Set(Object.values(slotCategories))].map((slug) => ({ slug, parent_slug: null })) as Category[];
categories.push({ slug: 'shirt', parent_slug: 'tops' } as Category);
const shirt = { id, user_id: owner, category_slug: 'shirt', lifecycle_status: 'active', deleted_at: null } as WardrobeItem;

describe('outfit draft and selection', () => {
  it('replaces/removes a slot without losing metadata or mutating the previous draft', () => {
    const original = { ...emptyOutfitDraft(), name: '출근 코디', memo: '메모' };
    const first = chooseItem(original, 'top', shirt, owner, categories);
    const next = chooseItem(first, 'top', { ...shirt, id: replacement }, owner, categories);
    expect(original.items).toEqual({});
    expect(first.items.top).toBe(id);
    expect(next.items.top).toBe(replacement);
    const removed = removeItem(next, 'top');
    expect(removed.items).toEqual({});
    expect(removed).toMatchObject({ name: '출근 코디', memo: '메모' });
  });
  it('accepts all seven category roots and child categories in matching slots', () => {
    for (const slot of slots) expect(selectionProblem({ ...shirt, category_slug: slotCategories[slot] }, slot, owner, categories)).toBeNull();
    expect(selectionProblem(shirt, 'top', owner, categories)).toBeNull();
    expect(rootCategory('shirt', categories)).toBe('tops');
  });
  it('rejects foreign, inactive, deleted, missing and incompatible clothes', () => {
    for (const item of [undefined, { ...shirt, user_id: 'foreign' }, { ...shirt, lifecycle_status: 'archived' }, { ...shirt, lifecycle_status: 'sold' }, { ...shirt, lifecycle_status: 'donated' }, { ...shirt, deleted_at: '2026-10-28' }, { ...shirt, category_slug: 'shoes' }]) expect(selectionProblem(item, 'top', owner, categories)).toBeTruthy();
    expect(() => chooseItem(emptyOutfitDraft(), 'shoes', shirt, owner, categories)).toThrow();
  });
  it('terminates category cycles and refuses unknown parents', () => {
    expect(rootCategory('missing', categories)).toBeNull();
    expect(rootCategory('a', [{ slug: 'a', parent_slug: 'b' }, { slug: 'b', parent_slug: 'a' }] as Category[])).toBeNull();
  });
  it('requires a name and at least one valid unique item, rejecting unknown slots', () => {
    expect(outfitDraftSchema.safeParse(emptyOutfitDraft()).success).toBe(false);
    const base = { ...emptyOutfitDraft(), name: '코디' };
    for (const items of [{}, { top: undefined }, { top: 'bad-id' }, { top: id, shoes: id }, { arbitrary: id }]) expect(outfitDraftSchema.safeParse({ ...base, items }).success).toBe(false);
    expect(outfitDraftSchema.safeParse({ ...base, items: { top: id } }).success).toBe(true);
  });
  it('normalizes metadata and enforces database-compatible bounds without trusting extra fields', () => {
    const valid = { ...emptyOutfitDraft(), name: '  출근  ', memo: ' 메모 ', tags: '봄,출근,봄', seasons: ['spring', 'spring'], items: { top: id }, user_id: 'foreign' };
    expect(outfitDraftSchema.parse(valid)).toMatchObject({ name: '출근', memo: '메모', tags: ['봄', '출근'], seasons: ['spring'] });
    expect(outfitDraftSchema.parse(valid)).not.toHaveProperty('user_id');
    for (const patch of [{ name: 'x'.repeat(161) }, { memo: 'x'.repeat(5001) }, { occasion: 'x'.repeat(81) }, { tags: 'x'.repeat(41) }, { tags: Array.from({ length: 21 }, (_, i) => `${i}`).join(',') }, { seasons: ['invalid'] }]) expect(outfitDraftSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
  it('marks every metadata/selection change dirty and becomes clean when fully cleared', () => {
    const empty = emptyOutfitDraft();
    expect(hasDraftChanges(empty)).toBe(false);
    for (const patch of [{ name: ' ' }, { memo: '메모' }, { occasion: '출근' }, { tags: '봄' }, { seasons: ['spring'] }, { isFavorite: true }, { items: { top: id } }]) expect(hasDraftChanges({ ...empty, ...patch })).toBe(true);
    expect(hasDraftChanges(removeItem({ ...empty, items: { top: id } }, 'top'))).toBe(false);
  });
});
