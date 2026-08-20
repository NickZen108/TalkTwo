import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync('supabase/migrations/20260820161000_personal_boundaries.sql', 'utf8');

test('personal boundary rows are RPC-only and owner-bound', () => {
  assert.match(migration, /alter table public\.personal_boundaries add column if not exists normalized_phrase text/i);
  assert.match(migration, /on public\.personal_boundaries\(user_id, relationship_id, normalized_phrase\)/i);
  assert.match(migration, /alter table public\.personal_boundaries enable row level security/i);
  assert.match(migration, /revoke all on table public\.personal_boundaries from public, anon, authenticated/i);
  assert.match(migration, /where pb\.user_id = uid and pb\.relationship_id = rel_id/i);
  assert.match(migration, /where pb\.id = boundary_id and pb\.user_id = uid/i);
});

test('only active Premium or trial users can add at most ten entries', () => {
  assert.match(migration, /plan_row\.plan = 'trial'[\s\S]*trial_ends_at > now\(\)/i);
  assert.match(migration, /plan_row\.plan = 'premium'[\s\S]*premium_ends_at > now\(\)/i);
  assert.match(migration, /boundary_count >= 10/i);
  assert.match(migration, /essential logistics word cannot be blocked on its own/i);
  assert.match(migration, /where pb\.user_id = uid and pb\.relationship_id = rel_id/i);
});

test('new and edited messages enforce complete normalized recipient phrases', () => {
  assert.match(migration, /strpos\([\s\S]*normalize_personal_boundary\(message_body\)[\s\S]*pb\.normalized_phrase/i);
  assert.match(migration, /create or replace function public\.send_message[\s\S]*private\.matching_personal_boundary\(rec\.user_id, rel_id, msg\)/i);
  assert.match(migration, /create or replace function public\.edit_unopened_message[\s\S]*private\.matching_personal_boundary\(rec\.recipient_id, rel, msg\)/i);
  assert.match(migration, /recipient''s blocked word or phrase/i);
});

test('public security-definer RPCs fix search paths and restrict execute grants', () => {
  for (const fn of ['list_my_personal_boundaries', 'add_my_personal_boundary', 'remove_my_personal_boundary']) {
    assert.match(migration, new RegExp(`function public\\.${fn}[^$]+security definer\\s+set search_path = ''`, 'i'));
  }
  assert.match(migration, /revoke execute on function private\.matching_personal_boundary\(uuid, uuid, text\) from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant execute on function public\.add_my_personal_boundary\(uuid, text\) to authenticated, service_role/i);
});
