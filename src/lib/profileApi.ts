import { supabase } from './supabase';

type ProfileRow = {
  display_name: string | null;
  onboarded_at?: string | null;
  age_range?: string | null;
};

export type AgeRange = 'under_18' | '18_24' | '25_34' | '35_49' | '50_plus' | 'prefer_not';

const AGE_RANGES: readonly AgeRange[] = [
  'under_18',
  '18_24',
  '25_34',
  '35_49',
  '50_plus',
  'prefer_not',
];

const AGE_BY_CHOICE: Record<string, AgeRange> = {
  'under-18': 'under_18',
  '18-24': '18_24',
  '25-34': '25_34',
  '35-49': '35_49',
  '50-plus': '50_plus',
  'prefer-not': 'prefer_not',
  'Under 18': 'under_18',
  '18–24': '18_24',
  '25–34': '25_34',
  '35–49': '35_49',
  '50+': '50_plus',
  'Prefer not to say': 'prefer_not',
};

export function ageRangeFromChoice(choice: string): AgeRange | null {
  return AGE_BY_CHOICE[choice] ?? null;
}

function ageRangeFromStored(value: string | null | undefined): AgeRange | null {
  if (!value) {
    return null;
  }
  return AGE_RANGES.find((item) => item === value) ?? null;
}

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

export async function getAgeRange(): Promise<AgeRange | null> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('profiles')
    .select('age_range')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return ageRangeFromStored((data as ProfileRow | null)?.age_range);
}

export async function saveAgeRange(ageRange: AgeRange): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase.from('profiles').update({ age_range: ageRange }).eq('id', userId);

  if (error) {
    throw error;
  }
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
