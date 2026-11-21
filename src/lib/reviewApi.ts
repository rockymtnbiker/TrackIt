import { normalizeDateOnly } from './localDate';
import { getActiveSettings, type WeekStart } from './settingsApi';
import { awardBadges } from './badgeCelebration';
import { supabase } from './supabase';
import { lastFullWeek, startOfWeek } from './week';

const TABLE = 'weekly_reviews';
const COLUMNS =
  'id, user_id, week_start, rating, win, change_next, done_pct, goal_checkins, partner_checkin, coach_checkin, completed_at, updated_at';

export type PartnerCheckin = 'yes' | 'not_yet' | 'invited' | 'not_now';
export type CoachCheckin = 'yes' | 'not_yet' | 'requested' | 'pending' | 'not_now';

export type GoalCheckin = {
  goal_id: string;
  /** "Reflect on my own" stores the single answer id here. */
  answer?: string;
  /** Whole-number week percent. Null when the goal has no weekly count. */
  week_pct?: number | null;
  /** The target amount changed while this goal was open in the reflection. */
  target_changed?: boolean;
  /** What's next choice. Null when that step did not run. */
  r3c?: string | null;
  /** Older rows. New reflections do not write these. */
  r3b?: string | null;
  r3d?: string | null;
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
  /** True when this row was saved from Reflect with Maya. */
  maya: boolean;
  /** Week start stored when the recap coach line was shown. */
  coachLineShown: string | null;
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
    const row = item as {
      goal_id?: unknown;
      answer?: unknown;
      week_pct?: unknown;
      target_changed?: unknown;
      r3b?: unknown;
      r3c?: unknown;
      r3d?: unknown;
    };
    if (typeof row.goal_id !== 'string') {
      continue;
    }
    const checkin: GoalCheckin = { goal_id: row.goal_id };
    if (typeof row.answer === 'string') {
      checkin.answer = row.answer;
    }
    if (typeof row.week_pct === 'number' && Number.isFinite(row.week_pct)) {
      checkin.week_pct = Math.round(row.week_pct);
    } else if (row.week_pct === null) {
      checkin.week_pct = null;
    }
    if (typeof row.target_changed === 'boolean') {
      checkin.target_changed = row.target_changed;
    }
    if (typeof row.r3b === 'string' || row.r3b === null) {
      checkin.r3b = row.r3b;
    }
    if (typeof row.r3c === 'string' || row.r3c === null) {
      checkin.r3c = row.r3c;
    }
    if (typeof row.r3d === 'string' || row.r3d === null) {
      checkin.r3d = row.r3d;
    }
    if (
      checkin.answer == null &&
      checkin.week_pct === undefined &&
      checkin.target_changed === undefined &&
      checkin.r3b === undefined &&
      checkin.r3c === undefined &&
      checkin.r3d === undefined
    ) {
      continue;
    }
    checkins.push(checkin);
  }
  return checkins;
}

/** Marker kept beside goal check-ins. No new column: goal_checkins is already JSON. */
function asCoachLineMeta(value: unknown): { maya: boolean; coachLineShown: string | null } {
  let maya = false;
  let coachLineShown: string | null = null;
  if (!Array.isArray(value)) {
    return { maya, coachLineShown };
  }
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const row = item as {
      maya?: unknown;
      coach_line_shown?: unknown;
      r3b?: unknown;
      r3c?: unknown;
      r3d?: unknown;
    };
    if (row.maya === true) {
      maya = true;
    }
    if (typeof row.coach_line_shown === 'string' && row.coach_line_shown.trim()) {
      coachLineShown = row.coach_line_shown.trim().slice(0, 10);
    }
    if (typeof row.r3b === 'string' || typeof row.r3c === 'string' || typeof row.r3d === 'string') {
      maya = true;
    }
  }
  return { maya, coachLineShown };
}

function goalCheckinsPayload(
  checkins: GoalCheckin[],
  maya: boolean,
  coachLineShown: string | null,
): unknown[] {
  const rows: unknown[] = [...checkins];
  if (!maya && !coachLineShown) {
    return rows;
  }
  const marker: { maya?: true; coach_line_shown?: string } = {};
  if (maya) {
    marker.maya = true;
  }
  if (coachLineShown) {
    marker.coach_line_shown = coachLineShown;
  }
  rows.push(marker);
  return rows;
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
    ...asCoachLineMeta(row.goal_checkins),
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

/** Last week when it has no reflection, otherwise the current week. */
export async function reflectOpenWeek(today: string, weekStartsOn: WeekStart): Promise<string> {
  const last = lastFullWeek(today, weekStartsOn);
  const review = await getReview(last);
  return review ? startOfWeek(today, weekStartsOn) : last;
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
  /** Reflect with Maya. Omitted for Reflect on my own. */
  maya?: boolean;
  /** Week the recap coach line was shown, when it was shown. */
  coachLineShown?: string | null;
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
        goal_checkins: goalCheckinsPayload(
          input.goalCheckins,
          input.maya === true,
          input.coachLineShown ?? null,
        ),
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

/** Every saved reflection, oldest week first. Used for the recap coach line. */
export async function listReflectionHistory(): Promise<WeekReview[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('week_start', { ascending: true });

  if (error) {
    throw error;
  }
  return ((data as WeekReviewRow[] | null) ?? []).map(mapRow);
}
