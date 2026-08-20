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

function singleParameter(value: string, name: string) {
  const params = new URLSearchParams(value);
  const matches = params.getAll(name);
  return matches.length === 1 && matches[0] ? matches[0] : null;
}

export function invitationFromUrl(url: string): (PendingInvite & { secret: string }) | null {
  if (!url || url.length > MAX_DEEP_LINK_LENGTH) return null;
  const match = url.match(/^talktwo:\/\/(invite|member)\/([^?#]+)(?:\?[^#]*)?(?:#(.*))?$/i);
  if (!match?.[1] || !match[2]) return null;
  const token = safeIdentifier(match[2]);
  const secret = singleParameter(match[3] ?? '', 's');
  if (!token || !secret || !INVITATION_SECRET_PATTERN.test(secret)) return null;
  return {
    kind: match[1].toLowerCase() === 'member' ? 'member' : 'invite',
    token,
    secret: secret.toLowerCase(),
  };
}

export function premiumGiftFromUrl(url: string): PendingPremiumGift | null {
  if (!url || url.length > MAX_DEEP_LINK_LENGTH) return null;
  const match = url.match(/^talktwo:\/\/premium-gift\/([^?#]+)\?([^#]+)$/i);
  if (!match?.[1] || !match[2]) return null;
  const giftId = safeIdentifier(match[1]);
  const token = singleParameter(match[2], 'token');
  if (!giftId || !token || token.length > MAX_IDENTIFIER_LENGTH || /[\u0000-\u001f\u007f]/.test(token)) return null;
  return { giftId, token };
}

export function isInvitationUrl(url: string) {
  return /^talktwo:\/\/(invite|member)(?:\/|$)/i.test(url);
}

export function isPremiumGiftUrl(url: string) {
  return /^talktwo:\/\/premium-gift(?:\/|$)/i.test(url);
}

export function isAuthCallbackUrl(url: string) {
  return /^talktwo:\/\/auth(?:[/?#]|$)/i.test(url) && url.length <= MAX_DEEP_LINK_LENGTH;
}
