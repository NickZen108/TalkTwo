import assert from 'node:assert/strict';
import test from 'node:test';
import { canResendPremiumGift, premiumGiftStatusLabel } from '../src/domain/premiumGifts';

test('only a paid unexpired Premium gift can receive a new link', () => {
  const now = Date.parse('2026-08-20T12:00:00Z');
  assert.equal(canResendPremiumGift({ status: 'paid', claim_expires_at: '2026-08-21T12:00:00Z' }, now), true);
  assert.equal(canResendPremiumGift({ status: 'paid', claim_expires_at: '2026-08-19T12:00:00Z' }, now), false);
  assert.equal(canResendPremiumGift({ status: 'claimed', claim_expires_at: '2026-08-21T12:00:00Z' }, now), false);
  assert.equal(canResendPremiumGift({ status: 'paid', claim_expires_at: 'not-a-date' }, now), false);
});

test('Premium gift statuses have safe user-facing labels', () => {
  assert.equal(premiumGiftStatusLabel('paid'), 'Waiting for recipient');
  assert.equal(premiumGiftStatusLabel('claimed'), 'Activated');
  assert.equal(premiumGiftStatusLabel('refunded'), 'Refunded');
  assert.equal(premiumGiftStatusLabel('unexpected-provider-state'), 'Processing');
});
