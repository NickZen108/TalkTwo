import { supabase } from '../lib/supabase';

export interface RelationshipSummary {
  id: string;
  status: 'active' | 'blocked' | 'closed';
  created_at: string;
}

export async function createInvitation() {
  const { data, error } = await supabase.rpc('create_relationship_invitation');
  if (error) throw error;
  const invitation = Array.isArray(data) ? data[0] : data;
  if (!invitation) throw new Error('Invitation could not be created.');
  return invitation as { relationship_id: string; token: string; expires_at: string };
}

export async function acceptInvitation(token: string) {
  const { data, error } = await supabase.rpc('accept_relationship_invitation', {
    invite_token: token.trim(),
  });
  if (error) throw error;
  return data as string;
}

export async function listRelationships() {
  const { data, error } = await supabase
    .from('relationships')
    .select('id,status,created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as RelationshipSummary[];
}
