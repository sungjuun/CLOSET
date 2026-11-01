import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/types/database.generated';
import { BackupError, maxArchiveBytes, maxDataBytes, mediaReferences, tableNames, validateBackup, withoutMedia, type Backup, type LoadedBackup } from './model';
import { sha256 } from './hash';
import { rasterKind } from '../wardrobe/photos/model';

export type RestoreSummary = { preview: boolean; tables: Record<string, { added: number; skipped: number }>; profileRestored: boolean };
export function createBackupService(sessionClient: SupabaseClient<Database>, owner: string, connection: { url: string; key: string }) {
  async function bound(signal?: AbortSignal) {
    const session = await sessionClient.auth.getSession();
    if (session.error || session.data.session?.user.id !== owner || signal?.aborted) throw new BackupError('session_changed');
    const token = session.data.session.access_token;
    const client = createClient<Database>(connection.url, connection.key, { accessToken: async () => token, db: { retry: false }, global: { fetch: (input, init) => fetch(input, { ...init, ...(signal ? { signal } : {}) }) } });
    return client;
  }
  async function active(signal?: AbortSignal) {
    if (signal?.aborted || (await sessionClient.auth.getSession()).data.session?.user.id !== owner) throw new BackupError('session_changed');
  }
  return {
    async profileVersion(signal?: AbortSignal) {
      const client = await bound(signal);
      const result = await client.from('profiles').select('updated_at').eq('id', owner).single();
      if (result.error) throw result.error;
      await active(signal);
      return result.data.updated_at;
    },
    async export(kind: 'data' | 'full', signal?: AbortSignal, progress?: (message: string) => void): Promise<LoadedBackup> {
      const client = await bound(signal);
      const snapshot = await client.rpc('export_member_backup');
      if (snapshot.error) throw snapshot.error;
      const payload = snapshot.data as unknown as Pick<Backup, 'owner' | 'profile' | 'tables'>;
      let backup: Backup = { ...payload, format: 'closet-backup', version: 1, kind, createdAt: new Date().toISOString(), files: [] };
      const files: Record<string, Uint8Array> = {};
      if (kind === 'data') backup = withoutMedia(backup);
      else {
        const refs = mediaReferences(backup);
        if (refs.length > 500) throw new BackupError('limit');
        let total = JSON.stringify(backup).length;
        for (const [index, ref] of refs.entries()) {
          await active(signal); progress?.(`사진을 백업하고 있어요… ${index + 1}/${refs.length}`);
          const result = await client.storage.from(ref.bucket).download(ref.path);
          if (result.error || !result.data) throw new BackupError('missing_media');
          // Check Blob size before allocating the additional byte buffer.
          if (result.data.size > 5 * 1024 * 1024 || (total += result.data.size) > maxArchiveBytes) throw new BackupError('limit');
          const bytes = new Uint8Array(await result.data.arrayBuffer());
          const extension = ref.path.split('.').pop();
          const mime = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : extension === 'webp' ? 'image/webp' : 'image/png';
          if (!bytes.length || rasterKind(new Uint8Array(bytes).buffer) !== mime.replace('image/', '')) throw new BackupError('invalid');
          const file = `files/${ref.bucket}/${ref.path}`;
          files[file] = bytes;
          backup.files.push({ ...ref, file, mime, size: bytes.length, sha256: await sha256(bytes) });
        }
      }
      // Refuse a mixed snapshot if metadata changed while photos were downloaded.
      const latest = await client.rpc('export_member_backup');
      if (latest.error) throw latest.error;
      if (JSON.stringify(snapshot.data) !== JSON.stringify(latest.data)) throw new BackupError('changed');
      await active(signal);
      return { backup: validateBackup(backup, owner), files };
    },
    async restore(loaded: LoadedBackup, preview: boolean, profileExpected: string | null, signal?: AbortSignal, progress?: (message: string) => void): Promise<RestoreSummary> {
      const backup = validateBackup(loaded.backup, owner);
      if (JSON.stringify(backup).length > maxDataBytes || tableNames.some(name => !backup.tables[name])) throw new BackupError('invalid');
      for (const file of backup.files) {
        const bytes = loaded.files[file.file];
        if (!bytes || bytes.length !== file.size || await sha256(bytes) !== file.sha256 || rasterKind(new Uint8Array(bytes).buffer) !== file.mime.replace('image/', '')) throw new BackupError('invalid');
      }
      const client = await bound(signal);
      const result = await client.rpc('restore_member_backup', { p_payload: backup as unknown as Json, p_dry_run: preview, p_restore_profile: profileExpected !== null, ...(profileExpected ? { p_profile_expected: profileExpected } : {}) });
      if (result.error) throw result.error;
      if (!preview) {
        // Metadata is one transaction. Storage is resumable; never claim atomic file uploads.
        for (const [index, file] of backup.files.entries()) {
          await active(signal); progress?.(`사진을 복원하고 있어요… ${index + 1}/${backup.files.length}`);
          const bytes = loaded.files[file.file];
          if (!bytes || await sha256(bytes) !== file.sha256) throw new BackupError('media');
          const complete = async () => {
            const confirmed = await client.rpc('complete_backup_file', { p_bucket: file.bucket, p_path: file.path, p_sha256: file.sha256 });
            if (confirmed.error) throw new BackupError('media');
          };
          const stored = await client.storage.from(file.bucket).download(file.path);
          if (!stored.error && stored.data) {
            if (stored.data.size !== file.size || await sha256(new Uint8Array(await stored.data.arrayBuffer())) !== file.sha256) throw new BackupError('media');
            await complete();
            continue;
          }
          const uploaded = await client.storage.from(file.bucket).upload(file.path, new Uint8Array(bytes).buffer, { contentType: file.mime, upsert: false, cacheControl: '60' });
          if (uploaded.error) {
            // Upload may have succeeded before the response was lost.
            const check = await client.storage.from(file.bucket).download(file.path);
            if (check.error || !check.data || check.data.size !== file.size || await sha256(new Uint8Array(await check.data.arrayBuffer())) !== file.sha256) throw new BackupError('media');
          }
          await complete();
        }
      }
      await active(signal);
      return result.data as unknown as RestoreSummary;
    },
  };
}
