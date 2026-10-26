import type {
  GoalEntry,
  Goal,
  GoalStatus,
  GoalTarget,
  RepeatPeriod,
} from '../types/goal';
import {
  localCalendarDay,
  normalizeDateOnly,
  parseLocalDate,
  todayLocal,
  toLocalDateString,
} from './localDate';
import { toDateString } from '../utils/date';
import { ENTRIES_TABLE, GOALS_TABLE, amountToNumber } from './goalTables';
import { normalizeClock } from './clock';
import { goalStartDate, isRepeating, storedTimesPerDay } from './goalTree';
import { getActiveSettings } from './settingsApi';
import { captureStatusDates } from './statusDates';
import { awardBadges } from './badgeCelebration';
import { supabase } from './supabase';
import { endOfWeek, startOfWeek } from './week';

type GoalRow = {
  id: string;
  user_id: string;
  parent_id: string | null;
  title: string;
  description: string | null;
  why: string | null;
  category: string | null;
  sort_order: number | null;
  status: string;
  target_start_date: string | null;
  target_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  created_date: string | null;
  deleted_at: string | null;
  unit: string | null;
  target_amount: number | string | null;
  repeat_period: string | null;
  planned_days: number[] | null;
  times_per_day?: number | string | null;
  reminder_time?: string | null;
  starter_key?: string | null;
};

export type GoalInput = {
  title: string;
  parentId?: string | null;
  description?: string | null;
  why?: string | null;
  category?: string | null;
  status?: GoalStatus;
  targetStartDate?: string | null;
  targetEndDate?: string | null;
  actualStartDate?: string | null;
  actualEndDate?: string | null;
  unit?: string | null;
  targetAmount?: number | null;
  repeatPeriod?: RepeatPeriod | null;
  plannedDays?: number[] | null;
  timesPerDay?: number | null;
  reminderTime?: string | null;
  starterKey?: string | null;
};

export type GoalUpdates = Partial<
  Omit<GoalInput, 'parentId' | 'title'>
> & {
  title?: string;
  sortOrder?: number;
};

type EntryRow = {
  id: string;
  goal_id: string;
  entry_date: string;
  value: number | string | null;
  created_at?: string | null;
};

