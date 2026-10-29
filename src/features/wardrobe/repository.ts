import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, TablesInsert, TablesUpdate } from '@/types/database.generated';
import type { WardrobeInput } from './schemas';
import { WardrobeError } from './errors';
import { wardrobePageSize } from './types';
import { defaultFilters, listFiltersSchema, type WardrobeFilters } from './filters';
import { editableFields } from './editing';
import { z } from 'zod';
import { readMemberCategories } from '../categories/service';

// No platform, React, or session storage imports: usable in live integration tests.
export function createWardrobeRepository(client: SupabaseClient<Database>, owner: string) {
  if (!owner.trim()) throw new WardrobeError('session_changed');
  async function get(id: string, signal?: AbortSignal) {
    let query = client.from('wardrobe_items').select('*').eq('user_id', owner).eq('id', id).is('deleted_at', null);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data;
  }
  async function patch(id: string, expected: string, changes: TablesUpdate<'wardrobe_items'>, mode: 'edit' | 'delete' | 'restore', signal?: AbortSignal) {
    const session = await client.auth.getSession();
    if (session.error || session.data.session?.user.id !== owner || signal?.aborted) throw new WardrobeError('session_changed');
    if (!expected) throw new WardrobeError('conflict');
    let request = client.from('wardrobe_items').update(changes).eq('id', id).eq('user_id', owner).eq('updated_at', expected);
    request = mode === 'restore' ? request.not('deleted_at', 'is', null) : request.is('deleted_at', null);
    if (signal) request = request.abortSignal(signal);
    const result = await request.select('*').maybeSingle();
    if (result.error) throw result.error;
    if (result.data) return result.data;
    let read = client.from('wardrobe_items').select('*').eq('id', id).eq('user_id', owner);
    if (signal) read = read.abortSignal(signal);
    const current = await read.maybeSingle();
    if (current.error) throw current.error;
    if (!current.data) throw new WardrobeError('item_unavailable');
    // Retry after a committed response was lost: accept only the already-applied
    // desired result, without touching newer fields or changing deletion dates.
    if (mode === 'delete' && current.data.deleted_at !== null) return current.data;
    if (mode === 'edit' && current.data.deleted_at !== null) throw new WardrobeError('item_unavailable');
    if (Object.entries(changes).every(([key, value]) => JSON.stringify(current.data![key as keyof typeof current.data]) === JSON.stringify(value))) return current.data;
    throw new WardrobeError('conflict');
  }
  return {
    get,
    async update(id: string, expected: string, input: WardrobeInput, signal?: AbortSignal) {
      return patch(id, expected, editableFields(input), 'edit', signal);
    },
    async setFavorite(id: string, expected: string, value: boolean, signal?: AbortSignal) {
      return patch(id, expected, { is_favorite: value }, 'edit', signal);
    },
    async setStatus(id: string, expected: string, status: string, signal?: AbortSignal) {
      const valid = z.enum(['active', 'archived', 'sold', 'donated']).parse(status);
      return patch(id, expected, { lifecycle_status: valid }, 'edit', signal);
    },
    async softDelete(id: string, expected: string, signal?: AbortSignal) {
      return patch(id, expected, { deleted_at: new Date().toISOString() }, 'delete', signal);
    },
    async restore(id: string, expected: string, signal?: AbortSignal) {
      return patch(id, expected, { deleted_at: null }, 'restore', signal);
    },
    async usage(id: string, signal?: AbortSignal) {
      let request = client.rpc('wardrobe_item_usage', { p_owner: owner, p_item: id });
      if (signal) request = request.abortSignal(signal);
      const result = await request.single();
      if (result.error) throw result.error;
      return result.data;
    },
    async trash(page: number, signal?: AbortSignal) {
      if (!Number.isSafeInteger(page) || page < 0) throw new WardrobeError('invalid_page');
      let request = client.from('wardrobe_items').select('*', { count: 'exact' }).eq('user_id', owner)
        .not('deleted_at', 'is', null).order('deleted_at', { ascending: false }).order('id', { ascending: false })
        .range(page * wardrobePageSize, (page + 1) * wardrobePageSize - 1);
      if (signal) request = request.abortSignal(signal);
      const result = await request;
      if (result.error?.code === 'PGRST103') {
        let recount = client.from('wardrobe_items').select('id', { count: 'exact', head: true }).eq('user_id', owner).not('deleted_at', 'is', null);
        if (signal) recount = recount.abortSignal(signal);
        const current = await recount;
        if (current.error) throw current.error;
        return { items: [], total: current.count ?? 0 };
      }
      if (result.error) throw result.error;
      return { items: result.data, total: result.count ?? 0 };
    },
    categories: (signal?: AbortSignal) => readMemberCategories(client, owner, signal),
    async filterOptions(signal?: AbortSignal) {
      let query = client.rpc('wardrobe_filter_options', { p_owner: owner });
      if (signal) query = query.abortSignal(signal);
      const { data, error } = await query.single();
      if (error) throw error;
      return data;
    },
    async list(page: number, signal?: AbortSignal, filters: WardrobeFilters = defaultFilters) {
      if (!Number.isSafeInteger(page) || page < 0 || page >= Number.MAX_SAFE_INTEGER / wardrobePageSize - 1) throw new WardrobeError('invalid_page');
      const values = listFiltersSchema.parse(filters);
      const args = { p_owner: owner, p_search: values.search, p_category: values.category, p_brand: values.brand, p_color: values.color, p_season: values.season, p_favorite_only: values.favoriteOnly, p_status: values.status, p_sort: values.sort };
      let query = client.rpc('search_wardrobe_items', args, { count: 'exact' })
        .range(page * wardrobePageSize, (page + 1) * wardrobePageSize - 1);
      if (signal) query = query.abortSignal(signal);
      const { data, count, error } = await query;
      if (error?.code === 'PGRST103') {
        // A different device may have removed the last page. Return the current
        // count so the screen can clamp its page without discarding filters.
        let recount = client.rpc('search_wardrobe_items', args, { count: 'exact', head: true });
        if (signal) recount = recount.abortSignal(signal);
        const result = await recount;
        if (result.error) throw result.error;
        return { items: [], total: result.count ?? 0 };
      }
      if (error) throw error;
      return { items: data, total: count ?? 0 };
    },
    async create(id: string, input: WardrobeInput, signal?: AbortSignal) {
      // Whitelist fields. A form cannot supply owner, timestamps, lifecycle or ID.
      const payload: TablesInsert<'wardrobe_items'> = {
        id, user_id: owner, name: input.name, category_slug: input.category_slug,
        brand_id: input.brand_id, ...(!input.brand_id ? { brand_name: input.brand_name } : {}), color_name: input.color_name, color_hex: input.color_hex,
        size_label: input.size_label, material: input.material, seasons: input.seasons, tags: input.tags,
        purchase_price: input.purchase_price, currency: input.currency, purchased_on: input.purchased_on,
        purchase_url: input.purchase_url, notes: input.notes,
      };
      let query = client.from('wardrobe_items').insert(payload).select('*');
      if (signal) query = query.abortSignal(signal);
      const { data, error } = await query.single();
      if (!error) return data;
      if (error.code === '23505') {
        // A response can be lost after commit. Retrying the SAME ID and content
        // returns the existing row, never inserts a second item or overwrites it.
        const existing = await get(id, signal);
        if (existing && Object.entries(payload).every(([key, value]) => JSON.stringify(existing[key as keyof typeof existing]) === JSON.stringify(value))) return existing;
        throw new WardrobeError('duplicate_request');
      }
      throw error;
    },
  };
}
