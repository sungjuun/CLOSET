import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '@/types/database.generated';
import { outfitDraftSchema, outfitNameSchema, slots, type OutfitDraft, type OutfitSlot } from './draft';
import type { SavedOutfit } from './catalog';

export class OutfitWriteError extends Error {
  constructor(public readonly code: string) { super(code); }
}
export function outfitErrorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
}
export function outfitErrorMessage(error: unknown) {
  switch (outfitErrorCode(error)) {
    case 'session_changed': case '42501': return '로그인 상태가 바뀌었습니다. 다시 로그인해 주세요.';
    case '40001': return '다른 곳에서 코디가 변경되었습니다. 입력은 유지했어요. 최신 내용을 확인한 뒤 다시 편집해 주세요.';
    case 'P0002': return '코디를 찾을 수 없거나 삭제되었습니다. 저장한 코디 목록을 확인해 주세요.';
    case 'P0003': return '선택한 옷의 상태나 분류가 바뀌었습니다. 경고가 있는 슬롯을 교체하거나 제거해 주세요.';
    case '22023': case '22P02': case '23514': return '코디 이름과 선택한 옷, 입력값을 확인해 주세요.';
    case 'unsupported_layout': return '현재 편집기에서 지원하지 않는 슬롯 구성입니다. 원본 코디는 유지됩니다.';
    default: return '작업 결과를 확인하지 못했습니다. 입력은 유지했어요. 연결을 확인하고 다시 시도해 주세요.';
  }
}
export function outfitToDraft(outfit: SavedOutfit): OutfitDraft {
  const items: OutfitDraft['items'] = {};
  for (const entry of outfit.outfit_items) {
    if (!slots.includes(entry.slot as OutfitSlot) || entry.position !== 0 || items[entry.slot as OutfitSlot]) throw new OutfitWriteError('unsupported_layout');
    items[entry.slot as OutfitSlot] = entry.item_id;
  }
  return { name: outfit.name, memo: outfit.memo ?? '', occasion: outfit.occasion ?? '', tags: outfit.tags.join(', '), seasons: [...outfit.seasons], isFavorite: outfit.is_favorite, items };
}
export function outfitPayload(draft: OutfitDraft) {
  const input = outfitDraftSchema.parse(draft);
  return { name: input.name, memo: input.memo, occasion: input.occasion, tags: input.tags, seasons: input.seasons, is_favorite: input.isFavorite,
    items: Object.entries(input.items).map(([slot, item_id]) => ({ slot, item_id, position: 0 })) };
}

export function createOutfitRepository(sessionClient: SupabaseClient<Database>, owner: string, connection: { url: string; key: string }, transport: typeof fetch = fetch) {
  if (!owner.trim()) throw new OutfitWriteError('session_changed');
  async function bound(signal?: AbortSignal) {
    const { data, error } = await sessionClient.auth.getSession();
    if (error || !data.session || data.session.user.id !== owner || signal?.aborted) throw new OutfitWriteError('session_changed');
    const token = data.session.access_token;
    return createClient<Database>(connection.url, connection.key, { accessToken: async () => token, db: { retry: false }, global: { fetch: (input, init) => transport(input, { ...init, ...(signal ? { signal } : {}) }) } });
  }
  return {
    async get(id: string, signal?: AbortSignal): Promise<SavedOutfit | null> {
      z.uuid().parse(id);
      const client = await bound(signal);
      const result = await client.from('outfits').select('*, outfit_items(*, item:wardrobe_items!outfit_items_item_id_user_id_fkey(*))').eq('id', id).eq('user_id', owner).is('deleted_at', null).maybeSingle();
      if (result.error) throw result.error;
      return result.data;
    },
    async save(id: string, expected: string | null, draft: OutfitDraft, signal?: AbortSignal) {
      z.uuid().parse(id);
      const payload = outfitPayload(draft);
      const client = await bound(signal);
      const result = await client.rpc('save_outfit', { p_id: id, ...(expected ? { p_expected: expected } : {}), p_draft: payload });
      if (result.error) throw result.error;
      return result.data;
    },
    async rename(id: string, expected: string, name: string, signal?: AbortSignal) {
      z.uuid().parse(id);
      const wantedName = outfitNameSchema.parse(name);
      const client = await bound(signal);
      const result = await client.rpc('rename_outfit', { p_id: id, p_expected: expected, p_name: wantedName });
      if (result.error) throw result.error;
      return result.data;
    },
    async copy(source: string, expected: string, id: string, signal?: AbortSignal) {
      z.uuid().parse(source); z.uuid().parse(id);
      const client = await bound(signal);
      const result = await client.rpc('copy_outfit', { p_source: source, p_expected: expected, p_id: id });
      if (result.error) throw result.error;
      return result.data;
    },
    async remove(id: string, expected: string, signal?: AbortSignal) {
      z.uuid().parse(id);
      const client = await bound(signal);
      const result = await client.rpc('delete_outfit', { p_id: id, p_expected: expected });
      if (result.error) throw result.error;
      return result.data;
    },
  };
}
