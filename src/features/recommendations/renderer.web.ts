import { itemBoardSvg } from './artwork';
import { type RenderRequest, type RenderedOutfit } from './renderModel';
import { prepareFlatlayPhoto } from './cutout';

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
export async function renderOutfit(request: RenderRequest): Promise<RenderedOutfit> {
  if (request.signal.aborted) throw new Error('render_cancelled');
  const images: Record<string, string> = {}; let failed = 0;
  for (const photo of request.photos) {
    if (!Object.values(request.items).some((item) => item?.id === photo.itemId)) continue;
    try { images[photo.itemId] = await prepareFlatlayPhoto(photo.uri, request.signal); }
    catch (error) { if (request.signal.aborted) throw error; failed++; }
  }
  return { bytes: await rasterize(itemBoardSvg(request, images), request.signal), width: 900, height: 1100, kind: 'item-board', ...(failed ? { notice: '일부 사진을 읽지 못해 해당 위치에 사진 미등록 안내를 표시했어요.' } : {}) };
}
export async function downloadOutfitImage(image: RenderedOutfit) {
  const url = URL.createObjectURL(new Blob([image.bytes], { type: 'image/png' })); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `closet-outfit-${image.kind}.png`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
