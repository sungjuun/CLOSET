import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

// Commit output only after verified migrations exist. Never truncate types on failure.
const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(command, ['supabase', 'gen', 'types', 'typescript', '--local'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
});
if (result.status !== 0 || !result.stdout.includes('export type Database')) {
  process.stderr.write('로컬 Supabase와 검증된 migration을 먼저 준비하세요. 타입 파일은 변경하지 않았습니다.\n');
  process.exit(1);
}
mkdirSync('src/types', { recursive: true });
writeFileSync('src/types/database.generated.ts', result.stdout, 'utf8');
