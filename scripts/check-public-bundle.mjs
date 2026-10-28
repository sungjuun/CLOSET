import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import { localSupabaseSettings } from './local-supabase.mjs';

const { serviceKey } = localSupabaseSettings();
let checked = 0;
function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) scan(path);
    else if (/\.(js|hbc|html|json)$/.test(entry.name)) {
      checked++;
      if (readFileSync(path).includes(Buffer.from(serviceKey))) {
        throw new Error(`서버 키가 공개 산출물에 포함됐습니다: ${path}`);
      }
    }
  }
}
scan('dist');
if (!checked) throw new Error('검사할 export 결과가 없습니다.');
process.stdout.write(`공개 산출물 ${checked}개에서 로컬 서버 키가 발견되지 않았습니다.\n`);
