import { supabase } from '../lib/supabase';

export interface UserPlan {
  user_id: string;
  plan: 'free' | 'trial' | 'premium';
  trial_started_at: string | null;
  trial_ends_at: string | null;
  premium_ends_at: string | null;
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
  const { data, error } = await supabase.from('user_plans').select('user_id,plan,trial_started_at,trial_ends_at,premium_ends_at').single();
  if (error) throw error;
  return data as UserPlan;
}

export async function startPremiumTrial() {
  const { data, error } = await supabase.rpc('start_my_premium_trial');
  if (error) throw error;
  return data as UserPlan;
}

export async function analyzePremiumMessage(relationshipId: string, message: string) {
  const { data, error } = await supabase.functions.invoke('analyze-message', {
    body: { relationship_id: relationshipId, message },
  });
  if (error) throw error;
  if (data?.fallback_free) throw new Error('Daily trial limit reached');
  if (data?.error) throw new Error(data.error);
  return data as AiReview;
}
