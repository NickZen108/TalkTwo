import { supabase } from '../lib/supabase';

export interface PendingPremiumGift {
  gift_id: string;
  purchaser_id: string;
  duration_months: number;
  claim_expires_at: string;
}

export interface PurchasedPremiumGift {
  gift_id: string;
  recipient_email: string;
  duration_months: number;
  status: 'paid' | 'claimed' | 'expired' | 'refunded' | string;
  claim_expires_at: string;
  claimed_at: string | null;
  created_at: string;
}

export async function listMyPendingPremiumGifts() {
  const { data, error } = await supabase.rpc('list_my_pending_premium_gifts');
  if (error) throw error;
  return (data ?? []) as PendingPremiumGift[];
}

export async function listMyPurchasedPremiumGifts() {
  const { data, error } = await supabase.rpc('list_my_purchased_premium_gifts');
  if (error) throw error;
  return (data ?? []) as PurchasedPremiumGift[];
}

export async function claimPremiumGift(giftId: string, token?: string) {
  const { data, error } = await supabase.rpc('claim_premium_gift', {
    gift_id: giftId,
    gift_token: token ?? null,
  });
  if (error) throw error;
  return String(data);
}

export async function rotatePremiumGiftLink(giftId: string) {
  const { data, error } = await supabase.rpc('rotate_premium_gift_link', { gift_id: giftId });
  if (error) throw error;
  const token = String(data);
  return {
    token,
    url: `talktwo://premium-gift/${encodeURIComponent(giftId)}?token=${encodeURIComponent(token)}`,
  };
}
