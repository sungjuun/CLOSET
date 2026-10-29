import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { transferSql, verificationSql } from './cloud-transfer-sql.mjs';
import { hostedPublicConfig } from './hosted-config.mjs';

const [folder, action] = process.argv.slice(2);
if (!folder || !['apply', 'verify'].includes(action)) throw new Error('Usage: node scripts/transfer-to-cloud.mjs <snapshot-directory> apply|verify');
const directory = resolve(folder);
const root = resolve('.local-backups') + '/';
if (!(directory.replaceAll('\\', '/') + '/').startsWith(root.replaceAll('\\', '/'))) throw new Error('이 프로젝트의 로컬 백업만 이전할 수 있습니다.');
const target = JSON.parse(readFileSync('deployment/target.json', 'utf8'));
const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
const records = readFileSync(join(directory, 'records.json'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
if (manifest.source !== 'http://127.0.0.1:54321' || manifest.recordsSha256 !== hash(records)) throw new Error('백업 무결성 검사 실패.');
const snapshot = JSON.parse(records);
for (const item of manifest.objects) if (hash(readFileSync(join(directory, item.file))) !== item.sha256) throw new Error('사진 백업 무결성 검사 실패.');

// CLI credentials stay in its credential store; service keys stay in memory.
function cli(args) {
  const result = spawnSync(process.execPath, ['node_modules/supabase/dist/supabase.js', ...args], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Supabase ${args[0]} ${args[1]} 실패. 원본 백업과 로컬 환경은 유지됩니다.`);
  try { return JSON.parse(result.stdout); } catch { throw new Error('CLI JSON 응답 형식을 확인해야 합니다.'); }
}
function query(sql, name) {
  const path = join(directory, name);
  writeFileSync(path, sql, { mode: 0o600 });
  return cli(['db', 'query', '--linked', '--project-ref', target.supabaseProjectRef, '--file', path, '--output-format', 'json']);
}
const sql = transferSql(snapshot);
if (action === 'apply') {
  const result = query(sql, 'transfer.sql');
  if (!result.rows) throw new Error('DB 이전 응답을 확인해야 합니다.');
  console.log('계정 및 앱 데이터 트랜잭션 이전 완료.');
}
const verification = query(verificationSql(), 'verify.sql').rows?.[0]?.snapshot;
if (!verification || !isDeepStrictEqual(verification.tables, snapshot.tables)) {
  const differing = Object.keys(snapshot.tables).filter(name => !isDeepStrictEqual(verification?.tables?.[name], snapshot.tables[name]));
  throw new Error(`서버 데이터 대조가 필요합니다: ${differing.join(', ')}`);
}
const keys = cli(['projects', 'api-keys', '--project-ref', target.supabaseProjectRef, '--reveal', '--output', 'json']);
const publicKey = (keys.find(key => key.type === 'publishable') || keys.find(key => key.name === 'anon'))?.api_key;
const secret = (keys.find(key => key.type === 'secret') || keys.find(key => key.name === 'service_role'))?.api_key;
const config = hostedPublicConfig({ EXPO_PUBLIC_SUPABASE_URL: target.supabaseUrl, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey }, target);
if (!secret) throw new Error('서버 이전용 키를 읽지 못했습니다.');
const admin = createClient(target.supabaseUrl, secret, { auth: { persistSession: false, autoRefreshToken: false } });
for (const item of manifest.objects) {
  const storage = admin.storage.from(item.bucket);
  const { data: existing, error: missing } = await storage.download(item.path);
  if (existing) {
    if (hash(new Uint8Array(await existing.arrayBuffer())) !== item.sha256) throw new Error('대상에 다른 사진이 있어 덮어쓰지 않았습니다.');
  } else {
    if (!missing || !['404', '400'].includes(String(missing.statusCode))) throw new Error('대상 사진 상태를 확인하지 못했습니다.');
    const { error } = await storage.upload(item.path, readFileSync(join(directory, item.file)), { contentType: item.contentType, upsert: false });
    if (error) throw new Error('사진 이전 실패. verify 명령으로 재시도할 수 있습니다.');
    const { data, error: downloadError } = await storage.download(item.path);
    if (downloadError || hash(new Uint8Array(await data.arrayBuffer())) !== item.sha256) throw new Error('서버 사진 바이트 대조 실패.');
  }
}
const final = query(verificationSql(), 'verify.sql').rows?.[0]?.snapshot;
if (!isDeepStrictEqual(final.tables, snapshot.tables) || final.objects.length !== manifest.objects.length || final.objects.some(item => !manifest.objects.some(source => source.bucket === item.bucket && source.path === item.path))) throw new Error('최종 데이터/파일 목록이 백업과 다릅니다.');
const environment = Object.entries(config).map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
if (existsSync('.env.cloud.local') && readFileSync('.env.cloud.local', 'utf8') !== environment) throw new Error('다른 공용 환경 파일이 있어 자동 교체하지 않았습니다.');
writeFileSync('.env.cloud.local', environment, { mode: 0o600 });
writeFileSync(join(directory, 'cloud-transfer-result.json'), JSON.stringify({ target: target.supabaseProjectRef, verifiedAt: new Date().toISOString(), tables: manifest.tables, objects: manifest.objects.length }, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ status: 'verified', tables: manifest.tables, objects: manifest.objects.length, publicEnvironment: '.env.cloud.local', localEnvironmentUnchanged: true }));
