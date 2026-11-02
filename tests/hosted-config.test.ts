import { describe, expect, it } from 'vitest';
// Deployment tooling runs in Node and never enters the application bundle.
import { hostedPublicConfig, parsePublicEnv } from '../scripts/hosted-config.mjs';

const ref = 'abcdefghijklmnopqrst';
const target = { supabaseProjectRef: ref, siteUrl: 'https://closet.example.test' };
const values = { EXPO_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture' };
describe('hosted build boundary', () => {
  it('requires the selected HTTPS project and a public key', () => {
    expect(hostedPublicConfig(values, target)).toEqual({ ...values, EXPO_PUBLIC_WEB_ORIGIN: target.siteUrl, EXPO_PUBLIC_TURNSTILE_SITE_KEY: '' });
    for (const url of ['http://127.0.0.1:54321', 'https://other.supabase.co', values.EXPO_PUBLIC_SUPABASE_URL + '/path', values.EXPO_PUBLIC_SUPABASE_URL + '?key=secret']) expect(() => hostedPublicConfig({ ...values, EXPO_PUBLIC_SUPABASE_URL: url }, target)).toThrow();
    expect(() => hostedPublicConfig({ ...values, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_fixture' }, target)).toThrow();
  });
  it('rejects dummy CAPTCHA keys and unexpected native challenge origins in hosted builds', () => {
    expect(() => hostedPublicConfig({ ...values, EXPO_PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA' }, target)).toThrow();
    expect(() => hostedPublicConfig({ ...values, EXPO_PUBLIC_WEB_ORIGIN: 'https://evil.example' }, target)).toThrow();
    expect(hostedPublicConfig({ ...values, EXPO_PUBLIC_TURNSTILE_SITE_KEY: '0x4AAAAAAAProductionFixture' }, target).EXPO_PUBLIC_TURNSTILE_SITE_KEY).toBe('0x4AAAAAAAProductionFixture');
  });
  it('rejects server secrets and duplicate public variables in the build env', () => {
    expect(parsePublicEnv('# public only\nEXPO_PUBLIC_SUPABASE_URL=https://example.supabase.co\n')).toEqual({ EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' });
    expect(() => parsePublicEnv('SUPABASE_SERVICE_ROLE_KEY=secret')).toThrow();
    expect(() => parsePublicEnv('EXPO_PUBLIC_SUPABASE_URL=a\nEXPO_PUBLIC_SUPABASE_URL=b')).toThrow();
  });
});
