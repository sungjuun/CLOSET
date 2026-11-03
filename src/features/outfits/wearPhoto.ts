import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.generated';
import { assertUploadCapacity } from '../usage/model';
import { PhotoError, signedUrlSeconds, validatePrepared, type PreparedImage } from '../wardrobe/photos/model';

export const wearPhotoBucket = 'wardrobe-private';
export const wearPhotoPath = (owner: string, outfitId: string) => `${owner}/outfits/${outfitId}/wear.jpg`;

export function createWearPhotoService(sessionClient: SupabaseClient<Database>, owner: string, outfitId: string, connection: { url: string; key: string }) {
  const path = wearPhotoPath(owner, outfitId);
  async function bound(signal?: AbortSignal) {
    const { data, error } = await sessionClient.auth.getSession();
    if (error || data.session?.user.id !== owner || signal?.aborted) throw new PhotoError('session_changed');
    const token = data.session.access_token;
    return createClient<Database>(connection.url, connection.key, {
      accessToken: async () => token,
      db: { retry: false },
      ...(signal && { global: { fetch: (input, init) => fetch(input, { ...init, signal }) } }),
    });
  }
  return {
    async read(signal: AbortSignal) {
      const client = await bound(signal);
      const storage = client.storage.from(wearPhotoBucket);
      const info = await storage.info(path);
      if (info.error) {
        if (info.error.status === 404 || info.error.statusCode === '404') return null;
        throw info.error;
      }
      const { data, error } = await storage.createSignedUrl(path, signedUrlSeconds);
      if (error) throw error;
      return data.signedUrl;
    },
    async save(image: PreparedImage) {
      validatePrepared(image);
      if (image.mime !== 'image/jpeg') throw new PhotoError('unsupported');
      const client = await bound();
      await assertUploadCapacity(client, wearPhotoBucket, path, image.bytes.byteLength);
      // One object per outfit. An upsert replaces the old file only when the upload succeeds.
      const { error } = await client.storage.from(wearPhotoBucket).upload(path, image.bytes, {
        contentType: image.mime, upsert: true, cacheControl: '0',
      });
      if (error) throw error;
    },
    async remove() {
      const client = await bound();
      const { error } = await client.storage.from(wearPhotoBucket).remove([path]);
      if (error) throw error;
    },
  };
}
