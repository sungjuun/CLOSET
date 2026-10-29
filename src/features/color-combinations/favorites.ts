import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '../../types/database.generated';
import { privateQueryKey } from '../../lib/query/keys';
import { colorIdSchema, pairSchema, type ColorPair } from './finder';

const favoriteSchema = z.object({ user_id: z.uuid(), top_color: colorIdSchema, bottom_color: colorIdSchema, created_at: z.iso.datetime({ offset: true }) });
export const favoriteKey = (owner: string) => privateQueryKey(owner, 'color-combinations', { kind: 'favorites' });

export function createColorFavorites(sessionClient: SupabaseClient<Database>, owner: string, connection: { url: string; key: string }, transport: typeof fetch = fetch) {
  async function bound(signal: AbortSignal) {
    const { data, error } = await sessionClient.auth.getSession();
    if (error || !data.session || data.session.user.id !== owner || signal.aborted) throw new Error('session_changed');
    const token = data.session.access_token;
    return createClient<Database>(connection.url, connection.key, { accessToken: async () => token, db: { retry: false }, global: { fetch: (input, init) => transport(input, { ...init, signal }) } });
  }
  function parse(row: unknown): ColorPair {
    const value = favoriteSchema.parse(row);
    if (value.user_id !== owner) throw new Error('session_changed');
    return { top: value.top_color, bottom: value.bottom_color };
  }
  return {
    async list(signal: AbortSignal): Promise<ColorPair[]> {
      const client = await bound(signal); const values: ColorPair[] = [];
      for (let offset = 0; ; offset += 200) {
        const result = await client.from('color_pair_favorites').select('user_id,top_color,bottom_color,created_at').eq('user_id', owner).order('created_at', { ascending: false }).order('top_color').order('bottom_color').range(offset, offset + 199).abortSignal(signal);
        if (result.error) throw result.error;
        values.push(...result.data.map(parse));
        if (result.data.length < 200) return values;
      }
    },
    async set(input: ColorPair, saved: boolean, signal: AbortSignal) {
      const pair = pairSchema.parse(input); const client = await bound(signal);
      if (saved) {
        const result = await client.from('color_pair_favorites').insert({ user_id: owner, top_color: pair.top, bottom_color: pair.bottom });
        if (result.error && result.error.code !== '23505') throw result.error;
        // A duplicate insert is an idempotent retry, but still confirm the owned row.
        const confirmed = await client.from('color_pair_favorites').select('user_id,top_color,bottom_color,created_at').eq('user_id', owner).eq('top_color', pair.top).eq('bottom_color', pair.bottom).abortSignal(signal).single();
        if (confirmed.error) throw confirmed.error;
        parse(confirmed.data);
      } else {
        const result = await client.from('color_pair_favorites').delete().eq('user_id', owner).eq('top_color', pair.top).eq('bottom_color', pair.bottom).abortSignal(signal);
        if (result.error) throw result.error;
      }
      return { pair, saved };
    },
  };
}
