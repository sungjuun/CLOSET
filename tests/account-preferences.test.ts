import { describe, expect, it } from 'vitest';
import { preferenceColumns, preferenceKey, preferencesPatchSchema, preferenceErrorMessage } from '../src/features/settings/preferences';

describe('account list preferences', () => {
  it('validates only supported settings and never accepts ownership or arbitrary columns', () => {
    expect(preferencesPatchSchema.parse({ display_name: '  내 옷장  ', card_density: 'compact' })).toEqual({ display_name: '내 옷장', card_density: 'compact' });
    for (const patch of [{}, { id: 'someone' }, { theme: 'brown' }, { wardrobe_sort: 'unsafe' }, { outfit_sort: 'brand' }, { card_density: 'unsafe' }, { display_name: '가'.repeat(81) }]) expect(preferencesPatchSchema.safeParse(patch).success).toBe(false);
    expect(preferenceKey('a')).not.toEqual(preferenceKey('b'));
    expect(preferenceErrorMessage({ code: '40001' })).toContain('같은 설정');
    expect(preferenceErrorMessage(new Error('secret trace'))).not.toContain('secret');
  });
  it('keeps original grids as the standard and changes density without exceeding small-screen limits', () => {
    expect(preferenceColumns('wardrobe', 1280, 'standard')).toBe(5);
    expect(preferenceColumns('outfits', 1280, 'standard')).toBe(3);
    expect(preferenceColumns('wardrobe', 1280, 'compact')).toBe(6);
    expect(preferenceColumns('outfits', 1280, 'compact')).toBe(4);
    expect(preferenceColumns('wardrobe', 390, 'compact')).toBe(2);
    expect(preferenceColumns('wardrobe', 390, 'roomy')).toBe(1);
    expect(preferenceColumns('outfits', 390, 'compact')).toBe(1);
    for (const width of [320, 390, 699, 700, 768, 1023, 1024, 1199, 1200, 1440]) {
      for (const kind of ['wardrobe', 'outfits'] as const) expect(preferenceColumns(kind, width, 'compact')).toBeGreaterThanOrEqual(preferenceColumns(kind, width, 'roomy'));
    }
  });
});
