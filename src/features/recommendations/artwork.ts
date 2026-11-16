import { slotLabels } from '../outfits/draft';
import { flatlayPalette, flatlayPlacements, flatlaySize, flatlayStops, flatlaySwatch } from './flatlay';
import { renderItem, type FlatlayPhotoData, type RenderRequest } from './renderModel';

export const xmlText = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
export function itemBoardSvg(request: RenderRequest, photos: ReadonlyMap<string, FlatlayPhotoData>) {
  const pieces = flatlayPlacements(request.items, request.layers, photos).map(({ slot, position, x, y, width, height, rotation }) => {
    const item = renderItem(request, slot, position);
    const photo = photos.get(item.id);
    const shadow = photo?.framed === false ? ' filter="url(#shadow)"' : '';
    return `<g transform="rotate(${rotation} ${x + width / 2} ${y + height / 2})">${photo ? `<image href="${xmlText(photo.uri)}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"${shadow}/>` : `<g><text x="${x + width / 2}" y="${y + height / 2}" text-anchor="middle" fill="#393A40" font-size="16">${slotLabels[slot]} · 사진 미등록</text><text x="${x + width / 2}" y="${y + height / 2 + 24}" text-anchor="middle" fill="#393A40" font-size="14">${xmlText(item.name.slice(0, Math.min(14, Math.floor(width / 15))))}</text></g>`}</g>`;
  });
  const { x, y, width, height, gap } = flatlaySwatch;
  const palette = flatlayPalette(request.items, request.layers).map(({ hex, label }, index) => {
    const top = y + index * (height + gap);
    return `<rect x="${x}" y="${top}" width="${width}" height="${height}" rx="2" fill="#F5F3EF"/><rect x="${x + 5}" y="${top + 5}" width="${width - 10}" height="69" rx="1" fill="${hex}"/><text x="${x + width / 2}" y="${top + 92}" text-anchor="middle" fill="#242428" font-size="12" font-weight="700">${xmlText(label.slice(0, 9))}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${flatlaySize.width}" height="${flatlaySize.height}" viewBox="0 0 ${flatlaySize.width} ${flatlaySize.height}" font-family="sans-serif"><title>${xmlText(request.name)}</title><desc>실제 보유 의류의 사진을 비율 유지하여 배치한 플랫레이</desc><defs><linearGradient id="surface" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${flatlayStops[0]}"/><stop offset="48%" stop-color="${flatlayStops[1]}"/><stop offset="100%" stop-color="${flatlayStops[2]}"/></linearGradient><filter id="shadow" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feDropShadow dx="6" dy="10" stdDeviation="9" flood-color="#202024" flood-opacity=".29"/></filter></defs><rect width="${flatlaySize.width}" height="${flatlaySize.height}" fill="url(#surface)"/>${pieces.join('')}${palette.join('')}</svg>`;
}
