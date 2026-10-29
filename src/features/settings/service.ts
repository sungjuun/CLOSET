import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '../../types/database.generated';
import { themeNames, type ThemeName } from '../../theme/tokens';

const themeSchema = z.enum(themeNames);
const profileSchema = z.object({ id: z.uuid(), theme: themeSchema });

export function createThemeService(sessionClient: SupabaseClient<Database>, owner: string, connection: { url: string; key: string }, transport: typeof fetch = fetch) {
  async function bound(signal: AbortSignal) {
    const { data, error } = await sessionClient.auth.getSession();
    if (error || !data.session || data.session.user.id !== owner || signal.aborted) throw new Error('session_changed');
    const token = data.session.access_token;
    return createClient<Database>(connection.url, connection.key, {
      accessToken: async () => token, db: { retry: false },
      global: { fetch: (input, init) => transport(input, { ...init, signal }) },
    });
  }
  function themeOf(row: unknown) {
    const parsed = profileSchema.parse(row);
    if (parsed.id !== owner) throw new Error('session_changed');
    return parsed.theme;
  }
  return {
    async load(signal: AbortSignal): Promise<ThemeName> {
      const client = await bound(signal);
      const result = await client.from('profiles').select('id,theme').eq('id', owner).abortSignal(signal).single();
      if (result.error) throw result.error;
      return themeOf(result.data);
    },
    async save(theme: ThemeName, signal: AbortSignal): Promise<ThemeName> {
      const value = themeSchema.parse(theme);
      const client = await bound(signal);
      const result = await client.from('profiles').update({ theme: value }).eq('id', owner).select('id,theme').abortSignal(signal).single();
      if (result.error) throw result.error;
      return themeOf(result.data);
    },
  };
}
