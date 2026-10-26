import { BADGES } from '../constants/badges';
import { addDays } from '../utils/date';
import { metWeekStreak } from '../utils/streak';
import { getMyConnections } from './communityApi';
import { getAllGoals, getEntries } from './goalTreeApi';
import { ENTRIES_TABLE, GOALS_TABLE } from './goalTables';
import { goalStartDate, isRepeating } from './goalTree';
import { normalizeDateOnly, parseLocalDate, todayLocal } from './localDate';
import { getReviewWeeks } from './reviewApi';
import { getActiveSettings } from './settingsApi';
import { supabase } from './supabase';
import { endOfWeek, startOfWeek } from './week';
import { getWeekStreak, getWeeklyItems, WEEK_STREAK_DONE } from './weeklyReview';

const TABLE = 'user_badges';

export type EarnedBadge = {
  badgeKey: string;
  earnedAt: string;
};

type EarnedRow = {
  badge_key: string;
  earned_at: string | null;
};

let pending: Promise<void> = Promise.resolve();

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

export async function listEarnedBadges(): Promise<EarnedBadge[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from(TABLE)
    .select('badge_key, earned_at')
    .eq('user_id', userId);

  if (error) {
    throw error;
  }

  return ((data as EarnedRow[] | null) ?? []).map((row) => ({
    badgeKey: row.badge_key,
    earnedAt: row.earned_at ?? '',
  }));
}

function longestWeekRun(weeks: string[]): number {
  const ordered = [...new Set(weeks)].sort();
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const week of ordered) {
    run = previous != null && addDays(previous, 7) === week ? run + 1 : 1;
    if (run > best) {
      best = run;
    }
    previous = week;
  }
  return best;
}

async function hasAny(rows: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<boolean> {
  const { data, error } = await rows;
  if (error) {
    throw error;
  }
  return Array.isArray(data) && data.length > 0;
}

async function evaluateBadges(): Promise<string[]> {
  const userId = await requireUserId();
  const earned = new Set((await listEarnedBadges()).map((badge) => badge.badgeKey));
  const missing = BADGES.filter((badge) => !earned.has(badge.key));
  if (missing.length === 0) {
    return [];
  }
  const need = new Set(missing.map((badge) => badge.key));
  const unlocked = new Set<string>();

  if (need.has('first_step')) {
    const logged = await hasAny(
      supabase.from(ENTRIES_TABLE).select('id').eq('user_id', userId).limit(1),
    );
    if (logged) {
      unlocked.add('first_step');
    }
  }

  if (need.has('reviewer') || need.has('steady_4') || need.has('committed_12')) {
    const weeks = await getReviewWeeks();
    const run = longestWeekRun(weeks);
    if (need.has('reviewer') && weeks.length > 0) {
      unlocked.add('reviewer');
    }
    if (need.has('steady_4') && run >= 4) {
      unlocked.add('steady_4');
    }
    if (need.has('committed_12') && run >= 12) {
      unlocked.add('committed_12');
    }
  }

  if (need.has('finisher')) {
    const finished = await hasAny(
      supabase.from(GOALS_TABLE).select('id').eq('user_id', userId).eq('status', 'done').limit(1),
    );
    if (finished) {
      unlocked.add('finisher');
    }
  }

  if (need.has('partnered_up')) {
    const connections = await getMyConnections();
    if (connections.some((connection) => connection.status.toLowerCase() === 'accepted')) {
      unlocked.add('partnered_up');
    }
  }

  if (need.has('perfect_week') || need.has('on_a_roll')) {
    const goals = await getAllGoals();
    const entries = await getEntries(goals.map((goal) => goal.id));
    const weekStartsOn = getActiveSettings().weekStart;
    const today = todayLocal();
    const currentWeek = startOfWeek(today, weekStartsOn);
    let earliest = today;
    for (const goal of goals) {
      const start = goalStartDate(goal);
      const planned = normalizeDateOnly(goal.targetStartDate);
      if (start && start < earliest) {
        earliest = start;
      }
      if (planned && planned < earliest) {
        earliest = planned;
      }
    }
    const firstWeek = startOfWeek(earliest, weekStartsOn);
    const repeating = goals.filter(
      (goal) => isRepeating(goal) && goal.repeatPeriod === 'week',
    );
    const flags: boolean[] = [];
    for (let week = firstWeek; week <= currentWeek; week = addDays(week, 7)) {
      const current = week === currentWeek;
      const asOf = current ? parseLocalDate(today) : undefined;
      const weekDate = parseLocalDate(week);
      if (need.has('perfect_week') && !unlocked.has('perfect_week')) {
        const full = getWeeklyItems(goals, entries, weekDate, asOf, weekStartsOn);
        if (full.totalCount > 0 && full.donePct >= 1) {
          unlocked.add('perfect_week');
        }
      }
      if (need.has('on_a_roll')) {
        const source = current ? goals : repeating;
        const review = getWeeklyItems(source, entries, weekDate, asOf, weekStartsOn);
        flags.push(review.totalCount > 0 && review.donePct >= WEEK_STREAK_DONE);
      }
    }
    if (need.has('on_a_roll')) {
      const streak = getWeekStreak(goals, entries, parseLocalDate(today), weekStartsOn);
      if (streak >= 4 || metWeekStreak(flags).best >= 4) {
        unlocked.add('on_a_roll');
      }
    }
  }

  const keys = BADGES.filter((badge) => unlocked.has(badge.key)).map((badge) => badge.key);
  if (keys.length === 0) {
    return [];
  }

  const earnedAt = new Date().toISOString();
  const { error } = await supabase.from(TABLE).upsert(
    keys.map((badgeKey) => ({
      user_id: userId,
      badge_key: badgeKey,
      earned_at: earnedAt,
    })),
    { onConflict: 'user_id,badge_key', ignoreDuplicates: true },
  );
  if (error) {
    throw error;
  }
  return keys;
}

/** Newly earned badge keys, in definition order. Concurrent checks run one at a time. */
export function checkBadges(): Promise<string[]> {
  const run = pending.then(evaluateBadges, evaluateBadges);
  pending = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
