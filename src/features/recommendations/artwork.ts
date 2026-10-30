import { slotLabels } from '../outfits/draft';
import { flatlayPlacements, flatlaySize } from './flatlay';
import type { RenderRequest } from './renderModel';

export const xmlText = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
export function itemBoardSvg(request: RenderRequest, images: Readonly<Record<string, string>>) {
  const pieces = flatlayPlacements(request.items).map(({ slot, x, y, width, height, rotation }) => {
    const item = request.items[slot]!; const image = images[item.id];
    return `<g transform="rotate(${rotation} ${x + width / 2} ${y + height / 2})">${image ? `<image href="${image}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>` : `<g><text x="${x + width / 2}" y="${y + height / 2}" text-anchor="middle" fill="#7C818E" font-size="16">${slotLabels[slot]} · 사진 미등록</text><text x="${x + width / 2}" y="${y + height / 2 + 24}" text-anchor="middle" fill="#7C818E" font-size="12">${xmlText(item.name.slice(0, 14))}</text></g>`}</g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${flatlaySize.width}" height="${flatlaySize.height}" viewBox="0 0 900 1100" font-family="sans-serif"><title>${xmlText(request.name)}</title><desc>실제 보유 의류의 사진을 비율 유지하여 배치한 플랫레이</desc><rect width="900" height="1100" fill="${flatlaySize.background}"/>${pieces.join('')}</svg>`;
}
