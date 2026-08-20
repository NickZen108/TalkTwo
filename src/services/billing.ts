import { supabase } from '../lib/supabase';

export interface BillingIntentOffer {
  intent_id: string;
  amount_minor: number;
  currency: 'dkk';
  recurring: boolean;
  expires_at: string;
}

function oneRow<T>(data: unknown, missingMessage: string) {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error(missingMessage);
  return row as T;
}

export function formatDkkMinor(amountMinor: number) {
  return `${Math.round(amountMinor) / 100} kr`;
}

export async function createExtraMemberCheckoutIntent(invitationId: string) {
  const { data, error } = await supabase.rpc('create_extra_member_checkout_intent', { inv_id: invitationId });
  if (error) throw error;
  return oneRow<BillingIntentOffer>(data, 'Membership checkout could not be prepared.');
}

export async function createMemberUpgradeCheckoutIntent(relationshipId: string) {
  const { data, error } = await supabase.rpc('create_member_upgrade_checkout_intent', { rel_id: relationshipId });
  if (error) throw error;
  return oneRow<BillingIntentOffer>(data, 'Upgrade checkout could not be prepared.');
}

export async function createPremiumGiftCheckoutIntent(recipientEmail: string, months = 1) {
  const { data, error } = await supabase.rpc('create_premium_gift_checkout_intent', {
    recipient: recipientEmail,
    months,
  });
  if (error) throw error;
  return oneRow<BillingIntentOffer>(data, 'Premium gift checkout could not be prepared.');
}
