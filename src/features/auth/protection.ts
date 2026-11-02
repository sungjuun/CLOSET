import { useState } from 'react';

export function parseTurnstileKey(value: string | undefined) {
  if (!value) return '';
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(value)) return '';
  return value;
}
export const turnstileSiteKey = parseTurnstileKey(process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY);
export const captchaRequired = Boolean(turnstileSiteKey);
export function authWebOrigin() {
  try { const url = new URL(process.env.EXPO_PUBLIC_WEB_ORIGIN ?? ''); return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash ? url.origin : ''; } catch { return ''; }
}
export function captchaOptions(token: string | undefined, required: boolean) {
  if (!token && !required) return {};
  if (!token?.trim() || token.length > 4096) throw { code: 'captcha_required' };
  return { captchaToken: token };
}
export function useCaptcha() {
  const [token, setToken] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  return { token, onToken: setToken, revision, blocked: captchaRequired && !token, reset: () => { setToken(null); setRevision(value => value + 1); } };
}
export type CaptchaProps = { onToken: (value: string | null) => void };
