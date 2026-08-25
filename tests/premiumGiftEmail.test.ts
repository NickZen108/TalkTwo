import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeGiftRecipientEmail } from '../src/domain/email';

test('Premium gift email normalization mirrors the server checkout guard', () => {
  assert.equal(normalizeGiftRecipientEmail(' Recipient@Example.COM '), 'recipient@example.com');
  assert.equal(normalizeGiftRecipientEmail('person+gift@example.co.uk'), 'person+gift@example.co.uk');
  assert.equal(normalizeGiftRecipientEmail(''), null);
  assert.equal(normalizeGiftRecipientEmail('recipient'), null);
  assert.equal(normalizeGiftRecipientEmail('recipient@example'), null);
  assert.equal(normalizeGiftRecipientEmail('recipient @example.com'), null);
  assert.equal(normalizeGiftRecipientEmail('recipient@example .com'), null);
});
