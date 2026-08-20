import { supabase } from '../lib/supabase';

export interface MemberWriteUpgradeOffer {
  relationship_id: string;
  current_price_dkk: 29;
  renewal_price_dkk: 99;
  prorated_upgrade_dkk: number;
  current_period_end: string;
  ready_to_pay: boolean;
}

export async function getMemberWriteUpgradeOffer(relationshipId: string) {
  const { data, error } = await supabase.rpc('get_member_write_upgrade_offer', { rel_id: relationshipId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Upgrade offer could not be loaded.');
  return row as MemberWriteUpgradeOffer;
}
