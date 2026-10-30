import { describe, expect, it } from 'vitest';
import { colorFeatures, colorHarmony, evaluateOutfit, itemColors, outfitSignature, outfitSimilarity, recommendationSlots, recommendationWeights, recommendOutfits, type RecommendationItem, type RecommendationOptions } from '../src/features/recommendations/engine';
import { type RenderRequest } from '../src/features/recommendations/renderModel';
import { itemBoardSvg } from '../src/features/recommendations/artwork';
import { cutoutProduct, flatlayPlacements, flatlaySize } from '../src/features/recommendations/flatlay';
import { wardrobeDraftSchema } from '../src/features/wardrobe/schemas';
import { emptyWardrobeDraft } from '../src/features/wardrobe/types';

const owner = 'member-a';
function item(slot: RecommendationItem['slot'], number = 0, change: Partial<RecommendationItem> = {}): RecommendationItem { return { id: `${slot}-${number}`, user_id: owner, slot, name: `${slot} ${number}`, brand_name: null, color_name: null, color_hex: number % 2 ? '#F6F4EC' : '#202D49', secondary_color_hexes: [], material: 'cotton', seasons: [], tags: ['미니멀'], updated_at: '2026-10-30T00:00:00Z', lifecycle_status: 'active', deleted_at: null, ...change }; }
const inventory = recommendationSlots.flatMap((slot) => [item(slot), item(slot, 1), item(slot, 2)]);
const options: RecommendationOptions = { season: '', style: '', count: 4, includeOuterwear: true, locks: {}, seed: 'first' };
describe('owned wardrobe recommendations', () => {
  it('uses six real inventory slots, stable IDs, and no duplicate cards', () => {
    const result = recommendOutfits(inventory, owner, options).outfits;
    expect(result).toHaveLength(4); expect(new Set(result.map((outfit) => outfit.signature)).size).toBe(4);
    for (const outfit of result) { expect(Object.keys(outfit.items)).toHaveLength(6); for (const value of Object.values(outfit.items)) expect(inventory).toContain(value); }
    expect(recommendationWeights.color).toBeGreaterThan(recommendationWeights.season);
  });
  it('excludes another member, archived, sold, donated and deleted garments', () => {
    const bad = ['archived', 'sold', 'donated'].map((lifecycle_status, index) => item('top', index, { lifecycle_status }));
    bad.push(item('top', 5, { user_id: 'member-b' }), item('top', 6, { deleted_at: '2026-10-30' }));
    expect(recommendOutfits([...bad, item('bottom')], owner, options).outfits).toEqual([]);
  });
  it('does not invent missing garments or repeated cards for a small wardrobe', () => {
    const result = recommendOutfits([item('top'), item('bottom')], owner, options);
    expect(result.outfits).toHaveLength(1); expect(result.missing).toContain('shoes'); expect(Object.keys(result.outfits[0]!.items)).toEqual(['top', 'bottom']);
    expect(recommendOutfits([item('shoes')], owner, options).outfits).toEqual([]);
  });
  it('pins real items while varying the rest and refuses foreign/wrong-slot/season locks', () => {
    const next = { ...options, locks: { top: 'top-1' } };
    const result = recommendOutfits(inventory, owner, next).outfits;
    expect(result.every((outfit) => outfit.items.top?.id === 'top-1')).toBe(true);
    expect(() => recommendOutfits(inventory, owner, { ...next, locks: { top: 'bottom-1' } })).toThrow('invalid_lock');
    expect(() => recommendOutfits(inventory, 'member-b', next)).toThrow('invalid_lock');
    expect(() => recommendOutfits([item('top', 0, { seasons: ['winter'] }), item('bottom')], owner, { ...options, season: 'summer', locks: { top: 'top-0' } })).toThrow('invalid_lock');
  });
  it('filters seasons, permits untagged garments, and excludes optional outerwear', () => {
    const result = recommendOutfits([...inventory, item('top', 10, { seasons: ['winter'] })], owner, { ...options, season: 'summer', includeOuterwear: false }).outfits;
    expect(result).toHaveLength(4); expect(result.every((outfit) => !outfit.items.outerwear && outfit.items.top?.id !== 'top-10')).toBe(true);
  });
  it('does not repeat recent signatures, changes the seed deterministically, and reports exhaustion', () => {
    const first = recommendOutfits(inventory, owner, options).outfits;
    const second = recommendOutfits(inventory, owner, { ...options, seed: 'second', excluded: first.map((outfit) => outfit.signature) }).outfits;
    expect(second.every((outfit) => !first.some((previous) => previous.signature === outfit.signature))).toBe(true);
    expect(recommendOutfits(inventory, owner, options).outfits).toEqual(first);
    const tiny = [item('top'), item('bottom')]; const signature = outfitSignature({ top: tiny[0]!, bottom: tiny[1]! });
    expect(recommendOutfits(tiny, owner, { ...options, excluded: [signature] }).exhausted).toBe(true);
  });
  it('ignores fixed slots when calculating similarity', () => {
    const a = evaluateOutfit({ top: item('top'), bottom: item('bottom') }, options);
    const b = evaluateOutfit({ top: item('top'), bottom: item('bottom', 1) }, options);
    expect(outfitSimilarity(a, b, { top: 'top-0' })).toBe(0); expect(outfitSimilarity(a, b, {})).toBe(0.5);
  });
  it('considers main/secondary colors, brightness, saturation and garment temperature', () => {
    expect(itemColors(item('top', 0, { secondary_color_hexes: ['#f6f4ec', '#202D49'] }))).toEqual(['#202D49', '#F6F4EC']);
    expect(colorFeatures('#FFFFFF')).toMatchObject({ neutral: true, l: 1 }); expect(colorFeatures('#CC5500').temperature).toBe('warm'); expect(colorFeatures('#0044BB').temperature).toBe('cool');
    expect(colorHarmony('#202D49', '#F6F4EC')).toBeGreaterThan(colorHarmony('#FF0000', '#00FF00'));
    const main = evaluateOutfit({ top: item('top'), bottom: item('bottom', 1) }, options);
    const secondary = evaluateOutfit({ top: item('top', 0, { secondary_color_hexes: ['#FF0000'] }), bottom: item('bottom', 1) }, options);
    expect(secondary.colorScore).not.toBe(main.colorScore);
  });
  it('honestly handles missing color/style/material data, and prioritizes matching metadata', () => {
    const unknown = item('top', 0, { color_hex: null, color_name: null, material: null, tags: [] });
    const result = evaluateOutfit({ top: unknown, bottom: { ...unknown, id: 'bottom', slot: 'bottom' } }, options);
    expect(result.colorCoverage).toBe(0); expect(result.colorScore).toBe(50); expect(result.reasons.join(' ')).toContain('기본값');
    const good = evaluateOutfit({ top: item('top', 0, { material: 'linen' }) }, { ...options, season: 'summer', style: 'minimal' });
    const bad = evaluateOutfit({ top: item('top', 0, { material: 'wool', tags: ['스포티'] }) }, { ...options, season: 'summer', style: 'minimal' });
    expect(good.score).toBeGreaterThan(bad.score);
  });
  it('normalizes optional secondary colors and rejects invalid/more than three', () => {
    const draft = { ...emptyWardrobeDraft(), name: 'shirt', category_slug: 'tops' };
    expect(wardrobeDraftSchema.parse({ ...draft, secondary_color_hexes: ' #ffffff, #FFFFFF, #123456 ' }).secondary_color_hexes).toEqual(['#FFFFFF', '#123456']);
    for (const value of ['blue', '#fff', '#000000,#111111,#222222,#333333']) expect(wardrobeDraftSchema.safeParse({ ...draft, secondary_color_hexes: value }).success).toBe(false);
  });
});

