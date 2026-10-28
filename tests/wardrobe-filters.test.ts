import { describe, expect, it } from 'vitest';
import { changeFilters, defaultFilters, hasFilters, listFiltersSchema } from '../src/features/wardrobe/filters';
import { wardrobeKeys } from '../src/features/wardrobe/keys';

describe('wardrobe filtering contracts', () => {
  it('trims search without interpreting punctuation as query syntax', () => {
    expect(listFiltersSchema.parse({ ...defaultFilters, search: '  %,_("한글")\\  ' }).search).toBe('%,_("한글")\\');
    expect(() => listFiltersSchema.parse({ ...defaultFilters, search: 'x'.repeat(201) })).toThrow();
    for (const patch of [{ season: 'monsoon' }, { status: 'deleted' }, { sort: 'arbitrary_sql' }]) expect(() => listFiltersSchema.parse({ ...defaultFilters, ...patch })).toThrow();
  });
  it('resets paging atomically while retaining other selected filters', () => {
    const next = changeFilters({ page: 12, filters: { ...defaultFilters, brand: '한글 브랜드', favoriteOnly: true } }, { category: 'shirt' });
    expect(next.page).toBe(0);
    expect(next.filters).toMatchObject({ brand: '한글 브랜드', favoriteOnly: true, category: 'shirt' });
    expect(hasFilters(defaultFilters)).toBe(false);
    expect(hasFilters(next.filters)).toBe(true);
    expect(hasFilters({ ...defaultFilters, sort: 'brand' })).toBe(false);
  });
  it('separates every list condition, page and owner in cache keys', () => {
    const base = wardrobeKeys.list('a', 0, defaultFilters);
    for (const patch of [{ search: '셔츠' }, { category: 'tops' }, { brand: 'a' }, { color: '네이비' }, { season: 'spring' as const }, { favoriteOnly: true }, { status: 'sold' as const }, { sort: 'name' as const }]) {
      expect(wardrobeKeys.list('a', 0, { ...defaultFilters, ...patch })).not.toEqual(base);
    }
    expect(wardrobeKeys.list('b', 0, defaultFilters)).not.toEqual(base);
    expect(wardrobeKeys.list('a', 1, defaultFilters)).not.toEqual(base);
    expect(wardrobeKeys.options('a').slice(0, 3)).toEqual(wardrobeKeys.root('a'));
  });
});
