import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const check = fs.readFileSync('supabase/checks/account_deletion_schema.sql', 'utf8');

test('post-deploy deletion gate rejects blocking public auth.users foreign keys', () => {
  assert.match(check, /con\.confrelid\s*=\s*'auth\.users'::regclass/i);
  assert.match(check, /n\.nspname\s*=\s*'public'/i);
  assert.match(check, /con\.confdeltype\s+in\s*\('a',\s*'r'\)/i);
  assert.match(check, /raise exception 'Account deletion can be blocked/i);
});

test('post-deploy deletion gate preserves payer history by SET NULL and membership cleanup by CASCADE', () => {
  assert.match(check, /premium_gifts_purchaser_id_fkey',\s*'n'/i);
  assert.match(check, /premium_sponsorship_credits_payer_user_id_fkey',\s*'n'/i);
  assert.match(check, /store_purchase_events_user_id_fkey',\s*'n'/i);
  assert.match(check, /premium_store_subscriptions_payer_user_id_fkey',\s*'n'/i);
  assert.match(check, /premium_store_subscription_members_user_id_fkey',\s*'c'/i);
});
