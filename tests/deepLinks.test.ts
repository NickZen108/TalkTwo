import assert from 'node:assert/strict';
import test from 'node:test';
import {
  invitationFromUrl,
  isAuthCallbackUrl,
  isInvitationUrl,
  isKeyRecoveryUrl,
  isPremiumGiftUrl,
  keyRecoveryFromUrl,
  premiumGiftFromUrl,
} from '../src/domain/deepLinks';

const secret = 'A'.repeat(64);
const inviteToken = 'b'.repeat(48);
const memberToken = 'c'.repeat(48);
const recoveryToken = 'd'.repeat(64);
const giftToken = 'e'.repeat(48);
const giftId = '11111111-1111-4111-8111-111111111111';
const originalSiteUrl = process.env.EXPO_PUBLIC_TALKTWO_SITE_URL;
delete process.env.EXPO_PUBLIC_TALKTWO_SITE_URL;

function withSiteUrl<T>(value: string, run: () => T) {
  const previous = process.env.EXPO_PUBLIC_TALKTWO_SITE_URL;
  process.env.EXPO_PUBLIC_TALKTWO_SITE_URL = value;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_TALKTWO_SITE_URL;
    else process.env.EXPO_PUBLIC_TALKTWO_SITE_URL = previous;
  }
}

process.on('exit', () => {
  if (originalSiteUrl === undefined) delete process.env.EXPO_PUBLIC_TALKTWO_SITE_URL;
  else process.env.EXPO_PUBLIC_TALKTWO_SITE_URL = originalSiteUrl;
});

test('parses invitation bearer token and envelope secret only from the fragment', () => {
  assert.deepEqual(invitationFromUrl(`talktwo://invite#token=${inviteToken}&s=${secret}`), {
    kind: 'invite',
    token: inviteToken,
    secret: secret.toLowerCase(),
  });
  assert.deepEqual(invitationFromUrl(`TALKTWO://member#x=1&token=${memberToken}&s=${secret}`), {
    kind: 'member',
    token: memberToken,
    secret: secret.toLowerCase(),
  });
});

test('rejects legacy, ambiguous, encoded and noncanonical invitation tokens', () => {
  assert.equal(invitationFromUrl(`talktwo://invite/${inviteToken}#s=${secret}`), null);
  assert.equal(invitationFromUrl(`talktwo://invite?token=${inviteToken}#s=${secret}`), null);
  assert.equal(invitationFromUrl(`talktwo://invite#token=${inviteToken}&token=${memberToken}&s=${secret}`), null);
  assert.equal(invitationFromUrl(`talktwo://invite#token=${inviteToken}&s=${secret}&s=${secret}`), null);
  assert.equal(invitationFromUrl(`talktwo://invite#token=${'a'.repeat(47)}&s=${secret}`), null);
  assert.equal(invitationFromUrl(`talktwo://invite#token=${'g'.repeat(48)}&s=${secret}`), null);
  assert.equal(invitationFromUrl(`talktwo://invite#token=%2562${'b'.repeat(46)}&s=${secret}`), null);
  assert.equal(invitationFromUrl(`talktwo://invite#token=${inviteToken}&s=${'a'.repeat(63)}`), null);
});

test('parses only canonical Premium gift id and fragment token', () => {
  assert.deepEqual(premiumGiftFromUrl(`talktwo://premium-gift/${giftId}#token=${giftToken}`), {
    giftId,
    token: giftToken,
  });
  assert.equal(premiumGiftFromUrl(`talktwo://premium-gift/${giftId}#token=${giftToken}&token=${giftToken}`), null);
  assert.equal(premiumGiftFromUrl(`talktwo://premium-gift/not-a-uuid#token=${giftToken}`), null);
  assert.equal(premiumGiftFromUrl(`talktwo://premium-gift/${giftId}?token=${giftToken}`), null);
  assert.equal(premiumGiftFromUrl(`talktwo://premium-gift/${giftId}#token=${'e'.repeat(47)}`), null);
});

test('parses recovery bearer token and envelope secret only from the fragment', () => {
  assert.deepEqual(keyRecoveryFromUrl(`talktwo://recover-key#token=${recoveryToken}&s=${secret}`), {
    token: recoveryToken,
    secret: secret.toLowerCase(),
  });
  assert.equal(keyRecoveryFromUrl(`talktwo://recover-key/${recoveryToken}#s=${secret}`), null);
  assert.equal(keyRecoveryFromUrl(`talktwo://recover-key?token=${recoveryToken}#s=${secret}`), null);
  assert.equal(keyRecoveryFromUrl(`talktwo://recover-key#token=${recoveryToken}&token=${recoveryToken}&s=${secret}`), null);
  assert.equal(keyRecoveryFromUrl(`talktwo://recover-key#token=${'d'.repeat(63)}&s=${secret}`), null);
  assert.equal(keyRecoveryFromUrl(`talktwo://recover-key#token=%2564${'d'.repeat(62)}&s=${secret}`), null);
  assert.equal(keyRecoveryFromUrl(`talktwo://recover-key#token=${recoveryToken}&s=${secret}&s=${secret}`), null);
});

test('recognizes only exact TalkTwo link families and canonical path shapes', () => {
  assert.equal(isInvitationUrl('talktwo://invite'), true);
  assert.equal(isInvitationUrl(`talktwo://invite/${inviteToken}`), false);
  assert.equal(isInvitationUrl('talktwo://invited'), false);
  assert.equal(isPremiumGiftUrl(`talktwo://premium-gift/${giftId}`), true);
  assert.equal(isPremiumGiftUrl('talktwo://premium-gift'), false);
  assert.equal(isPremiumGiftUrl(`talktwo://premium-gifts/${giftId}`), false);
  assert.equal(isKeyRecoveryUrl('talktwo://recover-key'), true);
  assert.equal(isKeyRecoveryUrl(`talktwo://recover-key/${recoveryToken}`), false);
  assert.equal(isKeyRecoveryUrl('talktwo://recover-keys'), false);
  assert.equal(isAuthCallbackUrl('talktwo://auth?code=x'), true);
  assert.equal(isAuthCallbackUrl('talktwo://authentication?code=x'), false);
  assert.equal(isAuthCallbackUrl(`talktwo://auth?code=${'x'.repeat(4096)}`), false);
});

test('configured builds accept only same-origin HTTPS app paths with bearer secrets in fragments', () => {
  withSiteUrl('https://secure.example', () => {
    assert.deepEqual(invitationFromUrl(`https://secure.example/app/invite#token=${inviteToken}&s=${secret}`), {
      kind: 'invite',
      token: inviteToken,
      secret: secret.toLowerCase(),
    });
    assert.deepEqual(premiumGiftFromUrl(`https://secure.example/app/premium-gift/${giftId}#token=${giftToken}`), {
      giftId,
      token: giftToken,
    });
    assert.deepEqual(keyRecoveryFromUrl(`https://secure.example/app/recover-key#token=${recoveryToken}&s=${secret}`), {
      token: recoveryToken,
      secret: secret.toLowerCase(),
    });
    assert.equal(isAuthCallbackUrl('https://secure.example/app/auth?code=x'), true);
    assert.equal(isAuthCallbackUrl('talktwo://auth?code=x'), false);
    assert.equal(isInvitationUrl(`https://secure.example.evil.invalid/app/invite#token=${inviteToken}&s=${secret}`), false);
    assert.equal(invitationFromUrl(`https://secure.example/app/invite/${inviteToken}#s=${secret}`), null);
    assert.equal(keyRecoveryFromUrl(`https://secure.example/app/recover-key/${recoveryToken}#s=${secret}`), null);
  });
});