function blankToNull(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function dateOrNull(value: string | null | undefined): string | null {
  return normalizeDateOnly(value);
}

/**
 * `created_date` is timestamptz default now(), not a date.
 * Store local noon so the UTC day matches the device day (UTC-12 through UTC+11).
 * A bare YYYY-MM-DD would be saved as UTC midnight and read back as the previous evening.
 */
function createdDateStamp(date: Date = new Date()): string {
  const noon = parseLocalDate(toLocalDateString(date));
  noon.setHours(12, 0, 0, 0);
  return noon.toISOString();
}

function mapRepeatPeriod(
  value: string | null | undefined,
): RepeatPeriod | null {
  const period = value?.toLowerCase();
  if (period === 'day') {
    return 'week';
  }
  if (period === 'week' || period === 'month') {
    return period;
  }
  return null;
}

function mapRowToNode(row: GoalRow): Goal {
  const status: GoalStatus =
    row.status === 'pending' || row.status === 'active' || row.status === 'done'
      ? row.status
      : 'pending';

  return {
    id: row.id,
    userId: row.user_id,
    parentId: row.parent_id,
    title: row.title,
    description: row.description,
    why: blankToNull(row.why),
    category: row.category,
    sortOrder: row.sort_order ?? 0,
    status,
    targetStartDate: dateOrNull(row.target_start_date),
    targetEndDate: dateOrNull(row.target_end_date),
    actualStartDate: dateOrNull(row.actual_start_date),
    actualEndDate: dateOrNull(row.actual_end_date),
    createdDate: localCalendarDay(row.created_date),
    unit: row.unit,
    targetAmount: amountToNumber(row.target_amount) ?? null,
    repeatPeriod: mapRepeatPeriod(row.repeat_period),
    plannedDays: row.planned_days,
    timesPerDay: storedTimesPerDay(amountToNumber(row.times_per_day) ?? null),
    reminderTime: normalizeClock(row.reminder_time),
    starterKey: blankToNull(row.starter_key),
  };
}

function refreshReminders(): void {
  void import('./reminders')
    .then(({ rebuildReminders }) => rebuildReminders())
    .catch((error) => {
      console.warn('Failed to rebuild reminders', error);
    });
}

const ENTRY_COLUMNS = 'id, goal_id, entry_date, value, created_at';
const GOAL_TARGETS_TABLE = 'goal_targets';
const TARGET_COLUMNS =
  'id, goal_id, user_id, effective_from, target_amount, repeat_period, planned_days, times_per_day, created_at';

type GoalTargetRow = {
  id: string;
  goal_id: string;
  user_id: string;
  effective_from: string;
  target_amount: number | string | null;
  repeat_period: string | null;
  planned_days: number[] | null;
  times_per_day: number | string | null;
  created_at: string | null;
};

function mapTargetRow(row: GoalTargetRow): GoalTarget {
  return {
    id: row.id,
    goalId: row.goal_id,
    userId: row.user_id,
    effectiveFrom: normalizeDateOnly(row.effective_from) ?? row.effective_from.slice(0, 10),
    targetAmount: amountToNumber(row.target_amount) ?? null,
    repeatPeriod: mapRepeatPeriod(row.repeat_period),
    plannedDays: row.planned_days,
    timesPerDay: storedTimesPerDay(amountToNumber(row.times_per_day) ?? null),
    createdAt: row.created_at ?? '',
  };
}

async function fetchTargetHistory(userId: string): Promise<Map<string, GoalTarget[]>> {
  const { data, error } = await supabase
    .from(GOAL_TARGETS_TABLE)
    .select(TARGET_COLUMNS)
    .eq('user_id', userId)
    .order('effective_from', { ascending: true });

  if (error) {
    throw error;
  }

  const byGoal = new Map<string, GoalTarget[]>();
  for (const row of (data as GoalTargetRow[] | null) ?? []) {
    const target = mapTargetRow(row);
    const list = byGoal.get(target.goalId);
    if (list) {
      list.push(target);
    } else {
      byGoal.set(target.goalId, [target]);
    }
  }
  for (const list of byGoal.values()) {
    list.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  }
  return byGoal;
}

function withHistory(goals: Goal[], history: Map<string, GoalTarget[]>): Goal[] {
  return goals.map((goal) => ({
    ...goal,
    targetHistory: history.get(goal.id) ?? [],
  }));
}

function sameDays(left: number[] | null, right: number[] | null): boolean {
  if (left == null || right == null) {
    return left == null && right == null;
  }
  if (left.length !== right.length) {
    return false;
  }
  const a = [...left].sort((x, y) => x - y);
  const b = [...right].sort((x, y) => x - y);
  return a.every((day, index) => day === b[index]);
}

function sameTarget(left: Goal, right: Goal): boolean {
  return (
    (left.targetAmount ?? null) === (right.targetAmount ?? null) &&
    (left.repeatPeriod ?? null) === (right.repeatPeriod ?? null) &&
    storedTimesPerDay(left.timesPerDay) === storedTimesPerDay(right.timesPerDay) &&
    sameDays(left.plannedDays, right.plannedDays)
  );
}

function currentPeriod(repeatPeriod: RepeatPeriod | null): { start: string; end: string } {
  const today = todayLocal();
  if (repeatPeriod === 'month') {
    const parsed = parseLocalDate(today);
    const year = parsed.getFullYear();
    const monthIndex = parsed.getMonth();
    const last = new Date(year, monthIndex + 1, 0).getDate();
    return {
      start: toDateString(year, monthIndex, 1),
      end: toDateString(year, monthIndex, last),
    };
  }
  const weekStartsOn = getActiveSettings().weekStart;
  const start = startOfWeek(today, weekStartsOn);
  return { start, end: endOfWeek(start, weekStartsOn) };
}

function mapRowToEntry(row: EntryRow): GoalEntry {
  return {
    id: row.id,
    goalId: row.goal_id,
    entryDate: normalizeDateOnly(row.entry_date) ?? row.entry_date.slice(0, 10),
    value: amountToNumber(row.value) ?? null,
    createdAt: row.created_at ?? '',
  };
}

/**
 * Repeat on: period is week or month and planned days is an array (maybe empty).
 * Repeat off: both are null. Setting only the period turns days into [].
 */
function normalizeRepeat(
  repeatPeriod: RepeatPeriod | null,
  plannedDays: number[] | null,
): { repeat_period: RepeatPeriod | null; planned_days: number[] | null } {
  if (plannedDays === null && repeatPeriod === null) {
    return { repeat_period: null, planned_days: null };
  }
  if (repeatPeriod == null) {
    throw new Error('A repeating step needs a repeat period of week or month.');
  }
  return {
    repeat_period: repeatPeriod,
    planned_days: plannedDays ?? [],
  };
}

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    throw error;
  }
  const userId = data.user?.id;
  if (!userId) {
    throw new Error('You must be signed in to manage goals.');
  }
  return userId;
}

