import { z } from 'zod';
import { privateQueryKey, privateQueryPrefix } from '../../lib/query/keys';

export const maxWearItems = 50;
export const wearPageSize = 20;
// Calendar dates stay as YYYY-MM-DD. Never round-trip them through local time.
export const wearDateSchema = z.iso.date().refine((value) => value >= '1900-01-01', '1900년 이후 날짜를 입력해 주세요.');
const fields = { wornOn: wearDateSchema, memo: z.string().trim().max(5000, '메모는 5000자 이하로 입력해 주세요.') };
export const wearRecordSchema = z.discriminatedUnion('kind', [
  z.object({ ...fields, kind: z.literal('outfit'), outfitId: z.uuid(), outfitVersion: z.iso.datetime({ offset: true }) }),
  z.object({ ...fields, kind: z.literal('items'), itemIds: z.array(z.uuid().transform((id) => id.toLowerCase())).min(1, '옷을 최소 1개 선택해 주세요.').max(maxWearItems).refine((ids) => new Set(ids).size === ids.length, '같은 옷을 중복으로 기록할 수 없습니다.').transform((ids) => [...ids].sort()) }),
]);
export type WearRecordInput = z.input<typeof wearRecordSchema>;
export const wearEditSchema = z.discriminatedUnion('kind', [...wearRecordSchema.options, z.object({ ...fields, kind: z.literal('keep') })]);
export type WearEditInput = z.input<typeof wearEditSchema>;
export function wearEditArgs(id: string, expected: string, input: WearEditInput) {
  z.uuid().parse(id); z.iso.datetime({ offset: true }).parse(expected);
  const value = wearEditSchema.parse(input);
  return value.kind === 'keep'
    ? { p_id: id, p_expected: expected, p_worn_on: value.wornOn, p_memo: value.memo, p_mode: 'keep' }
    : { ...wearRecordArgs(id, value), p_expected: expected, p_mode: value.kind };
}
export const wearRangeSchema = z.object({ start: wearDateSchema, end: wearDateSchema })
  .refine((range) => range.start <= range.end, '시작일이 종료일보다 늦습니다.')
  .refine((range) => (Date.parse(`${range.end}T00:00:00Z`) - Date.parse(`${range.start}T00:00:00Z`)) / 86_400_000 < 366, '한 번에 최대 366일을 조회할 수 있습니다.');
export type WearRange = z.infer<typeof wearRangeSchema>;
export function wearRecordArgs(id: string, input: WearRecordInput) {
  z.uuid().parse(id);
  const value = wearRecordSchema.parse(input);
  const base = { p_id: id, p_worn_on: value.wornOn, p_memo: value.memo };
  return value.kind === 'outfit'
    ? { ...base, p_outfit: value.outfitId, p_outfit_expected: value.outfitVersion }
    : { ...base, p_items: value.itemIds };
}
export const wearKeys = {
  root: (owner: string) => privateQueryPrefix(owner, 'wear'),
  item: (owner: string, id: string) => privateQueryKey(owner, 'wear', { kind: 'detail', id }),
  list: (owner: string, page: number, range: WearRange) => privateQueryKey(owner, 'wear', { kind: 'range', page, ...wearRangeSchema.parse(range) }),
  counts: (owner: string, range: WearRange) => privateQueryKey(owner, 'wear', { kind: 'counts', ...wearRangeSchema.parse(range) }),
};
export class WearError extends Error {
  constructor(public readonly code: string) { super(code); }
}
export function wearErrorMessage(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  switch (code) {
    case 'session_changed': case '42501': return '로그인 상태가 바뀌었습니다. 다시 로그인해 주세요.';
    case 'P0002': return '선택한 코디나 기록을 찾을 수 없거나 접근할 수 없습니다.';
    case 'P0003': return '사용할 수 없는 옷이 포함되어 있습니다. 보관·판매·기부·휴지통 상태를 확인해 주세요.';
    case '40001': return '코디나 기록 요청이 변경되었습니다. 입력을 유지했어요. 최신 내용을 확인해 주세요.';
    case 'selection_required': return '기록할 코디나 옷을 선택해 주세요.';
    case '22023': case '22007': case '22008': case '22P02': case '23514': return '날짜·메모·선택한 옷을 확인해 주세요.';
    default: return '착용 기록을 확인하지 못했습니다. 입력을 유지했어요. 연결을 확인한 뒤 같은 요청으로 다시 시도해 주세요.';
  }
}
