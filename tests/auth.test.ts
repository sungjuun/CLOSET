import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { credentialsSchema, newPasswordSchema, callbackCode } from '../src/features/auth/schemas';
import { authErrorMessage } from '../src/features/auth/errors';
import { createAuthService } from '../src/features/auth/service';
import type { Database } from '../src/types/database.generated';

describe('authentication inputs and messages', () => {
  it('normalizes email without changing password whitespace', () => {
    expect(credentialsSchema.parse({ email: ' person@example.com ', password: ' secret123 ' })).toEqual({ email: 'person@example.com', password: ' secret123 ' });
    expect(() => credentialsSchema.parse({ email: 'invalid', password: '123' })).toThrow();
    expect(() => newPasswordSchema.parse({ password: 'password1', confirmation: 'different' })).toThrow();
  });
  it('only accepts one bounded PKCE code and ignores arbitrary redirects', () => {
    expect(callbackCode({ code: 'one-time-code' })).toBe('one-time-code');
    for (const input of [{}, { code: ['a', 'b'] }, { code: 'valid', error: 'denied' }, { code: 'x'.repeat(4097) }]) {
      expect(() => callbackCode(input)).toThrow();
    }
  });
  it('does not expose raw server errors or account existence', () => {
    expect(authErrorMessage({ message: 'private server details' })).not.toContain('private');
    expect(authErrorMessage({ code: 'invalid_credentials' })).toContain('이메일 또는 비밀번호');
    expect(authErrorMessage({ code: 'signup_disabled' })).toContain('초대');
  });
});

describe('authentication service boundaries', () => {
  it('fails closed without a configured backend', async () => {
    await expect(createAuthService(null).signIn({ email: 'person@example.com', password: 'password1' })).rejects.toEqual({ code: 'backend_missing' });
  });
  it('validates input before sending a request and preserves server signup policy', async () => {
    const signUp = vi.fn().mockResolvedValue({ error: { code: 'signup_disabled' } });
    const client = { auth: { signUp } } as unknown as SupabaseClient<Database>;
    const service = createAuthService(client);
    await expect(service.signUp({ email: 'person@example.com', password: 'password1', confirmation: 'mismatch' }, 'http://localhost:8081/auth/callback')).rejects.toThrow();
    expect(signUp).not.toHaveBeenCalled();
    await expect(service.signUp({ email: 'person@example.com', password: 'password1', confirmation: 'password1' }, 'http://localhost:8081/auth/callback')).rejects.toEqual({ code: 'signup_disabled' });
  });
  it('requires a fresh CAPTCHA when enabled and forwards it to sign-in, signup, reset and resend', async () => {
    const response = { data: { session: null }, error: null };
    const auth = { signUp: vi.fn().mockResolvedValue(response), signInWithPassword: vi.fn().mockResolvedValue(response), resetPasswordForEmail: vi.fn().mockResolvedValue(response), resend: vi.fn().mockResolvedValue(response) };
    const service = createAuthService({ auth } as unknown as SupabaseClient<Database>, true);
    const input = { email: 'person@example.com', password: 'password1', confirmation: 'password1' };
    await expect(service.signUp(input, 'https://closet.example/auth/callback')).rejects.toEqual({ code: 'captcha_required' });
    await expect(service.signIn(input)).rejects.toEqual({ code: 'captcha_required' });
    await expect(service.requestReset(input.email, 'https://closet.example/auth/callback')).rejects.toEqual({ code: 'captcha_required' });
    await expect(service.resendSignup(input.email, 'https://closet.example/auth/callback')).rejects.toEqual({ code: 'captcha_required' });
    expect(auth.signUp).not.toHaveBeenCalled();
    const captchaToken = 'one-use-fixture-token';
    await service.signUp({ ...input, captchaToken }, 'https://closet.example/auth/callback');
    await service.signIn({ ...input, captchaToken });
    await service.requestReset(input.email, 'https://closet.example/auth/callback', captchaToken);
    await service.resendSignup(input.email, 'https://closet.example/auth/callback', captchaToken);
    expect(auth.signUp).toHaveBeenCalledWith(expect.objectContaining({ options: { emailRedirectTo: 'https://closet.example/auth/callback', captchaToken } }));
    expect(auth.signInWithPassword).toHaveBeenCalledWith(expect.objectContaining({ options: { captchaToken } }));
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith(input.email, { redirectTo: 'https://closet.example/auth/callback', captchaToken });
    expect(auth.resend).toHaveBeenCalledWith({ type: 'signup', email: input.email, options: { emailRedirectTo: 'https://closet.example/auth/callback', captchaToken } });
    expect(authErrorMessage({ code: 'captcha_failed' })).toContain('보안 확인');
  });
  it('uses recovery events and removes temporary listeners after code exchange', async () => {
    let listener: (event: string) => void = () => undefined;
    const unsubscribe = vi.fn();
    const client = { auth: {
      onAuthStateChange: vi.fn((callback) => { listener = callback; return { data: { subscription: { unsubscribe } } }; }),
      exchangeCodeForSession: vi.fn(async () => { listener('PASSWORD_RECOVERY'); return { error: null }; }),
    } } as unknown as SupabaseClient<Database>;
    expect(await createAuthService(client).completeCallback('code')).toBe(true);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
