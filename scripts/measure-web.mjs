// Read-only timing probe for the local Expo web server. No account/key required.
import { performance } from 'node:perf_hooks';

const origin = 'http://127.0.0.1:8081';
async function measure(path, target, run) {
  const start = performance.now();
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(30_000) });
  const headers = performance.now();
  if (!response.ok) throw new Error(`${target}: HTTP ${response.status}`);
  const body = await response.arrayBuffer();
  console.log(JSON.stringify({
    target, run, headersMs: Math.round(headers - start),
    totalMs: Math.round(performance.now() - start), bytes: body.byteLength,
  }));
  return body;
}

try {
  for (let run = 1; run <= 3; run++) {
    const html = new TextDecoder().decode(await measure('/login', 'HTML', run));
    const source = /<script\b[^>]*\bsrc=["']([^"']+)["']/i.exec(html)?.[1];
    if (!source) throw new Error('Expo의 JavaScript script 태그를 찾지 못했습니다.');
    const bundle = new URL(source.replaceAll('&amp;', '&'), origin);
    if (bundle.origin !== origin) throw new Error('다른 서버의 script는 측정하지 않습니다.');
    await measure(bundle, 'JavaScript', run);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : '측정 실패');
  console.error('8081 포트의 CLOSET 개발 서버가 실행 중인지 확인하세요.');
  process.exitCode = 1;
}
