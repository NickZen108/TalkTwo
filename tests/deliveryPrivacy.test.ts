import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync('supabase/migrations/20260824112000_delivery_and_open_state_privacy.sql', 'utf8');
const relationships = fs.readFileSync('src/services/relationships.ts', 'utf8');

test('app sync acknowledges all available delivery rather than one opened chat', () => {
  assert.match(migration, /ack_all_available_messages_delivered/i);
  assert.match(migration, /m\.recipient_id=uid/i);
  assert.match(migration, /m\.available_at<=now\(\)/i);
  assert.doesNotMatch(migration.match(/ack_all_available_messages_delivered[\s\S]*?end;\n\$\$/i)?.[0] ?? '', /relationship_id\s*=\s*rel_id/i);
  assert.match(relationships, /rpc\('ack_all_available_messages_delivered'\)/i);
});

test('legacy chat-specific acknowledgement is privacy-compatible', () => {
  const wrapper = migration.match(/create or replace function public\.ack_available_messages_delivered[\s\S]*?end;\n\$\$/i)?.[0] ?? '';
  assert.match(wrapper, /ack_all_available_messages_delivered/i);
  assert.doesNotMatch(wrapper, /update public\.messages/i);
});

test('edit and withdrawal cannot probe recipient open or rejection state', () => {
  const withdraw = migration.match(/create or replace function public\.withdraw_message[\s\S]*?end;\n\$\$/i)?.[0] ?? '';
  const edit = migration.match(/create or replace function public\.edit_unopened_message[\s\S]*?end;\n\$\$/i)?.[0] ?? '';
  assert.match(withdraw, /return false/i);
  assert.doesNotMatch(withdraw, /opened_at|rejected_at/i);
  assert.match(edit, /cannot be edited/i);
  assert.doesNotMatch(edit, /opened_at|rejected_at/i);
});
