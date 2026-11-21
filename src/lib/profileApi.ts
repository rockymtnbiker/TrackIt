import AsyncStorage from '@react-native-async-storage/async-storage';
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

/** Raw profiles.age_range. Empty when the person has not answered. */
export async function getStoredAgeRange(): Promise<string | null> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('profiles')
    .select('age_range')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const value = (data as ProfileRow | null)?.age_range?.trim() ?? '';
  return value ? value : null;
}

export type SettingsAgeChoice = AgeRange | 'under_13';

/** Maps a stored profiles.age_range onto the Settings row. */
export function settingsAgeFromStored(value: string | null): SettingsAgeChoice | null {
  if (isUnder13(value)) {
    return 'under_13';
  }
  return ageRangeFromStored(value);
}

/** Groups are 13+. The stored value "Under 13" is the only block. */
export function isUnder13(age: string | null): boolean {
  if (!age) {
    return false;
  }
  const key = age.trim().toLowerCase();
  return key === 'under 13' || key === 'under_13' || key === 'under-13';
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

export async function getGuidelinesAgreedAt(): Promise<string | null> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('profiles')
    .select('guidelines_agreed_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  const value = (data as { guidelines_agreed_at?: string | null } | null)?.guidelines_agreed_at;
  return value ?? null;
}

export async function agreeToCommunityGuidelines(): Promise<void> {
  const { error } = await supabase.rpc('agree_to_community_guidelines');
  if (error) {
    throw error;
  }
}

export async function saveAgeRange(ageRange: AgeRange): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase.from('profiles').update({ age_range: ageRange }).eq('id', userId);

  if (error) {
    throw error;
  }
}

const TEMPERATURES = ['level-up', 'handling', 'stretched', 'stuck'] as const;

export type TemperatureId = (typeof TEMPERATURES)[number];

function temperatureKey(userId: string): string {
  return `maya-temperature:${userId}`;
}

function temperatureFromStored(value: string | null): TemperatureId | null {
  return TEMPERATURES.find((item) => item === value) ?? null;
}

/** Once per user on this device. profiles has no column for this answer. */
export async function getTemperature(): Promise<TemperatureId | null> {
  try {
    const userId = await requireUserId();
    const raw = await AsyncStorage.getItem(temperatureKey(userId));
    return temperatureFromStored(raw);
  } catch {
    return null;
  }
}

export async function saveTemperature(temperature: TemperatureId): Promise<void> {
  const userId = await requireUserId();
  await AsyncStorage.setItem(temperatureKey(userId), temperature);
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
