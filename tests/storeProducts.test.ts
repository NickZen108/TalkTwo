import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STORE_PRODUCTS,
  PREMIUM_SUBSCRIPTION_PRODUCT_KEYS,
  oneTimeProductIdsFor,
  productIdFor,
  storeProductKeyForId,
  subscriptionProductIdsFor,
} from '../src/domain/storeProducts';

test('all store product ids are unique per platform', () => {
  const apple = Object.keys(STORE_PRODUCTS).map((key) => productIdFor('apple', key as keyof typeof STORE_PRODUCTS));
  const google = Object.keys(STORE_PRODUCTS).map((key) => productIdFor('google', key as keyof typeof STORE_PRODUCTS));
  assert.equal(new Set(apple).size, apple.length);
  assert.equal(new Set(google).size, google.length);
});

test('store ids round-trip to canonical product keys', () => {
  for (const key of Object.keys(STORE_PRODUCTS) as Array<keyof typeof STORE_PRODUCTS>) {
    assert.equal(storeProductKeyForId('apple', productIdFor('apple', key)), key);
    assert.equal(storeProductKeyForId('google', productIdFor('google', key)), key);
  }
});

test('subscription and one-time products stay separated', () => {
  assert.equal(subscriptionProductIdsFor('apple').length, 5);
  assert.equal(subscriptionProductIdsFor('google').length, 5);
  assert.deepEqual(oneTimeProductIdsFor('apple'), ['com.talktwo.premium.gift.1m']);
  assert.deepEqual(oneTimeProductIdsFor('google'), ['premium_gift_1m']);
});

test('account-wide extra access keeps the agreed Danish prices', () => {
  assert.equal(STORE_PRODUCTS.extra_observer_monthly.expectedDkk, 29);
  assert.equal(STORE_PRODUCTS.extra_participant_monthly.expectedDkk, 99);
});

test('Premium checkout exposes only the agreed subscription products', () => {
  assert.deepEqual(PREMIUM_SUBSCRIPTION_PRODUCT_KEYS, [
    'premium_individual_monthly',
    'premium_two_monthly',
    'premium_two_annual',
  ]);
  assert.deepEqual(
    PREMIUM_SUBSCRIPTION_PRODUCT_KEYS.map((key) => STORE_PRODUCTS[key].expectedDkk),
    [59, 99, 799],
  );
  assert.ok(PREMIUM_SUBSCRIPTION_PRODUCT_KEYS.every((key) => STORE_PRODUCTS[key].kind === 'subscription'));
});
