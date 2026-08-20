import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EXTRA_MEMBER_BILLING,
  extraMemberAccessCovers,
  extraMemberMonthlyPrice,
  proratedObserverUpgradeDkk,
} from '../src/domain/billingPolicy';

test('read-only extra members cost 29 DKK per month', () => {
  assert.equal(extraMemberMonthlyPrice('observer'), 29);
  assert.deepEqual(EXTRA_MEMBER_BILLING, { interval: 'month', intervalCount: 1, autoRenew: true, scope: 'account' });
});

test('writing extra members use the normal 99 DKK monthly price', () => {
  assert.equal(extraMemberMonthlyPrice('participant'), 99);
});

test('one account-wide subscription covers multiple eligible chats', () => {
  assert.equal(extraMemberAccessCovers('observer', 'observer'), true);
  assert.equal(extraMemberAccessCovers('observer', 'participant'), false);
  assert.equal(extraMemberAccessCovers('participant', 'observer'), true);
  assert.equal(extraMemberAccessCovers('participant', 'participant'), true);
});

test('observer-to-participant upgrade is prorated', () => {
  const day = 24 * 60 * 60 * 1000;
  const start = 0;
  const end = 30 * day;
  assert.equal(proratedObserverUpgradeDkk(start, end, start), 70);
  assert.equal(proratedObserverUpgradeDkk(start, end, 15 * day), 35);
  assert.equal(proratedObserverUpgradeDkk(start, end, end), 0);
});
