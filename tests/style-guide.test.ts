import { describe, expect, it } from 'vitest';
import { filterGuides, getGuide, guideCategories, guides, relatedGuides } from '../src/features/style-guide/guides';
import { desktopRoutes, isNavigationActive, mobileRoutes, moreRoutes } from '../src/components/layout/navigation';

describe('style guide discovery', () => {
  it('finds body text and applies category and every search term together', () => {
    expect(filterGuides('스웨이드 마른').map(item => item.slug)).toContain('suede-shoes');
    expect(filterGuides('스웨이드', 'basics')).toEqual([]);
    expect(filterGuides('존재하지않는팁')).toEqual([]);
    expect(filterGuides('  ＣＯＴＴＯＮ  ')).toEqual([]);
    expect(filterGuides('  니트  건조  ', 'clothing-care').map(item => item.slug)).toContain('drying');
  });
  it('normalizes composed Korean and whitespace', () => {
    expect(filterGuides('세탁'.normalize('NFD'))).toEqual(filterGuides('세탁'));
    expect(filterGuides('  ')).toHaveLength(guides.length);
  });
  it('keeps deep links unique and provides related content without self references', () => {
    expect(new Set(guides.map(item => item.slug)).size).toBe(guides.length);
    for (const category of guideCategories) expect(filterGuides('', category.id).length).toBeGreaterThan(0);
    for (const guide of guides) {
      expect(getGuide(guide.slug)).toBe(guide);
      expect(relatedGuides(guide).every(item => item.category === guide.category && item.slug !== guide.slug)).toBe(true);
      if (guide.source) expect(new URL(guide.source.url).protocol).toBe('https:');
    }
    expect(getGuide('unknown')).toBeUndefined();
    expect(getGuide(undefined)).toBeUndefined();
  });
});

describe('responsive navigation', () => {
  it('keeps every secondary destination available from more', () => {
    expect(mobileRoutes).toHaveLength(5);
    expect(moreRoutes.map(item => item.href)).toContain('/style-guide');
    expect(new Set([...mobileRoutes.filter(item => item.href !== '/more'), ...moreRoutes].map(item => item.href))).toEqual(new Set(desktopRoutes.map(item => item.href)));
  });
  it('selects one tab for details, settings sections and the outfit editor', () => {
    for (const path of ['/style-guide/tone-on-tone', '/settings', '/color-combinations', '/outfits/new', '/outfits', '/recommendations']) {
      expect(desktopRoutes.filter(item => isNavigationActive(item.href, path))).toHaveLength(1);
      expect(mobileRoutes.filter(item => isNavigationActive(item.href, path))).toHaveLength(1);
    }
    expect(isNavigationActive('/more', '/style-guide/suede-shoes')).toBe(true);
    expect(isNavigationActive('/more', '/settings-other')).toBe(false);
  });
});
