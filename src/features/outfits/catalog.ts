import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '@/types/database.generated';
import { seasons } from '../wardrobe/types';

export const outfitPageSize = 12;
export const outfitCatalogFiltersSchema = z.object({ search: z.string().trim().max(200), season: z.enum(['', ...seasons]), sort: z.enum(['recent', 'oldest', 'name']) });
export type OutfitCatalogFilters = z.infer<typeof outfitCatalogFiltersSchema>;
export const defaultOutfitCatalogFilters: OutfitCatalogFilters = { search: '', season: '', sort: 'recent' };

// Quote the entire PostgREST operand and escape LIKE wildcards as literals.
function searchOperand(value: string) {
  const pattern = `%${value.replace(/[\\%_]/g, '\\$&')}%`;
  return `"${pattern.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function createOutfitCatalog(client: SupabaseClient<Database>, owner: string) {
  if (!owner.trim()) throw new Error('로그인이 필요합니다.');
  return {
    async list(page: number, input: OutfitCatalogFilters, signal?: AbortSignal) {
      if (!Number.isSafeInteger(page) || page < 0 || page >= Number.MAX_SAFE_INTEGER / outfitPageSize - 1) throw new Error('잘못된 페이지입니다.');
      const filters = outfitCatalogFiltersSchema.parse(input);
      function request(head = false) {
        let query = client.from('outfits').select('*, outfit_items(*, item:wardrobe_items!outfit_items_item_id_user_id_fkey(*))', { count: 'exact', head }).eq('user_id', owner).is('deleted_at', null);
        if (filters.season) query = query.contains('seasons', [filters.season]);
        if (filters.search) {
          const term = searchOperand(filters.search);
          query = query.or(`name.ilike.${term},memo.ilike.${term}`);
        }
        query = filters.sort === 'name' ? query.order('name').order('id') : query.order('created_at', { ascending: filters.sort === 'oldest' }).order('id', { ascending: filters.sort === 'oldest' });
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
