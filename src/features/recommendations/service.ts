import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '../../types/database.generated';
import { outfitPayload } from '../outfits/repository';
import { createOutfitSelectionService } from '../outfits/selection';
import { emptyOutfitDraft, rootCategory, slotCategories, type OutfitDraft } from '../outfits/draft';
import { createPhotoService } from '../wardrobe/photos/service';
import { primaryPhoto, rasterKind } from '../wardrobe/photos/model';
import type { WardrobeItem, Category } from '../wardrobe/types';
import { occasionOptions, recommendationSlots, styleOptions, type RecommendationItem, type RecommendedOutfit, type RecommendationOptions } from './engine';
import { recentWearRange } from './presentation';
import { modeSchema, presetSchema, renderKindSchema, type ViewMode, type BodyPreset, type RenderedOutfit } from './renderModel';

const candidateSchema = z.object({ id: z.uuid(), user_id: z.uuid(), slot: z.enum(recommendationSlots), name: z.string(), brand_name: z.string().nullable(), color_name: z.string().nullable(), color_hex: z.string().nullable(), secondary_color_hexes: z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).max(3), material: z.string().nullable(), seasons: z.array(z.string()), tags: z.array(z.string()), updated_at: z.string(), lifecycle_status: z.literal('active'), deleted_at: z.null(), available_count: z.coerce.number().int().nonnegative().optional() });
const presentationSchema = z.object({ outfit_id: z.uuid(), user_id: z.uuid(), view_mode: modeSchema, body_preset: presetSchema, render_id: z.uuid().nullable(), updated_at: z.string() });
const assetSchema = z.object({ id: z.uuid(), user_id: z.uuid(), outfit_id: z.uuid(), outfit_version: z.string(), requested_mode: modeSchema, body_preset: presetSchema, render_kind: renderKindSchema, storage_path: z.string(), status: z.enum(['pending', 'ready']), created_at: z.string() });
export type OutfitPresentation = z.infer<typeof presentationSchema>;
export type OutfitRenderAsset = z.infer<typeof assetSchema>;
export function itemAsCandidate(item: WardrobeItem, categories: readonly Category[]): RecommendationItem {
  const root = rootCategory(item.category_slug, categories); const slot = recommendationSlots.find((entry) => slotCategories[entry] === root);
  if (!slot) throw new Error('invalid_category');
  return candidateSchema.parse({ ...item, slot });
}
export function recommendedDraft(outfit: RecommendedOutfit, name: string, options: Pick<RecommendationOptions, 'season' | 'style' | 'occasion'>): OutfitDraft {
  const occasion = occasionOptions.find((value) => value.value === options.occasion)?.label ?? '';
  const style = options.style ? styleOptions.find((value) => value.value === options.style)?.label ?? options.style : '';
  return { ...emptyOutfitDraft(), name, occasion, seasons: options.season ? [options.season] : [], tags: ['추천', style, occasion].filter(Boolean).join(', '), memo: `규칙 기반 추천 · 색상 점수 ${outfit.colorScore}/100\n${outfit.reasons.join('\n')}`, items: Object.fromEntries(Object.entries(outfit.items).map(([slot, item]) => [slot, item!.id])) };
}
export function createRecommendationService(sessionClient: SupabaseClient<Database>, owner: string, connection: { url: string; key: string }, transport: typeof fetch = fetch) {
  async function bound(signal?: AbortSignal) {
    const { data, error } = await sessionClient.auth.getSession();
    if (error || data.session?.user.id !== owner || signal?.aborted) throw { code: 'session_changed' };
    const token = data.session.access_token;
    return createClient<Database>(connection.url, connection.key, { accessToken: async () => token, db: { retry: false }, global: { fetch: (input, init) => transport(input, { ...init, ...(signal ? { signal } : {}) }) } });
  }
  const sameOwner = (value: { user_id: string }) => { if (value.user_id !== owner) throw { code: 'session_changed' }; };
  return {
    async recentlyWorn(today: string, signal: AbortSignal) {
      const range = recentWearRange(today); const client = await bound(signal); const ids = new Set<string>();
      for (let page = 0; ; page++) {
        const result = await client.from('wear_event_items').select('item_id,event:wear_events!wear_event_items_wear_event_id_user_id_fkey!inner(worn_on,deleted_at)').eq('user_id', owner).gte('event.worn_on', range.start).lte('event.worn_on', range.end).is('event.deleted_at', null).order('wear_event_id').order('item_id').range(page * 200, (page + 1) * 200 - 1).abortSignal(signal);
        if (result.error) throw result.error;
        for (const row of result.data) ids.add(row.item_id);
        if (result.data.length < 200) break;
      }
      return [...ids];
    },
    async candidates(options: RecommendationOptions, signal: AbortSignal) {
      const client = await bound(signal);
      const result = await client.rpc('recommendation_candidates', { p_season: options.season, p_seed: options.seed, p_locked: Object.values(options.locks) }).abortSignal(signal);
      if (result.error) throw result.error;
      return result.data.map((row) => { const item = candidateSchema.parse(row); sameOwner(item); return item; });
    },
    async validate(draft: OutfitDraft, signal: AbortSignal) {
      const client = await bound(signal); const selection = createOutfitSelectionService(client, owner);
      await selection.validate(draft, signal);
      return selection.selected(Object.values(draft.items), signal);
    },
    async choose(slot: typeof recommendationSlots[number], id: string, signal: AbortSignal) {
      const client = await bound(signal); const result = await createOutfitSelectionService(client, owner).choose(slot, id, signal);
      return itemAsCandidate(result.item, result.categories);
    },
    async save(id: string, expected: string | null, draft: OutfitDraft, signal: AbortSignal) {
      const client = await bound(signal);
      await createOutfitSelectionService(client, owner).validate(draft, signal);
      const result = await client.rpc('save_outfit', { p_id: z.uuid().parse(id), ...(expected ? { p_expected: expected } : {}), p_draft: outfitPayload(draft) }).abortSignal(signal);
      if (result.error) throw result.error;
      return result.data;
    },
    async photos(ids: string[], signal: AbortSignal) {
      await bound(signal);
      const rows = await createPhotoService(sessionClient, owner, connection, transport).list(ids, signal);
      return ids.flatMap((id) => { const photo = primaryPhoto(rows, id); return photo?.signedUrl ? [{ itemId: id, uri: photo.signedUrl }] : []; });
    },
    async presentation(outfitId: string, version: string, signal: AbortSignal) {
      const client = await bound(signal);
      const result = await client.from('outfit_presentations').select('*').eq('outfit_id', outfitId).eq('user_id', owner).abortSignal(signal).maybeSingle();
      if (result.error) throw result.error; if (!result.data) return null;
      const prefs = presentationSchema.parse(result.data); sameOwner(prefs);
      if (!prefs.render_id) return { prefs, asset: null, signedUrl: null };
      const assetResult = await client.from('outfit_render_assets').select('*').eq('id', prefs.render_id).eq('user_id', owner).eq('outfit_id', outfitId).abortSignal(signal).maybeSingle();
      if (assetResult.error) throw assetResult.error;
      const asset = assetResult.data ? assetSchema.parse(assetResult.data) : null;
      if (!asset || asset.status !== 'ready' || asset.outfit_version !== version) return { prefs, asset: null, signedUrl: null };
      sameOwner(asset);
      const signed = await client.storage.from('outfit-renders-private').createSignedUrl(asset.storage_path, 60);
      if (signed.error) throw signed.error;
      return { prefs, asset, signedUrl: signed.data.signedUrl };
    },
    async setPresentation(outfitId: string, version: string, mode: ViewMode, preset: BodyPreset, signal: AbortSignal) {
      const client = await bound(signal);
      const result = await client.rpc('set_outfit_presentation', { p_outfit: z.uuid().parse(outfitId), p_expected: version, p_mode: modeSchema.parse(mode), p_preset: presetSchema.parse(preset) }).abortSignal(signal);
      if (result.error) throw result.error;
      const prefs = presentationSchema.parse(result.data); sameOwner(prefs); return prefs;
    },
    async storeImage(id: string, outfitId: string, version: string, mode: ViewMode, preset: BodyPreset, image: RenderedOutfit, signal: AbortSignal) {
      if (image.bytes.byteLength > 5 * 1024 * 1024 || rasterKind(image.bytes) !== 'png') throw new Error('invalid_render_image');
      const client = await bound(signal); renderKindSchema.parse(image.kind);
      const reserved = await client.rpc('reserve_outfit_render', { p_id: z.uuid().parse(id), p_outfit: z.uuid().parse(outfitId), p_expected: version, p_mode: modeSchema.parse(mode), p_preset: presetSchema.parse(preset), p_kind: image.kind }).abortSignal(signal);
      if (reserved.error) throw reserved.error;
      const asset = assetSchema.parse(reserved.data); sameOwner(asset);
      let verifyExisting = asset.status === 'ready';
      if (asset.status !== 'ready') {
        const upload = await client.storage.from('outfit-renders-private').upload(asset.storage_path, image.bytes, { contentType: 'image/png', upsert: false, cacheControl: '60' });
        if (upload.error) {
          if (signal.aborted) throw upload.error;
          verifyExisting = true;
        }
      }
      if (verifyExisting) {
        const existing = await client.storage.from('outfit-renders-private').download(asset.storage_path);
        if (existing.error || !existing.data) throw existing.error ?? new Error('render_file_unavailable');
        const bytes = new Uint8Array(await existing.data.arrayBuffer()); const wanted = new Uint8Array(image.bytes);
        if (bytes.length !== wanted.length || !bytes.every((value, index) => value === wanted[index])) throw new Error('different_render_file');
      }
      const completed = await client.rpc('complete_outfit_render', { p_id: id }).abortSignal(signal);
      if (completed.error) throw completed.error;
      const result = assetSchema.parse(completed.data); sameOwner(result); return result;
    },
  };
}
