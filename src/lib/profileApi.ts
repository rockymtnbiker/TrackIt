import { supabase } from './supabase';

type ProfileRow = {
  display_name: string | null;
  onboarded_at?: string | null;
};

export type MyProfile = {
  displayName: string;
  onboardedAt: string | null;
};

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

export async function getMyProfile(): Promise<MyProfile> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name, onboarded_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as ProfileRow | null;
  return {
    displayName: (row?.display_name ?? '').trim(),
    onboardedAt: row?.onboarded_at ?? null,
  };
}

export async function getDisplayName(): Promise<string> {
  const profile = await getMyProfile();
  return profile.displayName;
}

export async function saveDisplayName(displayName: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: displayName.trim() })
    .eq('id', userId);

  if (error) {
    throw error;
  }
}

/** Sets onboarded_at when it is still null. Returns false if this account was already onboarded. */
export async function markOnboarded(): Promise<boolean> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('profiles')
    .update({ onboarded_at: new Date().toISOString() })
    .eq('id', userId)
    .is('onboarded_at', null)
    .select('id');

  if (error) {
    throw error;
  }

  return Array.isArray(data) && data.length > 0;
}
