import { describe, expect, it } from 'vitest';
import { categoryErrorMessage, categoryListKey, categoryNameSchema, customCategorySlug, movedCategoryOrder, registrationCategories } from '../src/features/categories/model';
import { slotDisplayLabel, rootCategory } from '../src/features/outfits/draft';
import type { Category } from '../src/features/wardrobe/types';

const categories: Category[] = [
  { slug: 'tops', parent_slug: null, label_ko: '내 상의', position: 0, is_active: false },
  { slug: 'shirt', parent_slug: 'tops', label_ko: '셔츠', position: 0, is_active: true },
  { slug: 'tee', parent_slug: 'tops', label_ko: '티셔츠', position: 1, is_active: false },
  { slug: 'shoes', parent_slug: null, label_ko: '신발', position: 1, is_active: true },
];
describe('member category presentation and editing', () => {
  it('validates names and stable custom identifiers', () => {
    expect(categoryNameSchema.parse('  후드티  ')).toBe('후드티');
    expect(categoryNameSchema.safeParse('   ').success).toBe(false);
    expect(categoryNameSchema.safeParse('가'.repeat(81)).success).toBe(false);
    expect(customCategorySlug('123e4567-e89b-42d3-a456-426614174000')).toBe('u_123e4567-e89b-42d3-a456-426614174000');
    expect(() => customCategorySlug('tops')).toThrow();
  });
  it('moves one sibling without mutating the original and respects boundaries', () => {
    const original = [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }];
    expect(movedCategoryOrder(original, 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(movedCategoryOrder(original, 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(movedCategoryOrder(original, 'a', -1)).toBeNull();
    expect(movedCategoryOrder(original, 'c', 1)).toBeNull();
    expect(movedCategoryOrder(original, 'missing', 1)).toBeNull();
    expect(original.map((row) => row.slug)).toEqual(['a', 'b', 'c']);
  });
  it('hides a parent and its descendants on new registration but retains an existing classification for edits', () => {
    expect(registrationCategories(categories).map((row) => row.slug)).toEqual(['shoes']);
    expect(registrationCategories(categories, 'tee').map((row) => row.slug)).toEqual(['tops', 'tee', 'shoes']);
    expect(registrationCategories(categories, 'shirt').map((row) => row.slug)).toEqual(['tops', 'shirt', 'shoes']);
  });
  it('renames the slot display while preserving its canonical identity even when hidden', () => {
    expect(slotDisplayLabel('top', categories)).toBe('내 상의');
    expect(rootCategory('tee', categories)).toBe('tops');
    expect(slotDisplayLabel('outerwear', categories)).toBe('아우터');
  });
  it('separates member caches and keeps database details out of feedback', () => {
    expect(categoryListKey('a')).not.toEqual(categoryListKey('b'));
    expect(categoryErrorMessage({ code: '23505' })).toContain('같은 이름');
    expect(categoryErrorMessage({ code: '40001' })).toContain('다른 곳');
    expect(categoryErrorMessage({ message: 'private sql trace' })).not.toContain('sql');
  });
});
