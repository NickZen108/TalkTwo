import assert from 'node:assert/strict';
import test from 'node:test';
import { conversationExportHtml, exportableMessages } from '../src/domain/conversationExport';
import type { ChatMessage } from '../src/services/messages';

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'row', logical_id: 'logical', relationship_id: 'rel', sender_id: 'sender', recipient_id: null,
    body: 'Hello', body_hash: 'hash', ciphertext: 'cipher', risk_level: 'green', created_at: '2026-08-20T10:00:00Z',
    available_at: '2026-08-20T10:00:00Z', opened_at: null, withdrawn_at: null, edited_at: null, rejected_at: null,
    reject_reason: null, blocked_for_recipient: false, recipient_count: 1, rejected_count: 0, ...overrides,
  };
}

test('exports only locally visible, non-withdrawn and non-blocked messages', () => {
  assert.equal(exportableMessages([
    message(),
    message({ id: 'hidden', body: null }),
    message({ id: 'withdrawn', withdrawn_at: '2026-08-20T11:00:00Z' }),
    message({ id: 'blocked', blocked_for_recipient: true }),
  ]).length, 1);
});

test('escapes names and message content in the PDF HTML', () => {
  const html = conversationExportHtml('A & B', [{ id: 'sender', name: '<Alex>' }], [message({ body: '<script>alert("x")</script>\nOkay' })]);
  assert.match(html, /A &amp; B/);
  assert.match(html, /&lt;Alex&gt;/);
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;<br>Okay/);
  assert.doesNotMatch(html, /<script>/);
});

test('can localize export metadata without changing message content', () => {
  const html = conversationExportHtml('Samtale', [{ id: 'sender', name: 'Alex' }], [message({ body: 'Hej' })], 'da-DK');
  assert.match(html, /oprettet/);
  assert.match(html, /1 synlige beskeder/);
  assert.match(html, />Hej<\/p>/);
});
