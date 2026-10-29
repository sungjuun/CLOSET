import { z } from 'zod';

export const outfitColors = [
  { id: 'white', label: '화이트', hex: '#FFFFFF', family: 'neutral' },
  { id: 'cream', label: '크림', hex: '#FFFBD6', family: 'earth' },
  { id: 'beige', label: '베이지', hex: '#F3F1D9', family: 'earth' },
  { id: 'lemon', label: '레몬 옐로우', hex: '#FAF0B8', family: 'earth' },
  { id: 'lavender', label: '연보라', hex: '#E8E4F5', family: 'purple' },
  { id: 'mint', label: '민트', hex: '#ABE5D1', family: 'green' },
  { id: 'light-gray', label: '라이트 그레이', hex: '#D9DAD7', family: 'neutral' },
  { id: 'light-blue', label: '라이트 블루', hex: '#A8D5E1', family: 'blue' },
  { id: 'turquoise', label: '터쿼이즈', hex: '#3DD7CA', family: 'green' },
  { id: 'light-pink', label: '라이트 핑크', hex: '#F5B6C1', family: 'red' },
  { id: 'light-denim', label: '연청 데님', hex: '#A7C9E5', family: 'blue' },
  { id: 'mid-gray', label: '멜란지 그레이', hex: '#C1C2BE', family: 'neutral' },
  { id: 'sage', label: '세이지 그린', hex: '#B2C2A6', family: 'green' },
  { id: 'khaki', label: '카키', hex: '#BDAE87', family: 'earth' },
  { id: 'camel', label: '카멜', hex: '#BD9967', family: 'earth' },
  { id: 'orange', label: '오렌지', hex: '#DF7C31', family: 'earth' },
  { id: 'gray', label: '그레이', hex: '#838580', family: 'neutral' },
  { id: 'green', label: '그린', hex: '#2D7D50', family: 'green' },
  { id: 'red', label: '레드', hex: '#C81639', family: 'red' },
  { id: 'cobalt', label: '코발트 블루', hex: '#0750AE', family: 'blue' },
  { id: 'dark-brown', label: '다크 브라운', hex: '#604334', family: 'earth' },
  { id: 'charcoal', label: '차콜', hex: '#35464C', family: 'neutral' },
  { id: 'dark-denim', label: '진청 데님', hex: '#293E4A', family: 'blue' },
  { id: 'chocolate', label: '초콜릿 브라운', hex: '#503A24', family: 'earth' },
  { id: 'navy', label: '네이비', hex: '#202D4A', family: 'blue' },
  { id: 'black', label: '블랙', hex: '#202020', family: 'neutral' },
  { id: 'ivory', label: '아이보리', hex: '#FFFFF0', family: 'earth' },
  { id: 'off-white', label: '오프화이트', hex: '#FAF9F6', family: 'neutral' },
  { id: 'sand', label: '샌드', hex: '#D3BDA0', family: 'earth' },
  { id: 'brown', label: '브라운', hex: '#835D46', family: 'earth' },
  { id: 'olive', label: '올리브', hex: '#777C51', family: 'green' },
  { id: 'forest', label: '포레스트 그린', hex: '#254D3D', family: 'green' },
  { id: 'burgundy', label: '버건디', hex: '#763347', family: 'red' },
  { id: 'denim', label: '데님 블루', hex: '#688AAA', family: 'blue' },
  { id: 'peach', label: '피치', hex: '#F2C1A1', family: 'earth' },
  { id: 'pink', label: '핑크', hex: '#D486A8', family: 'red' },
  { id: 'yellow', label: '옐로우', hex: '#E6BF36', family: 'earth' },
  { id: 'sky-blue', label: '스카이 블루', hex: '#83B9DE', family: 'blue' },
  { id: 'lilac', label: '라일락', hex: '#B1A0C6', family: 'purple' },
  { id: 'taupe', label: '토프', hex: '#A39686', family: 'earth' },
  { id: 'teal', label: '틸', hex: '#387B7C', family: 'green' },
  { id: 'ecru', label: '에크루', hex: '#D9D0AC', family: 'earth' },
] as const;
export type ColorId = typeof outfitColors[number]['id'];
export type OutfitColor = typeof outfitColors[number];
export const colorIds = outfitColors.map((color) => color.id) as [ColorId, ...ColorId[]];
export const colorIdSchema = z.enum(colorIds);
export const pairSchema = z.object({ top: colorIdSchema, bottom: colorIdSchema });
export type ColorPair = z.infer<typeof pairSchema>;
export type FinderSelection = { top: ColorId | null; bottom: ColorId | null };
const byId = new Map<ColorId, OutfitColor>(outfitColors.map((color) => [color.id, color]));
export const colorOf = (id: ColorId) => byId.get(id)!;
export const pairKey = (pair: ColorPair) => `${pair.top}:${pair.bottom}`;
export const samePair = (a: ColorPair, b: ColorPair) => pairKey(a) === pairKey(b);

