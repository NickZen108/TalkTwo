import { supabase } from '../lib/supabase';

export interface CoachSettings {
  enabled: boolean;
  premium_active: boolean;
  reviewed_attempts: number;
  green_count: number;
  yellow_count: number;
  red_count: number;
  blocked_percentage: number;
}

function normalizeCoachSettings(value: unknown): CoachSettings {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object') {
    return {
      enabled: false,
      premium_active: false,
      reviewed_attempts: 0,
      green_count: 0,
      yellow_count: 0,
      red_count: 0,
      blocked_percentage: 0,
    };
  }

  const record = row as Record<string, unknown>;
  return {
    enabled: record.enabled === true,
    premium_active: record.premium_active === true,
    reviewed_attempts: Number(record.reviewed_attempts ?? 0),
    green_count: Number(record.green_count ?? 0),
    yellow_count: Number(record.yellow_count ?? 0),
    red_count: Number(record.red_count ?? 0),
    blocked_percentage: Number(record.blocked_percentage ?? 0),
  };
}

export async function getMyCoachSettings() {
  const { data, error } = await supabase.rpc('get_my_coach_settings');
  if (error) throw error;
  return normalizeCoachSettings(data);
}

export async function setMyCoachEnabled(enabled: boolean) {
  const { data, error } = await supabase.rpc('set_my_coach_enabled', { enabled });
  if (error) throw error;
  return data === true;
}
