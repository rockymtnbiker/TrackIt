import { normalizeClock } from './clock';
import { supabase } from './supabase';

export type TimeFormat = 'system' | '12h' | '24h';
export type WeekStart = 0 | 1;

export type UserSettings = {
  weekStart: WeekStart;
  timeFormat: TimeFormat;
  /** Local time `HH:MM:SS`, or null when the evening check-in is off. */
  checkinTime: string | null;
};

export const DEFAULT_SETTINGS: UserSettings = {
  weekStart: 0,
  timeFormat: 'system',
  checkinTime: '19:00:00',
};

const SETTINGS_TABLE = 'user_settings';

let activeSettings: UserSettings = { ...DEFAULT_SETTINGS };

/** Latest settings held in memory. formatTime reads this. */
export function getActiveSettings(): UserSettings {
  return activeSettings;
}

export function setActiveSettings(next: UserSettings): void {
  activeSettings = next;
}

type SettingsRow = {
  week_start: number | null;
  time_format: string | null;
  checkin_time?: string | null;
};

function mapSettings(row: SettingsRow | null): UserSettings {
  if (!row) {
    return { ...DEFAULT_SETTINGS };
  }
  const weekStart: WeekStart = row.week_start === 1 ? 1 : 0;
  const timeFormat: TimeFormat =
    row.time_format === '12h' || row.time_format === '24h'
      ? row.time_format
      : 'system';
  return { weekStart, timeFormat, checkinTime: normalizeClock(row.checkin_time) };
}

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

export async function getSettings(): Promise<UserSettings> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .select('week_start, time_format, checkin_time')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return mapSettings((data as SettingsRow | null) ?? null);
}

export async function upsertSettings(settings: UserSettings): Promise<UserSettings> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .upsert(
      {
        user_id: userId,
        week_start: settings.weekStart,
        time_format: settings.timeFormat,
        checkin_time: normalizeClock(settings.checkinTime),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    .select('week_start, time_format, checkin_time')
    .single();

  if (error) {
    throw error;
  }

  const saved = mapSettings(data as SettingsRow);
  void import('./reminders')
    .then(({ rebuildReminders }) => rebuildReminders())
    .catch((refreshError) => {
      console.warn('Failed to rebuild reminders', refreshError);
    });
  return saved;
}
