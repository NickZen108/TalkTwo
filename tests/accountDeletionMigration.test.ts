import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync('supabase/migrations/20260820150217_account_deletion.sql', 'utf8');

test('account deletion preserves other members and paid gifts without retaining user identity', () => {
  assert.match(migration, /relationships_created_by_fkey[\s\S]*on delete set null/i);
  assert.match(migration, /premium_gifts_purchaser_id_fkey[\s\S]*on delete set null/i);
  assert.match(migration, /premium_sponsorship_credits_payer_user_id_fkey[\s\S]*on delete set null/i);
  assert.match(migration, /store_purchase_events_user_id_fkey[\s\S]*on delete set null/i);
  assert.match(migration, /premium_store_subscriptions_payer_user_id_fkey[\s\S]*on delete set null/i);
  assert.match(migration, /premium_store_subscription_members_user_id_fkey[\s\S]*on delete cascade/i);
});

test('deleted payer subscriptions cannot be silently renewed or rebound', () => {
  assert.match(migration, /prepare_talktwo_account_deletion[\s\S]*auto_renew = false/i);
  assert.match(migration, /if old\.payer_user_id is null then[\s\S]*new\.payer_user_id := null/i);
  assert.match(migration, /new\.current_period_end := old\.current_period_end/i);
  assert.match(migration, /new\.auto_renew := false/i);
  assert.match(migration, /revoke all on function private\./i);
});
