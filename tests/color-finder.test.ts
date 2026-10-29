import { describe, expect, it } from 'vitest';
import { colorIds, colorOf, compareAdd, describePair, featuredPairs, matchingColors, outfitColors, pairKey, pairQuery, pairSchema, randomPair, selectionFromParams, tone } from '../src/features/color-combinations/finder';
import { outfitArtwork } from '../src/features/color-combinations/art';

describe('clothing color finder', () => {
  it('keeps only whitelisted scalar colors from links, preserving either selection order', () => {
    expect(selectionFromParams({ top: 'sage', bottom: 'white' })).toEqual({ top: 'sage', bottom: 'white' });
    expect(selectionFromParams({ bottom: 'navy' })).toEqual({ top: null, bottom: 'navy' });
    expect(selectionFromParams({ top: ['white', 'black'], bottom: 'https://evil.test' })).toEqual({ top: null, bottom: null });
    expect(pairQuery({ top: 'sage', bottom: 'white' })).toBe('top=sage&bottom=white');
    expect(() => pairQuery({ top: 'red&bottom=black', bottom: 'white' } as never)).toThrow();
  });
  it('has a complete, duplicate-free recommendation order and readable result for every allowed pair', () => {
    expect(outfitColors).toHaveLength(42); expect(new Set(colorIds).size).toBe(42);
    for (const color of outfitColors) {
      expect(color.hex).toMatch(/^#[0-9A-F]{6}$/);
      for (const slot of ['top', 'bottom'] as const) {
        const ranked = matchingColors(color.id, slot);
        expect(new Set(ranked.map((entry) => entry.id)).size).toBe(42);
        expect([...ranked.map((entry) => entry.id)].sort()).toEqual([...colorIds].sort());
      }
      for (const other of outfitColors) {
        const result = describePair({ top: color.id, bottom: other.id });
        expect(result.top).toBe(color); expect(result.bottom).toBe(other);
        expect(result.title.length).toBeGreaterThan(2); expect(result.text.length).toBeGreaterThan(20);
        expect(result.tags.length).toBeGreaterThan(0); expect(result.contrast).toMatch(/대비$/);
      }
    }
    expect(matchingColors('sage', 'bottom')[0]!.id).toBe('white');
  });
  it('makes safe random picks and avoids repeating a fully selected pair', () => {
    for (const pair of featuredPairs) {
      expect(pairSchema.safeParse(pair).success).toBe(true);
      for (const random of [0, 0.5, 0.999999, 1, -1]) expect(pairKey(randomPair(pair, () => random))).not.toBe(pairKey(pair));
    }
    expect(pairSchema.safeParse(randomPair({ top: null, bottom: 'black' })).success).toBe(true);
  });
  it('keeps top and bottom orientation when comparing, deduplicates and enforces the three-pair limit', () => {
    const a = { top: 'sage', bottom: 'white' } as const; const b = { top: 'white', bottom: 'sage' } as const;
    const one = compareAdd([], a); expect(compareAdd(one, a)).toEqual(one);
    const two = compareAdd(one, b); expect(two).toHaveLength(2);
    const three = compareAdd(two, { top: 'black', bottom: 'gray' });
    expect(() => compareAdd(three, { top: 'navy', bottom: 'sand' })).toThrow('comparison_full');
    expect(one).toEqual([a]);
  });
  it('describes swatches rather than a user personal season, including neutral extremes', () => {
    expect(tone('#FFFFFF')).toMatchObject({ lightness: 1, saturation: 0, brightness: '밝은 톤' });
    expect(tone('#000000')).toMatchObject({ lightness: 0, saturation: 0, brightness: '짙은 톤' });
    for (const color of outfitColors) { expect(Number.isFinite(tone(color.hex).saturation)).toBe(true); expect(tone(color.hex).saturation).toBeGreaterThanOrEqual(0); }
    expect(describePair({ top: 'sage', bottom: 'white' }).title).toBe('클린 프레시');
  });
  it('exports original vector clothes and color codes without remote assets or arbitrary markup', () => {
    const pair = { top: 'sage', bottom: 'white' } as const;
    const svg = outfitArtwork(pair, true);
    expect(svg).toContain(colorOf('sage').hex); expect(svg).toContain('세이지 그린 상의'); expect(svg).toContain('height="800"');
    expect(svg).not.toMatch(/<script|<image|href=|<foreignObject/i);
    expect(() => outfitArtwork({ top: '<script>', bottom: 'white' } as never)).toThrow();
  });
});
