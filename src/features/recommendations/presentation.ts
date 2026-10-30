import { occasionOptions, styleOptions, type RecommendationOptions, type RecommendedOutfit } from './engine';
import { seasonLabels } from '../wardrobe/types';
import { wearDateSchema } from '../wear/model';

export function recentWearRange(today: string) {
  wearDateSchema.parse(today);
  const start = new Date(`${today}T00:00:00Z`); start.setUTCDate(start.getUTCDate() - 29);
  return { start: start.toISOString().slice(0, 10), end: today };
}
export function recommendationFilterKey(options: RecommendationOptions) {
  return JSON.stringify([options.occasion ?? '', options.style, options.season, options.count, options.includeOuterwear, Boolean(options.excludeWorn), Object.entries(options.locks).sort(([a], [b]) => a.localeCompare(b))]);
}
export function recommendationPresentation(outfit: RecommendedOutfit, options: RecommendationOptions) {
  const style = styleOptions.find((value) => value.value === options.style)?.label ?? '전체';
  const occasion = occasionOptions.find((value) => value.value === options.occasion)?.label ?? '일상';
  const season = seasonLabels[options.season as keyof typeof seasonLabels];
  const prefix = options.style ? style : '나만의';
  const title = `${prefix} ${occasion === '일상' ? '데일리룩' : `${occasion} 코디`}`;
  const count = Object.values(outfit.items).length;
  const description = `내 옷장의 ${count}개 아이템으로 완성한 조합이에요. ${outfit.colorCoverage === 0 ? '계절·소재와 입력된 태그를 함께 고려했어요.' : `입력된 색상 정보로 비교한 색상 조화 점수는 ${outfit.colorScore}점이에요.`}`;
  return { title, description, tags: [...new Set([options.style ? style : '내옷장', occasion, season, options.excludeWorn ? '새로운조합' : '보유아이템'].filter((value): value is string => Boolean(value)))] };
}
