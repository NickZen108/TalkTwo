export interface PremiumGiftStatusLike {
  status: string;
  claim_expires_at: string;
}

export function premiumGiftStatusLabel(status: string) {
  switch (status) {
    case 'paid': return 'Waiting for recipient';
    case 'claimed': return 'Activated';
    case 'expired': return 'Claim window expired';
    case 'refunded': return 'Refunded';
    default: return 'Processing';
  }
}

export function canResendPremiumGift(gift: PremiumGiftStatusLike, now = Date.now()) {
  const expiresAt = new Date(gift.claim_expires_at).valueOf();
  return gift.status === 'paid' && Number.isFinite(expiresAt) && expiresAt > now;
}
