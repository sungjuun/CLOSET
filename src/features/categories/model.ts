import { z } from 'zod';
import { privateQueryKey } from '../../lib/query/keys';
import type { Category } from '../wardrobe/types';

export const categoryRoots = ['outerwear', 'tops', 'bottoms', 'onepiece', 'shoes', 'bags', 'accessories'] as const;
export const categoryNameSchema = z.string().trim().min(1, '카테고리 이름을 입력해 주세요.').max(80, '이름은 80자 이하로 입력해 주세요.');
export const memberCategorySchema = z.object({
  slug: z.string().min(1).max(80), parent_slug: z.string().nullable(), label_ko: categoryNameSchema,
  position: z.number().int(), is_active: z.boolean(), is_custom: z.boolean(), updated_at: z.string().min(1),
});
export type MemberCategory = z.infer<typeof memberCategorySchema>;
export const categoryListKey = (owner: string) => privateQueryKey(owner, 'categories', { kind: 'list' });
export const customCategorySlug = (id: string) => `u_${z.uuid().parse(id)}`;
// Retain the original category while editing an existing garment, even if hidden.
export function registrationCategories(categories: readonly Category[], retainedSlug?: string): Category[] {
  const retained = categories.find((row) => row.slug === retainedSlug);
  return categories.filter((row) => row.slug === retained?.slug || row.slug === retained?.parent_slug ||
    (row.is_active && (!row.parent_slug || categories.some((parent) => parent.slug === row.parent_slug && parent.is_active))));
}
export function movedCategoryOrder(siblings: readonly { slug: string }[], slug: string, direction: -1 | 1): string[] | null {
  const order = siblings.map((row) => row.slug);
  const index = order.indexOf(slug);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= order.length) return null;
  [order[index], order[next]] = [order[next]!, order[index]!];
  return order;
}
export function categoryErrorMessage(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
  if (code === '23505') return '이 옷 종류에 같은 이름의 분류가 있어요. 다른 이름을 입력해 주세요.';
  if (code === '40001') return '다른 곳에서 카테고리를 변경했어요. 입력을 취소해 최신 내용으로 다시 편집해 주세요.';
  if (code === 'session_changed' || code === '42501') return '로그인 상태가 바뀌었어요. 다시 로그인해 주세요.';
  return '카테고리를 저장하지 못했어요. 입력은 유지됩니다. 연결을 확인하고 다시 시도해 주세요.';
}
