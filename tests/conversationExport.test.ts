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
    message_kind: overrides.message_kind ?? 'text', attachment_name: overrides.attachment_name ?? null,
    attachment_mime_type: overrides.attachment_mime_type ?? null,
    attachment_size_bytes: overrides.attachment_size_bytes ?? null,
    attachment_page_count: overrides.attachment_page_count ?? null,
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

test('renders localized PDF metadata without weakening HTML escaping', () => {
  const html = conversationExportHtml('Samtale', [], [message()], 'da-DK', {
    memberLabel: 'TalkTwo-medlem',
    privateExportLabel: 'Privat TalkTwo-eksport',
    createdLabel: 'oprettet',
    visibleMessagesLabel: '{count} synlig besked',
    noVisibleMessagesLabel: 'Ingen synlige beskeder',
  });
  assert.match(html, /Privat TalkTwo-eksport/);
  assert.match(html, /1 synlig besked/);
  assert.match(html, /TalkTwo-medlem/);
});
