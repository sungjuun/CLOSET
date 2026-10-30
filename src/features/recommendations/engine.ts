import { wardrobeSwatchColor } from '../wardrobe/colors';

export const recommendationSlots = ['outerwear', 'top', 'bottom', 'shoes', 'bag', 'accessory'] as const;
export type RecommendationSlot = typeof recommendationSlots[number];
export type RecommendationItem = {
  id: string; user_id: string; slot: RecommendationSlot; name: string; brand_name: string | null;
  color_name: string | null; color_hex: string | null; secondary_color_hexes: string[];
  material: string | null; seasons: string[]; tags: string[]; updated_at: string;
  lifecycle_status: string; deleted_at: string | null; available_count?: number | undefined;
};
export const styleOptions = [{ value: '', label: '전체' }, { value: 'minimal', label: '미니멀' }, { value: 'casual', label: '캐주얼' }, { value: 'formal', label: '포멀' }, { value: 'street', label: '스트릿' }, { value: 'vintage', label: '빈티지' }, { value: 'classic', label: '클래식' }, { value: 'sporty', label: '스포티' }] as const;
export const occasionOptions = [{ value: 'daily', label: '일상' }, { value: 'work', label: '출근' }, { value: 'date', label: '데이트' }, { value: 'meeting', label: '약속' }, { value: 'travel', label: '여행' }, { value: 'sport', label: '운동' }, { value: 'other', label: '기타' }] as const;
export type RecommendationOptions = { season: string; style: string; count: number; includeOuterwear: boolean; locks: Partial<Record<RecommendationSlot, string>>; seed: string; excluded?: readonly string[]; occasion?: string; excludeWorn?: boolean; wornIds?: readonly string[] };
export type RecommendedOutfit = { items: Partial<Record<RecommendationSlot, RecommendationItem>>; signature: string; score: number; colorScore: number; colorCoverage: number; reasons: string[] };
export const recommendationWeights = { color: 0.48, season: 0.18, style: 0.14, material: 0.12, novelty: 0.08 } as const;
const styleAliases: Record<string, string[]> = { casual: ['캐주얼', 'casual', '데일리'], minimal: ['미니멀', 'minimal'], classic: ['클래식', 'classic', '출근'], formal: ['포멀', 'formal', '정장', '격식'], vintage: ['빈티지', 'vintage', '레트로', '헤리티지'], street: ['스트릿', '스트리트', 'street', '워크웨어'], sporty: ['스포티', 'sporty', '스포츠', 'sport', '애슬레저'] };
const occasionAliases: Record<string, string[]> = { daily: ['일상', '데일리', 'daily', '캐주얼', 'casual'], work: ['출근', '오피스', 'work', '포멀', 'formal', '클래식'], date: ['데이트', 'date', '미니멀', 'minimal'], meeting: ['약속', '모임', 'meeting', '클래식', 'classic'], travel: ['여행', 'travel', '캐주얼', 'casual', '아웃도어'], sport: ['운동', 'sport', '스포츠', '스포티', '애슬레저'] };
const slotWeight: Record<RecommendationSlot, number> = { top: 1, bottom: 1, outerwear: 0.8, shoes: 0.5, bag: 0.3, accessory: 0.2 };
const clamp = (value: number) => Math.max(0, Math.min(1, value));
export function stableHash(value: string) { let hash = 2166136261; for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619); return (hash >>> 0) / 4294967296; }
export function outfitSignature(items: Partial<Record<RecommendationSlot, RecommendationItem>>) { return recommendationSlots.filter((slot) => items[slot]).map((slot) => `${slot}:${items[slot]!.id}`).join('|'); }
export function itemColors(item: RecommendationItem): string[] {
  const primary = wardrobeSwatchColor(item.color_name, item.color_hex);
  const named = (item.color_name ?? '').split(/[,/·+]/).map((name) => wardrobeSwatchColor(name));
  return [...new Set([primary, ...(item.secondary_color_hexes ?? []), ...named].filter((hex): hex is string => Boolean(hex && /^#[0-9a-f]{6}$/i.test(hex))).map((hex) => hex.toUpperCase()))].slice(0, 4);
}
export function colorFeatures(hex: string) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error('invalid_color');
  const [r, g, b] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const d = max - min; const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0; if (d) { h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360; }
  const neutral = s < 0.14 || l < 0.1 || l > 0.94;
  return { h, s, l, neutral, temperature: neutral ? 'neutral' : h <= 85 || h >= 335 ? 'warm' : h >= 160 && h <= 300 ? 'cool' : 'neutral' };
}
export function colorHarmony(aHex: string, bHex: string) {
  const a = colorFeatures(aHex); const b = colorFeatures(bHex); const difference = Math.abs(a.h - b.h); const hue = Math.min(difference, 360 - difference);
  let score = a.neutral || b.neutral ? 0.88 : hue <= 25 ? 0.86 : hue <= 65 ? 0.9 : hue >= 145 ? 0.79 : 0.64;
  const lightness = Math.abs(a.l - b.l);
  if (lightness >= 0.18 && lightness <= 0.7) score += 0.06;
  if (!a.neutral && !b.neutral && a.s > 0.65 && b.s > 0.65 && hue > 70) score -= 0.12;
  if (a.temperature !== 'neutral' && b.temperature !== 'neutral') score += a.temperature === b.temperature ? 0.035 : -0.02;
  return clamp(score);
}
function styles(item: RecommendationItem) {
  const tags = item.tags.map((value) => value.normalize('NFKC').toLowerCase());
  return Object.keys(styleAliases).filter((style) => tags.some((tag) => styleAliases[style]!.some((alias) => tag.includes(alias))));
}
function materialScore(item: RecommendationItem, season: string) {
  const value = item.material?.toLowerCase() ?? '';
  if (!value) return 0.6;
  const warm = /울|wool|다운|down|플리스|fleece|캐시미어|cashmere/.test(value);
  const light = /린넨|리넨|linen|메시|mesh/.test(value);
  return season === 'summer' && warm ? 0.25 : season === 'winter' && light && item.slot !== 'accessory' ? 0.4 : 0.85;
}
export function evaluateOutfit(items: Partial<Record<RecommendationSlot, RecommendationItem>>, options: Pick<RecommendationOptions, 'season' | 'style' | 'seed' | 'occasion'>): RecommendedOutfit {
  const entries = recommendationSlots.flatMap((slot) => items[slot] ? [{ slot, item: items[slot]!, colors: itemColors(items[slot]!) }] : []);
  let weighted = 0; let totalWeight = 0;
  for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
    const a = entries[i]!; const b = entries[j]!;
    if (!a.colors.length || !b.colors.length) continue;
    let sum = 0; let sumWeights = 0;
    for (let x = 0; x < a.colors.length; x++) for (let y = 0; y < b.colors.length; y++) {
      const weight = (x === 0 ? 0.75 : 0.25 / Math.max(1, a.colors.length - 1)) * (y === 0 ? 0.75 : 0.25 / Math.max(1, b.colors.length - 1));
      sum += colorHarmony(a.colors[x]!, b.colors[y]!) * weight; sumWeights += weight;
    }
    const importance = slotWeight[a.slot] * slotWeight[b.slot]; weighted += sum / sumWeights * importance; totalWeight += importance;
  }
  const color = totalWeight ? weighted / totalWeight : 0.5;
  const knownColors = entries.filter((entry) => entry.colors.length).length;
  const coverage = entries.length ? knownColors / entries.length : 0;
  const season = entries.length ? entries.reduce((sum, { item }) => sum + (!options.season ? 0.8 : !item.seasons.length ? 0.6 : item.seasons.includes(options.season) ? 1 : 0), 0) / entries.length : 0;
  const tagged = entries.map(({ item }) => styles(item));
  const matches = tagged.filter((tags) => tags.includes(options.style)).length;
  const commonStyle = Object.keys(styleAliases).map((style) => tagged.filter((tags) => tags.includes(style)).length);
  const style = entries.length ? options.style ? tagged.reduce((sum, tags) => sum + (!tags.length ? 0.6 : tags.includes(options.style) ? 1 : 0.35), 0) / entries.length : Math.max(0.6, Math.max(0, ...commonStyle) / entries.length) : 0.6;
  const occasionMatches = entries.filter(({ item }) => item.tags.some((tag) => (occasionAliases[options.occasion ?? ''] ?? []).some((alias) => tag.normalize('NFKC').toLowerCase().includes(alias)))).length;
  const contextualStyle = options.occasion && options.occasion !== 'other' && entries.length ? style * 0.7 + (0.6 + 0.4 * occasionMatches / entries.length) * 0.3 : style;
  const material = entries.length ? entries.reduce((sum, { item }) => sum + materialScore(item, options.season), 0) / entries.length : 0.6;
  const signature = outfitSignature(items); const novelty = stableHash(signature + options.seed);
  const score = recommendationWeights.color * color + recommendationWeights.season * season + recommendationWeights.style * contextualStyle + recommendationWeights.material * material + recommendationWeights.novelty * novelty;
  const reasons = [knownColors ? `대표·보조 색이 입력된 ${knownColors}/${entries.length}개 의류의 색상각·명도·채도와 웜/쿨 성향을 비교했어요.` : '색상 정보가 없어 색상 점수는 기본값 50점으로 표시합니다. 의류 색을 입력하면 더 정교해져요.',
    options.season ? '선택한 계절에 맞는 옷을 우선하고 계절 미입력 항목은 별도로 고려했어요.' : '계절 제한 없이 보유 중인 의류를 조합했어요.',
    options.style && matches ? `선택한 스타일 태그가 ${matches}개 의류에 포함되어 있어요.` : tagged.every((value) => !value.length) ? '스타일 태그가 없어 스타일 일치 평가는 중립값으로 반영했어요.' : '의류의 스타일 태그와 소재 정보를 함께 비교했어요.'];
  if (coverage < 1 && knownColors) reasons.push('색상 미입력 의류가 있어 색상 점수는 일부 의류만 반영합니다.');
  if (entries.some(({ item }) => !item.material)) reasons.push('일부 소재 정보가 없어 해당 항목은 중립값으로 반영했어요.');
  if (options.occasion && options.occasion !== 'other') reasons.push(occasionMatches ? `선택한 상황과 연관된 태그가 ${occasionMatches}개 의류에 있어요.` : '상황과 연관된 의류 태그가 없어 상황 평가는 중립값으로 반영했어요.');
  return { items, signature, score: Math.round(clamp(score) * 100), colorScore: Math.round(color * 100), colorCoverage: coverage, reasons };
}
export function outfitSimilarity(a: RecommendedOutfit, b: RecommendedOutfit, locks: RecommendationOptions['locks']) {
  let shared = 0; let total = 0;
  for (const slot of recommendationSlots) {
    if (locks[slot] || (!a.items[slot] && !b.items[slot])) continue;
    const weight = slotWeight[slot]; total += weight;
    if (a.items[slot]?.id === b.items[slot]?.id) shared += weight;
  }
  return total ? shared / total : 1;
}
export function recommendOutfits(inventory: readonly RecommendationItem[], owner: string, options: RecommendationOptions) {
  const worn = new Set(options.excludeWorn ? options.wornIds ?? [] : []);
  const eligible = inventory.filter((item) => item.user_id === owner && item.lifecycle_status === 'active' && !item.deleted_at && !worn.has(item.id) && recommendationSlots.includes(item.slot) && (!options.season || !item.seasons.length || item.seasons.includes(options.season)));
  const groups = Object.fromEntries(recommendationSlots.map((slot) => [slot, eligible.filter((item) => item.slot === slot)])) as Record<RecommendationSlot, RecommendationItem[]>;
  for (const slot of recommendationSlots) if (options.locks[slot] && !groups[slot].some((item) => item.id === options.locks[slot])) throw new Error('invalid_lock');
  const missing = recommendationSlots.filter((slot) => !groups[slot].length);
  if (!groups.top.length || !groups.bottom.length) return { outfits: [] as RecommendedOutfit[], missing, exhausted: false };
  let beam: RecommendedOutfit[] = [evaluateOutfit({}, options)];
  for (const slot of ['top', 'bottom', 'outerwear', 'shoes', 'bag', 'accessory'] as const) {
    let choices = options.locks[slot] ? groups[slot].filter((item) => item.id === options.locks[slot]) : groups[slot];
    if (slot === 'outerwear' && !options.includeOuterwear && !options.locks[slot]) choices = [];
    if (!choices.length) continue;
    choices = [...choices].sort((a, b) => stableHash(b.id + options.seed) - stableHash(a.id + options.seed)).slice(0, 16);
    const next = beam.flatMap((candidate) => choices.filter((item) => !Object.values(candidate.items).some((entry) => entry?.id === item.id)).map((item) => evaluateOutfit({ ...candidate.items, [slot]: item }, options)));
    beam = next.sort((a, b) => b.score - a.score || a.signature.localeCompare(b.signature)).slice(0, 96);
  }
  const excluded = new Set(options.excluded ?? []);
  const pool = [...new Map(beam.filter((outfit) => !excluded.has(outfit.signature)).map((outfit) => [outfit.signature, outfit])).values()];
  const result: RecommendedOutfit[] = [];
  const count = Math.max(3, Math.min(5, Math.floor(options.count) || 4));
  const diversityScore = (candidate: RecommendedOutfit) => candidate.score - 24 * Math.max(0, ...result.map((picked) => outfitSimilarity(candidate, picked, options.locks)));
  while (result.length < count && pool.length) {
    pool.sort((a, b) => diversityScore(b) - diversityScore(a));
    result.push(pool.shift()!);
  }
  return { outfits: result, missing, exhausted: !result.length && excluded.size > 0 };
}
