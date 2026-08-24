import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync(
  'supabase/migrations/20260820152500_database_advisor_hardening.sql',
  'utf8',
);

test('all advisor-reported foreign keys receive covering indexes', () => {
  for (const column of [
    'invitation_id',
    'member_user_id',
    'relationship_id',
    'claimed_by',
    'purchaser_id',
    'recipient_user_id',
    'checkout_intent_id',
  ]) {
    assert.match(migration, new RegExp(`on public\\.[a-z_]+ \\(${column}\\)`, 'i'));
  }
});

test('gift visibility keeps both access paths in one optimized policy', () => {
  assert.match(migration, /drop policy if exists premium_gifts_purchaser_select/i);
  assert.match(migration, /drop policy if exists premium_gifts_recipient_select/i);
  assert.match(migration, /create policy premium_gifts_visible_select/i);
  assert.match(migration, /purchaser_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /\(select auth\.jwt\(\)\) ->> 'email'/i);
  assert.match(migration, /status = 'paid'/i);
  assert.match(migration, /claim_expires_at > now\(\)/i);
});
