import type { RecommendationSlot } from './engine';
import type { RenderRequest } from './renderModel';

export const flatlaySize = { width: 900, height: 1100, background: '#F4F3F1' } as const;
export type FlatlayPlacement = { slot: RecommendationSlot; x: number; y: number; width: number; height: number; rotation: number };
// Back to front. Every rotated rectangle stays inside the canvas; images use contain.
export function flatlayPlacements(items: RenderRequest['items']): FlatlayPlacement[] {
  const outer = Boolean(items.outerwear);
  const placements: FlatlayPlacement[] = [
    { slot: 'bottom', x: 365, y: 454, width: 310, height: 515, rotation: 7 },
    { slot: 'top', x: outer ? 393 : 233, y: outer ? 120 : 75, width: outer ? 320 : 435, height: outer ? 410 : 455, rotation: outer ? 9 : -5 },
    { slot: 'outerwear', x: 142, y: 68, width: 452, height: 520, rotation: -9 },
    { slot: 'bag', x: 73, y: 548, width: 305, height: 330, rotation: -14 },
    { slot: 'accessory', x: 700, y: 516, width: 130, height: 280, rotation: 17 },
    { slot: 'shoes', x: 394, y: 901, width: 300, height: 155, rotation: -16 },
  ];
  return placements.filter(({ slot }) => items[slot]);
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
