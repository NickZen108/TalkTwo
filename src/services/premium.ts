import { supabase } from '../lib/supabase';
import { listCachedMessages } from './localDb';

export interface UserPlan {
  user_id: string;
  plan: 'free' | 'trial' | 'premium';
  trial_started_at: string | null;
  trial_ends_at: string | null;
  premium_ends_at: string | null;
  analyses_used_today: number;
  analyses_remaining_today: number;
}

export interface AiReview {
  level: 'green' | 'yellow' | 'red';
  can_send: boolean;
  reason: string;
  problematic_text: string[];
  rewrite: string | null;
  usage: { plan: string; analyses_used: number; analyses_remaining: number; trial_ends_at: string | null } | null;
}

export async function getMyPlan() {
  const { data, error } = await supabase.rpc('get_my_plan_status');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Plan status could not be loaded.');
  return row as UserPlan;
}

export async function startPremiumTrial() {
  const { error } = await supabase.rpc('start_my_premium_trial');
  if (error) throw error;
  return getMyPlan();
}

export async function analyzePremiumMessage(relationshipId: string, message: string) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('Please sign in again.');
  const cached = await listCachedMessages(user.id, relationshipId);
  const recentContext = cached.slice(-10).map((item) => ({
    logical_id: item.logical_id,
    text: item.body,
  }));

  const { data, error } = await supabase.functions.invoke('analyze-message', {
    body: { relationship_id: relationshipId, message, recent_context: recentContext },
  });
  if (error) throw error;
  if (data?.fallback_free) throw new Error('Daily trial limit reached');
  if (data?.error) throw new Error(data.error);
  return data as AiReview;
}