export function selectionFromParams(params: { top?: unknown; bottom?: unknown }): FinderSelection {
  const top = colorIdSchema.safeParse(params.top); const bottom = colorIdSchema.safeParse(params.bottom);
  return { top: top.success ? top.data : null, bottom: bottom.success ? bottom.data : null };
}
export function pairQuery(pair: ColorPair) {
  const parsed = pairSchema.parse(pair);
  return `top=${encodeURIComponent(parsed.top)}&bottom=${encodeURIComponent(parsed.bottom)}`;
}

// HSL describes the selected swatches, never a person's complexion or season.
export function tone(hex: string) {
  const [r, g, b] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const delta = max - min;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return { lightness, saturation, brightness: lightness >= 0.66 ? '밝은 톤' : lightness <= 0.32 ? '짙은 톤' : '중간 톤', chroma: saturation >= 0.5 ? '선명한 색' : '차분한 색' };
}

export const featuredPairs: readonly ColorPair[] = [
  { top: 'sage', bottom: 'white' }, { top: 'navy', bottom: 'sand' }, { top: 'white', bottom: 'light-denim' },
  { top: 'black', bottom: 'gray' }, { top: 'dark-brown', bottom: 'cream' }, { top: 'light-blue', bottom: 'navy' },
  { top: 'cream', bottom: 'dark-denim' }, { top: 'mid-gray', bottom: 'black' }, { top: 'burgundy', bottom: 'charcoal' },
  { top: 'white', bottom: 'olive' }, { top: 'camel', bottom: 'navy' }, { top: 'mint', bottom: 'off-white' },
  { top: 'lavender', bottom: 'gray' }, { top: 'navy', bottom: 'off-white' }, { top: 'black', bottom: 'khaki' },
];

const preferredBottoms: Partial<Record<ColorId, readonly ColorId[]>> = {
  sage: ['white', 'ivory', 'beige', 'dark-denim', 'black', 'gray', 'light-denim', 'off-white'],
  navy: ['sand', 'off-white', 'gray', 'brown', 'light-denim', 'white', 'khaki', 'cream'],
  white: ['light-denim', 'navy', 'black', 'olive', 'sand', 'gray', 'dark-denim', 'brown'],
  black: ['gray', 'white', 'khaki', 'light-denim', 'charcoal', 'sand', 'olive', 'ivory'],
  gray: ['black', 'navy', 'white', 'dark-denim', 'sand', 'ivory', 'charcoal', 'olive'],
  'mid-gray': ['black', 'navy', 'dark-denim', 'white', 'olive', 'sand', 'charcoal', 'ivory'],
  'light-gray': ['navy', 'black', 'dark-denim', 'sand', 'charcoal', 'white', 'olive', 'brown'],
  cream: ['dark-denim', 'brown', 'olive', 'navy', 'sand', 'white', 'charcoal', 'khaki'],
  beige: ['navy', 'dark-denim', 'white', 'brown', 'olive', 'black', 'cream', 'charcoal'],
  'light-blue': ['navy', 'white', 'sand', 'dark-denim', 'gray', 'ivory', 'brown', 'black'],
  'light-pink': ['white', 'gray', 'navy', 'light-denim', 'charcoal', 'ivory', 'sand', 'black'],
  mint: ['off-white', 'sand', 'light-denim', 'navy', 'gray', 'dark-denim', 'ivory', 'black'],
  lavender: ['gray', 'off-white', 'navy', 'light-denim', 'charcoal', 'sand', 'white', 'black'],
  'dark-brown': ['cream', 'sand', 'light-denim', 'ivory', 'navy', 'white', 'khaki', 'gray'],
  brown: ['ivory', 'sand', 'navy', 'light-denim', 'cream', 'olive', 'white', 'charcoal'],
  khaki: ['white', 'black', 'dark-denim', 'ivory', 'navy', 'sand', 'charcoal', 'brown'],
  camel: ['navy', 'dark-denim', 'ivory', 'black', 'cream', 'gray', 'olive', 'white'],
  burgundy: ['charcoal', 'navy', 'gray', 'sand', 'dark-denim', 'ivory', 'black', 'white'],
  green: ['ivory', 'dark-denim', 'sand', 'black', 'gray', 'white', 'navy', 'khaki'],
  red: ['dark-denim', 'gray', 'white', 'navy', 'black', 'sand', 'charcoal', 'ivory'],
  cobalt: ['white', 'gray', 'sand', 'charcoal', 'black', 'ivory', 'navy', 'light-denim'],
  charcoal: ['white', 'light-denim', 'sand', 'black', 'gray', 'ivory', 'navy', 'olive'],
};

