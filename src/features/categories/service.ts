import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.generated';
import { categoryNameSchema, deletedCategorySchema, memberCategorySchema, type MemberCategory } from './model';

export class CategoryError extends Error {
  constructor(public readonly code: string) { super(code); }
}
export async function readMemberCategories(client: SupabaseClient<Database>, owner: string, signal?: AbortSignal) {
  if (!owner.trim()) throw new CategoryError('session_changed');
  const rows: MemberCategory[] = [];
  for (let start = 0; ; start += 500) {
    let query = client.rpc('member_categories', { p_owner: owner }).order('position').order('slug').range(start, start + 499);
    if (signal) query = query.abortSignal(signal);
    const result = await query;
    if (result.error) throw result.error;
    rows.push(...result.data.map((row) => memberCategorySchema.parse(row)));
    if (result.data.length < 500) break;
  }
  return [...new Map(rows.map((row) => [row.slug, row])).values()];
}

export function createCategoryService(sessionClient: SupabaseClient<Database>, owner: string, connection: { url: string; key: string }, transport: typeof fetch = fetch) {
  async function bound(signal?: AbortSignal) {
    const { data, error } = await sessionClient.auth.getSession();
    if (error || !data.session || data.session.user.id !== owner || signal?.aborted) throw new CategoryError('session_changed');
    const token = data.session.access_token;
    return createClient<Database>(connection.url, connection.key, { accessToken: async () => token, db: { retry: false }, global: { fetch: (input, init) => transport(input, { ...init, ...(signal ? { signal } : {}) }) } });
  }
  return {
    async remove(category: MemberCategory, target?: string, signal?: AbortSignal) {
      if (!category.is_custom || !category.parent_slug) throw new CategoryError('42501');
      const client = await bound(signal);
      const result = await client.rpc('delete_member_category', { p_slug: category.slug, p_expected: category.updated_at, ...(target ? { p_target: target } : {}) });
      if (result.error) throw result.error;
      return deletedCategorySchema.parse(result.data);
    },
    async save(input: { slug: string; name: string; active: boolean; parent: string | null; expected?: string }, signal?: AbortSignal) {
      const name = categoryNameSchema.parse(input.name);
      const client = await bound(signal);
      const result = await client.rpc('save_member_category', { p_slug: input.slug, p_label: name, p_active: input.active, p_parent: input.parent ?? '', ...(input.expected ? { p_expected: input.expected } : {}) });
      if (result.error) throw result.error;
      return memberCategorySchema.parse(result.data);
    },
    async reorder(parent: string | null, expected: readonly string[], order: readonly string[], signal?: AbortSignal) {
      const client = await bound(signal);
      const result = await client.rpc('reorder_member_categories', { p_parent: parent ?? '', p_expected: [...expected], p_order: [...order] });
      if (result.error) throw result.error;
      return readMemberCategories(client, owner, signal);
    },
  };
}