describe('photo flatlay composition', () => {
  const request: RenderRequest = { name: '<script>&"', items: { top: item('top', 0, { name: '<danger>' }) }, photos: [], signal: new AbortController().signal };
  function photo(background: number, paint: (x: number, y: number) => number[] | null) {
    const width = 60; const height = 100; const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(paint(x, y) ?? [background, background, background, 255], (y * width + x) * 4);
    return { width, height, data };
  }
  it('places only real items, layers clothes and keeps rotated photographs within the canvas', () => {
    const items = Object.fromEntries(inventory.filter((entry) => entry.id.endsWith('-0')).map((entry) => [entry.slot, entry]));
    const result = flatlayPlacements(items); expect(result).toHaveLength(6); expect(result[0]?.slot).toBe('bottom');
    for (const p of result) { const radians = p.rotation * Math.PI / 180; const w = Math.abs(p.width * Math.cos(radians)) + Math.abs(p.height * Math.sin(radians)); const h = Math.abs(p.width * Math.sin(radians)) + Math.abs(p.height * Math.cos(radians)); const cx = p.x + p.width / 2; const cy = p.y + p.height / 2; expect(cx - w / 2).toBeGreaterThanOrEqual(0); expect(cx + w / 2).toBeLessThanOrEqual(flatlaySize.width); expect(cy - h / 2).toBeGreaterThanOrEqual(0); expect(cy + h / 2).toBeLessThanOrEqual(flatlaySize.height); }
    expect(flatlayPlacements(request.items).map((p) => p.slot)).toEqual(['top']);
  });
  it('uses a single paper background, rotated contain photographs, and escaped labels for missing photos', () => {
    const svg = itemBoardSvg(request, { 'top-0': 'data:image/png;base64,AAAA' });
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"'); expect(svg).toContain('rotate('); expect(svg.match(/<rect/g)).toHaveLength(1); expect(svg).not.toContain('<script>');
    expect(itemBoardSvg(request, {})).toContain('&lt;danger&gt;'); expect(itemBoardSvg({ ...request, items: {} }, {})).not.toContain('<image');
  });
  it('clears only edge-connected uniform background and trims transparent padding, keeping all garment pixels', () => {
    const original = photo(244, (x, y) => x >= 20 && x < 40 && y >= 20 && y < 80 ? [32, 45, 73, 255] : null); const before = original.data.slice();
    const result = cutoutProduct(original); expect(result.method).toBe('edge-background'); expect(result.width).toBe(26); expect(result.height).toBe(66);
    expect(result.data.filter((_value, index) => index % 4 === 3 && result.data[index] === 255)).toHaveLength(1200); expect(original.data).toEqual(before);
  });
  it('preserves interior whites and a light garment on a slightly darker background', () => {
    const enclosed = photo(255, (x, y) => x >= 15 && x <= 45 && y >= 20 && y <= 80 ? x === 15 || x === 45 || y === 20 || y === 80 ? [20, 20, 20, 255] : [255, 255, 255, 255] : null);
    const result = cutoutProduct(enclosed); const middle = (Math.floor(result.height / 2) * result.width + Math.floor(result.width / 2)) * 4;
    expect([...result.data.slice(middle, middle + 4)]).toEqual([255, 255, 255, 255]);
    const pale = cutoutProduct(photo(244, (x, y) => x >= 20 && x < 40 && y >= 20 && y < 80 ? [255, 255, 255, 255] : null)); expect(pale.method).toBe('edge-background'); expect(pale.width).toBe(26);
  });
  it('keeps complex backgrounds and ambiguous all-white photographs intact', () => {
    const complex = photo(240, (x, y) => [x * 4, y * 2, 80, 255]); const result = cutoutProduct(complex); expect(result.method).toBe('original'); expect(result.data).toEqual(complex.data);
    const blank = photo(255, () => null); expect(cutoutProduct(blank)).toMatchObject({ width: 60, height: 100, method: 'original' });
  });
  it('preserves existing alpha and rejects invalid or oversized pixel buffers', () => {
    const transparent = photo(0, (x, y) => x >= 20 && x < 40 && y >= 20 && y < 80 ? [200, 20, 30, 180] : [0, 0, 0, 0]); const result = cutoutProduct(transparent);
    expect(result.method).toBe('transparent'); expect(result.width).toBe(26); expect(result.data.filter((_value, index) => index % 4 === 3 && result.data[index] === 180)).toHaveLength(1200);
    expect(() => cutoutProduct({ width: 60, height: 100, data: new Uint8Array(4) })).toThrow('invalid_photo_pixels');
  });
});
