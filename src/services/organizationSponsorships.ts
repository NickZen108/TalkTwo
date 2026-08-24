import { supabase } from '../lib/supabase';

export interface ClaimedOrganizationSponsorship {
  sponsorship_id: string;
  sponsor_name: string;
  sponsored_months: number;
  entitlement_ends_at: string;
}

export async function claimMyOrganizationSponsorships() {
  const { data, error } = await supabase.rpc('claim_my_organization_sponsorships');
  if (error) throw error;
  return (data ?? []) as ClaimedOrganizationSponsorship[];
}
