import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import { hostedPublicConfig, parsePublicEnv } from './hosted-config.mjs';

const target = JSON.parse(readFileSync('deployment/target.json', 'utf8'));
const config = hostedPublicConfig(parsePublicEnv(readFileSync('.env.cloud.local', 'utf8')), target);
const environment = { ...process.env, ...config, EXPO_NO_DOTENV: '1' };
for (const key of Object.keys(environment)) {
  if ((key.startsWith('EXPO_PUBLIC_') && !(key in config)) || /SUPABASE.*(?:SECRET|SERVICE|PASSWORD|TOKEN)|SUPABASE_ACCESS_TOKEN/.test(key)) delete environment[key];
}
const build = spawnSync(process.execPath, ['node_modules/expo/bin/cli', 'export', '--platform', 'web'], { env: environment, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status || 1);
let files = 0;
function check(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) check(path);
    else if (/\.(?:js|html|json|map)$/.test(entry.name)) {
      files++;
      const text = readFileSync(path, 'utf8');
      if (/sb_secret_[A-Za-z0-9_-]+|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) throw new Error('배포 산출물에 비밀 값이 있습니다.');
      for (const match of text.matchAll(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
        let role;
        try { role = JSON.parse(Buffer.from(match[0].split('.')[1], 'base64url').toString()).role; } catch { /* Only actual JWT payloads are inspected. */ }
        if (role === 'service_role' || role === 'supabase_admin') throw new Error('배포 산출물에 서버 JWT가 있습니다.');
      }
      if (/https?:\/\/(?:localhost|127\.0\.0\.1):54321/.test(text)) throw new Error('배포 산출물이 로컬 Supabase를 참조합니다.');
    }
  }
}
check('dist');
console.log(`공용 Supabase 웹 빌드 및 공개 산출물 ${files}개 검사 완료.`);
