import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/migrations/20260820125229_recurring_premium_subscription_lifecycle.sql', import.meta.url),
  'utf8',
);

test('Premium store subscriptions have a server-only source-of-truth ledger', () => {
  assert.match(migration, /create table if not exists public\.premium_store_subscriptions/i);
  assert.match(migration, /create table if not exists public\.premium_store_subscription_members/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.premium_store_subscriptions from public, anon, authenticated/i);
});

test('two-person Premium requires a specific active relationship beneficiary', () => {
  assert.match(migration, /create or replace function public\.create_premium_checkout_intent/i);
  assert.match(migration, /beneficiary_user = caller/i);
  assert.match(migration, /Premium beneficiary must share an active relationship with the purchaser/i);
  assert.match(migration, /payer\.relationship_id = r\.id and payer\.user_id = caller/i);
});

test('renewal is monotonic and tier changes fail closed', () => {
  assert.match(migration, /if period_end <= subscription\.current_period_end then return 'ignored_stale'/i);
  assert.match(migration, /Premium product changes require a new checkout/i);
  assert.match(migration, /Monthly Premium period is too long/i);
  assert.match(migration, /Annual Premium period is too long/i);
});

test('cancellation preserves paid access while expiry and refund resynchronise users', () => {
  assert.match(migration, /'cancel_at_period_end', 'on_hold'/i);
  assert.match(migration, /create or replace function public\.expire_premium_store_subscription/i);
  assert.match(migration, /create or replace function public\.revoke_premium_store_subscription/i);
  assert.match(migration, /perform public\.sync_store_premium_user_plan/i);
  assert.match(migration, /current_plan\.premium_ends_at > removed_period_end/i);
});

test('verified store notifications route the complete Premium lifecycle', () => {
  for (const functionName of [
    'start_premium_store_subscription',
    'renew_premium_store_subscription',
    'cancel_premium_store_subscription',
    'expire_premium_store_subscription',
    'revoke_premium_store_subscription',
  ]) {
    assert.match(migration, new RegExp(`public\\.${functionName}`, 'i'));
  }
  assert.doesNotMatch(migration, /Premium subscription lifecycle is not enabled yet/i);
});

test('follow-up events may omit but cannot replace the original checkout intent', () => {
  assert.match(migration, /p_checkout_intent_id is not null[\s\S]*?existing_event\.checkout_intent_id is distinct from p_checkout_intent_id/i);
  assert.match(migration, /Store transaction identity mismatch/i);
});

test('all entitlement mutation functions remain service-role only', () => {
  for (const functionName of [
    'sync_store_premium_user_plan',
    'start_premium_store_subscription',
    'renew_premium_store_subscription',
    'cancel_premium_store_subscription',
    'expire_premium_store_subscription',
    'revoke_premium_store_subscription',
  ]) {
    assert.match(
      migration,
      new RegExp(`revoke execute on function public\\.${functionName}[\\s\\S]*?from public, anon, authenticated`, 'i'),
    );
  }
});
