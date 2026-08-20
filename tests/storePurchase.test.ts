import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extraMemberProductKey,
  googleAccountBindingInput,
  googleSubscriptionOffer,
  parsePendingStorePurchase,
  pendingPurchaseMatches,
  storeVerificationBody,
} from '../src/domain/storePurchase';

test('extra-member roles select monthly products only', () => {
  assert.equal(extraMemberProductKey('observer'), 'extra_observer_monthly');
  assert.equal(extraMemberProductKey('participant'), 'extra_participant_monthly');
});

test('Google account binding has a stable namespaced input', () => {
  assert.equal(googleAccountBindingInput('user-123'), 'talktwo:user-123');
});

test('pending checkout state expires closed', () => {
  const pending = JSON.stringify({
    checkoutIntentId: 'intent-1',
    expiresAt: '2026-08-20T13:00:00.000Z',
    productKey: 'extra_observer_monthly',
    userId: 'user-1',
  });
  assert.equal(parsePendingStorePurchase(pending, Date.parse('2026-08-20T12:00:00Z'))?.checkoutIntentId, 'intent-1');
  assert.equal(parsePendingStorePurchase(pending, Date.parse('2026-08-20T14:00:00Z')), null);
});

test('pending purchase must match the exact platform product', () => {
  const pending = {
    checkoutIntentId: 'intent-1',
    expiresAt: '2026-08-20T13:00:00.000Z',
    productKey: 'extra_observer_monthly' as const,
    userId: 'user-1',
  };
  assert.equal(pendingPurchaseMatches(pending, 'google', {
    productId: 'extra_observer_monthly', purchaseState: 'purchased', store: 'google',
  }), true);
  assert.equal(pendingPurchaseMatches(pending, 'apple', {
    productId: 'extra_observer_monthly', purchaseState: 'purchased', store: 'apple',
  }), false);
});

test('Google subscription purchase fails closed on ambiguous offers', () => {
  assert.deepEqual(googleSubscriptionOffer({
    id: 'extra_observer_monthly',
    platform: 'android',
    subscriptionOffers: [{ offerTokenAndroid: 'monthly-token' }],
  }, 'extra_observer_monthly'), { sku: 'extra_observer_monthly', offerToken: 'monthly-token' });
  assert.throws(() => googleSubscriptionOffer({
    id: 'extra_observer_monthly',
    platform: 'android',
    subscriptionOffers: [{ offerTokenAndroid: 'one' }, { offerTokenAndroid: 'two' }],
  }, 'extra_observer_monthly'), /exactly one eligible offer/i);
});

test('verification body never accepts a pending or tokenless purchase', () => {
  assert.throws(() => storeVerificationBody({
    productId: 'extra_observer_monthly', purchaseState: 'pending', purchaseToken: 'token', store: 'google',
  }, 'purchase', 'intent-1'), /not completed/i);
  assert.throws(() => storeVerificationBody({
    productId: 'extra_observer_monthly', purchaseState: 'purchased', purchaseToken: null, store: 'google',
  }, 'purchase', 'intent-1'), /incomplete/i);
});

test('restore request carries no checkout intent and grants nothing locally', () => {
  assert.deepEqual(storeVerificationBody({
    productId: 'extra_observer_monthly', purchaseState: 'purchased', purchaseToken: 'token', store: 'google',
  }, 'restore', 'must-not-be-sent'), {
    platform: 'google',
    mode: 'restore',
    checkoutIntentId: undefined,
    purchaseToken: 'token',
    purchaseKind: 'subscription',
  });
});
