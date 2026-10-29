import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.generated';
import { brandNameSchema, type Brand } from './model';
import { PhotoError, validatePrepared, type PreparedImage } from '../wardrobe/photos/model';

export function createBrandService(sessionClient: SupabaseClient<Database>, owner: string, connection: { url: string; key: string }, transport: typeof fetch = fetch) {
  const bucket = 'brand-private';
  async function bound(signal?: AbortSignal) {
    const { data, error } = await sessionClient.auth.getSession();
    if (error || !data.session || data.session.user.id !== owner || signal?.aborted) throw new PhotoError('session_changed');
    const token = data.session.access_token;
    return createClient<Database>(connection.url, connection.key, { accessToken: async () => token, db: { retry: false }, global: { fetch: (input, init) => transport(input, { ...init, ...(signal ? { signal } : {}) }) } });
  }
  async function imageChange(client: SupabaseClient<Database>, brand: Brand, path: string | null) {
    // PostgreSQL accepts null here; generated RPC argument types omit nullability.
    const result = await client.rpc('set_brand_image', { p_id: brand.id, p_expected: brand.updated_at, p_path: path as string });
    if (result.error) throw result.error;
    let cleanupPending = false;
    if (brand.image_path && brand.image_path !== path) {
      try { cleanupPending = Boolean((await client.storage.from(bucket).remove([brand.image_path])).error); }
      catch { cleanupPending = true; }
    }
    return { brand: result.data, cleanupPending };
  }
  return {
    async list(signal?: AbortSignal) {
      const client = await bound(signal);
      const brands: Brand[] = [];
      for (let start = 0; ; start += 500) {
        const result = await client.from('brands').select('*').eq('user_id', owner).is('deleted_at', null).order('name').order('id').range(start, start + 499);
        if (result.error) throw result.error;
        brands.push(...result.data);
        if (result.data.length < 500) break;
      }
      return [...new Map(brands.map((brand) => [brand.id, brand])).values()];
    },
    async images(brands: readonly Brand[], signal?: AbortSignal) {
      const paths = [...new Set(brands.filter((brand) => brand.user_id === owner && !brand.deleted_at && brand.image_path).map((brand) => brand.image_path!))];
      if (!paths.length) return {} as Record<string, string>;
      const client = await bound(signal);
      const result = await client.storage.from(bucket).createSignedUrls(paths, 60);
      if (result.error) throw result.error;
      if (signal?.aborted) throw new PhotoError('session_changed');
      return Object.fromEntries(result.data.filter((entry) => entry.path && entry.signedUrl && !entry.error).map((entry) => [entry.path!, entry.signedUrl!]));
    },
    async save(id: string, name: string, expected?: string, signal?: AbortSignal) {
      const title = brandNameSchema.parse(name);
      const client = await bound(signal);
      const result = await client.rpc('save_brand', { p_id: id, p_name: title, ...(expected ? { p_expected: expected } : {}) });
      if (result.error) throw result.error;
      return result.data;
    },
    async upload(brand: Brand, imageId: string, image: PreparedImage, signal?: AbortSignal) {
      validatePrepared(image);
      const client = await bound(signal);
      const extension = image.mime === 'image/jpeg' ? 'jpg' : image.mime.split('/')[1]!;
      const path = `${owner}/brands/${brand.id}/${imageId}.${extension}`;
      const result = await client.storage.from(bucket).upload(path, image.bytes, { contentType: image.mime, cacheControl: '60', upsert: false });
      if (result.error) {
        if (signal?.aborted) throw new PhotoError('session_changed');
        const existing = await client.storage.from(bucket).download(path);
        if (existing.error || !existing.data) throw result.error;
        const actual = new Uint8Array(await existing.data.arrayBuffer());
        const wanted = new Uint8Array(image.bytes);
        if (actual.length !== wanted.length || !actual.every((value, index) => value === wanted[index])) throw new PhotoError('different_file');
      }
      // Keep the same operation ID on retry: a committed response loss returns
      // the already referenced path rather than uploading duplicate files.
      return imageChange(client, brand, path);
    },
    async removeImage(brand: Brand, signal?: AbortSignal) {
      return imageChange(await bound(signal), brand, null);
    },
    async remove(brand: Brand, signal?: AbortSignal) {
      const client = await bound(signal);
      const result = await client.rpc('delete_brand', { p_id: brand.id, p_expected: brand.updated_at });
      if (result.error) throw result.error;
      let cleanupPending = false;
      try {
        const prefix = `${owner}/brands/${brand.id}`;
        // A deleted brand rejects uploads. Remove from the first page each time
        // so pagination cannot skip files after successful deletion.
        for (let page = 0; ; page++) {
          const files = await client.storage.from(bucket).list(prefix, { limit: 100, sortBy: { column: 'name', order: 'asc' } });
          if (files.error) throw files.error;
          if (!files.data.length) break;
          if (page >= 50) { cleanupPending = true; break; }
          const removed = await client.storage.from(bucket).remove(files.data.map((file) => `${prefix}/${file.name}`));
          if (removed.error || !removed.data.length) { cleanupPending = true; break; }
        }
      } catch { cleanupPending = true; }
      return { brand: result.data, cleanupPending };
    },
  };
}
