import { describe, expect, it } from 'vitest';
import { parsePublicConfig } from '../src/lib/config/schema';

const key = 'sb_publishable_example';
const jwt = (role: string) => `header.${btoa(JSON.stringify({ role }))}.signature`;

describe('public configuration boundary', () => {
  it('runs unconfigured without constructing a backend', () => {
    expect(parsePublicConfig({})).toEqual({ status: 'missing' });
    expect(parsePublicConfig({ url: 'https://example.supabase.co' })).toEqual({ status: 'invalid' });
  });
  it('accepts publishable keys and local anon JWTs', () => {
    expect(parsePublicConfig({ url: 'https://example.supabase.co', key }).status).toBe('ready');
    expect(parsePublicConfig({ url: 'http://127.0.0.1:54321', key: jwt('anon') }, true).status).toBe('ready');
  });
  it.each(['sb_secret_example', jwt('service_role'), 'unrecognized-key'])('rejects non-public key %s without echoing it', (secret) => {
    expect(parsePublicConfig({ url: 'https://example.supabase.co', key: secret })).toEqual({ status: 'invalid' });
  });
  it('allows local HTTP only during development', () => {
    expect(parsePublicConfig({ url: 'http://127.0.0.1:54321', key }).status).toBe('invalid');
    expect(parsePublicConfig({ url: 'http://192.168.1.3:54321', key }, true).status).toBe('ready');
    expect(parsePublicConfig({ url: 'http://public.example.com', key }, true).status).toBe('invalid');
  });
  it.each(['https://user:pass@example.com', 'https://example.com/path', 'https://example.com?key=value', 'javascript:alert(1)'])('rejects unsuitable endpoint %s', (url) => {
    expect(parsePublicConfig({ url, key })).toEqual({ status: 'invalid' });
  });
});
