import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync('supabase/functions/dispatch-push-notifications/index.ts', 'utf8');
const config = fs.readFileSync('supabase/config.toml', 'utf8');

test('dispatcher uses a dedicated bearer secret and requires Expo enhanced security', () => {
  assert.match(config, /\[functions\.dispatch-push-notifications\]\s+verify_jwt = false/i);
  assert.match(source, /PUSH_DISPATCH_SECRET/i);
  assert.match(source, /EXPO_ACCESS_TOKEN/i);
  assert.match(source, /digest\(provided\) === await digest\(expected\)/i);
  assert.match(source, /Authorization: `Bearer \$\{expoAccessToken\}`/i);
});

test('push payload is generic and contains no conversation metadata', () => {
  assert.match(source, /title: "TalkTwo"/i);
  assert.match(source, /body: "You have a new message\."/i);
  assert.match(source, /data: \{ kind: "message_available" \}/i);
  for (const forbidden of ['message_body', 'document_text', 'attachment_name', 'sender_name', 'relationship_id', 'risk_level']) {
    assert.doesNotMatch(source, new RegExp(forbidden, 'i'));
  }
});

test('dispatcher respects Expo batch limits and processes tickets and receipts', () => {
  assert.match(source, /claim_due_push_jobs[\s\S]*batch_limit: 100/i);
  assert.match(source, /list_pending_push_receipts[\s\S]*batch_limit: 1000/i);
  assert.match(source, /record_push_ticket/i);
  assert.match(source, /record_push_receipt/i);
  assert.match(source, /DeviceNotRegistered|expoError/i);
});

test('provider-at-least-once retries collapse to one visible device job', () => {
  assert.match(source, /const collapseKey = `tt-\$\{row\.job_id\}`/i);
  assert.match(source, /collapseId: collapseKey/i);
  assert.match(source, /tag: collapseKey/i);
  assert.doesNotMatch(source, /collapseId:[^\n]*(relationship|message)/i);
});
