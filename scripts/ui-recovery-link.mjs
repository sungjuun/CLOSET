import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { localSupabaseSettings } from './local-supabase.mjs';

// Consume only the email requested by this run's disposable UI fixture.
localSupabaseSettings();
const fixture = JSON.parse(readFileSync('test-results/ui-fixture.json', 'utf8'));
const inbox = await fetch('http://127.0.0.1:54324/api/v1/messages').then((response) => response.json());
const message = inbox.messages.find((entry) => entry.To.some((recipient) => recipient.Address === fixture.email));
assert.ok(message, 'UI fixture recovery email missing');
const body = await fetch(`http://127.0.0.1:54324/api/v1/message/${message.ID}`).then((response) => response.json());
const link = (body.HTML || body.Text).match(/https?:\/\/[^\s"<>]+\/auth\/v1\/verify[^\s"<>]*/)?.[0]?.replaceAll('&amp;', '&');
assert.ok(link, 'UI fixture verification link missing');
const response = await fetch(link, { redirect: 'manual' });
const url = new URL(response.headers.get('location'));
assert.equal(url.origin, 'http://localhost:8081');
assert.equal(url.pathname, '/auth/callback');
assert.ok(url.searchParams.get('code'));
writeFileSync('test-results/ui-recovery.json', JSON.stringify({ url: url.href, messageId: message.ID }));
process.stdout.write('임시 인증 복귀 링크를 준비했습니다. 인증 코드는 출력하지 않았습니다.\n');
