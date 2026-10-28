import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '../../types/database.generated';
import { WearError, maxWearItems, wearEditArgs, wearPageSize, wearRangeSchema, wearRecordArgs, type WearEditInput, type WearRange, type WearRecordInput } from './model';

const selection = '*, wear_event_items(*, item:wardrobe_items!wear_event_items_item_id_user_id_fkey(*))' as const;

export function createWearRepository(sessionClient: SupabaseClient<Database>, owner: string, connection: { url: string; key: string }, transport: typeof fetch = fetch) {
  if (!owner.trim()) throw new WearError('session_changed');
  async function bound(signal?: AbortSignal) {
    const { data, error } = await sessionClient.auth.getSession();
    if (error || !data.session || data.session.user.id !== owner || signal?.aborted) throw new WearError('session_changed');
    const token = data.session.access_token;
    return createClient<Database>(connection.url, connection.key, { accessToken: async () => token, db: { retry: false }, global: { fetch: (input, init) => transport(input, { ...init, ...(signal ? { signal } : {}) }) } });
  }
  return {
    async update(id: string, expected: string, input: WearEditInput, signal?: AbortSignal) {
      const args = wearEditArgs(id, expected, input);
      const client = await bound(signal);
      const result = await client.rpc('update_wear_event', args);
      if (result.error) throw result.error;
      return result.data;
    },
    async remove(id: string, expected: string, signal?: AbortSignal) {
      z.uuid().parse(id); z.iso.datetime({ offset: true }).parse(expected);
      const client = await bound(signal);
      const result = await client.rpc('delete_wear_event', { p_id: id, p_expected: expected });
      if (result.error) throw result.error;
      return result.data;
    },
    async dayCounts(input: WearRange, signal?: AbortSignal) {
      const range = wearRangeSchema.parse(input);
      const client = await bound(signal);
      const result = await client.rpc('wear_day_counts', { p_owner: owner, p_start: range.start, p_end: range.end });
      if (result.error) throw result.error;
      return result.data;
    },
    async selectedItems(ids: string[], signal?: AbortSignal) {
      const valid = z.array(z.uuid()).max(maxWearItems).parse(ids);
      const client = await bound(signal);
      if (!valid.length) return [];
      const result = await client.from('wardrobe_items').select('*').eq('user_id', owner).in('id', [...new Set(valid)]);
      if (result.error) throw result.error;
      return result.data;
    },
    async record(id: string, input: WearRecordInput, signal?: AbortSignal) {
      const args = wearRecordArgs(id, input);
      const client = await bound(signal);
      const result = await client.rpc('record_wear_event', args);
      if (result.error) throw result.error;
      return result.data;
    },
    async get(id: string, signal?: AbortSignal) {
      z.uuid().parse(id);
      const client = await bound(signal);
      const result = await client.from('wear_events').select(selection).eq('id', id).eq('user_id', owner).is('deleted_at', null).maybeSingle();
      if (result.error) throw result.error;
      return result.data;
    },
    async list(page: number, input: WearRange, signal?: AbortSignal) {
      if (!Number.isSafeInteger(page) || page < 0 || page >= Number.MAX_SAFE_INTEGER / wearPageSize - 1) throw new WearError('invalid_page');
      const range = wearRangeSchema.parse(input);
      const client = await bound(signal);
      function request(head = false) {
        return client.from('wear_events').select(selection, { count: 'exact', head }).eq('user_id', owner)
          .is('deleted_at', null)
          .gte('worn_on', range.start).lte('worn_on', range.end)
          .order('worn_on', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: false });
      }
      const result = await request().range(page * wearPageSize, (page + 1) * wearPageSize - 1);
      if (result.error?.code === 'PGRST103') {
        const recount = await request(true);
        if (recount.error) throw recount.error;
        return { items: [], total: recount.count ?? 0 };
      }
      if (result.error) throw result.error;
      return { items: result.data, total: result.count ?? 0 };
    },
  };
}
export type SavedWearEvent = NonNullable<Awaited<ReturnType<ReturnType<typeof createWearRepository>['get']>>>;
