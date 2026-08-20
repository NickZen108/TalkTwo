import { supabase } from '../lib/supabase';

export type FeedbackCategory = 'general' | 'bug' | 'idea' | 'filter' | 'premium' | 'privacy';

export async function submitFeedback(category: FeedbackCategory, message: string) {
  const clean = message.trim();
  if (!clean) throw new Error('Please write a message.');
  if (Array.from(clean).length > 2000) throw new Error('Feedback is limited to 2,000 characters.');

  const { error } = await supabase.rpc('submit_feedback', {
    p_category: category,
    p_message: clean,
    p_app_version: '0.3.0',
  });
  if (error) throw error;
}
