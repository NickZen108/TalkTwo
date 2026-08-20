import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { STORE_PRODUCTS } from '../src/domain/storeProducts';

const pack = fs.readFileSync('docs/STORE_SUBMISSION_PACK.md', 'utf8');

test('submission pack contains every canonical store product ID and price', () => {
  for (const product of Object.values(STORE_PRODUCTS)) {
    assert.match(pack, new RegExp(product.appleProductId.replaceAll('.', '\\.'), 'i'));
    assert.match(pack, new RegExp(product.googleProductId, 'i'));
    assert.match(pack, new RegExp(`${product.expectedDkk} DKK`, 'i'));
  }
});

test('store copy avoids an unsupported end-to-end encryption claim', () => {
  assert.doesNotMatch(pack, /TalkTwo is end[- ]to[- ]end encrypted/i);
  assert.match(pack, /do not describe the whole product as end-to-end encrypted/i);
});

test('account and subscription disclosures are ready for the final gate', () => {
  assert.match(pack, /authenticated account-deletion URLs/i);
  assert.match(pack, /renew automatically unless cancelled/i);
  assert.match(pack, /monthly only/i);
  assert.match(pack, /unanimous approval/i);
});
