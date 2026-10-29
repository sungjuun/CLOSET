import { z } from 'zod';
import { privateQueryKey } from '../../lib/query/keys';
import type { Category } from '../wardrobe/types';

export const categoryRoots = ['outerwear', 'tops', 'bottoms', 'shoes', 'bags', 'accessories'] as const;
// Keep legacy identifiers in storage for existing garments/outfits, but no
// longer offer this clothing type in management or new registrations.
export const isRetiredCategory = (row: Pick<Category, 'slug' | 'parent_slug'>) => row.slug === 'onepiece' || row.parent_slug === 'onepiece';
export const categoryNameSchema = z.string().trim().min(1, '카테고리 이름을 입력해 주세요.').max(80, '이름은 80자 이하로 입력해 주세요.');
export const memberCategorySchema = z.object({
  slug: z.string().min(1).max(80), parent_slug: z.string().nullable(), label_ko: categoryNameSchema,
  position: z.number().int(), is_active: z.boolean(), is_custom: z.boolean(), updated_at: z.string().min(1),
});
export type MemberCategory = z.infer<typeof memberCategorySchema>;
export const deletedCategorySchema = z.object({ category_slug: z.string(), parent_slug: z.string(), target_slug: z.string(), moved_items: z.number().int().nonnegative(), deleted_at: z.string() });
export function duplicateCategory(categories: readonly MemberCategory[], source: MemberCategory, name: string) {
  const title = name.trim().toLowerCase();
  return categories.find((row) => row.slug !== source.slug && row.parent_slug === source.parent_slug && row.label_ko.trim().toLowerCase() === title);
}
export const categoryListKey = (owner: string) => privateQueryKey(owner, 'categories', { kind: 'list' });
export const customCategorySlug = (id: string) => `u_${z.uuid().parse(id)}`;
// Retain the original category while editing an existing garment, even if hidden.
export function registrationCategories(categories: readonly Category[], retainedSlug?: string): Category[] {
  const retained = categories.find((row) => row.slug === retainedSlug);
  return categories.filter((row) => row.slug === retained?.slug || row.slug === retained?.parent_slug ||
    (!isRetiredCategory(row) && row.is_active && (!row.parent_slug || categories.some((parent) => parent.slug === row.parent_slug && parent.is_active))));
}
// The RPC compares/reorders every sibling. Preserve retired rows in their
// original positions while applying a drag order to the visible rows only.
export function completeCategoryOrder(siblings: readonly Category[], expected: readonly string[], order: readonly string[]): string[] | null {
  const visible = siblings.filter((row) => !isRetiredCategory(row)).map((row) => row.slug);
  if (visible.length !== expected.length || visible.some((slug, index) => slug !== expected[index]) ||
    order.length !== visible.length || new Set(order).size !== visible.length || order.some((slug) => !visible.includes(slug))) return null;
  let index = 0;
  return siblings.map((row) => isRetiredCategory(row) ? row.slug : order[index++]!);
}
export function categoryErrorMessage(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
  if (code === '23505') return '이 옷 종류에 같은 이름의 분류가 있어요. 다른 이름을 입력해 주세요.';
  if (code === '40001') return '다른 곳에서 카테고리를 변경했어요. 입력을 취소해 최신 내용으로 다시 편집해 주세요.';
  if (code === '55P03') return '이 분류의 옷을 다른 곳에서 수정 중이에요. 잠시 후 다시 시도해 주세요.';
  if (code === 'P0002') return '이미 삭제한 분류입니다. 목록을 새로고침해 주세요.';
  if (code === 'session_changed' || code === '42501') return '로그인 상태가 바뀌었어요. 다시 로그인해 주세요.';
  return '카테고리를 저장하지 못했어요. 입력은 유지됩니다. 연결을 확인하고 다시 시도해 주세요.';
}
