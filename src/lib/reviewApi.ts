import { normalizeDateOnly } from './localDate';
import { getActiveSettings } from './settingsApi';
import { awardBadges } from './badgeCelebration';
import { supabase } from './supabase';
import { startOfWeek } from './week';

const TABLE = 'weekly_reviews';
const COLUMNS =
  'id, user_id, week_start, rating, win, change_next, done_pct, goal_checkins, partner_checkin, coach_checkin, completed_at, updated_at';

export type PartnerCheckin = 'yes' | 'not_yet' | 'invited' | 'not_now';
export type CoachCheckin = 'yes' | 'not_yet' | 'requested' | 'pending' | 'not_now';

export type GoalCheckin = {
  goal_id: string;
  answer: string;
};

export type WeekReview = {
  id: string;
  userId: string;
  weekStart: string;
  rating: number | null;
  win: string | null;
  changeNext: string | null;
  donePct: number;
  goalCheckins: GoalCheckin[];
  partnerCheckin: PartnerCheckin | null;
  coachCheckin: CoachCheckin | null;
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
  rating: number | string | null;
  win: string | null;
  change_next: string | null;
  done_pct: number | string;
  goal_checkins?: unknown;
  partner_checkin?: string | null;
  coach_checkin?: string | null;
  completed_at: string | null;
  updated_at: string | null;
};

const PARTNER_CHECKINS: readonly PartnerCheckin[] = ['yes', 'not_yet', 'invited', 'not_now'];
const COACH_CHECKINS: readonly CoachCheckin[] = ['yes', 'not_yet', 'requested', 'pending', 'not_now'];

function asPartnerCheckin(value: string | null | undefined): PartnerCheckin | null {
  return PARTNER_CHECKINS.find((item) => item === value) ?? null;
}

function asCoachCheckin(value: string | null | undefined): CoachCheckin | null {
  return COACH_CHECKINS.find((item) => item === value) ?? null;
}

function asCheckins(value: unknown): GoalCheckin[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const checkins: GoalCheckin[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const row = item as { goal_id?: unknown; answer?: unknown };
    if (typeof row.goal_id === 'string' && typeof row.answer === 'string') {
      checkins.push({ goal_id: row.goal_id, answer: row.answer });
    }
  }
  return checkins;
}

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
    rating: asNumber(row.rating),
    win: optionalText(row.win),
    changeNext: optionalText(row.change_next),
    donePct: asNumber(row.done_pct) ?? 0,
    goalCheckins: asCheckins(row.goal_checkins),
    partnerCheckin: asPartnerCheckin(row.partner_checkin),
    coachCheckin: asCoachCheckin(row.coach_checkin),
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

/** Week starts the user has reviewed, aligned to the current week start. */
export async function getReviewWeeks(): Promise<string[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from(TABLE)
    .select('week_start')
    .eq('user_id', userId);

  if (error) {
    throw error;
  }

  const weeks: string[] = [];
  for (const row of (data as { week_start: string }[] | null) ?? []) {
    const day = normalizeDateOnly(row.week_start);
    if (day) {
      weeks.push(startOfWeek(day, getActiveSettings().weekStart));
    }
  }
  return weeks;
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
  awardBadges();
  return mapRow(data as WeekReviewRow);
}

export type ReflectionSaveInput = {
  weekStart: string;
  donePct: number;
  goalCheckins: GoalCheckin[];
  partnerCheckin: PartnerCheckin | null;
  coachCheckin: CoachCheckin | null;
};

/** Saves a reflection onto the same weekly_reviews row, including the done percent snapshot. */
export async function saveReflection(input: ReflectionSaveInput): Promise<WeekReview> {
  const userId = await requireUserId();
  const week = weekStartKey(input.weekStart);
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
        rating: null,
        win: null,
        done_pct: donePct,
        goal_checkins: input.goalCheckins,
        partner_checkin: input.partnerCheckin,
        coach_checkin: input.coachCheckin,
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

/** Newest reflections first, for skip rules and the saved summary. */
export async function listReflections(limit = 8): Promise<WeekReview[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('week_start', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }
  return ((data as WeekReviewRow[] | null) ?? []).map(mapRow);
}
