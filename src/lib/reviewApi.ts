import { normalizeDateOnly } from './localDate';
import { getActiveSettings } from './settingsApi';
import { supabase } from './supabase';
import { startOfWeek } from './week';

const TABLE = 'weekly_reviews';
const COLUMNS =
  'id, user_id, week_start, rating, win, change_next, done_pct, completed_at, updated_at';

export type WeekReview = {
  id: string;
  userId: string;
  weekStart: string;
  rating: number;
  win: string | null;
  changeNext: string | null;
  donePct: number;
  completedAt: string;
  updatedAt: string;
};

export type WeekReviewInput = {
  weekStart: string;
  rating: number;
  win?: string | null;
  changeNext?: string | null;
  donePct: number;
};

type WeekReviewRow = {
  id: string;
  user_id: string;
  week_start: string;
  rating: number | string;
  win: string | null;
  change_next: string | null;
  done_pct: number | string;
  completed_at: string | null;
  updated_at: string | null;
};

function weekStartKey(weekStart: string): string {
  const day = normalizeDateOnly(weekStart);
  if (!day) {
    throw new Error('That week is not a valid date.');
  }
  return startOfWeek(day, getActiveSettings().weekStart);
}

function optionalText(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim().slice(0, 280);
  return trimmed ? trimmed : null;
}

function asNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === '') {
    return null;
  }
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function mapRow(row: WeekReviewRow): WeekReview {
  return {
    id: row.id,
    userId: row.user_id,
    weekStart: normalizeDateOnly(row.week_start) ?? row.week_start.slice(0, 10),
    rating: asNumber(row.rating) ?? 0,
    win: optionalText(row.win),
    changeNext: optionalText(row.change_next),
    donePct: asNumber(row.done_pct) ?? 0,
    completedAt: row.completed_at ?? '',
    updatedAt: row.updated_at ?? '',
  };
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

export async function getReview(weekStart: string): Promise<WeekReview | null> {
  const userId = await requireUserId();
  const week = weekStartKey(weekStart);
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq('user_id', userId)
    .eq('week_start', week)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data ? mapRow(data as WeekReviewRow) : null;
}

export async function upsertReview(input: WeekReviewInput): Promise<WeekReview> {
  const userId = await requireUserId();
  const week = weekStartKey(input.weekStart);
  const rating = Math.round(input.rating);
  if (rating < 1 || rating > 5) {
    throw new Error('Pick a rating from 1 to 5.');
  }
  const done = asNumber(input.donePct);
  if (done == null) {
    throw new Error('This week has no done percent.');
  }
  const donePct = Math.min(100, Math.max(0, Math.round(done)));
  const now = new Date().toISOString();

  const { data: existing, error: existingError } = await supabase
    .from(TABLE)
    .select('completed_at')
    .eq('user_id', userId)
    .eq('week_start', week)
    .maybeSingle();
  if (existingError) {
    throw existingError;
  }

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(
      {
        user_id: userId,
        week_start: week,
        rating,
        win: optionalText(input.win),
        change_next: optionalText(input.changeNext),
        done_pct: donePct,
        completed_at: (existing as { completed_at: string | null } | null)?.completed_at ?? now,
        updated_at: now,
      },
      { onConflict: 'user_id,week_start' },
    )
    .select(COLUMNS)
    .single();

  if (error) {
    throw error;
  }
  return mapRow(data as WeekReviewRow);
}
