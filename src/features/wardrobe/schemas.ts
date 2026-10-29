import { z } from 'zod';
import { seasons, type WardrobeDraft } from './types';

const optionalText = (max: number) => z.string().trim().max(max, `${max}자 이하로 입력해 주세요.`).transform((value) => value || null);
export const httpsUrl = z.string().trim().max(2048, '주소는 2048자 이하로 입력해 주세요.').refine((value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !/\s/.test(value);
  } catch { return false; }
}, '공백이나 계정 정보가 없는 HTTPS 주소를 입력해 주세요.').transform((value) => value || null);

export const wardrobeDraftSchema = z.object({
  name: z.string().trim().min(1, '제품명을 입력해 주세요.').max(200, '제품명은 200자 이하로 입력해 주세요.'),
  category_slug: z.string().min(1, '옷 종류를 선택해 주세요.').max(80),
  brand_name: optionalText(120), brand_id: z.union([z.literal(''), z.uuid('브랜드를 다시 선택해 주세요.')]).default('').transform((value) => value || null), color_name: optionalText(60),
  color_hex: optionalText(7).refine((value) => value === null || /^#[0-9A-Fa-f]{6}$/.test(value), '#RRGGBB 형식으로 입력해 주세요.'),
  size_label: optionalText(60), material: optionalText(200),
  seasons: z.array(z.enum(seasons, '계절을 확인해 주세요.')).max(4).transform((values) => [...new Set(values)]),
  tags: z.string().transform((value) => [...new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean))]).pipe(z.array(z.string().max(40, '태그 하나는 40자 이하로 입력해 주세요.')).max(20, '태그는 20개까지 입력할 수 있습니다.')),
  purchase_price: z.string().trim().refine((value) => !value || /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value), '구매가는 0 이상의 숫자와 소수 둘째 자리까지 입력해 주세요.')
    .transform((value) => value ? Number(value.replaceAll(',', '')) : null)
    .refine((value) => value === null || (Number.isFinite(value) && value <= 9999999999.99), '구매가는 9,999,999,999.99 이하로 입력해 주세요.'),
  currency: z.literal('KRW', { error: '가격은 원화(KRW)만 사용할 수 있어요.' }).default('KRW'),
  purchased_on: z.string().trim().refine((value) => !value || z.iso.date().safeParse(value).success, '실제 날짜를 YYYY-MM-DD 형식으로 입력해 주세요.').transform((value) => value || null),
  purchase_url: httpsUrl, notes: optionalText(5000),
});

export type WardrobeInput = z.output<typeof wardrobeDraftSchema>;
export type DraftErrors = Partial<Record<keyof WardrobeDraft, string>>;

export function draftErrors(error: z.ZodError): DraftErrors {
  const result: DraftErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as keyof WardrobeDraft;
    if (key && !result[key]) result[key] = issue.message;
  }
  return result;
}
