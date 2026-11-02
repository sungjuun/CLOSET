import { Buffer } from 'node:buffer';

export function hostedPublicConfig(input, target) {
  const url = new URL(input.EXPO_PUBLIC_SUPABASE_URL || 'about:blank');
  if (!/^[a-z]{20}$/.test(target.supabaseProjectRef) || url.origin !== `https://${target.supabaseProjectRef}.supabase.co` || url.href !== `${url.origin}/`) throw new Error('배포 대상과 HTTPS Supabase 주소가 일치해야 합니다.');
  const key = input.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
  let publicKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
  if (!publicKey) {
    try { const payload = JSON.parse(Buffer.from(key.split('.')[1] || '', 'base64url').toString()); publicKey = key.split('.').length === 3 && payload.role === 'anon' && payload.ref === target.supabaseProjectRef; } catch { /* Invalid keys remain rejected. */ }
  }
  if (!publicKey || url.username || url.password || url.search || url.hash) throw new Error('클라이언트 공개 키만 배포할 수 있습니다.');
  const site = new URL(target.siteUrl);
  if (site.protocol !== 'https:' || site.username || site.password || site.search || site.hash || site.pathname !== '/') throw new Error('HTTPS 사이트 주소가 필요합니다.');
  if (input.EXPO_PUBLIC_WEB_ORIGIN && input.EXPO_PUBLIC_WEB_ORIGIN !== site.origin) throw new Error('보안 확인 페이지와 배포 사이트 주소가 다릅니다.');
  const siteKey = input.EXPO_PUBLIC_TURNSTILE_SITE_KEY || '';
  if (siteKey && !/^0x[A-Za-z0-9_-]{18,98}$/.test(siteKey)) throw new Error('배포에는 실제 Turnstile 공개 사이트 키만 사용할 수 있습니다. 테스트 키는 로컬에서만 사용하세요.');
  return { EXPO_PUBLIC_SUPABASE_URL: url.origin, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key, EXPO_PUBLIC_WEB_ORIGIN: site.origin, EXPO_PUBLIC_TURNSTILE_SITE_KEY: siteKey };
}

export function parsePublicEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const match = line.match(/^(EXPO_PUBLIC_(?:SUPABASE_(?:URL|PUBLISHABLE_KEY)|TURNSTILE_SITE_KEY|WEB_ORIGIN))=(.*)$/);
    if (!match || match[1] in values) throw new Error('공용 연결 파일에는 중복 없이 공개 연결·웹 주소·Turnstile 사이트 키만 허용됩니다.');
    values[match[1]] = match[2].trim();
  }
  return values;
}
