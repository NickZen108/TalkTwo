import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/migrations/20260820121002_verified_store_restore.sql', import.meta.url),
  'utf8',
);

test('restore only confirms an existing user-owned store event', () => {
  assert.match(migration, /returns boolean/i);
  assert.match(migration, /event\.user_id = p_user_id/i);
  assert.match(migration, /event\.product_id = trim\(p_product_id\)/i);
  assert.match(migration, /provider_original_transaction_id = normalized_original/i);
  assert.doesNotMatch(migration, /insert into|update public|delete from/i);
});

test('restore RPC is server-only', () => {
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /revoke execute[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute[\s\S]*to service_role/i);
});
