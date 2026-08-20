import { supabase } from '../lib/supabase';

export type FeedbackCategory = 'general' | 'bug' | 'idea' | 'filter' | 'premium' | 'privacy';

export async function submitFeedback(category: FeedbackCategory, message: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Please sign in first.');

  const clean = message.trim();
  if (!clean) throw new Error('Please write a message.');
  if (clean.length > 2000) throw new Error('Feedback is limited to 2,000 characters.');

  const { error } = await supabase.from('feedback').insert({
    user_id: user.id,
    category,
    message: clean,
    app_version: '0.2.0',
  });
  if (error) throw error;
}
