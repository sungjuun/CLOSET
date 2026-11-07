import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.generated';
import type { BodyMeasurements, BodyValues, BrandSize, BrandSizeDraft } from './model';
import type { ShoeFit } from './shoeFit';

export type SizeChange =
  | { kind: 'body'; values: BodyValues & { shoe_fit?: ShoeFit | null }; base: BodyMeasurements | null }
  | { kind: 'brand'; id: string; values: BrandSizeDraft; base: BrandSize | null }
  | { kind: 'remove'; base: BrandSize };

export function createSizeService(sessionClient: SupabaseClient<Database>, owner: string, connection: { url: string; key: string }, transport: typeof fetch = fetch) {
  async function bound(signal: AbortSignal) {
    const { data, error } = await sessionClient.auth.getSession();
    if (error || !data.session || data.session.user.id !== owner || signal.aborted) {
      throw { code: 'session_changed' };
    }
    const token = data.session.access_token;
    return createClient<Database>(connection.url, connection.key, {
      accessToken: async () => token,
      db: { retry: false },
      global: { fetch: (input, init) => transport(input, { ...init, signal }) },
    });
  }

  return {
    async load(signal: AbortSignal) {
      const client = await bound(signal);
      const body = await client.from('member_body_measurements').select('*').eq('user_id', owner).maybeSingle();
      if (body.error) throw body.error;

      const brands: BrandSize[] = [];
      const pageSize = 200;
      for (let start = 0; ; start += pageSize) {
        const page = await client.from('member_brand_sizes').select('*').eq('user_id', owner)
          .order('brand_name').order('id').range(start, start + pageSize - 1);
        if (page.error) throw page.error;
        brands.push(...page.data);
        if (page.data.length < pageSize) break;
      }
      return { body: body.data, brands };
    },

    async save(change: SizeChange, signal: AbortSignal) {
      if (change.base && change.base.user_id !== owner) throw { code: 'session_changed' };
      const client = await bound(signal);
      if (change.kind === 'body') {
        const table = client.from('member_body_measurements');
        const result = change.base
          ? await table.update(change.values).eq('user_id', owner).eq('revision', change.base.revision).select().maybeSingle()
          : await table.insert({ user_id: owner, ...change.values }).select().single();
        assertChanged(result);
        return;
      }

      const table = client.from('member_brand_sizes');
      if (change.kind === 'remove') {
        const result = await table.delete().eq('user_id', owner).eq('id', change.base.id)
          .eq('revision', change.base.revision).select('id').maybeSingle();
        assertChanged(result);
        return;
      }

      const values = { ...change.values, fit_note: change.values.fit_note || null };
      const result = change.base
        ? await table.update(values).eq('user_id', owner).eq('id', change.base.id)
          .eq('revision', change.base.revision).select().maybeSingle()
        : await table.insert({ id: change.id, user_id: owner, ...values }).select().single();
      assertChanged(result);
    },
  };
}

function assertChanged(result: { data: unknown; error: unknown }) {
  if (result.error) throw result.error;
  if (!result.data) throw { code: 'size_conflict' };
}

export function sizeErrorMessage(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
  if (code === 'size_conflict' || code === '23505') return '다른 곳에서 기록이 변경됐어요. 입력을 복사해 둔 뒤 최신 기록을 열어 다시 편집해 주세요.';
  if (code === '42501' || code === 'session_changed') return '로그인 상태를 확인하고 다시 시도해 주세요.';
  return '저장 결과를 확인하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.';
}
