import assert from 'node:assert/strict';
import test from 'node:test';
import { conversationExportHtml, exportableMessages, validateExportDateRange } from '../src/domain/conversationExport';
import type { ChatMessage } from '../src/services/messages';

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'row', logical_id: 'logical', relationship_id: 'rel', sender_id: 'sender', recipient_id: null,
    body: 'Hello', body_hash: 'hash', ciphertext: 'cipher', risk_level: 'green', created_at: '2026-08-20T12:00:00Z',
    available_at: '2026-08-20T12:00:00Z', opened_at: null, withdrawn_at: null, edited_at: null, rejected_at: null,
    reject_reason: null, blocked_for_recipient: false, recipient_count: 1, rejected_count: 0,
    message_kind: 'text', attachment_name: null, attachment_mime_type: null, attachment_size_bytes: null,
    attachment_page_count: null, ...overrides,
  };
}

test('exports only locally visible, ordinary non-withdrawn and non-blocked messages', () => {
  assert.equal(exportableMessages([
    message(),
    message({ id: 'hidden', body: null }),
    message({ id: 'withdrawn', withdrawn_at: '2026-08-20T13:00:00Z' }),
    message({ id: 'blocked', blocked_for_recipient: true }),
    message({ id: 'attachment', message_kind: 'text_attachment', body: 'Private document contents' }),
  ]).length, 1);
});

test('selected date interval filters the visible ordinary message history', () => {
  const result = validateExportDateRange('2026-08-20', '2026-08-20');
  assert.equal(result.valid, true);
  if (!result.valid) return;
  const visible = exportableMessages([
    message({ id: 'before', created_at: '2026-08-19T12:00:00Z' }),
    message({ id: 'inside', created_at: '2026-08-20T12:00:00Z' }),
    message({ id: 'after', created_at: '2026-08-21T12:00:00Z' }),
  ], result.range);
  assert.deepEqual(visible.map((item) => item.id), ['inside']);
});

test('rejects impossible dates and reversed intervals', () => {
  assert.deepEqual(validateExportDateRange('2026-02-30', ''), { valid: false, error: 'invalid_start' });
  assert.deepEqual(validateExportDateRange('', '2026-13-01'), { valid: false, error: 'invalid_end' });
  assert.deepEqual(validateExportDateRange('2026-08-21', '2026-08-20'), { valid: false, error: 'start_after_end' });
});

test('escapes names and message content and includes sender-recipient context', () => {
  const html = conversationExportHtml(
    'A & B',
    [{ id: 'sender', name: '<Alex>' }, { id: 'recipient', name: 'Sam & Jo' }],
    [message({ recipient_id: 'recipient', body: '<script>alert("x")</script>\nOkay' })],
  );
  assert.match(html, /A &amp; B/);
  assert.match(html, /&lt;Alex&gt; → Sam &amp; Jo/);
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;<br>Okay/);
  assert.doesNotMatch(html, /<script>/);
});

test('can localize export metadata without changing message content', () => {
  const html = conversationExportHtml('Samtale', [{ id: 'sender', name: 'Alex' }], [message({ body: 'Hej' })], 'da-DK', { startDate: '2026-08-20', endDate: '2026-08-20' });
  assert.match(html, /interval:/);
  assert.match(html, /oprettet/);
  assert.match(html, /1 synlige beskeder/);
  assert.match(html, />Hej<\/p>/);
});
