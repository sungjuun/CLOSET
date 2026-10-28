import { z } from 'zod';

const schema = z.object({
  url: z.url(),
  key: z.string().min(1),
});

export type PublicConfig =
  | { status: 'ready'; url: string; key: string }
  | { status: 'missing' | 'invalid' };

function isPublicKey(key: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  const parts = key.split('.');
  if (parts.length !== 3 || !parts[1]) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as {
      role?: unknown;
    };
    return payload.role === 'anon';
  } catch {
    return false;
  }
}

export function parsePublicConfig(
  input: { url?: string | undefined; key?: string | undefined },
  development = false,
): PublicConfig {
  if (!input.url && !input.key) return { status: 'missing' };
  const result = schema.safeParse(input);
  if (!result.success || !isPublicKey(result.data.key)) return { status: 'invalid' };
  const url = new URL(result.data.url);
  const local = /^(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(url.hostname);
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    return { status: 'invalid' };
  }
  if (url.protocol !== 'https:' && !(development && local && url.protocol === 'http:')) {
    return { status: 'invalid' };
  }
  return { status: 'ready', url: url.origin, key: result.data.key };
}
