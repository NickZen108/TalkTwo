import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appleEventType,
  appleAppAccountToken,
  assertCurrentAppleSubscription,
  assertCurrentGoogleSubscription,
  googleObfuscatedAccountId,
  googleVerifiedAccountId,
  normalizeAppleNotification,
  normalizeGoogleSubscription,
  parseGooglePubSubPush,
  storeEventRpcArgs,
} from '../supabase/functions/_shared/storeEvents';

test('initial subscription verification rejects expired or revoked receipts', () => {
  assert.doesNotThrow(() => assertCurrentAppleSubscription(
    { expiresDate: 2_000, revocationDate: null },
    1_000,
  ));
  assert.throws(() => assertCurrentAppleSubscription({ expiresDate: 1_000 }, 1_000), /not active/i);
  assert.throws(() => assertCurrentAppleSubscription({ expiresDate: 2_000, revocationDate: 900 }, 1_000), /revoked/i);

  assert.doesNotThrow(() => assertCurrentGoogleSubscription({
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    lineItems: [{ expiryTime: '2030-01-01T00:00:00.000Z' }],
  }, Date.parse('2029-01-01T00:00:00.000Z')));
  assert.throws(() => assertCurrentGoogleSubscription({
    subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED',
    lineItems: [{ expiryTime: '2030-01-01T00:00:00.000Z' }],
  }, Date.parse('2029-01-01T00:00:00.000Z')), /not active/i);
});

test('client purchase receipts remain bound to the authenticated account', async () => {
  assert.equal(appleAppAccountToken({ appAccountToken: 'user-123' }), 'user-123');
  assert.equal(
    await googleObfuscatedAccountId('user-123'),
    '0549fe1c66ef059ea5b26addbedbaf49e647b3208449a1792fd14743514d0f5f',
  );
  assert.equal(
    googleVerifiedAccountId('subscription', {
      externalAccountIdentifiers: { obfuscatedExternalAccountId: 'account-hash' },
    }),
    'account-hash',
  );
  assert.equal(
    googleVerifiedAccountId('one_time', { obfuscatedExternalAccountId: 'account-hash' }),
    'account-hash',
  );
});

test('Apple lifecycle notifications map conservatively', () => {
  assert.equal(appleEventType('SUBSCRIBED', 'INITIAL_BUY'), 'purchase');
  assert.equal(appleEventType('SUBSCRIBED', 'RESUBSCRIBE'), 'recovery');
  assert.equal(appleEventType('DID_CHANGE_RENEWAL_STATUS', 'AUTO_RENEW_DISABLED'), 'cancellation');
  assert.equal(appleEventType('DID_FAIL_TO_RENEW', 'GRACE_PERIOD'), 'grace_period');
  assert.equal(appleEventType('SOMETHING_NEW', null), 'unknown');
});

test('verified Apple payload is reduced to non-secret metadata', async () => {
  const event = await normalizeAppleNotification(
    {
      notificationUUID: 'apple-event-1',
      notificationType: 'DID_RENEW',
      signedDate: 1_787_200_000_000,
      data: { environment: 'Sandbox' },
    },
    {
      transactionId: 'apple-transaction-2',
      originalTransactionId: 'apple-subscription-1',
      productId: 'com.talktwo.extra.observer.monthly',
      purchaseDate: 1_787_200_000_000,
      expiresDate: 1_789_792_000_000,
      environment: 'Sandbox',
    },
    'signed.payload.value',
  );

  assert.equal(event.eventType, 'renewal');
  assert.equal(event.providerOriginalTransactionId, 'apple-subscription-1');
  assert.equal(event.payloadSha256.length, 64);
  assert.deepEqual(Object.keys(event.verifiedMetadata).sort(), [
    'environment',
    'notificationType',
    'revocationReason',
    'subtype',
    'transactionReason',
  ]);
});

test('Google Pub/Sub parsing requires package match and keeps messageId for idempotency', () => {
  const data = Buffer.from(JSON.stringify({
    version: '1.0',
    packageName: 'com.talktwo.app',
    eventTimeMillis: '1787200000000',
    subscriptionNotification: {
      version: '1.0',
      notificationType: 2,
      purchaseToken: 'google-purchase-token',
    },
  })).toString('base64');

  const envelope = parseGooglePubSubPush({ message: { messageId: 'google-message-7', data } }, 'com.talktwo.app');
  assert.equal(envelope.messageId, 'google-message-7');
  assert.equal(envelope.eventType, 'renewal');
  assert.equal(envelope.purchaseToken, 'google-purchase-token');

  assert.throws(
    () => parseGooglePubSubPush({ message: { messageId: 'google-message-7', data } }, 'com.wrong.app'),
    /package name mismatch/i,
  );
});

test('Google subscription status comes from the Developer API response', async () => {
  const data = Buffer.from(JSON.stringify({
    version: '1.0',
    packageName: 'com.talktwo.app',
    eventTimeMillis: '1787200000000',
    subscriptionNotification: {
      version: '1.0',
      notificationType: 2,
      purchaseToken: 'google-purchase-token',
    },
  })).toString('base64');
  const envelope = parseGooglePubSubPush({ message: { messageId: 'google-message-7', data } }, 'com.talktwo.app');
  const event = await normalizeGoogleSubscription(envelope, {
    startTime: '2026-08-20T00:00:00Z',
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    lineItems: [{
      productId: 'extra_observer_monthly',
      expiryTime: '2026-09-20T00:00:00Z',
      latestSuccessfulOrderId: 'GPA.1234-5678-9012-34567',
    }],
  });

  assert.equal(event.productId, 'extra_observer_monthly');
  assert.equal(event.providerTransactionId, 'GPA.1234-5678-9012-34567');
  assert.equal(event.providerOriginalTransactionId, 'google-purchase-token');
  assert.equal(storeEventRpcArgs(event).p_provider_event_id, 'google-message-7');
});
