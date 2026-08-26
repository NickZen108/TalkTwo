import { supabase } from '../lib/supabase';

export interface ExtraMemberAccess {
  access_role: 'observer' | 'participant';
  price_dkk: 29 | 99;
  billing_interval: 'month';
  interval_count: 1;
  auto_renew: boolean;
  status: 'active' | 'cancel_at_period_end' | 'expired' | 'on_hold';
  current_period_start: string;
  current_period_end: string;
}

export type MemberWriteUpgradeStatus =
  | 'awaiting_approvals'
  | 'awaiting_payment'
  | 'checkout_pending'
  | 'completed'
  | 'rejected'
  | 'expired';

export interface MemberWriteUpgradeRequest {
  request_id: string;
  relationship_id: string;
  status: MemberWriteUpgradeStatus;
  expires_at: string;
  completed_at: string | null;
}

export interface PendingMemberWriteUpgradeApproval {
  request_id: string;
  relationship_id: string;
  requester_id: string;
  expires_at: string;
}

export async function getMyExtraMemberAccess() {
  const { data, error } = await supabase.rpc('get_my_extra_member_access');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as ExtraMemberAccess | null;
}

export async function createMemberWriteUpgradeRequest(relationshipId: string) {
  const { data, error } = await supabase.rpc('create_member_write_upgrade_request', { rel_id: relationshipId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('The writing-access request could not be created.');
  return row as MemberWriteUpgradeRequest;
}

export async function listMyMemberWriteUpgradeRequests(relationshipId?: string | null) {
  const { data, error } = await supabase.rpc('list_my_member_write_upgrade_requests', {
    rel_id: relationshipId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as MemberWriteUpgradeRequest[];
}

export async function listPendingMemberWriteUpgradeApprovals(relationshipId?: string | null) {
  const { data, error } = await supabase.rpc('list_pending_member_write_upgrade_approvals', {
    rel_id: relationshipId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as PendingMemberWriteUpgradeApproval[];
}

export async function respondMemberWriteUpgrade(requestId: string, approve: boolean) {
  const { data, error } = await supabase.rpc('respond_member_write_upgrade', {
    req_id: requestId,
    approve,
  });
  if (error) throw error;
  return String(data) as MemberWriteUpgradeStatus;
}
