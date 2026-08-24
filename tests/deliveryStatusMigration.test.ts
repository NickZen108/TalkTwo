import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { sentDeliveryStatusText } from '../src/i18n/deliveryCopy';

const migration = fs.readFileSync('supabase/migrations/20260824061500_delivery_acknowledgements.sql', 'utf8');
const client = fs.readFileSync('src/services/messages.ts', 'utf8');

test('delivery acknowledgement is recipient-bound and never requires opening', () => {
  assert.match(migration, /recipient_id = uid/i);
  assert.match(migration, /available_at <= now\(\)/i);
  assert.match(migration, /set delivered_at = coalesce\(m\.delivered_at, now\(\)\)/i);
  assert.doesNotMatch(migration, /set opened_at/i);
});

test('sender delivery RPC exposes aggregate counts only', () => {
  assert.match(migration, /list_my_sent_delivery_status/i);
  assert.match(migration, /m\.sender_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /count\(\*\) filter \(where m\.delivered_at is not null\)/i);
  assert.doesNotMatch(migration, /returns table\([\s\S]*opened_at/i);
  assert.doesNotMatch(migration, /returns table\([\s\S]*recipient_id/i);
});

test('blocked messages can still be acknowledged as delivered to avoid a block side-channel', () => {
  const ackBody = migration.match(/create or replace function public\.ack_available_messages_delivered[\s\S]*?\$\$;/i)?.[0] ?? '';
  assert.doesNotMatch(ackBody, /blocked_for_recipient\s*=\s*false/i);
});

test('client acknowledges arrival before hydrating aggregate sender delivery counts', () => {
  const ack = client.indexOf("supabase.rpc('ack_available_messages_delivered'");
  const list = client.indexOf("supabase.rpc('list_relationship_messages'");
  const status = client.indexOf("supabase.rpc('list_my_sent_delivery_status'");
  assert.ok(ack >= 0 && list > ack && status > ack);
  assert.match(client, /delivered_count: delivery\?\.delivered_count \?\? 0/i);
});

test('delivery copy stays aggregate and contains no read receipt language', () => {
  assert.equal(sentDeliveryStatusText(0, 1, 0, 'en'), 'Sent');
  assert.equal(sentDeliveryStatusText(1, 1, 0, 'en'), 'Delivered');
  assert.equal(sentDeliveryStatusText(1, 2, 0, 'da'), 'Leveret 1/2');
  assert.match(sentDeliveryStatusText(1, 1, 1, 'en'), /rejected unread 1/);
  assert.doesNotMatch(sentDeliveryStatusText(1, 1, 0, 'en'), /read|opened/i);
});
