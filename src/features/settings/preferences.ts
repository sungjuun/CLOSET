import { z } from 'zod';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../../types/database.generated';
import { privateQueryKey } from '../../lib/query/keys';

export const wardrobeSortSchema = z.enum(['recent', 'oldest', 'name', 'brand', 'price_asc', 'price_desc']);
export const outfitSortSchema = z.enum(['recent', 'updated', 'oldest', 'name']);
export const densitySchema = z.enum(['compact', 'standard', 'roomy']);
export type CardDensity = z.infer<typeof densitySchema>;
const fields = { display_name: z.string().trim().max(80).nullable(), wardrobe_sort: wardrobeSortSchema, outfit_sort: outfitSortSchema, card_density: densitySchema };
export const accountPreferencesSchema = z.object({ id: z.uuid(), ...fields });
export type AccountPreferences = z.infer<typeof accountPreferencesSchema>;
export const preferencesPatchSchema = z.object(fields).partial().strict().refine((patch) => Object.keys(patch).length > 0);
export type PreferencesPatch = z.infer<typeof preferencesPatchSchema>;
export const preferenceKey = (owner: string) => privateQueryKey(owner, 'profile', { kind: 'preferences' });

export function createAccountPreferencesService(sessionClient: SupabaseClient<Database>, owner: string, connection: { url: string; key: string }, transport: typeof fetch = fetch) {
  async function bound(signal: AbortSignal) {
    const { data, error } = await sessionClient.auth.getSession();
    if (error || !data.session || data.session.user.id !== owner || signal.aborted) throw { code: 'session_changed' };
    const token = data.session.access_token;
    return createClient<Database>(connection.url, connection.key, { accessToken: async () => token, db: { retry: false }, global: { fetch: (input, init) => transport(input, { ...init, signal }) } });
  }
  function parse(value: unknown) {
    const profile = accountPreferencesSchema.parse(value);
    if (profile.id !== owner) throw { code: 'session_changed' };
    return profile;
  }
  return {
    async load(signal: AbortSignal) {
      const client = await bound(signal);
      const result = await client.from('profiles').select('id,display_name,wardrobe_sort,outfit_sort,card_density').eq('id', owner).abortSignal(signal).single();
      if (result.error) throw result.error;
      return parse(result.data);
    },
    async save(input: PreferencesPatch, expected: AccountPreferences, signal: AbortSignal) {
      const patch = preferencesPatchSchema.parse(input);
      if (patch.display_name === '') patch.display_name = null;
      if (expected.id !== owner) throw { code: 'session_changed' };
      const previous = Object.fromEntries(Object.keys(patch).map((key) => [key, expected[key as keyof PreferencesPatch]]));
      const client = await bound(signal);
      const result = await client.rpc('save_account_preferences', { p_patch: patch as Json, p_expected: previous as Json });
      if (result.error) throw result.error;
      return parse(result.data);
    },
  };
}

export function preferenceErrorMessage(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
  if (code === '40001') return '다른 곳에서 같은 설정을 변경했어요. 최신 내용을 확인한 뒤 다시 저장해 주세요.';
  if (code === 'session_changed' || code === '42501') return '로그인 상태가 바뀌었어요. 다시 로그인해 주세요.';
  return '설정 저장 결과를 확인하지 못했어요. 연결을 확인하고 다시 불러와 주세요.';
}

export function preferenceColumns(kind: 'wardrobe' | 'outfits', width: number, density: CardDensity): number {
  if (kind === 'outfits') return width >= 1024 ? density === 'compact' ? 4 : density === 'roomy' ? 2 : 3 : width >= 700 ? density === 'compact' ? 3 : density === 'roomy' ? 1 : 2 : 1;
  const standard = width >= 1200 ? 5 : width >= 1024 ? 4 : width >= 768 ? 3 : 2;
  return density === 'roomy' ? standard - 1 : density === 'compact' && width >= 768 ? standard + 1 : standard;
}
