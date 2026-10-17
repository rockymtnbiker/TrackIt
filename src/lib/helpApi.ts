import { supabase } from './supabase';

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    throw error;
  }
  const userId = data.user?.id;
  if (!userId) {
    throw new Error('You must be signed in.');
  }
  return userId;
}

function isDuplicate(error: { code?: string }): boolean {
  return error.code === '23505';
}

export async function hasCoachingInterest(): Promise<boolean> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('coaching_interest')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data != null;
}

export async function saveCoachingInterest(): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase.from('coaching_interest').insert({ user_id: userId });

  if (error && !isDuplicate(error)) {
    throw error;
  }
}
