import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync('supabase/migrations/20260820181500_locale_preferences.sql', 'utf8');

test('locale preference is constrained to system, English, or Danish', () => {
  assert.match(migration, /locale_preference in \('system', 'en', 'da'\)/i);
  assert.match(migration, /resolved_locale not in \('en', 'da'\)/i);
});

test('locale RPCs are authenticated owner operations with fixed search paths', () => {
  assert.match(migration, /get_my_locale_preference[\s\S]*security definer\s+set search_path = ''/i);
  assert.match(migration, /set_my_locale_preference[\s\S]*security definer\s+set search_path = ''/i);
  assert.match(migration, /where p\.id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /revoke execute on function public\.set_my_locale_preference\(text, text\) from public, anon/i);
});
