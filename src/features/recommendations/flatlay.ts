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

export function flatlayPlacements(items: RenderRequest['items'], layers: RenderRequest['layers'] = [], photos?: ReadonlyMap<string, FlatlayPhotoData>): FlatlayPlacement[] {
  const entries = renderEntries({ items, layers });
  if (entries.length === 1) {
    const { slot, position } = entries[0]!;
    return [{ slot, position, x: 170, y: 200, width: 560, height: 800, rotation: 0 }];
  }
  const tops = entries.filter(({ slot }) => slot === 'top').sort((a, b) => a.position - b.position);
  const outers = entries.filter(({ slot }) => slot === 'outerwear').sort((a, b) => a.position - b.position);
  const hasUpper = tops.length > 0 || outers.length > 0;
  const hasBottom = Boolean(items.bottom);
  const gap = 20;
  const pieces: FlatlayPlacement[] = [];
  const add = (slot: RecommendationSlot, x: number, y: number, width: number, height: number, rotation = 0) => {
    const item = items[slot];
    if (!item) return;
    const cutout = photos?.get(item.id)?.framed === false;
    pieces.push({ slot, position: 0, x, y, width, height, rotation: cutout ? rotation : 0 });
  };
  const addUpper = (group: typeof entries, x: number, y: number, width: number, height: number) => {
    // Stack layers in the narrow column and spread them in a wider column.
    const columns = width >= 400 ? Math.min(group.length, 2) : 1;
    const rows = Math.ceil(group.length / columns);
    const cellWidth = (width - gap * (columns - 1)) / columns;
    const cellHeight = (height - gap * (rows - 1)) / rows;
    group.forEach(({ slot, position }, index) => {
      const row = Math.floor(index / columns);
      const rowCount = Math.min(columns, group.length - row * columns);
      const inset = (columns - rowCount) * (cellWidth + gap) / 2;
      pieces.push({ slot, position, x: x + inset + index % columns * (cellWidth + gap), y: y + row * (cellHeight + gap), width: cellWidth, height: cellHeight, rotation: 0 });
    });
  };

  add('bottom', 260, hasUpper ? 550 : 240, 377, hasUpper ? 595 : 865);
  if (outers.length && tops.length) {
    const outerWidth = tops.length > outers.length ? 356 : 418;
    addUpper(outers, 152, 78, outerWidth, 450);
    addUpper(tops, 152 + outerWidth + gap, 107, 716 - outerWidth - gap, 402);
  } else if (hasUpper) {
    addUpper(outers.length ? outers : tops, 175, 78, 550, 450);
  }

  // Separate side areas leave room for photo backgrounds and the rotated silhouettes.
  const sideTop = hasUpper || hasBottom ? 557 : 399;
  add('accessory', hasBottom ? 48 : 355, sideTop, hasBottom ? 179 : 190, 226);
  add('bag', hasBottom ? 667 : 600, sideTop + 60, hasBottom ? 193 : 245, 268, -7);
  add('shoes', hasBottom ? 45 : 67, sideTop + (hasBottom ? 302 : 154), hasBottom ? 184 : 232, 209, -10);
  return pieces;
}

export type RgbaPhoto = { width: number; height: number; data: Uint8Array | Uint8ClampedArray };
export type Cutout = RgbaPhoto & { method: 'transparent' | 'edge-background' | 'original' };

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
