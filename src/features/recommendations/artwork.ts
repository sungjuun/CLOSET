import { slotLabels } from '../outfits/draft';
import { itemColors, recommendationSlots } from './engine';
import { presetLabels, type BodyPreset, type RenderRequest } from './renderModel';

export const xmlText = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
export function mannequinSampleSvg(preset: BodyPreset, input?: RenderRequest['items']) {
  const scale = preset === 'slim' ? 0.86 : preset === 'broad' ? 1.16 : 1;
  const top = input?.top ? itemColors(input.top)[0] ?? '#A6B5C7' : '#A6B5C7';
  const bottom = input?.bottom ? itemColors(input.bottom)[0] ?? '#697783' : '#697783';
  const outer = input?.outerwear ? itemColors(input.outerwear)[0] ?? '#B2AA9B' : null;
  const shoes = input?.shoes ? itemColors(input.shoes)[0] ?? '#D5DCE5' : '#D5DCE5';
  const bag = input?.bag ? itemColors(input.bag)[0] ?? '#B2AA9B' : null;
  const accessory = input?.accessory ? itemColors(input.accessory)[0] ?? '#758294' : null;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="780" viewBox="0 0 600 780" font-family="sans-serif">
  <rect width="600" height="780" fill="#EEF1F6"/><text x="34" y="38" font-size="12" letter-spacing="2" fill="#526078">CLOSET / MANNEQUIN PROTOTYPE</text>
  <ellipse cx="300" cy="676" rx="122" ry="19" fill="#D8DFEA"/>
  <g transform="translate(300 0) scale(${scale} 1) translate(-300 0)" stroke="#758294" stroke-width="2" stroke-linejoin="round">
   <ellipse cx="300" cy="134" rx="40" ry="52" fill="#D2D9E3"/><path d="M282 178V206H318V178" fill="#D2D9E3"/>
   <path d="M236 219L210 241L177 410L197 471L215 460L214 412L245 307M364 219L390 241L423 410L403 471L385 460L386 412L355 307" fill="#D2D9E3"/>
   <path d="M246 390H354L359 500L344 651H310L300 480L290 651H256L241 500Z" fill="${bottom}"/>
   <path d="M255 643L244 672Q268 683 291 673L291 649M310 649L309 673Q339 684 357 673L344 643" fill="${shoes}"/>
   <path d="M272 201Q300 219 328 201L369 221L390 296L354 308L347 277L351 398Q300 414 249 398L253 277L246 308L210 296L231 221Z" fill="${top}"/>
   <path d="M272 201Q300 246 328 201M300 434V479M266 450L262 624M334 450L338 624" fill="none" opacity="0.35"/>
   ${outer ? `<path d="M264 205L231 221L210 292L239 307L251 282L239 421L286 425L288 231ZM336 205L369 221L390 292L361 307L349 282L361 421L314 425L312 231Z" fill="${outer}"/><path d="M265 208L276 263L288 231M335 208L324 263L312 231" fill="none"/>` : ''}
   ${bag ? `<path d="M376 402Q400 372 424 402L435 480H365Z" fill="${bag}"/><path d="M384 402Q399 360 416 402" fill="none"/>` : ''}
   ${accessory ? `<rect x="184" y="414" width="25" height="16" rx="4" fill="${accessory}"/>` : ''}
  </g>
  <rect x="20" y="704" width="560" height="57" rx="8" fill="#FFFFFF"/>
  <text x="300" y="726" text-anchor="middle" font-size="16" font-weight="700" fill="#3047D5">${presetLabels[preset]} · 샘플 마네킹</text>
  <text x="300" y="750" text-anchor="middle" font-size="14" fill="#526078">실제 보유 제품을 착용한 이미지가 아닙니다</text></svg>`;
}

export function itemBoardSvg(request: RenderRequest, images: Readonly<Record<string, string>>) {
  const cells = recommendationSlots.map((slot, index) => {
    const x = 24 + index % 3 * 286; const y = 112 + Math.floor(index / 3) * 450; const item = request.items[slot];
    const image = item ? images[item.id] : null;
    const name = item?.name ?? '보유 목록에 없음';
    const lines = [name.slice(0, 17), name.slice(17, 34)];
    return `<g transform="translate(${x} ${y})"><rect width="270" height="426" rx="12" fill="#FFFFFF" stroke="#E0E5EE"/><text x="18" y="30" fill="#3047D5" font-size="16" font-weight="700">${slotLabels[slot]}</text><rect x="12" y="46" width="246" height="288" rx="8" fill="#F5F6F9"/>${image ? `<image href="${image}" x="14" y="48" width="242" height="284" preserveAspectRatio="xMidYMid meet"/>` : `<text x="135" y="195" text-anchor="middle" font-size="15" fill="#7C818E">${item ? '사진 미등록·확인 불가' : '추천 제외'}</text>`}<text x="16" y="365" fill="#222530" font-size="14">${xmlText(lines[0]!)}</text><text x="16" y="387" fill="#222530" font-size="14">${xmlText(lines[1]!)}</text><text x="16" y="411" fill="#7C818E" font-size="11">${xmlText((item?.brand_name ?? '').slice(0, 25))}</text></g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1100" viewBox="0 0 900 1100" font-family="sans-serif"><rect width="900" height="1100" fill="#F5F7FB"/><text x="30" y="42" fill="#3047D5" font-size="12" letter-spacing="2">CLOSET / MY REAL WARDROBE</text><text x="30" y="82" fill="#222530" font-size="26" font-weight="700">${xmlText(request.name.slice(0, 28))}</text>${cells.join('')}<text x="30" y="1050" font-size="14" fill="#667083">실제 보유 의류의 원본 사진 · 이미지 비율 유지</text><text x="30" y="1078" font-size="12" fill="#7C818E">사진이 없는 항목은 이름과 빈 사진 영역으로 표시합니다.</text></svg>`;
}
