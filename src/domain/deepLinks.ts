import { parseTalkTwoLink } from './appLinks';

const MAX_DEEP_LINK_LENGTH = 4096;
const MAX_IDENTIFIER_LENGTH = 512;
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

function safeIdentifier(value: string) {
  if (!value || value.length > MAX_IDENTIFIER_LENGTH) return null;
  try {
    const decoded = decodeURIComponent(value);
    if (!decoded || decoded.length > MAX_IDENTIFIER_LENGTH || /[\u0000-\u001f\u007f]/.test(decoded)) return null;
    return decoded;
  } catch {
    return null;
  }
}

function singleParameter(params: URLSearchParams, name: string) {
  const matches = params.getAll(name);
  return matches.length === 1 && matches[0] ? matches[0] : null;
}

function safeFragmentIdentifier(params: URLSearchParams, name: string) {
  const value = singleParameter(params, name);
  return value ? safeIdentifier(value) : null;
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
  const token = safeFragmentIdentifier(link.fragment, 'token');
  const secret = singleParameter(link.fragment, 's');
  if (!token || !secret || !INVITATION_SECRET_PATTERN.test(secret)) return null;
  return {
    kind: link.family === 'member' ? 'member' : 'invite',
    token,
    secret: secret.toLowerCase(),
  };
}

export function premiumGiftFromUrl(url: string): PendingPremiumGift | null {
  const link = parsed(url);
  if (!link || link.family !== 'premium-gift' || link.pathSegments.length !== 2) return null;
  const giftId = safeIdentifier(link.pathSegments[1] ?? '');
  // Keep the possession token in the fragment so an HTTPS browser fallback never
  // sends it to the public web server, reverse proxy or request logs.
  const token = safeFragmentIdentifier(link.fragment, 'token');
  if (!giftId || !token) return null;
  return { giftId, token };
}

export function keyRecoveryFromUrl(url: string): (PendingKeyRecoveryApproval & { secret: string }) | null {
  const link = parsed(url);
  // The recovery token authorizes a chat member to inspect/fulfill the request,
  // so both it and the local envelope secret stay fragment-only.
  if (!link || link.family !== 'recover-key' || link.pathSegments.length !== 1) return null;
  const token = safeFragmentIdentifier(link.fragment, 'token');
  const secret = singleParameter(link.fragment, 's');
  if (!token || !secret || !INVITATION_SECRET_PATTERN.test(secret)) return null;
  return { token, secret: secret.toLowerCase() };
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
