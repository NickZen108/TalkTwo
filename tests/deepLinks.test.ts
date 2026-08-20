import assert from 'node:assert/strict';
import test from 'node:test';
import {
  invitationFromUrl,
  isAuthCallbackUrl,
  isInvitationUrl,
  isPremiumGiftUrl,
  premiumGiftFromUrl,
} from '../src/domain/deepLinks';

const secret = 'A'.repeat(64);

test('parses invitation secrets from fragments without preserving their case', () => {
  assert.deepEqual(invitationFromUrl(`talktwo://invite/invite%201#s=${secret}`), {
    kind: 'invite',
    token: 'invite 1',
    secret: secret.toLowerCase(),
  });
  assert.deepEqual(invitationFromUrl(`TALKTWO://member/member-1?source=share#x=1&s=${secret}`), {
    kind: 'member',
    token: 'member-1',
    secret: secret.toLowerCase(),
  });
});

test('rejects missing, duplicate, malformed and oversized invitation values', () => {
  assert.equal(invitationFromUrl('talktwo://invite/id'), null);
  assert.equal(invitationFromUrl(`talktwo://invite/id#s=${secret}&s=${secret}`), null);
  assert.equal(invitationFromUrl(`talktwo://invite/%E0%A4%A#s=${secret}`), null);
  assert.equal(invitationFromUrl(`talktwo://invite/${'a'.repeat(513)}#s=${secret}`), null);
  assert.equal(invitationFromUrl(`talktwo://invite/id#s=${'a'.repeat(63)}`), null);
});

test('parses one unambiguous Premium gift token', () => {
  assert.deepEqual(premiumGiftFromUrl('talktwo://premium-gift/gift%201?token=token-1'), {
    giftId: 'gift 1',
    token: 'token-1',
  });
  assert.equal(premiumGiftFromUrl('talktwo://premium-gift/id?token=one&token=two'), null);
  assert.equal(premiumGiftFromUrl('talktwo://premium-gift/%E0%A4%A?token=one'), null);
  assert.equal(premiumGiftFromUrl('talktwo://premium-gift/id?source=share'), null);
});

test('recognizes only exact TalkTwo link families', () => {
  assert.equal(isInvitationUrl('talktwo://invite/id'), true);
  assert.equal(isInvitationUrl('talktwo://invited/id'), false);
  assert.equal(isPremiumGiftUrl('talktwo://premium-gift/id'), true);
  assert.equal(isPremiumGiftUrl('talktwo://premium-gifts/id'), false);
  assert.equal(isAuthCallbackUrl('talktwo://auth#access_token=x'), true);
  assert.equal(isAuthCallbackUrl('talktwo://authentication#access_token=x'), false);
  assert.equal(isAuthCallbackUrl(`talktwo://auth#${'x'.repeat(4096)}`), false);
});
