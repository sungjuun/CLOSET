import { itemColors, type RecommendationSlot } from './engine';
import { renderEntries, type FlatlayPhotoData, type RenderRequest } from './renderModel';

export const flatlaySize = { width: 900, height: 1200, background: '#B9B6B2' } as const;
export const flatlayStops = ['#E4E2DF', '#C9C6C2', '#A6A3A1'] as const;
export const flatlaySwatch = { x: 40, y: 56, width: 91, height: 103, gap: 12 } as const;
export type FlatlayPlacement = { slot: RecommendationSlot; position: number; x: number; y: number; width: number; height: number; rotation: number };

export function flatlayPalette(items: RenderRequest['items'], layers: RenderRequest['layers'] = []) {
  const entries = renderEntries({ items, layers });
  const priority: RecommendationSlot[] = ['outerwear', 'bottom', 'top', 'bag', 'shoes', 'accessory'];
  const colors = new Map<string, string>();
  for (const slot of priority) {
    for (const { item } of entries.filter((entry) => entry.slot === slot).sort((a, b) => b.position - a.position)) {
      const hex = itemColors(item)[0];
      if (hex && !colors.has(hex)) colors.set(hex, item.color_name?.split(/[,/·+]/)[0]?.trim() || hex);
    }
  }
  return [...colors].slice(0, 2).map(([hex, label]) => ({ hex, label }));
}

// Back to front. Inset the inner garments and expose their collars and hems.
// Keep the inner top visible when an outer layer has a closed front or an opaque background.
export function flatlayPlacements(items: RenderRequest['items'], layers: RenderRequest['layers'] = [], photos?: ReadonlyMap<string, FlatlayPhotoData>): FlatlayPlacement[] {
  const entries = renderEntries({ items, layers });
  const tops = entries.filter(({ slot }) => slot === 'top').sort((a, b) => a.position - b.position);
  const outers = entries.filter(({ slot }) => slot === 'outerwear').sort((a, b) => a.position - b.position);
  const outer = outers.length > 0;
  const sideBySide = outer && tops.length > 0 && photos !== undefined
    && (tops.some(({ item }) => photos.get(item.id)?.framed !== false)
      || outers.some(({ item }) => !photos.get(item.id)?.openFront));
  if (entries.length === 1) {
    const { slot, position } = entries[0]!;
    return [{ slot, position, x: 170, y: 200, width: 560, height: 800, rotation: 0 }];
  }
  const pieces: FlatlayPlacement[] = [];
  const add = (slot: RecommendationSlot, x: number, y: number, width: number, height: number, rotation = 0) => {
    if (items[slot]) pieces.push({ slot, position: 0, x, y, width, height, rotation });
  };
  const collarAccessory = /목도리|머플러|스카프|목걸이|scarf|muffler|necklace/i.test(items.accessory?.name ?? '');
  const belt = /벨트|허리띠|belt/i.test(items.accessory?.name ?? '');
  const wearableAccessory = Boolean(items.accessory && (!photos || photos.get(items.accessory.id)?.framed === false) && (outer || tops.length));

  add('bottom', 243, outer || tops.length ? 485 : 212, 413, 656);
  tops.forEach(({ position }, index) => {
    const x = sideBySide ? 568 + index * 29 : outer ? 257 + index * 25 : 185 + index * 30;
    const y = sideBySide ? 118 + index * 65 : outer ? 65 + index * 38 : 95 + index * 43;
    pieces.push({ slot: 'top', position, x, y, width: sideBySide ? 248 : outer ? 385 : 530, height: sideBySide ? 315 : outer ? 500 : 450, rotation: sideBySide ? 4 : 0 });
  });
  outers.forEach(({ position }, index) => {
    const offset = outers.length - 1 - index;
    pieces.push({ slot: 'outerwear', position,
      x: (sideBySide ? 139 : 141) - offset * 37, y: 105 - offset * 33,
      width: sideBySide ? 469 : 610, height: sideBySide ? 488 : 486, rotation: -offset * 4 });
  });
  if (wearableAccessory && collarAccessory) add('accessory', 345, 114, 212, 320, -3);
  else if (wearableAccessory && belt && items.bottom) add('accessory', 338, 511, 230, 133, 5);
  else add('accessory', 725, sideBySide ? 480 : 90, 132, 175, 5);
  add('bag', 606, items.bottom ? 538 : 625, 241, 333, -12);
  add('shoes', 65, items.bottom ? 848 : 744, 238, 241, -16);
  return pieces;
}

