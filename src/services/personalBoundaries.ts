import { validatePersonalBoundary } from '../domain/personalBoundaries';
import { supabase } from '../lib/supabase';

export interface PersonalBoundaryRow {
  id: string;
  phrase: string;
  created_at: string;
}

export async function listMyPersonalBoundaries(relationshipId: string) {
  const { data, error } = await supabase.rpc('list_my_personal_boundaries', { rel_id: relationshipId });
  if (error) throw error;
  return (data ?? []) as PersonalBoundaryRow[];
}

export async function addMyPersonalBoundary(relationshipId: string, input: string) {
  const validation = validatePersonalBoundary(input);
  if (!validation.valid) throw new Error(validation.error);
  const { data, error } = await supabase.rpc('add_my_personal_boundary', { rel_id: relationshipId, p_phrase: validation.display });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as PersonalBoundaryRow | null;
  if (!row) throw new Error('The personal boundary was not saved.');
  return row;
}

export async function removeMyPersonalBoundary(id: string) {
  const { data, error } = await supabase.rpc('remove_my_personal_boundary', { boundary_id: id });
  if (error) throw error;
  return Boolean(data);
}
