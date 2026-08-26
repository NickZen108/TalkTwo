import { parseTalkTwoLink } from './appLinks';

const MAX_DEEP_LINK_LENGTH = 4096;
const INVITATION_TOKEN_PATTERN = /^[0-9a-f]{48}$/i;
const RECOVERY_TOKEN_PATTERN = /^[0-9a-f]{64}$/i;
const PREMIUM_GIFT_TOKEN_PATTERN = /^[0-9a-f]{48}$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INVITATION_SECRET_PATTERN = /^[0-9a-f]{64}$/i;

export interface PendingInvite {
  kind: 'invite' | 'member';
  token: string;
}

export interface PendingPremiumGift {
  giftId: string;
  token: string;
}

export interface PendingKeyRecoveryApproval {
  token: string;
}

function singleParameter(params: URLSearchParams, name: string) {
  const matches = params.getAll(name);
  return matches.length === 1 && matches[0] ? matches[0] : null;
}

function exactFragmentValue(params: URLSearchParams, name: string, pattern: RegExp) {
  // URLSearchParams has already percent-decoded fragment values exactly once.
  // Never decode bearer material a second time: canonical protocol tokens are
  // fixed-format random hex and any encoded/non-canonical variant must fail.
  const value = singleParameter(params, name);
  return value && pattern.test(value) ? value.toLowerCase() : null;
}

function safePathUuid(value: string) {
  try {
    const decoded = decodeURIComponent(value);
    return UUID_PATTERN.test(decoded) ? decoded.toLowerCase() : null;
  } catch {
    return null;
  }
}

function parsed(url: string) {
  if (!url || url.length > MAX_DEEP_LINK_LENGTH) return null;
  return parseTalkTwoLink(url);
}

export function invitationFromUrl(url: string): (PendingInvite & { secret: string }) | null {
  const link = parsed(url);
  // Invitation tokens are bearer authority. They must never appear in an HTTPS
  // path/query, where web infrastructure may log them. Accept the canonical
  // fragment-only format and reject legacy path-token links.
  if (!link || !['invite', 'member'].includes(link.family) || link.pathSegments.length !== 1) return null;
  const token = exactFragmentValue(link.fragment, 'token', INVITATION_TOKEN_PATTERN);
  const secret = exactFragmentValue(link.fragment, 's', INVITATION_SECRET_PATTERN);
  if (!token || !secret) return null;
  return {
    kind: link.family === 'member' ? 'member' : 'invite',
    token,
    secret,
  };
}

export function premiumGiftFromUrl(url: string): PendingPremiumGift | null {
  const link = parsed(url);
  if (!link || link.family !== 'premium-gift' || link.pathSegments.length !== 2) return null;
  const giftId = safePathUuid(link.pathSegments[1] ?? '');
  // Keep the possession token in the fragment so an HTTPS browser fallback never
  // sends it to the public web server, reverse proxy or request logs.
  const token = exactFragmentValue(link.fragment, 'token', PREMIUM_GIFT_TOKEN_PATTERN);
  if (!giftId || !token) return null;
  return { giftId, token };
}

export function keyRecoveryFromUrl(url: string): (PendingKeyRecoveryApproval & { secret: string }) | null {
  const link = parsed(url);
  // The recovery token authorizes a chat member to inspect/fulfill the request,
  // so both it and the local envelope secret stay fragment-only.
  if (!link || link.family !== 'recover-key' || link.pathSegments.length !== 1) return null;
  const token = exactFragmentValue(link.fragment, 'token', RECOVERY_TOKEN_PATTERN);
  const secret = exactFragmentValue(link.fragment, 's', INVITATION_SECRET_PATTERN);
  if (!token || !secret) return null;
  return { token, secret };
}

export function isInvitationUrl(url: string) {
  const link = parsed(url);
  return Boolean(link && (link.family === 'invite' || link.family === 'member') && link.pathSegments.length === 1);
}

export function isPremiumGiftUrl(url: string) {
  const link = parsed(url);
  return Boolean(link && link.family === 'premium-gift' && link.pathSegments.length === 2);
}

export function isKeyRecoveryUrl(url: string) {
  const link = parsed(url);
  return Boolean(link && link.family === 'recover-key' && link.pathSegments.length === 1);
}

export function isAuthCallbackUrl(url: string) {
  const link = parsed(url);
  return Boolean(link && link.family === 'auth' && link.pathSegments.length === 1);
}