export type RgbaPhoto = { width: number; height: number; data: Uint8Array | Uint8ClampedArray };
export type Cutout = RgbaPhoto & { method: 'transparent' | 'edge-background' | 'original' };

export function hasOpenFront({ width, height, data, method }: Cutout) {
  if (method === 'original') return false;
  // A naturally open jacket has a clear vertical gap between the two plackets.
  const x = Math.floor(width / 2);
  for (const row of [0.55, 0.66, 0.77, 0.88]) {
    const y = Math.floor(height * row);
    if (data[(y * width + x) * 4 + 3]! > 16) return false;
    if ([0.27, 0.73].some((side) => data[(y * width + Math.floor(width * side)) * 4 + 3]! <= 16)) return false;
  }
  return true;
}
// Local, conservative background cleanup, never AI. Only a uniform light neutral
// background connected to the perimeter is cleared. Interior whites stay intact.
export function cutoutProduct(source: RgbaPhoto): Cutout {
  const { width, height } = source; const size = width * height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 || size > 1024 * 1024 || source.data.length !== size * 4) throw new Error('invalid_photo_pixels');
  const original = new Uint8Array(source.data); const data = new Uint8Array(original);
  const corners = [0, width - 1, (height - 1) * width, size - 1];
  const border: number[] = [];
  for (let x = 0; x < width; x++) border.push(x, (height - 1) * width + x);
  for (let y = 1; y < height - 1; y++) border.push(y * width, y * width + width - 1);
  const transparent = border.filter((pixel) => data[pixel * 4 + 3]! < 16).length / border.length > 0.3;
  let method: Cutout['method'] = transparent ? 'transparent' : 'original';
  if (!transparent) {
    const difference = (pixel: number, color: number[]) => Math.max(Math.abs(data[pixel * 4]! - color[0]!), Math.abs(data[pixel * 4 + 1]! - color[1]!), Math.abs(data[pixel * 4 + 2]! - color[2]!));
    const samples = corners.map((pixel) => [data[pixel * 4]!, data[pixel * 4 + 1]!, data[pixel * 4 + 2]!]);
    const background = samples.find((color) => corners.filter((pixel) => difference(pixel, color) <= 16).length >= 3);
    if (background && Math.min(...background) >= 135 && Math.max(...background) - Math.min(...background) < 42 && border.filter((pixel) => difference(pixel, background) <= 16).length / border.length >= 0.86) {
      const visited = new Uint8Array(size); const queue = new Uint32Array(size); let head = 0; let tail = 0;
      const visit = (pixel: number) => { if (!visited[pixel]) { visited[pixel] = 1; if (data[pixel * 4 + 3]! < 16 || difference(pixel, background) <= 8) queue[tail++] = pixel; } };
      border.forEach(visit);
      while (head < tail) {
        const pixel = queue[head++]!; data[pixel * 4 + 3] = 0;
        const x = pixel % width; const y = Math.floor(pixel / width);
        if (x > 0) visit(pixel - 1); if (x + 1 < width) visit(pixel + 1); if (y > 0) visit(pixel - width); if (y + 1 < height) visit(pixel + width);
      }
      // Reject uncertain/all-background results rather than erase a light garment.
      if (tail / size >= 0.08 && tail / size <= 0.96) method = 'edge-background';
      else data.set(original);
    }
  }
  if (method === 'original') return { width, height, data: original, method };
  let left = width; let top = height; let right = -1; let bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3]! > 16) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
  if (right < left || bottom < top) return { width, height, data: original, method: 'original' };
  left = Math.max(0, left - 3); top = Math.max(0, top - 3); right = Math.min(width - 1, right + 3); bottom = Math.min(height - 1, bottom + 3);
  const resultWidth = right - left + 1; const resultHeight = bottom - top + 1; const result = new Uint8Array(resultWidth * resultHeight * 4);
  for (let y = 0; y < resultHeight; y++) result.set(data.subarray(((top + y) * width + left) * 4, ((top + y) * width + right + 1) * 4), y * resultWidth * 4);
  return { width: resultWidth, height: resultHeight, data: result, method };
}
