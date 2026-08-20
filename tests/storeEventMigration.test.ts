import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/migrations/20260820112904_store_notification_event_ingestion.sql', import.meta.url),
  'utf8',
);

test('store notifications are idempotent by provider event id', () => {
  assert.match(migration, /unique \(platform, provider_event_id\)/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /return 'duplicate'/i);
});

test('verified product policy is server-owned', () => {
  assert.match(migration, /create table if not exists public\.store_product_catalog/i);
  assert.match(migration, /store product does not match billing intent/i);
  assert.match(migration, /store product does not match expected amount/i);
  assert.match(migration, /checkout intent required for initial purchase/i);
});

test('store ingestion and ledger mutation stay server-only', () => {
  for (const table of ['store_product_catalog', 'store_notification_events']) {
    assert.match(
      migration,
      new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, 'i'),
    );
  }
  for (const functionName of ['record_verified_store_event', 'process_verified_store_notification']) {
    assert.match(migration, new RegExp(`create or replace function public\\.${functionName}`, 'i'));
    assert.match(
      migration,
      new RegExp(`revoke execute on function public\\.${functionName}[\\s\\S]*?from public, anon, authenticated`, 'i'),
    );
  }
});

test('provider retries cannot silently change transaction ownership', () => {
  assert.match(migration, /store transaction identity mismatch/i);
  assert.match(migration, /existing_event\.user_id <> p_user_id/i);
  assert.match(migration, /existing_event\.product_id <> trim\(p_product_id\)/i);
});
