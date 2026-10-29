import { describe, expect, it } from 'vitest';
import { brandErrorMessage, brandNameSchema, filterBrands, type Brand } from '../src/features/brands/model';
import { editableFields, itemToDraft } from '../src/features/wardrobe/editing';
import { emptyWardrobeDraft, type WardrobeItem } from '../src/features/wardrobe/types';
import { wardrobeDraftSchema } from '../src/features/wardrobe/schemas';
import { privateQueryKey } from '../src/lib/query/keys';
import { centerSquareCrop } from '../src/features/wardrobe/photos/model';

describe('reusable brands', () => {
  it('validates names and searches literal text without regex syntax', () => {
    expect(brandNameSchema.parse('  My Brand  ')).toBe('My Brand');
    expect(brandNameSchema.safeParse(' ').success).toBe(false);
    expect(brandNameSchema.safeParse('가'.repeat(121)).success).toBe(false);
    const brands = [{ name: 'NIKE' }, { name: '50%_[]' }, { name: '뉴발란스' }] as Brand[];
    expect(filterBrands(brands, 'nike')).toEqual([brands[0]]);
    expect(filterBrands(brands, '%_[')).toEqual([brands[1]]);
  });
  it('sends brand identity and lets the DB supply canonical name, including stale names', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const input = wardrobeDraftSchema.parse({ ...emptyWardrobeDraft(), name: '옷', category_slug: 'shirt', brand_id: id, brand_name: '이전 이름' });
    expect(editableFields(input)).toMatchObject({ brand_id: id });
    expect(editableFields(input)).not.toHaveProperty('brand_name');
    expect(wardrobeDraftSchema.safeParse({ ...emptyWardrobeDraft(), brand_id: 'tampered' }).success).toBe(false);
    const item = { name: '옷', category_slug: 'shirt', brand_id: id, brand_name: '브랜드', seasons: [], tags: [], currency: 'KRW', purchase_price: null } as unknown as WardrobeItem;
    expect(itemToDraft(item)).toMatchObject({ brand_id: id, brand_name: '브랜드' });
    expect(editableFields(wardrobeDraftSchema.parse({ ...emptyWardrobeDraft(), name: '옷', category_slug: 'shirt' }))).toMatchObject({ brand_id: null, brand_name: null });
  });
  it('keeps brand caches private and sanitizes server error details', () => {
    expect(privateQueryKey('a', 'brands')).not.toEqual(privateQueryKey('b', 'brands'));
    expect(brandErrorMessage({ code: '40001', message: 'secret' })).toContain('변경');
    expect(brandErrorMessage({ code: '23505' })).toContain('같은 이름');
    expect(brandErrorMessage({ message: 'secret' })).not.toContain('secret');
  });
  it('fills a square without stretching wide, tall, square or odd-sized source images', () => {
    expect(centerSquareCrop(1200, 400)).toEqual({ originX: 400, originY: 0, width: 400, height: 400 });
    expect(centerSquareCrop(400, 1200)).toEqual({ originX: 0, originY: 400, width: 400, height: 400 });
    expect(centerSquareCrop(99, 50)).toEqual({ originX: 24, originY: 0, width: 50, height: 50 });
    expect(centerSquareCrop(80, 80)).toEqual({ originX: 0, originY: 0, width: 80, height: 80 });
  });
  it('rejects unusable image dimensions and explains deletion/conflict errors safely', () => {
    for (const size of [0, -1, Infinity, NaN, 0.5]) expect(() => centerSquareCrop(size, 80)).toThrow();
    expect(brandErrorMessage({ code: 'P0002' })).toContain('삭제');
    expect(brandErrorMessage({ code: '55P03', message: 'internal lock' })).toContain('수정 중');
    expect(brandErrorMessage({ code: '55P03', message: 'internal lock' })).not.toContain('internal');
  });
});
