import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/migrations/20260820110000_fix_account_wide_subscription_lifecycle.sql', import.meta.url),
  'utf8',
);

test('one provider subscription can cover multiple approved chats', () => {
  assert.match(
    migration,
    /drop constraint if exists relationship_member_subscriptions_provider_subscription_id_key/i,
  );
  assert.match(migration, /create index if not exists relationship_member_subscriptions_provider_idx/i);
  assert.match(migration, /create unique index if not exists extra_member_access_provider_subscription_uidx/i);
});

test('renewal is monotonic and only extends chats with unanimous approval', () => {
  assert.match(migration, /if period_end <= account_subscription\.current_period_end/i);
  assert.match(migration, /return 'ignored_stale'/i);
  assert.match(migration, /a\.decision is distinct from true/i);
  assert.match(migration, /s\.status = 'active'/i);
});

test('provider cancellation, expiry, and revocation stay server-only', () => {
  for (const functionName of [
    'cancel_extra_member_subscription',
    'expire_extra_member_subscription',
    'revoke_extra_member_subscription',
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${functionName}`, 'i'));
    assert.match(
      migration,
      new RegExp(`revoke execute on function public\\.${functionName}\\(text\\)[\\s\\S]*?from public, anon, authenticated`, 'i'),
    );
  }
});
