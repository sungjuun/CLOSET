import { z } from 'zod';
import type { Tables } from '../../types/database.generated';

export type Brand = Tables<'brands'>;
export const brandNameSchema = z.string().trim().min(1, '브랜드명을 입력해 주세요.').max(120, '브랜드명은 120자 이하로 입력해 주세요.');
export function brandErrorMessage(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code === '23505') return '같은 이름의 브랜드가 있습니다. 목록에서 선택해 주세요.';
  if (code === '40001') return '다른 곳에서 브랜드가 변경됐습니다. 새로고침 후 다시 선택해 주세요.';
  if (code === '42501' || code === 'session_changed') return '로그인 상태가 바뀌었습니다. 다시 로그인해 주세요.';
  if (code === '22023' || code === '23514') return '브랜드명과 업로드한 이미지를 확인해 주세요.';
  return '브랜드 작업을 완료하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.';
}
export function filterBrands(brands: readonly Brand[], search: string) {
  const term = search.trim().toLocaleLowerCase();
  return brands.filter((brand) => brand.name.toLocaleLowerCase().includes(term));
}
