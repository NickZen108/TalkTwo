import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { sentDeliveryStatusText } from '../src/i18n/deliveryCopy';

const baseMigration = fs.readFileSync('supabase/migrations/20260824061500_delivery_acknowledgements.sql', 'utf8');
const privacyMigration = fs.readFileSync('supabase/migrations/20260824112000_delivery_and_open_state_privacy.sql', 'utf8');
const client = fs.readFileSync('src/services/messages.ts', 'utf8');
const relationships = fs.readFileSync('src/services/relationships.ts', 'utf8');
const chat = fs.readFileSync('src/screens/ChatScreen.tsx', 'utf8');

test('delivery acknowledgement never writes open/read state', () => {
  assert.match(baseMigration, /set delivered_at = coalesce\(m\.delivered_at, now\(\)\)/i);
  assert.doesNotMatch(baseMigration, /set opened_at/i);
  assert.match(privacyMigration, /ack_all_available_messages_delivered/i);
  assert.doesNotMatch(privacyMigration.match(/ack_all_available_messages_delivered[\s\S]*?\$\$;/i)?.[0] ?? '', /set opened_at/i);
});

test('sender delivery RPC exposes aggregate counts only', () => {
  assert.match(baseMigration, /list_my_sent_delivery_status/i);
  assert.match(baseMigration, /m\.sender_id = \(select auth\.uid\(\)\)/i);
  assert.match(baseMigration, /count\(\*\) filter \(where m\.delivered_at is not null\)/i);
  assert.doesNotMatch(baseMigration, /returns table\([\s\S]*opened_at/i);
  assert.doesNotMatch(baseMigration, /returns table\([\s\S]*recipient_id/i);
});

test('blocked and privately rejected messages can still be acknowledged as delivered', () => {
  const ackBody = privacyMigration.match(/create or replace function public\.ack_all_available_messages_delivered[\s\S]*?\$\$;/i)?.[0] ?? '';
  assert.doesNotMatch(ackBody, /blocked_for_recipient\s*=\s*false/i);
  assert.doesNotMatch(ackBody, /rejected_at\s+is\s+null/i);
});

test('home relationship sync acknowledges app delivery independently of opening a chat', () => {
  assert.match(relationships, /supabase\.rpc\('ack_all_available_messages_delivered'\)/i);
  // The legacy per-chat call may remain for compatibility, but server-side it
  // now acknowledges all available messages, not just that relationship.
  assert.match(client, /supabase\.rpc\('ack_available_messages_delivered'/i);
  assert.match(privacyMigration, /return public\.ack_all_available_messages_delivered\(\)/i);
});

test('sent messages are final in both chat UI and the client service API', () => {
  assert.doesNotMatch(chat, /editUnopenedMessage|withdrawMessage|startEdit|async function withdraw/);
  assert.doesNotMatch(client, /export async function (editUnopenedMessage|withdrawMessage)/);
  assert.doesNotMatch(client, /supabase\.rpc\('(edit_unopened_message|withdraw_message)'/);
});

test('chat renders only the aggregate privacy-safe delivery formatter for sender status', () => {
  assert.match(chat, /sentDeliveryStatusText\(item\.delivered_count \?\? 0, item\.recipient_count, item\.rejected_count, locale\)/i);
  assert.doesNotMatch(chat, /senderStatus[\s\S]{0,300}item\.opened_at/i);
});

test('delivery copy contains no read or rejection receipt language', () => {
  assert.equal(sentDeliveryStatusText(0, 1, 0, 'en'), 'Sent');
  assert.equal(sentDeliveryStatusText(1, 1, 0, 'en'), 'Delivered');
  assert.equal(sentDeliveryStatusText(1, 2, 0, 'da'), 'Leveret 1/2');
  assert.equal(sentDeliveryStatusText(1, 1, 1, 'en'), 'Delivered');
  assert.equal(sentDeliveryStatusText(0, 1, 1, 'da'), 'Sendt');
  assert.doesNotMatch(sentDeliveryStatusText(1, 1, 1, 'en'), /read|opened|reject/i);
});
