import { z } from 'zod';
import { seasons } from './types';

export const sortOptions = [
  { value: 'recent', label: '최근 등록순' },
  { value: 'oldest', label: '오래된 등록순' },
  { value: 'name', label: '이름순' },
  { value: 'brand', label: '브랜드순' },
  { value: 'price_asc', label: '구매가 낮은순 · 통화별' },
  { value: 'price_desc', label: '구매가 높은순 · 통화별' },
] as const;

export const listFiltersSchema = z.object({
  search: z.string().trim().max(200),
  category: z.string().max(80),
  brand: z.string().max(120),
  color: z.string().max(60),
  season: z.enum(['', ...seasons]),
  favoriteOnly: z.boolean(),
  status: z.enum(['', 'active', 'archived', 'sold', 'donated']),
  sort: z.enum(['recent', 'oldest', 'name', 'brand', 'price_asc', 'price_desc']),
});
export type WardrobeFilters = z.infer<typeof listFiltersSchema>;
export const defaultFilters: WardrobeFilters = { search: '', category: '', brand: '', color: '', season: '', favoriteOnly: false, status: '', sort: 'recent' };

export function hasFilters(filters: WardrobeFilters) {
  return Boolean(filters.search || filters.category || filters.brand || filters.color || filters.season || filters.favoriteOnly || filters.status);
}

export type ListState = { page: number; filters: WardrobeFilters };
export function changeFilters(state: ListState, patch: Partial<WardrobeFilters>): ListState {
  return { page: 0, filters: listFiltersSchema.parse({ ...state.filters, ...patch }) };
}
