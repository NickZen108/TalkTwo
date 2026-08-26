import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync('supabase/migrations/20260824114500_extra_member_hold_lifecycle.sql', 'utf8');
const storeLifecycle = fs.readFileSync('supabase/migrations/20260820125229_recurring_premium_subscription_lifecycle.sql', 'utf8');

test('verified provider hold/pause events are distinct from ordinary cancellation', () => {
  assert.match(storeLifecycle, /p_event_type in \('cancellation', 'on_hold', 'pause'\)/i);
  assert.match(migration, /new\.event_type not in \('on_hold', 'pause'\)/i);
  assert.match(migration, /billing_intent_kind = 'extra_member_start'/i);
  assert.match(migration, /status = 'on_hold'/i);
});

test('extra-member hold suspends every paid chat server membership immediately', () => {
  assert.match(migration, /relationship_member_subscriptions[\s\S]*status = 'payment_failed'/i);
  assert.match(migration, /delete from public\.relationship_members/i);
  assert.match(migration, /s\.status = 'payment_failed'/i);
  assert.match(migration, /push_notification_jobs/i);
  assert.match(migration, /status='cancelled'/i);
});

test('verified recovery can reactivate an on-hold subscription without requiring a later period end', () => {
  assert.match(migration, /period_end <= account_subscription\.current_period_end[\s\S]*account_subscription\.status <> 'on_hold'/i);
  assert.match(migration, /s\.status in \('active', 'cancel_at_period_end', 'payment_failed'\)/i);
  assert.match(migration, /insert into public\.relationship_members/i);
  assert.match(migration, /on conflict\(relationship_id, user_id\) do update set role = excluded\.role/i);
});

test('recovery never resurrects a chat whose unanimous approval was withdrawn', () => {
  const approvalGuard = /not exists \([\s\S]*member_invitation_approvals[\s\S]*a\.decision is distinct from true[\s\S]*\)/i;
  assert.match(migration, approvalGuard);
  const reactivation = migration.match(/update public\.relationship_member_subscriptions s[\s\S]*?insert into public\.relationship_members/i)?.[0] ?? '';
  assert.match(reactivation, approvalGuard);
});

test('extra-member lifecycle mutation remains service-side', () => {
  assert.match(migration, /Service role required/i);
  assert.match(migration, /revoke execute on function public\.renew_extra_member_subscription\(text, timestamptz, timestamptz\)[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.renew_extra_member_subscription\(text, timestamptz, timestamptz\)[\s\S]*to service_role/i);
});
