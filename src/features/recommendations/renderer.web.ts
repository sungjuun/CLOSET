import { itemBoardSvg, mannequinSampleSvg } from './artwork';
import { renderWithFallback, type RenderRequest, type RenderedOutfit } from './renderModel';

async function rasterize(svg: string, signal: AbortSignal): Promise<ArrayBuffer> {
  if (signal.aborted) throw new Error('render_cancelled');
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { cleanup(); reject(new Error('render_timeout')); }, 15_000);
      const abort = () => { cleanup(); reject(new Error('render_cancelled')); };
      const cleanup = () => { clearTimeout(timeout); signal.removeEventListener('abort', abort); };
      image.onload = () => { cleanup(); resolve(); }; image.onerror = () => { cleanup(); reject(new Error('render_failed')); };
      signal.addEventListener('abort', abort, { once: true }); image.src = url;
    });
    if (signal.aborted) throw new Error('render_cancelled');
    const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 1100;
    const context = canvas.getContext('2d'); if (!context) throw new Error('render_failed');
    const scale = Math.min(900 / image.naturalWidth, 1100 / image.naturalHeight);
    const width = image.naturalWidth * scale; const height = image.naturalHeight * scale;
    context.fillStyle = '#FFFFFF'; context.fillRect(0, 0, 900, 1100); context.drawImage(image, (900 - width) / 2, (1100 - height) / 2, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('render_failed')), 'image/png'));
    return blob.arrayBuffer();
  } finally { URL.revokeObjectURL(url); }
}
async function originalPhotoData(uri: string, signal: AbortSignal) {
  const response = await fetch(uri, { signal, credentials: 'omit' });
  if (!response.ok) throw new Error('photo_failed');
  const blob = await response.blob(); if (blob.size > 5 * 1024 * 1024) throw new Error('photo_large');
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d'); if (!context) throw new Error('photo_failed');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); return canvas.toDataURL('image/png');
  } finally { bitmap.close(); }
}
export async function renderOutfit(request: RenderRequest): Promise<RenderedOutfit> {
  return renderWithFallback(request, {
    async itemBoard(input) {
      const images: Record<string, string> = {}; let failed = 0;
      for (const photo of input.photos) {
        if (!Object.values(input.items).some((item) => item?.id === photo.itemId)) continue;
        try { images[photo.itemId] = await originalPhotoData(photo.uri, input.signal); }
        catch (error) { if (input.signal.aborted) throw error; failed++; }
      }
      return { bytes: await rasterize(itemBoardSvg(input, images), input.signal), width: 900, height: 1100, kind: 'item-board', ...(failed ? { notice: '일부 사진을 읽지 못해 이름과 빈 사진 영역으로 표시했어요.' } : {}) };
    },
    async mannequin(input) { return { bytes: await rasterize(mannequinSampleSvg(input.preset, input.items), input.signal), width: 900, height: 1100, kind: 'mannequin-sample' }; },
  });
}
export async function downloadOutfitImage(image: RenderedOutfit) {
  const url = URL.createObjectURL(new Blob([image.bytes], { type: 'image/png' })); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `closet-outfit-${image.kind}.png`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
