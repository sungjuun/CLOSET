import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { fetch as expoFetch } from 'expo/fetch';
import { randomUUID } from 'expo-crypto';
import { decode, encode } from 'fast-png';
import { cutoutProduct } from './flatlay';
import { rasterKind } from '../wardrobe/photos/model';

function base64(bytes: Uint8Array) { let binary = ''; for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192)); return btoa(binary); }
export async function prepareFlatlayPhoto(uri: string, signal: AbortSignal): Promise<string> {
  const response = await expoFetch(uri, { signal }); if (!response.ok) throw new Error('photo_failed');
  const bytes = await response.arrayBuffer(); if (bytes.byteLength > 5 * 1024 * 1024) throw new Error('photo_large');
  const kind = rasterKind(bytes); if (!kind) throw new Error('photo_format');
  const input = new File(Paths.cache, `closet-flatlay-${randomUUID()}.${kind}`); let output: File | null = null;
  input.write(new Uint8Array(bytes));
  const context = ImageManipulator.manipulate(input.uri, { maxWidth: 640, maxHeight: 640 });
  try {
    let image = await context.renderAsync();
    if (Math.max(image.width, image.height) > 640) {
      context.resize(image.width >= image.height ? { width: 640 } : { height: 640 });
      image.release(); image = await context.renderAsync();
    }
    try {
      const saved = await image.saveAsync({ format: SaveFormat.PNG, base64: true }); output = new File(saved.uri);
      if (signal.aborted) throw new Error('render_cancelled');
      if (!saved.base64) throw new Error('photo_failed');
      const png = decode(Uint8Array.from(atob(saved.base64), (char) => char.charCodeAt(0)));
      if (png.depth !== 8 || png.palette || png.channels < 3) return `data:image/png;base64,${saved.base64}`;
      const data = new Uint8Array(png.width * png.height * 4);
      for (let i = 0; i < png.width * png.height; i++) { data[i * 4] = png.data[i * png.channels]!; data[i * 4 + 1] = png.data[i * png.channels + 1]!; data[i * 4 + 2] = png.data[i * png.channels + 2]!; data[i * 4 + 3] = png.channels === 4 ? png.data[i * 4 + 3]! : 255; }
      const cutout = cutoutProduct({ width: png.width, height: png.height, data });
      return `data:image/png;base64,${base64(encode({ ...cutout, channels: 4, depth: 8 }))}`;
    } finally { image.release(); }
  } finally { context.release(); if (input.exists) input.delete(); if (output?.exists) output.delete(); }
}
