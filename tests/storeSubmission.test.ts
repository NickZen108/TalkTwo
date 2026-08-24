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
  assert.match(pack, /public web deletion path is still required/i);
  assert.match(pack, /renew automatically unless cancelled/i);
  assert.match(pack, /monthly only/i);
  assert.match(pack, /unanimous approval/i);
});

test('organization-funded access is documented without a consumer redemption-code path', () => {
  assert.match(pack, /server-assigned entitlement/i);
  assert.match(pack, /no activation-code or external-checkout UI/i);
  assert.match(pack, /consumer Premium is also available through IAP/i);
  assert.match(pack, /one-way SHA-256 match value/i);
});

test('review notes cover the current privacy-explicit PDF export', () => {
  assert.match(pack, /explicit unencrypted-file warning/i);
  assert.match(pack, /date interval controls/i);
  assert.match(pack, /text-document attachment contents/i);
});
