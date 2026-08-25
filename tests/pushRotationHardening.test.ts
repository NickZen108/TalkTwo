import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration=fs.readFileSync('supabase/migrations/20260825103000_push_rotation_and_receipt_hardening.sql','utf8');

test('push token refresh is one authenticated server transaction',()=>{
  assert.match(migration,/create or replace function public\.rotate_push_device/i);
  assert.match(migration,/talktwo:push-token:/i);
  assert.match(migration,/talktwo:push-user:/i);
  assert.match(migration,/on conflict\(expo_push_token\) do update set[\s\S]*enabled=true/i);
  assert.match(migration,/previous_token<>next_token[\s\S]*set enabled=false/i);
  assert.match(migration,/Device token replaced by refreshed token/i);
  assert.match(migration,/grant execute on function public\.rotate_push_device\(text,text,text\) to authenticated,service_role/i);
});

test('token rebound to another account cancels queued work before reassignment',()=>{
  assert.match(migration,/next_device\.user_id<>uid/i);
  assert.match(migration,/Device token rebound to another signed-in account/i);
  assert.match(migration,/status in \('pending','processing','ticketed'\)/i);
});

test('missing Expo receipt stops polling without creating a fresh send',()=>{
  assert.match(migration,/ticketed_at < pg_catalog\.now\(\)-interval '24 hours'/i);
  assert.match(migration,/status='failed'/i);
  assert.match(migration,/Push receipt unavailable after 24 hours/i);
  const receipts=migration.match(/create or replace function public\.list_pending_push_receipts[\s\S]*?\$\$;/i)?.[0]??'';
  assert.doesNotMatch(receipts,/status='pending'/i);
});
