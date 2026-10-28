import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.generated';
import { insightArgs, insightListSchema, insightPageSize, insightSummarySchema, type InsightScope, type InsightListFilters } from './model';

export class InsightError extends Error {
  constructor(public readonly code: string) { super(code); }
}
export function insightErrorMessage(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code === 'session_changed' || code === '42501') return '로그인 상태가 바뀌었습니다. 다시 로그인해 주세요.';
  if (code === '22023') return '집계 기준일과 기간을 확인해 주세요.';
  return '통계를 불러오지 못했습니다. 연결을 확인하고 다시 시도해 주세요.';
}
export function createInsightRepository(sessionClient: SupabaseClient<Database>, owner: string, connection: { url: string; key: string }, transport: typeof fetch = fetch) {
  if (!owner.trim()) throw new InsightError('session_changed');
  async function bound(signal?: AbortSignal) {
    const { data, error } = await sessionClient.auth.getSession();
    if (error || !data.session || data.session.user.id !== owner || signal?.aborted) throw new InsightError('session_changed');
    const token = data.session.access_token;
    return createClient<Database>(connection.url, connection.key, { accessToken: async () => token, db: { retry: false }, global: { fetch: (input, init) => transport(input, { ...init, ...(signal ? { signal } : {}) }) } });
  }
  return {
    async summary(scope: InsightScope, signal?: AbortSignal) {
      const args = insightArgs(scope);
      const client = await bound(signal);
      const result = await client.rpc('wardrobe_insights', { p_owner: owner, ...args });
      if (result.error) throw result.error;
      return insightSummarySchema.parse(result.data);
    },
    async items(page: number, scope: InsightScope, input: InsightListFilters, signal?: AbortSignal) {
      if (!Number.isSafeInteger(page) || page < 0 || page >= Number.MAX_SAFE_INTEGER / insightPageSize - 1) throw new InsightError('invalid_page');
      const values = insightListSchema.parse(input);
      const args = { p_owner: owner, ...insightArgs(scope), p_mode: values.mode, p_search: values.search };
      const client = await bound(signal);
      function request(head = false) { return client.rpc('insight_item_stats', args, { count: 'exact', head }); }
      const result = await request().range(page * insightPageSize, (page + 1) * insightPageSize - 1);
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
