import { cutoutProduct } from './flatlay';

export async function prepareFlatlayPhoto(uri: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(uri, { signal, credentials: 'omit' }); if (!response.ok) throw new Error('photo_failed');
  const blob = await response.blob(); if (blob.size > 5 * 1024 * 1024) throw new Error('photo_large');
  const bitmap = await createImageBitmap(blob);
  try {
    if (signal.aborted) throw new Error('render_cancelled');
    const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(2, Math.round(bitmap.width * scale)); canvas.height = Math.max(2, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d'); if (!context) throw new Error('photo_failed');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const cutout = cutoutProduct(context.getImageData(0, 0, canvas.width, canvas.height));
    canvas.width = cutout.width; canvas.height = cutout.height;
    const output = context.createImageData(cutout.width, cutout.height); output.data.set(cutout.data); context.putImageData(output, 0, 0);
    if (signal.aborted) throw new Error('render_cancelled');
    return canvas.toDataURL('image/png');
  } finally { bitmap.close(); }
}
