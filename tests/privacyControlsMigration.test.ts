import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync('supabase/migrations/20260824110000_privacy_controls_and_notification_mutes.sql', 'utf8');
const storageBoundaryMigration = fs.readFileSync('supabase/migrations/20260824113000_storage_boundary_enforcement.sql', 'utf8');

test('partner timezone/window RPC is not participant-readable', () => {
  assert.match(migration, /revoke execute on function public\.get_relationship_partner_settings\(uuid\) from authenticated/i);
  assert.match(migration, /grant execute on function public\.get_relationship_partner_settings\(uuid\) to service_role/i);
});

test('sender message rows reveal neither opens nor rejection decisions', () => {
  const mine = migration.match(/with mine as \([\s\S]*?\), incoming as \(/i)?.[0] ?? '';
  assert.match(mine, /null::timestamptz as opened_at/i);
  assert.match(mine, /null::timestamptz as rejected_at/i);
  assert.match(mine, /null::text as reject_reason/i);
  assert.match(mine, /0::int as rejected_count/i);
  assert.doesNotMatch(mine, /count\(\*\) filter\s*\(where m\.rejected_at/i);
});

test('blocking is owner-only and supports exactly the requested durations', () => {
  assert.match(migration, /expires_at timestamptz/i);
  assert.match(migration, /block_minutes not in \(60,240,1440\)/i);
  assert.match(migration, /expires_at is null or b\.expires_at>now\(\)/i);
  assert.match(migration, /list_my_member_blocks/i);
});

test('notification mutes are owner-only and can target app chat or sender', () => {
  assert.match(migration, /create table if not exists public\.notification_mutes/i);
  assert.match(migration, /alter table public\.notification_mutes enable row level security/i);
  assert.match(migration, /revoke all on table public\.notification_mutes from public,anon,authenticated/i);
  assert.match(migration, /set_my_notification_mute/i);
  assert.match(migration, /m\.relationship_id=new\.relationship_id/i);
  assert.match(migration, /m\.sender_id=new\.sender_id/i);
  assert.match(migration, /m\.relationship_id is null and m\.sender_id is null/i);
});

test('public names and every stored message pass neutralization gates', () => {
  assert.match(migration, /safe_public_display_name/i);
  assert.match(migration, /symbolic_tone_block_reason/i);
  assert.match(migration, /before insert or update of body on public\.messages/i);
  assert.match(migration, /hader\|hate\|hates/i);
});

test('expired timed blocks cannot bypass active Personal Boundaries at storage', () => {
  assert.match(storageBoundaryMigration, /create or replace function private\.enforce_message_privacy_invariants/i);
  assert.match(storageBoundaryMigration, /b\.expires_at is null or b\.expires_at > now\(\)/i);
  assert.match(storageBoundaryMigration, /if not new\.blocked_for_recipient and new\.body is not null/i);
  assert.match(storageBoundaryMigration, /private\.matching_personal_boundary\(/i);
  assert.match(storageBoundaryMigration, /raise exception 'Message contains a recipient''s blocked word or phrase/i);
});

test('plaintext is processed for trusted checks but removed before an inserted message is persisted', () => {
  const boundaryMatch = storageBoundaryMigration.indexOf('private.matching_personal_boundary(');
  const scrub = storageBoundaryMigration.indexOf('new.body := null;');
  assert.ok(boundaryMatch >= 0, 'Personal Boundary storage check is required');
  assert.ok(scrub > boundaryMatch, 'plaintext may only be cleared after storage-boundary checks');
  assert.match(storageBoundaryMigration, /new\.plaintext_scrubbed_at := coalesce\(new\.plaintext_scrubbed_at, now\(\)\)/i);
  assert.match(storageBoundaryMigration, /not a claim of[\s\S]*end-to-end encryption/i);
});
