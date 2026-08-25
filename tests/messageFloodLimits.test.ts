import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration=fs.readFileSync('supabase/migrations/20260825104000_message_flood_limits.sql','utf8');

test('successful-send flood buckets are service-only storage-boundary controls',()=>{
  assert.match(migration,/create table if not exists public\.message_send_rate_buckets/i);
  assert.match(migration,/revoke all on table public\.message_send_rate_buckets from public,anon,authenticated/i);
  assert.match(migration,/create trigger enforce_message_flood_limit[\s\S]*before insert on public\.messages/i);
  assert.match(migration,/revoke execute on function private\.enforce_message_flood_limit\(\)[\s\S]*service_role/i);
});

test('chat flood limit is isolated by sender so one participant cannot consume another quota',()=>{
  assert.match(migration,/actor_id uuid not null/i);
  assert.match(migration,/primary key\(scope_kind,scope_id,actor_id,bucket_start\)/i);
  assert.match(migration,/'relationship_10m',new\.relationship_id,new\.sender_id/i);
  assert.match(migration,/relationship_count>40/i);
});

test('account daily backstop is generous and server-clock based',()=>{
  assert.match(migration,/'user_day',new\.sender_id,new\.sender_id,day_bucket/i);
  assert.match(migration,/user_count>300/i);
  assert.match(migration,/date_trunc\('day',now_at at time zone 'UTC'\)/i);
});

test('fan-out rows for one logical message do not multiply quota',()=>{
  assert.match(migration,/where m\.sender_id=new\.sender_id and m\.logical_id=new\.logical_id/i);
  assert.match(migration,/return new;/i);
});