async function fetchNodeRow(
  id: string,
  userId: string,
): Promise<GoalRow | null> {
  const { data, error } = await supabase
    .from(GOALS_TABLE)
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as GoalRow | null) ?? null;
}

export async function getAllGoals(ownerId?: string): Promise<Goal[]> {
  const userId = ownerId ?? (await requireUserId());
  const [goalsResult, history] = await Promise.all([
    supabase
      .from(GOALS_TABLE)
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true }),
    fetchTargetHistory(userId),
  ]);

  if (goalsResult.error) {
    throw goalsResult.error;
  }

  return withHistory(
    ((goalsResult.data as GoalRow[] | null) ?? []).map(mapRowToNode),
    history,
  );
}

export async function getGoal(id: string): Promise<Goal | null> {
  const userId = await requireUserId();
  const [row, history] = await Promise.all([
    fetchNodeRow(id, userId),
    fetchTargetHistory(userId),
  ]);
  return row ? withHistory([mapRowToNode(row)], history)[0] : null;
}

export async function getChildren(
  parentId: string | null,
): Promise<Goal[]> {
  const userId = await requireUserId();
  let query = supabase
    .from(GOALS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });

  query =
    parentId == null
      ? query.is('parent_id', null)
      : query.eq('parent_id', parentId);

  const [{ data, error }, history] = await Promise.all([
    query,
    fetchTargetHistory(userId),
  ]);
  if (error) {
    throw error;
  }

  return withHistory(((data as GoalRow[] | null) ?? []).map(mapRowToNode), history);
}

/** Insert or replace the target version that starts on effectiveFrom. */
export async function upsertGoalTarget(goal: Goal, effectiveFrom: string): Promise<void> {
  const day = normalizeDateOnly(effectiveFrom);
  if (!day) {
    throw new Error('A target needs a start date.');
  }
  const userId = goal.userId || (await requireUserId());
  const { error } = await supabase.from(GOAL_TARGETS_TABLE).upsert(
    {
      goal_id: goal.id,
      user_id: userId,
      effective_from: day,
      target_amount: goal.targetAmount,
      repeat_period: goal.repeatPeriod,
      planned_days: goal.plannedDays,
      times_per_day: storedTimesPerDay(goal.timesPerDay),
    },
    { onConflict: 'goal_id,effective_from' },
  );
  if (error) {
    throw error;
  }
}

/**
 * A change applies to the whole current week or month.
 * The first change for an older step keeps the previous target on its start date
 * so past periods do not pick up the new fields.
 * Rows already inside the current period are updated so a mid-period start date
 * does not hide the change.
 */
