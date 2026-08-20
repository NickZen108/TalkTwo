import { supabase } from '../lib/supabase';
import { consumePendingInviteKey, ensureThreadKey } from './threadKeys';

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
}

function invitationUrl(path: 'invite' | 'member', token: string, key: string) {
  return `talktwo://${path}/${encodeURIComponent(token)}#k=${key}`;
}

export async function createInvitation() {
  const { data, error } = await supabase.rpc('create_relationship_invitation');
  if (error) throw error;
  const invitation = Array.isArray(data) ? data[0] : data;
  if (!invitation) throw new Error('Invitation could not be created.');
  const typed = invitation as { relationship_id: string; token: string; expires_at: string };
  const key = await ensureThreadKey(typed.relationship_id);
  return { ...typed, url: invitationUrl('invite', typed.token, key) };
}

export async function acceptInvitation(token: string) {
  const clean = token.trim();
  const { data, error } = await supabase.rpc('accept_relationship_invitation', { invite_token: clean });
  if (error) throw error;
  const relationshipId = data as string;
  await consumePendingInviteKey(clean, relationshipId);
  return relationshipId;
}

export async function listRelationships() {
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
  const key = await ensureThreadKey(relationshipId);
  return { ...typed, url: invitationUrl('member', typed.token, key) };
}

export async function acceptMemberInvitation(token: string) {
  const clean = token.trim();
  const { data, error } = await supabase.rpc('accept_member_invitation', { invite_token: clean });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Invitation could not be accepted.');
  const typed = row as { relationship_id: string; invitation_id: string; status: string };
  await consumePendingInviteKey(clean, typed.relationship_id);
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

export async function getRelationshipSeatStatus(relationshipId: string) {
  const { data, error } = await supabase.rpc('get_relationship_seat_status', { rel_id: relationshipId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row as { member_count: number; extra_seats: number; max_members: number; available_seats: number };
}
