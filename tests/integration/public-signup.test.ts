import { spawnSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database.generated';
import { localDockerSupabase } from '../helpers/local-supabase';
import { createAuthService } from '../../src/features/auth/service';
import { readMemberUsage } from '../../src/features/usage/model';
const config = localDockerSupabase(); const name = `closet-auth-signup-${randomUUID().slice(0, 8)}`;
const admin = createClient<Database>(config.API_URL, config.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const created: string[] = []; const emails: string[] = []; const clients: SupabaseClient<Database>[] = []; let base = ''; let launched = false;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
beforeAll(async () => {
  // Reuse only this checkout's local Auth image/environment. Neither remote config
  // nor the running local server is changed. Mail stays in the local Mailpit inbox.
  const inspected = spawnSync('docker', ['inspect', 'supabase_auth_closet'], { encoding: 'utf8' }); if (inspected.status !== 0) throw new Error('Local Auth required');
  const original = JSON.parse(inspected.stdout)[0];
  if (!original.NetworkSettings.Networks.supabase_network_closet) throw new Error('Local network required');
  const values = Object.fromEntries(original.Config.Env.map((entry: string) => { const i = entry.indexOf('='); return [entry.slice(0, i), entry.slice(i + 1)]; }));
  if (values.GOTRUE_SMTP_HOST !== 'supabase_inbucket_closet' || new URL(String(values.GOTRUE_DB_DATABASE_URL)).hostname !== 'supabase_db_closet') throw new Error('Fixture database and mail must remain local');
  if (Object.values(values).some(value => /[\r\n]/.test(String(value)))) throw new Error('Invalid local fixture environment');
  const process = spawn('docker', ['run', '--rm', '-i', '--name', name, '--label', 'closet.registration-fixture=true', '--network', 'supabase_network_closet', '-p', '127.0.0.1::9999', '--entrypoint', '/bin/sh', original.Config.Image, '-c', 'while IFS= read -r line; do export "$line"; done; exec auth'], { stdio: ['pipe', 'ignore', 'ignore'] });
  launched = true;
  values.GOTRUE_DISABLE_SIGNUP = 'false'; values.GOTRUE_MAILER_AUTOCONFIRM = 'false'; values.GOTRUE_SECURITY_CAPTCHA_ENABLED = 'false'; values.GOTRUE_MAILER_OTP_EXP = '3600'; values.GOTRUE_RATE_LIMIT_EMAIL_SENT = '100'; values.GOTRUE_SMTP_MAX_FREQUENCY = '0';
  process.stdin.end(Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n');
  for (let i = 0; i < 40; i++) {
    const found = spawnSync('docker', ['port', name, '9999/tcp'], { encoding: 'utf8' }); const port = found.stdout.trim().match(/^127\.0\.0\.1:(\d+)$/)?.[1];
    if (port) { base = `http://127.0.0.1:${port}`; try { if ((await fetch(`${base}/health`)).ok) break; } catch { /* Auth is starting. */ } }
    await sleep(150);
  }
  if (!base || !(await fetch(`${base}/health`)).ok) throw new Error('Isolated Auth did not start');
});
afterAll(async () => {
  try {
  for (const client of clients) await client.auth.signOut({ scope: 'local' });
  for (const id of created) if ((await admin.auth.admin.deleteUser(id)).error) throw new Error('Fixture user cleanup failed');
  const inbox = await fetch('http://127.0.0.1:54324/api/v1/messages').then(r => r.json());
  const ids = inbox.messages.filter((message: { To: { Address: string }[] }) => message.To.some(recipient => emails.includes(recipient.Address))).map((message: { ID: string }) => message.ID);
  if (ids.length) await fetch('http://127.0.0.1:54324/api/v1/messages', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: ids }) });
  } finally { if (launched) spawnSync('docker', ['stop', '-t', '1', name], { encoding: 'utf8' }); }
});
function client() {
  const storage = new Map<string, string>();
  const c = createClient<Database>(config.API_URL, config.ANON_KEY, { auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, flowType: 'pkce', storageKey: `registration-${randomUUID()}`, storage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => { storage.set(key, value); }, removeItem: key => { storage.delete(key); } } }, db: { retry: false }, global: { fetch: async (input, init) => {
    const url = new URL(String(input)); if (url.origin === config.API_URL && url.pathname.startsWith('/auth/v1/')) return fetch(`${base}${url.pathname.slice('/auth/v1'.length)}${url.search}`, init);
    return fetch(input, init);
  } } }); clients.push(c); return c;
}
describe('public signup email and first-login flow on isolated local Auth', () => {
  it('requires email confirmation, exchanges the PKCE link once, and creates an isolated empty wardrobe', async () => {
    const c = client(); const email = `closet-signup-${randomUUID()}@example.test`; emails.push(email); const password = `${randomUUID()}Aa!9`;
    const api = createAuthService(c, false);
    expect(await api.signUp({ email, password, confirmation: password }, 'http://localhost:8081/auth/callback')).toContain('인증 이메일');
    const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 }); const user = users.data.users.find(x => x.email === email); expect(user).toBeTruthy(); created.push(user!.id);
    await expect(api.signIn({ email, password })).rejects.toMatchObject({ code: 'email_not_confirmed' });
    let message: { ID: string } | undefined;
    for (let i = 0; i < 30 && !message; i++) { const inbox = await fetch('http://127.0.0.1:54324/api/v1/messages').then(r => r.json()); message = inbox.messages.find((m: { To: { Address: string }[] }) => m.To.some(x => x.Address === email)); if (!message) await sleep(100); }
    expect(message).toBeTruthy();
    const body = await fetch(`http://127.0.0.1:54324/api/v1/message/${message!.ID}`).then(r => r.json());
    const link = (body.HTML || body.Text).match(/https?:\/\/[^\s"<>]+\/auth\/v1\/verify[^\s"<>]*/)?.[0]?.replaceAll('&amp;', '&'); expect(link).toBeTruthy();
    const original = new URL(link!); const verified = await fetch(`${base}${original.pathname.slice('/auth/v1'.length)}${original.search}`, { redirect: 'manual' });
    const redirect = new URL(verified.headers.get('location')!); expect(redirect.origin).toBe('http://localhost:8081'); expect(redirect.pathname).toBe('/auth/callback'); const code = redirect.searchParams.get('code'); expect(code).toBeTruthy();
    expect(await api.completeCallback(code!)).toBe(false);
    expect((await c.auth.getSession()).data.session?.user.id).toBe(user!.id);
    expect((await c.from('profiles').select('id').single()).data?.id).toBe(user!.id);
    expect((await c.from('wardrobe_items').select('id')).data).toEqual([]);
    expect((await c.from('outfits').select('id')).data).toEqual([]);
    expect((await c.rpc('member_categories', { p_owner: user!.id })).data?.length).toBeGreaterThan(0);
    expect((await readMemberUsage(c, user!.id)).wardrobe_limit).toBe(300);
    await expect(api.completeCallback(code!)).rejects.toBeTruthy();
    expect((await fetch(`${config.API_URL}/auth/v1/settings`, { headers: { apikey: config.ANON_KEY } }).then(r => r.json())).disable_signup).toBe(true);
  });
});