async function recordTargetChange(
  previous: Goal,
  next: Goal,
  userId: string,
): Promise<void> {
  if (!isRepeating(next) || sameTarget(previous, next)) {
    return;
  }

  const bounds = currentPeriod(next.repeatPeriod);
  const { data: earlier, error: earlierError } = await supabase
    .from(GOAL_TARGETS_TABLE)
    .select('id')
    .eq('user_id', userId)
    .eq('goal_id', next.id)
    .lt('effective_from', bounds.start)
    .limit(1);
  if (earlierError) {
    throw earlierError;
  }

  const start = goalStartDate(previous);
  if ((earlier?.length ?? 0) === 0 && start && start < bounds.start) {
    await upsertGoalTarget({ ...previous, userId }, start);
  }

  await upsertGoalTarget({ ...next, userId }, bounds.start);

  const { data: later, error: laterError } = await supabase
    .from(GOAL_TARGETS_TABLE)
    .select('effective_from')
    .eq('user_id', userId)
    .eq('goal_id', next.id)
    .gt('effective_from', bounds.start)
    .lte('effective_from', bounds.end);
  if (laterError) {
    throw laterError;
  }
  for (const row of (later as { effective_from: string }[] | null) ?? []) {
    const day = normalizeDateOnly(row.effective_from);
    if (day) {
      await upsertGoalTarget({ ...next, userId }, day);
    }
  }
}

