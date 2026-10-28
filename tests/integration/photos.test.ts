import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database.generated';
import { createPhotoService } from '../../src/features/wardrobe/photos/service';
import type { PreparedImage } from '../../src/features/wardrobe/photos/model';
import { makePng } from '../helpers/png';

const status = JSON.parse(execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx',['supabase','status','-o','json'],{ encoding: 'utf8', shell: process.platform === 'win32', stdio: ['pipe','pipe','ignore'] }));
if (!['http://127.0.0.1:54321','http://localhost:54321'].includes(status.API_URL)) throw new Error('Loopback API required');
const connection = { url: status.API_URL as string, key: status.ANON_KEY as string };
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient<Database>(connection.url,status.SERVICE_ROLE_KEY,options);
const accounts: { id: string; email: string; password: string; client: ReturnType<typeof createClient<Database>> }[] = [];
const image = (variant = 0): PreparedImage => ({ bytes: makePng(variant), mime: 'image/png', width: 96, height: 64 });
const service = (index = 0, transport?: typeof fetch) => {
  const account = accounts[index]!;
  return createPhotoService(account.client,account.id,connection,transport);
};
async function item() {
  const result = await accounts[0]!.client.from('wardrobe_items').insert({ name: '사진 통합 테스트', category_slug: 'tops' }).select().single();
  if (result.error) throw result.error;
  return result.data;
}
beforeAll(async () => {
  for (let index = 0; index < 2; index++) {
    const email = `closet-photos-${randomUUID()}@example.test`;
    const password = `${randomUUID()}aA!9`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error('Photo fixture setup failed');
    const client = createClient<Database>(connection.url,connection.key,options);
    const account = { id: created.data.user.id, email, password, client };
    accounts.push(account);
    if ((await client.auth.signInWithPassword({ email,password })).error) throw new Error('Photo fixture login failed');
  }
});
afterAll(async () => {
  for (const account of accounts) {
    const rows = await admin.from('item_images').select('storage_path').eq('user_id',account.id);
    if (rows.error) throw rows.error;
    if (rows.data.length && (await admin.storage.from('wardrobe-private').remove(rows.data.map((row) => row.storage_path))).error) throw new Error('Photo object cleanup failed');
    if ((await admin.auth.admin.deleteUser(account.id)).error) throw new Error('Photo account cleanup failed');
  }
});

describe('actual private photo lifecycle', () => {
  it('publishes a complete image, serves it privately, and denies foreign RPCs/signing', async () => {
    const clothing = await item();
    const photo = await service().upload(clothing.id,randomUUID(),image());
    expect(photo.upload_status).toBe('ready');
    expect(photo.is_primary).toBe(true);
    const photos = await service().list([clothing.id]);
    const url = photos[0]?.signedUrl;
    expect(Boolean(url)).toBe(true);
    if (!url) throw new Error('Signed URL missing');
    const served = await fetch(url);
    expect(served.ok).toBe(true);
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(new Uint8Array(image().bytes));
    expect((await service(1).list([clothing.id])).length).toBe(0);
    await expect(service(1).complete(photo.id)).rejects.toBeTruthy();
    await expect(service(1).setPrimary(photo.id)).rejects.toBeTruthy();
    await expect(service(1).upload(clothing.id,randomUUID(),image())).rejects.toBeTruthy();
    await service(1).remove(photo.id);
    expect((await service().list([clothing.id])).length).toBe(1);
    expect((await accounts[1]!.client.storage.from('wardrobe-private').createSignedUrl(photo.storage_path,60)).error !== null).toBe(true);
    expect((await accounts[0]!.client.from('item_images').update({ is_primary: false }).eq('id',photo.id)).error?.code).toBe('42501');
    expect((await accounts[0]!.client.from('item_images').insert({ item_id: clothing.id, storage_path: photo.storage_path, upload_status: 'ready' })).error?.code).toBe('42501');
  });
  it('limits concurrent uploads to five slots and one primary', async () => {
    const clothing = await item();
    const uploaded = await Promise.allSettled(Array.from({ length: 6 },() => service().upload(clothing.id,randomUUID(),image())));
    expect(uploaded.filter((result) => result.status === 'fulfilled').length).toBe(5);
    const photos = await service().list([clothing.id]);
    expect(photos.length).toBe(5);
    expect(photos.filter((photo) => photo.is_primary).length).toBe(1);
    await Promise.all(photos.slice(0,2).map((photo) => service().setPrimary(photo.id)));
    expect((await service().list([clothing.id])).filter((photo) => photo.is_primary).length).toBe(1);
  });
  it('recovers lost upload and completion responses without duplicates or overwritten bytes', async () => {
    for (const phase of ['object','complete']) {
      const clothing = await item();
      const id = randomUUID();
      let lost = false;
      const transport: typeof fetch = async (url,init) => {
        const result = await fetch(url,init);
        const target = phase === 'object' ? '/storage/v1/object/wardrobe-private/' : '/rest/v1/rpc/complete_item_image';
        if (!lost && init?.method === 'POST' && String(url).includes(target) && result.ok) { lost = true; throw new TypeError('simulated committed response loss'); }
        return result;
      };
      if (phase === 'object') expect((await service(0,transport).upload(clothing.id,id,image())).id).toBe(id);
      else await expect(service(0,transport).upload(clothing.id,id,image())).rejects.toBeTruthy();
      expect(lost).toBe(true);
      expect((await service().upload(clothing.id,id,image())).id).toBe(id);
      expect((await service().list([clothing.id])).length).toBe(1);
      await expect(service().upload(clothing.id,id,image(1))).rejects.toMatchObject({ code: 'different_file' });
    }
  });
  it('keeps failed reservations pending and supports retry and restart recovery', async () => {
    const clothing = await item();
    const id = randomUUID();
    const transport: typeof fetch = async (url,init) => {
      if (init?.method === 'POST' && String(url).includes('/storage/v1/object/wardrobe-private/')) throw new TypeError('simulated offline upload');
      return fetch(url,init);
    };
    await expect(service(0,transport).upload(clothing.id,id,image())).rejects.toBeTruthy();
    const pending = await service().list([clothing.id]);
    expect(pending[0]?.upload_status).toBe('pending');
    expect(pending[0]?.signedUrl).toBeNull();
    await expect(service().complete(id)).rejects.toMatchObject({ code: 'P0002' });
    expect((await service().upload(clothing.id,id,image())).upload_status).toBe('ready');
    const anotherId = randomUUID();
    const reserved = await accounts[0]!.client.rpc('reserve_item_image',{ p_item_id: clothing.id, p_image_id: anotherId, p_extension: 'png' });
    if (reserved.error) throw reserved.error;
    if ((await accounts[0]!.client.storage.from('wardrobe-private').upload(reserved.data.storage_path,image().bytes,{ contentType: 'image/png' })).error) throw new Error('Restart fixture upload failed');
    expect((await service().complete(anotherId)).upload_status).toBe('ready');
  });
  it('deletes object before reservation, replaces primary, and refuses ready path reuse', async () => {
    const clothing = await item();
    const first = await service().upload(clothing.id,randomUUID(),image());
    const second = await service().upload(clothing.id,randomUUID(),image(1));
    expect((await accounts[0]!.client.rpc('remove_item_image',{ p_image_id: first.id })).error?.code).toBe('23514');
    await service().remove(first.id);
    const remaining = await service().list([clothing.id]);
    expect(remaining.length).toBe(1); expect(remaining[0]?.id).toBe(second.id); expect(remaining[0]?.is_primary).toBe(true);
    if ((await accounts[0]!.client.storage.from('wardrobe-private').remove([second.storage_path])).error) throw new Error('Removal fixture failed');
    expect((await accounts[0]!.client.storage.from('wardrobe-private').upload(second.storage_path,image().bytes,{ contentType: 'image/png' })).error !== null).toBe(true);
    await service().remove(second.id);
    await service().remove(second.id);
    expect((await service().list([clothing.id])).length).toBe(0);
  });
  it('aborts requests and refuses a service whose session owner changed', async () => {
    const clothing = await item();
    const controller = new AbortController(); controller.abort();
    await expect(service().list([clothing.id],controller.signal)).rejects.toBeTruthy();
    const a = accounts[0]!; const b = accounts[1]!;
    const client = createClient<Database>(connection.url,connection.key,options);
    await client.auth.signInWithPassword({ email: a.email, password: a.password });
    const scoped = createPhotoService(client,a.id,connection);
    await client.auth.signInWithPassword({ email: b.email, password: b.password });
    await expect(scoped.list([clothing.id])).rejects.toMatchObject({ code: 'session_changed' });
  });
});
