import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.generated';
import { PhotoError, signedUrlSeconds, validatePrepared, type PreparedImage, type PrivatePhoto } from './model';

type Connection = { url: string; key: string };
export function createPhotoService(sessionClient: SupabaseClient<Database>, owner: string, connection: Connection, transport: typeof fetch = fetch) {
  const bucket = 'wardrobe-private';
  async function bound(signal?: AbortSignal) {
    const { data, error } = await sessionClient.auth.getSession();
    if (error || !data.session || data.session.user.id !== owner || signal?.aborted) throw new PhotoError('session_changed');
    // Snapshot the authenticated token for this operation; never switch to another
    // account midway through upload/cleanup. Cancellation reaches Storage too.
    const token = data.session.access_token;
    return createClient<Database>(connection.url, connection.key, {
      accessToken: async () => token,
      db: { retry: false },
      global: { fetch: (input, init) => transport(input, { ...init, ...(signal ? { signal } : {}) }) },
    });
  }
  async function ownedImage(client: SupabaseClient<Database>, id: string) {
    const { data, error } = await client.from('item_images').select('*').eq('id',id).eq('user_id',owner).maybeSingle();
    if (error) throw error;
    return data;
  }
  return {
    async list(itemIds: string[], signal?: AbortSignal): Promise<PrivatePhoto[]> {
      if (!itemIds.length) return [];
      const client = await bound(signal);
      const { data, error } = await client.from('item_images').select('*').eq('user_id',owner).in('item_id',itemIds).order('image_order').order('id');
      if (error) throw error;
      const ready = data.filter((photo) => photo.upload_status === 'ready');
      const signed = ready.length ? await client.storage.from(bucket).createSignedUrls(ready.map((photo) => photo.storage_path), signedUrlSeconds) : null;
      if (signed?.error) throw signed.error;
      if (signal?.aborted) throw new PhotoError('session_changed');
      return data.map((photo) => ({ ...photo, signedUrl: signed?.data?.find((entry) => entry.path === photo.storage_path && !entry.error)?.signedUrl ?? null }));
    },
    async upload(itemId: string, id: string, image: PreparedImage, signal?: AbortSignal) {
      validatePrepared(image);
      const client = await bound(signal);
      const extension = image.mime === 'image/jpeg' ? 'jpg' : image.mime.split('/')[1]!;
      const reserved = await client.rpc('reserve_item_image', { p_item_id: itemId, p_image_id: id, p_extension: extension });
      if (reserved.error) throw reserved.error;
      const path = reserved.data.storage_path;
      if (reserved.data.upload_status !== 'ready') {
        const uploaded = await client.storage.from(bucket).upload(path, image.bytes, { contentType: image.mime, cacheControl: '60', upsert: false });
        if (uploaded.error) {
          if (signal?.aborted) throw new PhotoError('session_changed');
          // The upload may have committed before its response was lost. Confirm
          // exact bytes rather than overwriting or silently accepting other data.
          const existing = await client.storage.from(bucket).download(path);
          if (existing.error || !existing.data) throw uploaded.error;
          const bytes = new Uint8Array(await existing.data.arrayBuffer());
          const wanted = new Uint8Array(image.bytes);
          if (bytes.length !== wanted.length || !bytes.every((value,index) => value === wanted[index])) throw new PhotoError('different_file');
        }
      } else {
        const existing = await client.storage.from(bucket).download(path);
        if (existing.error || !existing.data) throw existing.error ?? new PhotoError('P0002');
        const bytes = new Uint8Array(await existing.data.arrayBuffer());
        const wanted = new Uint8Array(image.bytes);
        if (bytes.length !== wanted.length || !bytes.every((value,index) => value === wanted[index])) throw new PhotoError('different_file');
      }
      const completed = await client.rpc('complete_item_image', { p_image_id: id });
      if (completed.error) throw completed.error;
      return completed.data;
    },
    async complete(id: string, signal?: AbortSignal) {
      const client = await bound(signal);
      const { data, error } = await client.rpc('complete_item_image', { p_image_id: id });
      if (error) throw error;
      return data;
    },
    async setPrimary(id: string, signal?: AbortSignal) {
      const client = await bound(signal);
      const { error } = await client.rpc('set_primary_item_image', { p_image_id: id });
      if (error) throw error;
    },
    async remove(id: string, signal?: AbortSignal) {
      const client = await bound(signal);
      const image = await ownedImage(client,id);
      if (!image) return;
      const { error: objectError } = await client.storage.from(bucket).remove([image.storage_path]);
      if (objectError) throw objectError;
      const { error } = await client.rpc('remove_item_image', { p_image_id: id });
      if (error) throw error;
    },
  };
}
