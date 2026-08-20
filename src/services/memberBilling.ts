import { supabase } from '../lib/supabase';

export interface MemberWriteUpgradeOffer {
  relationship_id: string;
  current_price_dkk: 29 | 99;
  renewal_price_dkk: 99;
  prorated_upgrade_dkk: number;
  current_period_end: string;
  ready_to_pay: boolean;
}

export interface ExtraMemberAccess {
  access_role: 'observer' | 'participant';
  price_dkk: 29 | 99;
  status: 'active' | 'cancel_at_period_end' | 'expired';
  current_period_end: string;
  auto_renew: boolean;
}

export async function getMemberWriteUpgradeOffer(relationshipId: string) {
  const { data, error } = await supabase.rpc('get_member_write_upgrade_offer', { rel_id: relationshipId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Upgrade offer could not be loaded.');
  return row as MemberWriteUpgradeOffer;
}

export async function getMyExtraMemberAccess() {
  const { data, error } = await supabase.rpc('get_my_extra_member_access');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as ExtraMemberAccess | null;
}
