import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync('public-site/src/main.js', 'utf8');
const html = fs.readFileSync('public-site/delete-account/index.html', 'utf8');
const env = fs.readFileSync('public-site/.env.example', 'utf8');

test('public deletion browser module parses as valid JavaScript', () => {
  execFileSync(process.execPath, ['--check', 'public-site/src/main.js'], { stdio: 'pipe' });
});

test('external deletion verifies an existing account without creating one', () => {
  assert.match(source, /signInWithOtp\(/i);
  assert.match(source, /shouldCreateUser:\s*false/i);
  assert.match(source, /emailRedirectTo:\s*redirectTo/i);
  assert.match(source, /auth\.getUser\(\)/i);
});

test('account existence is not disclosed by the magic-link request result', () => {
  assert.match(source, /does not become an account-enumeration endpoint/i);
  assert.match(source, /requestStatus\.textContent = genericLinkMessage/i);
  assert.doesNotMatch(source, /requestStatus\.textContent\s*=\s*[^;]*(?:unknown|not found|does not exist)/i);
});

test('permanent deletion requires explicit confirmation and the authenticated edge function', () => {
  assert.match(source, /toUpperCase\(\) !== 'DELETE'/i);
  assert.match(source, /functions\.invoke\('delete-account'/i);
  assert.match(source, /body:\s*\{\s*confirmation:\s*'DELETE'\s*\}/i);
  assert.match(html, /Deleting TalkTwo does not cancel an Apple App Store or Google Play subscription/i);
  assert.match(html, /src="\/src\/main\.js"/i);
});

test('browser build uses publishable configuration and never documents a private service role value', () => {
  assert.match(env, /VITE_SUPABASE_PUBLISHABLE_KEY=/i);
  assert.doesNotMatch(env, /VITE_.*SERVICE_ROLE/i);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/i);
});
