import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync('supabase/migrations/20260824114000_premium_on_hold_projection.sql', 'utf8');
const lifecycle = fs.readFileSync('supabase/migrations/20260820125229_recurring_premium_subscription_lifecycle.sql', 'utf8');

test('provider on-hold and pause events route to an immediate non-active Premium state', () => {
  assert.match(lifecycle, /p_event_type in \('cancellation', 'on_hold', 'pause'\)/i);
  assert.match(lifecycle, /case when p_event_type in \('on_hold', 'pause'\) then 'on_hold' else 'cancel_at_period_end' end/i);
  assert.match(migration, /hold_status not in \('cancel_at_period_end', 'on_hold'\)/i);
});

test('on-hold Premium reprojects every covered member immediately', () => {
  assert.match(migration, /if hold_status = 'on_hold' then/i);
  assert.match(migration, /premium_store_subscription_members/i);
  assert.match(migration, /perform public\.sync_store_premium_user_plan\([\s\S]*member_record\.user_id,[\s\S]*subscription\.current_period_end/i);
});

test('normal cancellation still preserves access through the paid period', () => {
  const holdBlock = migration.match(/if hold_status = 'on_hold' then[\s\S]*?end if;/i)?.[0] ?? '';
  assert.match(holdBlock, /sync_store_premium_user_plan/i);
  assert.doesNotMatch(migration, /if hold_status = 'cancel_at_period_end'[\s\S]*sync_store_premium_user_plan/i);
});

test('Premium lifecycle mutation remains service-only', () => {
  assert.match(migration, /Service role required/i);
  assert.match(migration, /revoke execute on function public\.cancel_premium_store_subscription\(text, text, text\)[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.cancel_premium_store_subscription\(text, text, text\)[\s\S]*to service_role/i);
});
