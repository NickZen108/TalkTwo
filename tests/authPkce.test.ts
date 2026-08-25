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
  assert.match(auth, /parsed\.query\.getAll\('code'\)/);
  assert.match(auth, /supabase\.auth\.exchangeCodeForSession\(code\)/);
  assert.match(auth, /parsed\.fragment\.has\('access_token'\)/);
  assert.match(auth, /parsed\.fragment\.has\('refresh_token'\)/);
  assert.match(auth, /unsupported legacy authentication flow/i);
  assert.doesNotMatch(auth, /supabase\.auth\.setSession\(/);
});

test('auth redirect and callback share the central verified app-link boundary', () => {
  assert.match(auth, /AUTH_REDIRECT_URL = buildTalkTwoLink\('auth'\)/);
  assert.match(auth, /const parsed = parseTalkTwoLink\(url\)/);
  assert.match(auth, /parsed\.family !== 'auth'/);
  assert.match(auth, /parsed\.pathSegments\.length !== 1/);
  assert.match(auth, /codes\.length !== 1/);
  assert.match(auth, /code\.length > 2048/);
  assert.match(auth, /[\\u0000-\\u001f\\u007f]/);
});