export async function createGoal(input: GoalInput): Promise<Goal> {
  const userId = await requireUserId();
  const parentId = input.parentId ?? null;

  if (parentId) {
    const parent = await fetchNodeRow(parentId, userId);
    if (!parent) {
      throw new Error('Parent step not found.');
    }
    if (isRepeating(mapRowToNode(parent))) {
      throw new Error("Repeating steps can't have children.");
    }
  }

  const repeat = normalizeRepeat(
    input.repeatPeriod ?? null,
    input.plannedDays === undefined ? null : input.plannedDays,
  );
  const repeating = repeat.planned_days !== null;

  let siblingQuery = supabase
    .from(GOALS_TABLE)
    .select('sort_order')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: false })
    .limit(1);

  siblingQuery =
    parentId == null
      ? siblingQuery.is('parent_id', null)
      : siblingQuery.eq('parent_id', parentId);

  const { data: siblings, error: siblingError } = await siblingQuery;
  if (siblingError) {
    throw siblingError;
  }

  const maxOrder =
    (siblings as { sort_order: number | null }[] | null)?.[0]?.sort_order ??
    -1;

  const { data, error } = await supabase
    .from(GOALS_TABLE)
    .insert({
      user_id: userId,
      parent_id: parentId,
      title: input.title,
      description: blankToNull(input.description),
      why: blankToNull(input.why),
      category: blankToNull(input.category),
      sort_order: maxOrder + 1,
      status: input.status ?? (repeating ? 'active' : 'pending'),
      target_start_date: dateOrNull(input.targetStartDate),
      target_end_date: dateOrNull(input.targetEndDate),
      actual_start_date: dateOrNull(input.actualStartDate),
      actual_end_date: dateOrNull(input.actualEndDate),
      created_date: createdDateStamp(parseLocalDate(todayLocal())),
      unit: blankToNull(input.unit),
      target_amount: input.targetAmount ?? null,
      repeat_period: repeat.repeat_period,
      planned_days: repeat.planned_days,
      times_per_day: storedTimesPerDay(input.timesPerDay),
      starter_key: blankToNull(input.starterKey),
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  const created = mapRowToNode(data as GoalRow);
  if (isRepeating(created)) {
    await upsertGoalTarget(created, goalStartDate(created) || todayLocal());
  }
  const history = await fetchTargetHistory(userId);
  refreshReminders();
  return withHistory([created], history)[0];
}

/** Move a repeating goal's repeat and logs into a new first step. Returns that step's id. */
export async function convertRepeatingToParent(goalId: string): Promise<string> {
  const { data, error } = await supabase.rpc('convert_repeating_to_parent', {
    p_goal_id: goalId,
  });
  if (error) {
    throw error;
  }
  if (typeof data !== 'string' || data.length === 0) {
    throw new Error('The repeat could not be moved into a step.');
  }

  const userId = await requireUserId();
  const { error: moveError } = await supabase
    .from(GOAL_TARGETS_TABLE)
    .update({ goal_id: data })
    .eq('goal_id', goalId)
    .eq('user_id', userId);
  if (moveError) {
    throw moveError;
  }
  return data;
}

export async function updateGoal(
  id: string,
  updates: GoalUpdates,
): Promise<Goal> {
  const userId = await requireUserId();
  const existing = await fetchNodeRow(id, userId);
  if (!existing) {
    throw new Error('Step not found.');
  }

  const row: Record<string, unknown> = {};

  if (updates.title !== undefined) {
    row.title = updates.title;
  }
  if (updates.description !== undefined) {
    row.description = blankToNull(updates.description);
  }
  if (updates.why !== undefined) {
    row.why = blankToNull(updates.why);
  }
  if (updates.category !== undefined) {
    row.category = blankToNull(updates.category);
  }
  if (updates.status !== undefined) {
    row.status = updates.status;
  }
  if (updates.targetStartDate !== undefined) {
    row.target_start_date = dateOrNull(updates.targetStartDate);
  }
  if (updates.targetEndDate !== undefined) {
    row.target_end_date = dateOrNull(updates.targetEndDate);
  }
  if (updates.actualStartDate !== undefined) {
    row.actual_start_date = dateOrNull(updates.actualStartDate);
  }
  if (updates.actualEndDate !== undefined) {
    row.actual_end_date = dateOrNull(updates.actualEndDate);
  }
  if (updates.unit !== undefined) {
    row.unit = blankToNull(updates.unit);
  }
  if (updates.targetAmount !== undefined) {
    row.target_amount = updates.targetAmount;
  }
  if (updates.sortOrder !== undefined) {
    row.sort_order = updates.sortOrder;
  }
  if (updates.timesPerDay !== undefined) {
    row.times_per_day = storedTimesPerDay(updates.timesPerDay);
  }
  if (updates.reminderTime !== undefined) {
    row.reminder_time = normalizeClock(updates.reminderTime);
  }

  const touchesRepeat =
    updates.plannedDays !== undefined || updates.repeatPeriod !== undefined;

  if (touchesRepeat) {
    const repeat = normalizeRepeat(
      updates.repeatPeriod !== undefined
        ? updates.repeatPeriod
        : mapRepeatPeriod(existing.repeat_period),
      updates.plannedDays !== undefined
        ? updates.plannedDays
        : existing.planned_days,
    );

    if (repeat.planned_days !== null) {
      const { count, error: countError } = await supabase
        .from(GOALS_TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('parent_id', id)
        .is('deleted_at', null);

      if (countError) {
        throw countError;
      }
      if ((count ?? 0) > 0) {
        throw new Error("A step with children can't be repeating.");
      }
    }

    row.repeat_period = repeat.repeat_period;
    row.planned_days = repeat.planned_days;
  }

  const { data, error } = await supabase
    .from(GOALS_TABLE)
    .update(row)
    .eq('id', id)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  const next = mapRowToNode(data as GoalRow);
  await recordTargetChange(mapRowToNode(existing), next, userId);
  const history = await fetchTargetHistory(userId);
  refreshReminders();
  return withHistory([next], history)[0];
}

export async function setGoalStatus(
  id: string,
  status: GoalStatus,
  endDate?: string,
): Promise<Goal> {
  const userId = await requireUserId();
  const existing = await fetchNodeRow(id, userId);
  if (!existing) {
    throw new Error('Step not found.');
  }

  const today = todayLocal();
  const updates = captureStatusDates(status, existing, today, endDate);
  const fillStart = updates.actual_start_date ?? null;
  delete updates.actual_start_date;

  if (fillStart) {
    const { error: startError } = await supabase
      .from(GOALS_TABLE)
      .update({ actual_start_date: fillStart })
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .is('actual_start_date', null);

    if (startError) {
      throw startError;
    }
  }

  const { data, error } = await supabase
    .from(GOALS_TABLE)
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  refreshReminders();
  if (status === 'done' && existing.status !== 'done') {
    awardBadges();
  }
  return mapRowToNode(data as GoalRow);
}

export async function deleteGoal(id: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from(GOALS_TABLE)
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    throw error;
  }
  refreshReminders();
}

export async function reorderGoals(orderedIds: string[]): Promise<void> {
  const userId = await requireUserId();

  for (let index = 0; index < orderedIds.length; index += 1) {
    const { error } = await supabase
      .from(GOALS_TABLE)
      .update({ sort_order: index })
      .eq('id', orderedIds[index])
      .eq('user_id', userId);

    if (error) {
      throw error;
    }
  }
}

export async function getEntries(
  goalIds: string[],
  from?: string,
  to?: string,
  ownerId?: string,
): Promise<GoalEntry[]> {
  if (goalIds.length === 0) {
    return [];
  }

  const userId = ownerId ?? (await requireUserId());
  let query = supabase
    .from(ENTRIES_TABLE)
    .select(ENTRY_COLUMNS)
    .eq('user_id', userId)
    .in('goal_id', goalIds)
    .order('entry_date', { ascending: true });

  if (from) {
    query = query.gte('entry_date', normalizeDateOnly(from) ?? from);
  }
  if (to) {
    query = query.lte('entry_date', normalizeDateOnly(to) ?? to);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return ((data as EntryRow[] | null) ?? []).map(mapRowToEntry);
}

export type UpsertedEntry = {
  entry: GoalEntry;
  /** Pending steps this log activated, including ancestors. Empty when nothing changed. */
  goals: Goal[];
};

/** A check-off (no amount) or a positive amount. Zero does not count. */
function logActivates(value: number | null): boolean {
  return value == null || value > 0;
}

/**
 * Pending → Active for this step and any Pending ancestors.
 * Sets a missing start date to the logged day, and moves a later start date back.
 * Done ancestors are left unchanged. Already-active steps are left unchanged.
 */
async function activatePendingOnLog(
  goalId: string,
  loggedDay: string,
  userId: string,
): Promise<Goal[]> {
  const day = normalizeDateOnly(loggedDay) ?? loggedDay.slice(0, 10);
  const changed: Goal[] = [];
  let currentId: string | null = goalId;
  const seen = new Set<string>();

  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const row = await fetchNodeRow(currentId, userId);
    if (!row) {
      break;
    }

    if (row.status === 'pending') {
      const currentStart = dateOrNull(row.actual_start_date);
      const nextStart =
        currentStart == null || currentStart > day ? day : currentStart;
      const patch: Record<string, string> = { status: 'active' };
      if (nextStart !== currentStart) {
        patch.actual_start_date = nextStart;
      }

      const { data, error } = await supabase
        .from(GOALS_TABLE)
        .update(patch)
        .eq('id', row.id)
        .eq('user_id', userId)
        .is('deleted_at', null)
        .select('*')
        .single();

      if (error) {
        throw error;
      }
      changed.push(mapRowToNode(data as GoalRow));
    }

    currentId = row.parent_id;
  }

  return changed;
}

/** Insert one log. A second row for the same day is a new session, not an update. */
export async function insertEntry(
  goalId: string,
  entryDate: string,
  value: number | null,
): Promise<UpsertedEntry> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from(ENTRIES_TABLE)
    .insert({
      user_id: userId,
      goal_id: goalId,
      entry_date: normalizeDateOnly(entryDate) ?? entryDate.slice(0, 10),
      value,
    })
    .select(ENTRY_COLUMNS)
    .single();

  if (error) {
    throw error;
  }

  const entry = mapRowToEntry(data as EntryRow);
  const goals = logActivates(value)
    ? await activatePendingOnLog(goalId, entry.entryDate, userId)
    : [];
  refreshReminders();
  awardBadges();
  return { entry, goals };
}

/** Delete every log for one step on one day. */
export async function deleteEntry(
  goalId: string,
  entryDate: string,
): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from(ENTRIES_TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('goal_id', goalId)
    .eq('entry_date', normalizeDateOnly(entryDate) ?? entryDate.slice(0, 10));

  if (error) {
    throw error;
  }
  refreshReminders();
}

/** Delete one log row. */
export async function deleteEntryById(entryId: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from(ENTRIES_TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('id', entryId);

  if (error) {
    throw error;
  }
  refreshReminders();
}
