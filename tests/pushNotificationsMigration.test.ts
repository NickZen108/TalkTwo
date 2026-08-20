import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync('supabase/migrations/20260820174500_private_push_notifications.sql', 'utf8');

test('push tokens and jobs are private server-owned data', () => {
  for (const table of ['push_devices', 'push_notification_jobs']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, 'i'));
    assert.match(migration, new RegExp(`grant select, insert, update, delete on table public\\.${table} to service_role`, 'i'));
  }
  assert.match(migration, /expo_push_token text not null unique/i);
  assert.doesNotMatch(migration, /message_body|attachment_name|sender_name/i);
});

test('jobs are queued without content and cannot be claimed before the server window', () => {
  assert.match(migration, /select new\.id, d\.id, new\.recipient_id, new\.available_at, new\.available_at/i);
  assert.match(migration, /if new\.blocked_for_recipient then return new/i);
  assert.match(migration, /j\.available_at <= now\(\)[\s\S]*m\.available_at <= now\(\)/i);
  assert.match(migration, /m\.withdrawn_at is null and m\.rejected_at is null and m\.opened_at is null/i);
  assert.match(migration, /for update of j skip locked/i);
  assert.match(migration, /limit greatest\(1, least\(coalesce\(batch_limit, 100\), 100\)\)/i);
});

test('account switching cancels old jobs before a token is rebound', () => {
  assert.match(migration, /existing_device\.user_id <> uid[\s\S]*Device token rebound to another signed-in account/i);
  assert.match(migration, /where device_id = existing_device\.id and status in \('pending', 'processing', 'ticketed'\)/i);
});

test('client RPCs are owner-bound while dispatcher RPCs are service-role only', () => {
  assert.match(migration, /where d\.user_id = \(select auth\.uid\(\)\)[\s\S]*d\.expo_push_token/i);
  assert.match(migration, /where d\.user_id = \(select auth\.uid\(\)\)[\s\S]*trim\(coalesce\(expo_token/i);
  for (const fn of ['claim_due_push_jobs', 'record_push_ticket', 'list_pending_push_receipts', 'record_push_receipt']) {
    assert.match(migration, new RegExp(`revoke execute on function public\\.${fn}[^;]+from public, anon, authenticated`, 'i'));
    assert.match(migration, new RegExp(`grant execute on function public\\.${fn}[^;]+to service_role`, 'i'));
  }
});

test('ticket and receipt failures disable invalid devices and retry transient failures', () => {
  assert.match(migration, /error_code = 'DeviceNotRegistered'[\s\S]*enabled = false/i);
  assert.match(migration, /DeviceNotRegistered', 'MessageTooBig', 'MismatchSenderId', 'InvalidCredentials/i);
  assert.match(migration, /attempt_count >= 4 then 'failed' else 'pending'/i);
  assert.match(migration, /Recovered stale dispatcher lock/i);
});