function scorePair(pair: ColorPair) {
  const top = colorOf(pair.top); const bottom = colorOf(pair.bottom);
  const a = tone(top.hex); const b = tone(bottom.hex);
  const preferred = preferredBottoms[pair.top]?.indexOf(pair.bottom) ?? -1;
  if (preferred >= 0) return 1000 - preferred * 20;
  let score = featuredPairs.some((entry) => samePair(entry, pair)) ? 800 : 0;
  if (top.family === 'neutral' || bottom.family === 'neutral') score += 40;
  if (Math.abs(a.lightness - b.lightness) > 0.25) score += 15;
  if (top.family === bottom.family) score += 12;
  if (top.id === bottom.id) score -= 25;
  if (a.saturation > 0.65 && b.saturation > 0.65 && top.family !== bottom.family) score -= 20;
  return score;
}
export function matchingColors(other: ColorId, slot: 'top' | 'bottom'): OutfitColor[] {
  return [...outfitColors].sort((a, b) => scorePair(slot === 'top' ? { top: b.id, bottom: other } : { top: other, bottom: b.id }) - scorePair(slot === 'top' ? { top: a.id, bottom: other } : { top: other, bottom: a.id }));
}
export function randomPair(current: FinderSelection, random = Math.random): ColorPair {
  const candidates = featuredPairs.filter((pair) => pair.top !== current.top || pair.bottom !== current.bottom);
  const index = Math.max(0, Math.min(candidates.length - 1, Math.floor(random() * candidates.length)));
  return { ...candidates[index]! };
}
export function compareAdd(current: readonly ColorPair[], pair: ColorPair): ColorPair[] {
  pairSchema.parse(pair);
  if (current.some((entry) => samePair(entry, pair))) return [...current];
  if (current.length >= 3) throw new Error('comparison_full');
  return [...current, pair];
}

export function describePair(pair: ColorPair) {
  const top = colorOf(pair.top); const bottom = colorOf(pair.bottom); const a = tone(top.hex); const b = tone(bottom.hex);
  const contrast = Math.abs(a.lightness - b.lightness);
  const key = pairKey(pair);
  const special: Record<string, { title: string; text: string; tags: string[] }> = {
    'sage:white': { title: '클린 프레시', text: '부드러운 세이지 그린과 깨끗한 화이트가 만나 가볍고 산뜻한 인상을 줍니다. 아이보리 스니커즈나 밝은 가방을 더해 편안하게 입어 보세요.', tags: ['산뜻한', '나들이', '데일리'] },
    'navy:sand': { title: '모던 클래식', text: '차분한 네이비 상의에 샌드 톤 하의가 따뜻한 균형을 더합니다. 브라운 소품이나 단정한 로퍼로 마무리해 보세요.', tags: ['클래식', '출근룩', '차분한'] },
    'white:light-denim': { title: '라이트 데일리', text: '화이트와 연청 데님의 밝은 대비를 살린 편안한 조합입니다. 스니커즈와 가벼운 아우터를 함께 활용해 보세요.', tags: ['캐주얼', '산뜻한', '데일리'] },
    'black:gray': { title: '어반 모노', text: '블랙 상의와 그레이 하의로 간결한 모노톤을 만들 수 있어요. 소재의 질감이나 신발 형태로 변화를 주면 좋습니다.', tags: ['미니멀', '모노톤', '도시적인'] },
  };
  const mood = special[key] ?? (top.id === bottom.id || top.family === bottom.family
    ? { title: '차분한 톤온톤', text: `${top.label} 상의와 ${bottom.label} 하의로 색의 흐름을 이어 보세요. 상하의 소재나 질감을 다르게 고르면 자연스럽게 구분할 수 있어요.`, tags: ['톤온톤', '차분한', '데일리'] }
    : top.family === 'neutral' || bottom.family === 'neutral'
      ? { title: '밸런스 데일리', text: `${top.label}와 ${bottom.label}를 함께 배치한 조합입니다. 무채색이 다른 색을 받쳐 주므로, 신발과 소품은 두 색 중 하나와 비슷한 톤으로 맞춰 보세요.`, tags: ['균형 있는', '데일리', '담백한'] }
      : { title: '컬러 포인트', text: `${top.label} 상의와 ${bottom.label} 하의의 색 차이를 즐겨 보세요. 신발과 가방을 화이트·그레이 같은 무채색으로 정리하면 두 색에 집중할 수 있어요.`, tags: ['포인트', '캐주얼', '개성 있는'] });
  return { ...mood, top, bottom, topTone: a, bottomTone: b, contrast: contrast >= 0.45 ? '뚜렷한 대비' : contrast >= 0.22 ? '보통 대비' : '부드러운 대비' };
}
