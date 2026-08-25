import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync(
  'supabase/migrations/20260825102000_store_lifecycle_ordering.sql',
  'utf8',
);

test('different provider events for one subscription are serialized before lifecycle mutation', () => {
  assert.match(migration, /talktwo:store-subscription-order:/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /provider_original_transaction_id = normalized_original/i);
});

test('trusted provider occurrence time prevents reverse-order entitlement mutations', () => {
  assert.match(migration, /Verified subscription lifecycle event time required/i);
  assert.match(migration, /Provider lifecycle event time is implausibly in the future/i);
  assert.match(migration, /latest_occurred_at > p_occurred_at/i);
  assert.match(migration, /ignored_stale_provider_order/i);
  assert.match(migration, /status = 'processed'/i);
});

test('same-timestamp lifecycle conflicts resolve deterministically toward safer states', () => {
  assert.match(migration, /when 'revocation' then 100/i);
  assert.match(migration, /when 'expiry' then 90/i);
  assert.match(migration, /when 'on_hold' then 80/i);
  assert.match(migration, /when 'cancellation' then 70/i);
  assert.match(migration, /when 'recovery' then 50/i);
  assert.match(migration, /latest_rank[^\n]*> current_rank/i);
});

test('Premium can recover or change state within the same paid period without moving the boundary', () => {
  const renew = migration.match(/create or replace function public\.renew_premium_store_subscription[\s\S]*?\$\$;/i)?.[0] ?? '';
  assert.match(renew, /period_end < subscription\.current_period_end[\s\S]*return 'ignored_stale'/i);
  assert.match(renew, /period_end = subscription\.current_period_end/i);
  assert.match(renew, /effective_start := subscription\.current_period_start/i);
  assert.match(renew, /effective_end := subscription\.current_period_end/i);
  assert.match(renew, /set status = renewal_status/i);
  assert.doesNotMatch(renew, /period_end <= subscription\.current_period_end then return 'ignored_stale'/i);
});

test('provider purchase callbacks without checkout intent are confirmation-only and already-linked', () => {
  assert.match(migration, /linked_purchase_confirmation boolean/i);
  assert.match(migration, /from public\.store_purchase_events e[\s\S]*provider_transaction_id = normalized_transaction/i);
  assert.match(migration, /Checkout intent required for unlinked initial purchase/i);
  assert.match(migration, /recorded_purchase_confirmation/i);
  assert.match(migration, /p_event_type = 'purchase' and linked_purchase_confirmation/i);
});

test('ordering helper is private and lifecycle processor remains service-only', () => {
  assert.match(migration, /revoke execute on function private\.store_lifecycle_event_rank\(text\)[\s\S]*service_role/i);
  assert.match(migration, /revoke execute on function public\.process_verified_store_notification[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.process_verified_store_notification[\s\S]*to service_role/i);
});
