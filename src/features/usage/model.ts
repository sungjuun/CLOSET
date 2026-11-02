import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.generated';

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const memberUsageSchema = z.object({ user_id: z.uuid(), wardrobe_count: count, wardrobe_limit: count.positive(), media_files: count, media_files_limit: count.positive(), media_bytes: count, media_bytes_limit: count.positive() });
export type MemberUsage = z.infer<typeof memberUsageSchema>;
export const quotaMessage = '회원별 사용량 한도에 도달했습니다. 설정 → 계정·보안에서 사용량을 확인해 주세요.';
export function isQuotaError(error: unknown) { return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'PT413'); }
export async function readMemberUsage(client: SupabaseClient<Database>, owner: string, signal?: AbortSignal) {
  let query = client.rpc('member_usage'); if (signal) query = query.abortSignal(signal);
  const result = await query; if (result.error) throw result.error;
  const usage = memberUsageSchema.parse(result.data);
  if (usage.user_id !== owner) throw { code: 'session_changed' };
  return usage;
}
export async function assertUploadCapacity(client: SupabaseClient<Database>, bucket: string, path: string, bytes: number, signal?: AbortSignal) {
  let query = client.rpc('assert_member_upload_capacity', { p_bucket: bucket, p_path: path, p_bytes: bytes });
  if (signal) query = query.abortSignal(signal);
  const result = await query; if (result.error) throw result.error;
}
export const formatMiB = (bytes: number) => `${(bytes / 1024 / 1024).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}MiB`;
