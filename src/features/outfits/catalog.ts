import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '@/types/database.generated';
import { privateQueryKey, privateQueryPrefix } from '../../lib/query/keys';
import { seasons } from '../wardrobe/types';

export const outfitPageSize = 12;
export const outfitCatalogFiltersSchema = z.object({ search: z.string().trim().max(200), brand: z.string().max(120), tag: z.string().max(40), season: z.enum(['', ...seasons]), favoriteOnly: z.boolean(), sort: z.enum(['recent', 'updated', 'oldest', 'name']) });
export type OutfitCatalogFilters = z.infer<typeof outfitCatalogFiltersSchema>;
export const defaultOutfitCatalogFilters: OutfitCatalogFilters = { search: '', brand: '', tag: '', season: '', favoriteOnly: false, sort: 'recent' };

export function hasOutfitFilters(filters: OutfitCatalogFilters) {
  return Boolean(filters.search || filters.brand || filters.tag || filters.season || filters.favoriteOnly);
}
export function changeOutfitFilters(state: { page: number; filters: OutfitCatalogFilters }, patch: Partial<OutfitCatalogFilters>) {
  return { page: 0, filters: outfitCatalogFiltersSchema.parse({ ...state.filters, ...patch }) };
}
export const outfitCatalogKeys = {
  root: (owner: string) => privateQueryPrefix(owner, 'outfits'),
  list: (owner: string, page: number, filters: OutfitCatalogFilters) => privateQueryKey(owner, 'outfits', { kind: 'catalog', page, ...outfitCatalogFiltersSchema.parse(filters) }),
  options: (owner: string) => privateQueryKey(owner, 'outfits', { kind: 'filter-options' }),
};

export function createOutfitCatalog(client: SupabaseClient<Database>, owner: string) {
  if (!owner.trim()) throw new Error('로그인이 필요합니다.');
  return {
    async filterOptions(signal?: AbortSignal) {
      let query = client.rpc('outfit_filter_options', { p_owner: owner });
      if (signal) query = query.abortSignal(signal);
      const result = await query.single();
      if (result.error) throw result.error;
      return result.data;
    },
    async list(page: number, input: OutfitCatalogFilters, signal?: AbortSignal) {
      if (!Number.isSafeInteger(page) || page < 0 || page >= Number.MAX_SAFE_INTEGER / outfitPageSize - 1) throw new Error('잘못된 페이지입니다.');
      const filters = outfitCatalogFiltersSchema.parse(input);
      const args = { p_owner: owner, p_search: filters.search, p_brand: filters.brand, p_tag: filters.tag, p_season: filters.season, p_favorite_only: filters.favoriteOnly, p_sort: filters.sort };
      function request(head = false) {
        const query = client.rpc('search_outfits', args, { count: 'exact', head })
          .select('*, outfit_items(*, item:wardrobe_items!outfit_items_item_id_user_id_fkey(*))');
        return signal ? query.abortSignal(signal) : query;
      }
      let totalRequest = client.from('outfits').select('id', { count: 'exact', head: true }).eq('user_id', owner).is('deleted_at', null);
      if (signal) totalRequest = totalRequest.abortSignal(signal);
      const [result, total] = await Promise.all([request().range(page * outfitPageSize, (page + 1) * outfitPageSize - 1), totalRequest]);
      if (total.error) throw total.error;
      if (result.error?.code === 'PGRST103') {
        const recount = await request(true);
        if (recount.error) throw recount.error;
        return { items: [], total: recount.count ?? 0, allTotal: total.count ?? 0 };
      }
      if (result.error) throw result.error;
      return { items: result.data, total: result.count ?? 0, allTotal: total.count ?? 0 };
    },
  };
}
export type SavedOutfit = Awaited<ReturnType<ReturnType<typeof createOutfitCatalog>['list']>>['items'][number];
