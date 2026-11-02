import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hostedPublicConfig, parsePublicEnv } from './hosted-config.mjs';

// Read-only: even the deliberately false comparison flags below are never pushed.
const target = JSON.parse(readFileSync('deployment/target.json', 'utf8'));
const config = hostedPublicConfig(parsePublicEnv(readFileSync('.env.cloud.local', 'utf8')), target);
const directory = resolve('test-results/public-auth-readiness'); mkdirSync(resolve(directory, 'supabase'), { recursive: true });
writeFileSync(resolve(directory, 'supabase/config.toml'), `project_id = "closet-readiness-only"
[auth]
site_url = "${target.siteUrl}"
additional_redirect_urls = ["${target.siteUrl}/auth/callback"]
enable_signup = false
[auth.email]
enable_confirmations = false
[auth.email.smtp]
enabled = false
[auth.captcha]
enabled = false
provider = "hcaptcha"
`);
const command = spawnSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'config', 'diff', '--workdir', directory, '--project-ref', target.supabaseProjectRef, '--output-format', 'json'], { encoding: 'utf8' });
if (command.status !== 0) throw new Error('Supabase CLI configuration read failed. No settings changed.');
const result = JSON.parse(command.stdout);
if (!result.scope?.present?.includes('auth')) throw new Error('Auth configuration was not available.');
const remote = (path, baseline) => result.changes.find(change => change.path.join('.') === path)?.remote ?? baseline;
const settings = await fetch(`${config.EXPO_PUBLIC_SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: config.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY } });
if (!settings.ok) throw new Error('Public Auth settings could not be read.');
const auth = await settings.json();
const state = { signupOpen: auth.disable_signup === false, emailLoginEnabled: auth.external?.email === true, emailConfirmationRequired: remote('auth.email.enable_confirmations', false) === true, smtpConfigured: remote('auth.email.smtp.enabled', false) === true, captchaEnabled: remote('auth.captcha.enabled', false) === true, captchaProvider: remote('auth.captcha.provider', 'hcaptcha'), captchaSiteKeyConfigured: Boolean(config.EXPO_PUBLIC_TURNSTILE_SITE_KEY), siteUrlMatches: remote('auth.site_url', target.siteUrl) === target.siteUrl, callbackAllowed: remote('auth.additional_redirect_urls', [`${target.siteUrl}/auth/callback`]).includes(`${target.siteUrl}/auth/callback`) };
console.log(JSON.stringify(state, null, 2));
if (process.argv.includes('--require-open') && (!state.signupOpen || !state.emailLoginEnabled || !state.emailConfirmationRequired || !state.smtpConfigured || !state.captchaEnabled || state.captchaProvider !== 'turnstile' || !state.captchaSiteKeyConfigured || !state.siteUrlMatches || !state.callbackAllowed)) process.exitCode = 1;
