import { supabase } from '../lib/supabase';

export interface ChatMessage {
  id: string;
  relationship_id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  risk_level: 'green' | 'yellow';
  created_at: string;
  available_at: string;
  delivered_at: string | null;
  opened_at: string | null;
  withdrawn_at: string | null;
  edited_at: string | null;
  rejected_at: string | null;
}

export async function listMessages(relationshipId: string) {
  const { data, error } = await supabase
    .from('messages')
    .select('id,relationship_id,sender_id,recipient_id,body,risk_level,created_at,available_at,delivered_at,opened_at,withdrawn_at,edited_at,rejected_at')
    .eq('relationship_id', relationshipId)
    .is('withdrawn_at', null)
    .is('rejected_at', null)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ChatMessage[];
}

export async function sendMessage(relationshipId: string, body: string) {
  const { data, error } = await supabase.rpc('send_message', {
    rel_id: relationshipId,
    message_body: body,
  });
  if (error) throw error;
  return data as ChatMessage;
}

export async function openMessage(messageId: string) {
  const { data, error } = await supabase.rpc('open_message', { message_id: messageId });
  if (error) throw error;
  return data as ChatMessage;
}

export async function withdrawMessage(messageId: string) {
  const { data, error } = await supabase.rpc('withdraw_message', { message_id: messageId });
  if (error) throw error;
  return Boolean(data);
}

export async function editUnopenedMessage(messageId: string, body: string) {
  const { data, error } = await supabase.rpc('edit_unopened_message', {
    message_id: messageId,
    new_body: body,
  });
  if (error) throw error;
  return data as ChatMessage;
}
