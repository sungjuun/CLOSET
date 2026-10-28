import { existsSync, writeFileSync } from 'node:fs';
import { localSupabaseSettings } from './local-supabase.mjs';

if (existsSync('.env.local')) {
  throw new Error('.env.local이 이미 있어 덮어쓰지 않았습니다. 기존 연결을 직접 확인하세요.');
}
const local = localSupabaseSettings();
// The admin key is intentionally NEVER written to an application env file.
writeFileSync('.env.local', `EXPO_PUBLIC_SUPABASE_URL=${local.url}\nEXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${local.anonKey}\n`, { flag: 'wx' });
process.stdout.write('로컬 공개 연결 설정을 .env.local에 저장했습니다. 서버 비밀 키는 저장하지 않았습니다.\n');
