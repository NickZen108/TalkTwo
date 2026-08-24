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

test('parses one unambiguous Premium gift token only from the fragment', () => {
  assert.deepEqual(premiumGiftFromUrl('talktwo://premium-gift/gift%201#token=token-1'), {
    giftId: 'gift 1',
    token: 'token-1',
  });
  assert.equal(premiumGiftFromUrl('talktwo://premium-gift/id#token=one&token=two'), null);
  assert.equal(premiumGiftFromUrl('talktwo://premium-gift/%E0%A4%A#token=one'), null);
  assert.equal(premiumGiftFromUrl('talktwo://premium-gift/id?token=legacy-query-token'), null);
});

test('parses a recovery secret only from an unambiguous fragment', () => {
  assert.deepEqual(keyRecoveryFromUrl(`talktwo://recover-key/request%201#s=${secret}`), {
    token: 'request 1',
    secret: secret.toLowerCase(),
  });
  assert.equal(keyRecoveryFromUrl('talktwo://recover-key/request-1'), null);
  assert.equal(keyRecoveryFromUrl(`talktwo://recover-key/request-1#s=${secret}&s=${secret}`), null);
  assert.equal(keyRecoveryFromUrl(`talktwo://recover-key/%E0%A4%A#s=${secret}`), null);
});

test('recognizes only exact TalkTwo link families', () => {
  assert.equal(isInvitationUrl('talktwo://invite/id'), true);
  assert.equal(isInvitationUrl('talktwo://invited/id'), false);
  assert.equal(isPremiumGiftUrl('talktwo://premium-gift/id'), true);
  assert.equal(isPremiumGiftUrl('talktwo://premium-gifts/id'), false);
  assert.equal(isKeyRecoveryUrl('talktwo://recover-key/id'), true);
  assert.equal(isKeyRecoveryUrl('talktwo://recover-keys/id'), false);
  assert.equal(isAuthCallbackUrl('talktwo://auth?code=x'), true);
  assert.equal(isAuthCallbackUrl('talktwo://authentication?code=x'), false);
  assert.equal(isAuthCallbackUrl(`talktwo://auth?code=${'x'.repeat(4096)}`), false);
});

test('configured builds accept only same-origin HTTPS app paths', () => {
  withSiteUrl('https://secure.example', () => {
    assert.deepEqual(invitationFromUrl(`https://secure.example/app/invite/invite%201#s=${secret}`), {
      kind: 'invite',
      token: 'invite 1',
      secret: secret.toLowerCase(),
    });
    assert.deepEqual(premiumGiftFromUrl('https://secure.example/app/premium-gift/gift%201#token=token-1'), {
      giftId: 'gift 1',
      token: 'token-1',
    });
    assert.deepEqual(keyRecoveryFromUrl(`https://secure.example/app/recover-key/request%201#s=${secret}`), {
      token: 'request 1',
      secret: secret.toLowerCase(),
    });
    assert.equal(isAuthCallbackUrl('https://secure.example/app/auth?code=x'), true);
    assert.equal(isAuthCallbackUrl('talktwo://auth?code=x'), false);
    assert.equal(isInvitationUrl(`https://secure.example.evil.invalid/app/invite/id#s=${secret}`), false);
  });
});
