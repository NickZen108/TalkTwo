import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attachmentPageCount,
  attachmentSizeLabel,
  normalizeAttachmentText,
  validateTextAttachment,
} from '../src/domain/textAttachments';

test('accepts and canonicalizes supported UTF-8 text document types', () => {
  const markdown = validateTextAttachment({
    name: ' Parenting / plan.MARKDOWN ',
    mimeType: 'application/octet-stream',
    sizeBytes: 2400,
    text: '\uFEFFLine one\r\nLine two',
  });
  assert.equal(markdown.ok, true);
  if (!markdown.ok) return;
  assert.equal(markdown.attachment.name, 'Parenting - plan.MARKDOWN');
  assert.equal(markdown.attachment.mimeType, 'text/markdown');
  assert.equal(markdown.attachment.text, 'Line one\nLine two');
  assert.equal(markdown.attachment.pageCount, 1);

  const csv = validateTextAttachment({
    name: 'schedule.csv',
    mimeType: 'text/csv; charset=utf-8',
    sizeBytes: 12,
    text: 'day,time\nMon,9',
  });
  assert.equal(csv.ok && csv.attachment.mimeType, 'text/csv');
});

test('normalization and page calculation are deterministic', () => {
  assert.equal(normalizeAttachmentText('\uFEFF a\r\nb\r '), 'a\nb');
  assert.equal(attachmentPageCount('a'.repeat(3001)), 2);
  assert.equal(attachmentPageCount('first\fsecond\fthird'), 3);
  assert.equal(attachmentPageCount(`${'a'.repeat(6001)}\fsecond`), 3);
});

test('rejects unsupported, binary, empty, oversized and over-page documents', () => {
  const cases = [
    { name: 'photo.jpg', mimeType: 'image/jpeg', sizeBytes: 10, text: 'not really a photo' },
    { name: 'notes.txt', mimeType: 'text/plain', sizeBytes: 10, text: '\u0000binary' },
    { name: 'notes.txt', mimeType: 'text/plain', sizeBytes: 10, text: '  ' },
    { name: 'notes.txt', mimeType: 'text/plain', sizeBytes: 5 * 1024 * 1024 + 1, text: 'text' },
    { name: 'notes.txt', mimeType: 'text/plain', sizeBytes: 10, text: 'x'.repeat(60_001) },
    { name: 'notes.txt', mimeType: 'text/plain', sizeBytes: 10, text: Array.from({ length: 21 }, () => 'p').join('\f') },
  ];
  for (const value of cases) assert.equal(validateTextAttachment(value).ok, false);
});

test('rejects invisible or bidi formatting in attachment file names', () => {
  const zeroWidth = validateTextAttachment({
    name: 'plan\u200B.txt',
    mimeType: 'text/plain',
    sizeBytes: 4,
    text: 'text',
  });
  const bidi = validateTextAttachment({
    name: 'plan\u202Etxt.csv',
    mimeType: 'text/csv',
    sizeBytes: 4,
    text: 'a,b',
  });
  assert.equal(zeroWidth.ok, false);
  assert.equal(bidi.ok, false);
  assert.match(zeroWidth.ok ? '' : zeroWidth.reason, /invisible formatting/i);
});

test('formats attachment sizes for compact message metadata', () => {
  assert.equal(attachmentSizeLabel(512), '512 B');
  assert.equal(attachmentSizeLabel(1025), '2 KB');
  assert.equal(attachmentSizeLabel(1572864), '1.5 MB');
});
