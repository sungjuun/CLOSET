import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, open } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Buffer } from 'node:buffer';
import { createClient } from '@supabase/supabase-js';
import { localSupabaseSettings } from './local-supabase.mjs';

// Read-only, loopback-only pre-migration snapshot. It never resets the source.
const local = localSupabaseSettings();
const directory = resolve('.local-backups', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(directory, { recursive: true });
const sql = `begin isolation level repeatable read read only;
select jsonb_build_object(
 'tables', (select jsonb_object_agg(schema_name || '.' || table_name, rows) from (
 ${['auth.users', 'auth.identities', 'public.profiles', 'public.categories', 'public.category_preferences', 'public.brands', 'public.wardrobe_items', 'public.item_images', 'public.outfits', 'public.outfit_items', 'public.wear_events', 'public.wear_event_items', 'public.import_jobs'].map(name => {
  const [schema, table] = name.split('.');
  return `select '${schema}' schema_name, '${table}' table_name, coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), '[]'::jsonb) rows from ${name} t`;
 }).join('\n union all\n')} ) snapshots),
 'objects', (select coalesce(jsonb_agg(to_jsonb(o) order by o.bucket_id,o.name),'[]'::jsonb) from storage.objects o),
 'migrations', (select jsonb_agg(version order by version) from supabase_migrations.schema_migrations)
); commit;`;
function capture() {
  const result = spawnSync('docker', ['exec', '-i', 'supabase_db_closet', 'psql', '-U', 'postgres', '-d', 'postgres', '-XAtq', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  if (result.status !== 0) throw new Error('로컬 데이터 스냅샷을 읽지 못했습니다.');
  return JSON.parse(result.stdout);
}
const snapshot = capture();
const digest = value => createHash('sha256').update(value).digest('hex');
const file = await open(join(directory, 'database.dump'), 'wx', 0o600);
try {
  const dump = spawnSync('docker', ['exec', 'supabase_db_closet', 'pg_dump', '-U', 'postgres', '-d', 'postgres', '-Fc', '--no-owner', '--no-acl'], { stdio: ['ignore', file.fd, 'pipe'], maxBuffer: 1024 * 1024 });
  if (dump.status !== 0) throw new Error('로컬 DB 전체 백업이 실패했습니다.');
} finally { await file.close(); }
await writeFile(join(directory, 'records.json'), JSON.stringify(snapshot), { flag: 'wx', mode: 0o600 });
await mkdir(join(directory, 'storage'));
const client = createClient(local.url, local.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const objects = [];
for (const object of snapshot.objects) {
  if (!['wardrobe-private', 'brand-private'].includes(object.bucket_id)) throw new Error('검토하지 않은 버킷이 있습니다.');
  const { data, error } = await client.storage.from(object.bucket_id).download(object.name);
  if (error) throw new Error('사진 백업 중 다운로드가 실패했습니다.');
  const bytes = Buffer.from(await data.arrayBuffer());
  const name = digest(`${object.bucket_id}/${object.name}`);
  await writeFile(join(directory, 'storage', name), bytes, { flag: 'wx', mode: 0o600 });
  objects.push({ bucket: object.bucket_id, path: object.name, file: `storage/${name}`, size: bytes.length, sha256: digest(bytes), contentType: object.metadata?.mimetype || data.type });
}
// A concurrent change invalidates this capture instead of claiming consistency.
if (JSON.stringify(snapshot) !== JSON.stringify(capture())) throw new Error('백업 도중 데이터가 변경되었습니다. 현재 폴더는 미완료 상태이며 다시 실행해야 합니다.');
const manifest = { format: 1, source: local.url, capturedAt: new Date().toISOString(), tables: Object.fromEntries(Object.entries(snapshot.tables).map(([name, rows]) => [name, rows.length])), migrations: snapshot.migrations, recordsSha256: digest(JSON.stringify(snapshot)), objects };
await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ directory, tables: manifest.tables, objects: objects.length, bytes: objects.reduce((sum, item) => sum + item.size, 0), status: 'complete' }));
