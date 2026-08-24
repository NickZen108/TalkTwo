import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync('src/lib/supabase.ts', 'utf8');

test('mobile Supabase client reads the same public environment values checked by release preflight', () => {
  assert.match(source, /process\.env\.EXPO_PUBLIC_SUPABASE_URL/i);
  assert.match(source, /process\.env\.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY/i);
  assert.match(source, /createClient\(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY/i);
});

test('mobile client fails closed unless the API key is a current Supabase publishable key', () => {
  assert.match(source, /\^sb_publishable_/i);
  assert.match(source, /TalkTwo Supabase client configuration is missing or unsafe/i);
  assert.doesNotMatch(source, /sb_secret_/i);
  assert.doesNotMatch(source, /https:\/\/gqiyzactnxjhbxzvbgui\.supabase\.co/i);
  assert.doesNotMatch(source, /sb_publishable_[A-Za-z0-9_-]{10,}/i);
});
