import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { hostedPublicConfig } from './hosted-config.mjs';

const target = JSON.parse(readFileSync('deployment/target.json', 'utf8'));
const result = spawnSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'projects', 'api-keys', '--project-ref', target.supabaseProjectRef, '--output', 'json'], { encoding: 'utf8' });
if (result.status !== 0) throw new Error('Supabase CLI 로그인이 필요합니다. npx supabase login을 실행하세요.');
const keys = JSON.parse(result.stdout);
const key = keys.find(item => item.type === 'publishable')?.api_key;
const config = hostedPublicConfig({ EXPO_PUBLIC_SUPABASE_URL: target.supabaseUrl, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key }, target);
const text = Object.entries(config).map(([name, value]) => `${name}=${value}`).join('\n') + '\n';
if (existsSync('.env.local') && readFileSync('.env.local', 'utf8') !== text) {
  mkdirSync('.local-backups', { recursive: true });
  copyFileSync('.env.local', join('.local-backups', `environment-before-cloud-${Date.now()}.env`));
}
writeFileSync('.env.local.next', text, { mode: 0o600 });
renameSync('.env.local.next', '.env.local');
writeFileSync('.env.cloud.local', text, { mode: 0o600 });
console.log(`공용 Supabase 연결 설정 완료: ${target.supabaseUrl}. 개발 서버를 재시작하세요. 이전 환경 파일은 보존했습니다.`);
