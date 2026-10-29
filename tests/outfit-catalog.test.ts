import { describe, expect, it } from 'vitest';
import { changeOutfitFilters, defaultOutfitCatalogFilters, hasOutfitFilters, outfitCatalogFiltersSchema, outfitCatalogKeys, outfitSearchText } from '../src/features/outfits/catalog';

describe('saved outfit filters', () => {
  it('accepts a leading hashtag in the shared search box without changing embedded punctuation', () => {
    expect(outfitSearchText('  #캐주얼  ')).toBe('캐주얼');
    expect(outfitSearchText('# 출근')).toBe('출근');
    expect(outfitSearchText('간절기#12')).toBe('간절기#12');
    expect(outfitSearchText('  %, _  ')).toBe('%, _');
    expect(outfitSearchText('#')).toBe('');
  });
  it('preserves literal search and exact option values, and rejects invalid bounds and sorts', () => {
    expect(outfitCatalogFiltersSchema.parse({ ...defaultOutfitCatalogFilters, search: '  %,_"\\한글  ', brand: 'Brand ', tag: '출근' })).toMatchObject({ search: '%,_"\\한글', brand: 'Brand ', tag: '출근' });
    for (const patch of [{ search: 'a'.repeat(201) }, { brand: 'a'.repeat(121) }, { tag: 'a'.repeat(41) }, { season: 'unknown' }, { sort: 'unsafe_sql' }, { favoriteOnly: 'true' }]) {
      expect(() => outfitCatalogFiltersSchema.parse({ ...defaultOutfitCatalogFilters, ...patch })).toThrow();
    }
  });
  it('resets paging while retaining every other AND filter and identifies filtered empty results', () => {
    const next = changeOutfitFilters({ page: 9, filters: { ...defaultOutfitCatalogFilters, search: '봄', brand: '브랜드', favoriteOnly: true } }, { tag: '출근', sort: 'updated' });
    expect(next).toEqual({ page: 0, filters: { ...defaultOutfitCatalogFilters, search: '봄', brand: '브랜드', tag: '출근', favoriteOnly: true, sort: 'updated' } });
    expect(hasOutfitFilters(defaultOutfitCatalogFilters)).toBe(false);
    expect(hasOutfitFilters({ ...defaultOutfitCatalogFilters, sort: 'updated' })).toBe(false);
    for (const patch of [{ search: '봄' }, { brand: '브랜드' }, { tag: '출근' }, { season: 'spring' as const }, { favoriteOnly: true }]) expect(hasOutfitFilters({ ...defaultOutfitCatalogFilters, ...patch })).toBe(true);
  });
  it('separates owners, pages, and every filter in the cache, with options under the same invalidation root', () => {
    const base = outfitCatalogKeys.list('a', 0, defaultOutfitCatalogFilters);
    for (const patch of [{ search: '봄' }, { brand: '브랜드' }, { tag: '출근' }, { season: 'spring' as const }, { favoriteOnly: true }, { sort: 'updated' as const }]) {
      expect(outfitCatalogKeys.list('a', 0, { ...defaultOutfitCatalogFilters, ...patch })).not.toEqual(base);
    }
    expect(outfitCatalogKeys.list('b', 0, defaultOutfitCatalogFilters)).not.toEqual(base);
    expect(outfitCatalogKeys.list('a', 1, defaultOutfitCatalogFilters)).not.toEqual(base);
    expect(outfitCatalogKeys.list('a', 0, { ...defaultOutfitCatalogFilters, search: ' 봄 ' })).toEqual(outfitCatalogKeys.list('a', 0, { ...defaultOutfitCatalogFilters, search: '봄' }));
    expect(outfitCatalogKeys.options('a').slice(0, 3)).toEqual(outfitCatalogKeys.root('a'));
  });
});
