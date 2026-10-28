import { spawnSync } from 'node:child_process';

// Never accept a remote endpoint/key for these destructive fixture tests.
export function localSupabaseSettings() {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(command, ['supabase', 'status', '-o', 'json'], {
    encoding: 'utf8', shell: process.platform === 'win32',
  });
  if (result.status !== 0) throw new Error('로컬 Supabase가 필요합니다. npm run db:start를 먼저 실행하세요.');
  let settings;
  try { settings = JSON.parse(result.stdout); } catch { throw new Error('로컬 Supabase 상태를 읽지 못했습니다.'); }
  const url = settings.API_URL;
  if (url !== 'http://127.0.0.1:54321' && url !== 'http://localhost:54321') {
    throw new Error('테스트는 이 프로젝트의 기본 loopback API(54321)에서만 실행합니다.');
  }
  if (!settings.ANON_KEY || !settings.SERVICE_ROLE_KEY) throw new Error('로컬 테스트 키가 없습니다.');
  return { url, anonKey: settings.ANON_KEY, serviceKey: settings.SERVICE_ROLE_KEY };
}
