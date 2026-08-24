import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync('supabase/migrations/20260824040500_coach_opt_in_stats.sql', 'utf8');

test('Coach statistics store only private aggregate outcome counts', () => {
  assert.match(migration, /create table public\.coach_review_stats/i);
  assert.match(migration, /reviewed_attempts integer not null default 0/i);
  assert.match(migration, /green_count integer not null default 0/i);
  assert.match(migration, /yellow_count integer not null default 0/i);
  assert.match(migration, /red_count integer not null default 0/i);
  assert.match(migration, /reviewed_attempts = green_count \+ yellow_count \+ red_count/i);
  assert.doesNotMatch(migration, /relationship_id/i);
  assert.doesNotMatch(migration, /body_hash/i);
  assert.doesNotMatch(migration, /message_text/i);
});

test('Coach statistics table is RPC-only and the getter is owner-bound', () => {
  assert.match(migration, /alter table public\.coach_review_stats enable row level security/i);
  assert.match(migration, /revoke all on table public\.coach_review_stats from public, anon, authenticated/i);
  assert.match(migration, /get_my_coach_settings[\s\S]*uid uuid := \(select auth\.uid\(\)\)/i);
  assert.match(migration, /where s\.user_id = uid/i);
  assert.match(migration, /revoke execute on function public\.get_my_coach_settings\(\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.get_my_coach_settings\(\) to authenticated, service_role/i);
});

test('only the service role can record aggregate Coach outcomes', () => {
  assert.match(migration, /outcome not in \('green', 'yellow', 'red'\)/i);
  assert.match(migration, /revoke execute on function public\.record_coach_review_outcome\(uuid, text\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.record_coach_review_outcome\(uuid, text\) to service_role/i);
});

test('enabling Coach requires an effective Premium or trial entitlement', () => {
  assert.match(migration, /set_my_coach_enabled\(enabled boolean\)[\s\S]*if enabled then/i);
  assert.match(migration, /p\.plan = 'trial'[\s\S]*p\.trial_ends_at > now\(\)/i);
  assert.match(migration, /p\.plan = 'premium'[\s\S]*p\.premium_ends_at > now\(\)/i);
  assert.match(migration, /Premium is required for Coach/i);
});
