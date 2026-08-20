import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeIanaTimezone, normalizeLocalTime, normalizeMessageWindow } from '../src/domain/messageWindows';

test('normalizes valid 24-hour times for the database RPC', () => {
  assert.equal(normalizeLocalTime('8:05'), '08:05:00');
  assert.equal(normalizeLocalTime(' 17:30 '), '17:30:00');
  assert.equal(normalizeLocalTime('23:59'), '23:59:00');
});

test('rejects invalid or ambiguous clock values', () => {
  assert.equal(normalizeLocalTime('24:00'), null);
  assert.equal(normalizeLocalTime('12:60'), null);
  assert.equal(normalizeLocalTime('8.30'), null);
  assert.equal(normalizeLocalTime('08:5'), null);
});

test('enabled windows require a same-day opening before closing', () => {
  assert.deepEqual(normalizeMessageWindow(true, '08:00', '18:00'), { start: '08:00:00', end: '18:00:00' });
  assert.throws(() => normalizeMessageWindow(true, '18:00', '08:00'), /Overnight windows are not supported/);
  assert.throws(() => normalizeMessageWindow(true, '08:00', '08:00'), /earlier than/);
});

test('a day can still be closed after its draft times become invalid', () => {
  assert.deepEqual(normalizeMessageWindow(false, 'bad', 'also bad'), { start: '08:00:00', end: '18:00:00' });
});

test('normalizes supported IANA timezone names and rejects unsafe input', () => {
  assert.equal(normalizeIanaTimezone(' Europe/Copenhagen '), 'Europe/Copenhagen');
  assert.equal(normalizeIanaTimezone('Not/A_Timezone'), null);
  assert.equal(normalizeIanaTimezone('Europe/Copenhagen\nUTC'), null);
  assert.equal(normalizeIanaTimezone('x'.repeat(101)), null);
});
