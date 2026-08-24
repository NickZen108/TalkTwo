import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const client = fs.readFileSync('src/lib/supabase.ts', 'utf8');
const auth = fs.readFileSync('src/services/auth.ts', 'utf8');

test('Supabase mobile auth is configured for PKCE with protected native storage', () => {
  assert.match(client, /flowType:\s*'pkce'/);
  assert.match(client, /Platform\.OS !== 'web' \? \{ storage: secureAuthStorage \}/);
  assert.match(client, /detectSessionInUrl:\s*false/);
});

test('magic-link callback exchanges one PKCE code instead of importing URL credentials', () => {
  assert.match(auth, /parsed\.searchParams\.getAll\('code'\)/);
  assert.match(auth, /supabase\.auth\.exchangeCodeForSession\(code\)/);
  assert.match(auth, /fragment\.has\('access_token'\)/);
  assert.match(auth, /fragment\.has\('refresh_token'\)/);
  assert.match(auth, /unsupported legacy authentication flow/i);
  assert.doesNotMatch(auth, /supabase\.auth\.setSession\(/);
});

test('auth callback validates the TalkTwo callback origin and rejects malformed codes', () => {
  assert.match(auth, /parsed\.protocol !== 'talktwo:'/);
  assert.match(auth, /parsed\.hostname\.toLowerCase\(\) !== 'auth'/);
  assert.match(auth, /codes\.length !== 1/);
  assert.match(auth, /code\.length > 2048/);
  assert.match(auth, /[\\u0000-\\u001f\\u007f]/);
});
