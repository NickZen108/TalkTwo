import { supabase } from '../lib/supabase';

export type BlockMinutes = 60 | 240 | 1440 | null;

export interface MemberBlock {
  blocked_user_id: string;
  expires_at: string | null;
}

export interface NotificationMute {
  relationship_id: string | null;
  sender_id: string | null;
  created_at: string;
}

export async function listMyMemberBlocks(relationshipId: string) {
  const { data, error } = await supabase.rpc('list_my_member_blocks', { rel_id: relationshipId });
  if (error) throw error;
  return (data ?? []) as MemberBlock[];
}

export async function setMemberBlockDuration(
  relationshipId: string,
  targetUserId: string,
  blocked: boolean,
  blockMinutes: BlockMinutes = null,
) {
  const { data, error } = await supabase.rpc('set_member_block', {
    rel_id: relationshipId,
    target_user: targetUserId,
    blocked,
    block_minutes: blockMinutes,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function listMyNotificationMutes(relationshipId?: string) {
  const { data, error } = await supabase.rpc('list_my_notification_mutes', {
    rel_id: relationshipId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as NotificationMute[];
}

export async function setMyNotificationMute(options: {
  relationshipId?: string | null;
  senderId?: string | null;
  muted: boolean;
}) {
  const { data, error } = await supabase.rpc('set_my_notification_mute', {
    rel_id: options.relationshipId ?? null,
    target_sender: options.senderId ?? null,
    muted: options.muted,
  });
  if (error) throw error;
  return Boolean(data);
}
