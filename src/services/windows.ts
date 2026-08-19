import { supabase } from '../lib/supabase';

export interface MessageWindow {
  id: string;
  user_id: string;
  weekday: number;
  start_local: string;
  end_local: string;
  enabled: boolean;
}

export interface PartnerWindow {
  user_id: string;
  timezone: string;
  weekday: number | null;
  start_local: string | null;
  end_local: string | null;
  enabled: boolean | null;
}

export async function getMyTimezone() {
  const { data, error } = await supabase.from('profiles').select('timezone').single();
  if (error) throw error;
  return data.timezone as string;
}

export async function setMyTimezone(timezone: string) {
  const { data, error } = await supabase.rpc('set_my_timezone', { p_timezone: timezone });
  if (error) throw error;
  return data as string;
}

export async function listMyWindows() {
  const { data, error } = await supabase
    .from('message_windows')
    .select('id,user_id,weekday,start_local,end_local,enabled')
    .order('weekday', { ascending: true });
  if (error) throw error;
  return (data ?? []) as MessageWindow[];
}

export async function saveMyWindow(weekday: number, enabled: boolean, startLocal: string, endLocal: string) {
  const { data, error } = await supabase.rpc('save_my_message_window', {
    p_weekday: weekday,
    p_enabled: enabled,
    p_start_local: startLocal,
    p_end_local: endLocal,
  });
  if (error) throw error;
  return data as MessageWindow;
}

export async function getPartnerWindows(relationshipId: string) {
  const { data, error } = await supabase.rpc('get_relationship_partner_settings', { rel_id: relationshipId });
  if (error) throw error;
  return (data ?? []) as PartnerWindow[];
}

export async function releaseWaitingMessages(relationshipId?: string) {
  const { data, error } = await supabase.rpc('release_waiting_messages', { rel_id: relationshipId ?? null });
  if (error) throw error;
  return Number(data ?? 0);
}
