import { supabase } from '../lib/supabase';
import { buildTalkTwoLink } from '../domain/appLinks';
import {
  bindPendingMemberInviteSecret,
  consumeInitialInviteEnvelope,
  createInvitationEnvelope,
  ensureThreadKey,
  getThreadKey,
  installActiveMemberEnvelope,
} from './threadKeys';

export type MemberRole = 'participant' | 'observer';

export interface RelationshipSummary {
  id: string;
  status: 'active' | 'blocked' | 'closed';
  created_at: string;
  my_role: MemberRole;
  member_count: number;
}

export interface RelationshipMember {
  user_id: string;
  display_name: string;
  role: MemberRole;
  joined_at: string;
  blocked_by_me: boolean;
  is_extra: boolean;
  subscription_status: 'active' | 'cancel_at_period_end' | null;
  current_period_end: string | null;
  renewal_approved_by_me: boolean | null;
}

function invitationUrl(path: 'invite' | 'member', token: string, secret: string) {
  return buildTalkTwoLink(path, token, { fragment: { s: secret } });
}

async function prepareInvitationEnvelope(token: string, relationshipId: string) {
  const threadKey = await ensureThreadKey(relationshipId);
  const { secret, envelope } = await createInvitationEnvelope(token, threadKey);
  const { data, error } = await supabase.rpc('set_invitation_key_envelope', { invite_token: token, envelope });
  if (error) throw error;
  if (!data) throw new Error('The secure invitation envelope could not be stored.');
  return secret;
}

export async function createInvitation() {
  const { data, error } = await supabase.rpc('create_relationship_invitation');
  if (error) throw error;
  const invitation = Array.isArray(data) ? data[0] : data;
  if (!invitation) throw new Error('Invitation could not be created.');
  const typed = invitation as { relationship_id: string; token: string; expires_at: string };
  const secret = await prepareInvitationEnvelope(typed.token, typed.relationship_id);
  return { ...typed, url: invitationUrl('invite', typed.token, secret) };
}

export async function acceptInvitation(token: string) {
  const clean = token.trim();
  const { data, error } = await supabase.rpc('accept_relationship_invitation', { invite_token: clean });
  if (error) throw error;
  const relationshipId = data as string;
  const { data: envelopeRows, error: envelopeError } = await supabase.rpc('get_accepted_relationship_key_envelope', { invite_token: clean });
  if (envelopeError) throw envelopeError;
  const envelopeRow = Array.isArray(envelopeRows) ? envelopeRows[0] : envelopeRows;
  if (!envelopeRow?.key_envelope) throw new Error('The secure conversation key envelope is unavailable.');
  await consumeInitialInviteEnvelope(clean, relationshipId, String(envelopeRow.key_envelope));
  return relationshipId;
}

export async function installMyActiveMemberKeys() {
  const { data, error } = await supabase.rpc('list_my_active_member_key_envelopes');
  if (error) throw error;
  let installed = 0;
  const missing: string[] = [];
  for (const item of data ?? []) {
    const relationshipId = String(item.relationship_id);
    if (await getThreadKey(relationshipId)) continue;
    const ok = await installActiveMemberEnvelope(String(item.invitation_id), relationshipId, String(item.key_envelope));
    if (ok) installed += 1;
    else missing.push(relationshipId);
  }
  return { installed, missing };
}

export async function listRelationships() {
  // Delivery means the authenticated app has synchronized available messages,
  // not that a particular relationship or message was opened.
  const { error: deliveryError } = await supabase.rpc('ack_all_available_messages_delivered');
  if (deliveryError) throw deliveryError;
  const { data, error } = await supabase.rpc('list_my_relationships');
  if (error) throw error;
  return (data ?? []) as RelationshipSummary[];
}

export async function listRelationshipMembers(relationshipId: string) {
  const { data, error } = await supabase.rpc('list_relationship_members', { rel_id: relationshipId });
  if (error) throw error;
  return (data ?? []) as RelationshipMember[];
}

export async function setMemberBlocked(relationshipId: string, userId: string, blocked: boolean) {
  const { data, error } = await supabase.rpc('set_member_block', {
    rel_id: relationshipId,
    target_user: userId,
    blocked,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function createMemberInvitation(relationshipId: string, role: MemberRole) {
  const { data, error } = await supabase.rpc('create_member_invitation', {
    rel_id: relationshipId,
    member_role: role,
  });
  if (error) throw error;
  const invitation = Array.isArray(data) ? data[0] : data;
  if (!invitation) throw new Error('Invitation could not be created.');
  const typed = invitation as { invitation_id: string; token: string; expires_at: string; role: MemberRole };
  const secret = await prepareInvitationEnvelope(typed.token, relationshipId);
  return { ...typed, url: invitationUrl('member', typed.token, secret) };
}

export async function acceptMemberInvitation(token: string) {
  const clean = token.trim();
  const { data, error } = await supabase.rpc('accept_member_invitation', { invite_token: clean });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Invitation could not be accepted.');
  const typed = row as { relationship_id: string; invitation_id: string; status: string };
  await bindPendingMemberInviteSecret(clean, typed.invitation_id);
  return typed;
}

export interface PendingApproval {
  invitation_id: string;
  candidate_id: string;
  display_name: string;
  role: MemberRole;
  status: string;
  created_at: string;
}

export async function listPendingMemberApprovals(relationshipId: string) {
  const { data, error } = await supabase.rpc('list_pending_member_approvals', { rel_id: relationshipId });
  if (error) throw error;
  return (data ?? []) as PendingApproval[];
}

export async function respondMemberInvitation(invitationId: string, approve: boolean) {
  const { data, error } = await supabase.rpc('respond_member_invitation', { inv_id: invitationId, approve });
  if (error) throw error;
  return String(data);
}

export interface PendingMembership {
  invitation_id: string;
  relationship_id: string;
  role: MemberRole;
  status: 'awaiting_approvals' | 'awaiting_payment';
  created_at: string;
}

export interface MemberPaymentOffer {
  invitation_id: string;
  relationship_id: string;
  role: MemberRole;
  price_dkk: 29 | 99;
  billing_interval: 'month';
  interval_count: 1;
  auto_renew: true;
  ready_to_pay: boolean;
}

export async function listMyPendingMemberships() {
  const { data, error } = await supabase.rpc('list_my_pending_memberships');
  if (error) throw error;
  return (data ?? []) as PendingMembership[];
}

export async function getMemberPaymentOffer(invitationId: string) {
  const { data, error } = await supabase.rpc('get_member_payment_offer', { inv_id: invitationId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Payment offer could not be loaded.');
  return row as MemberPaymentOffer;
}

export async function setExtraMemberRenewalApproval(relationshipId: string, targetUserId: string, approve: boolean) {
  const { data, error } = await supabase.rpc('set_extra_member_renewal_approval', {
    rel_id: relationshipId,
    target_user: targetUserId,
    approve,
  });
  if (error) throw error;
  return String(data) as 'active' | 'cancel_at_period_end';
}
