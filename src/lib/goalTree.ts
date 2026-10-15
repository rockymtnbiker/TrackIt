import type { GoalEntry, Goal, RepeatPeriod } from '../types/goal';
import { parseDateString, toDateString, todayDateString } from '../utils/date';
import type { WeekStart } from './settingsApi';
import { endOfWeek, startOfWeek, weekDays } from './week';

export type PeriodRange = {
  start: string;
  end: string;
};

function daysInMonth(date: string): number {
  const parsed = parseDateString(date.slice(0, 10));
  return new Date(parsed.getFullYear(), parsed.getMonth() + 1, 0).getDate();
}

/** Week follows the user's week start. Month is the calendar month containing the date. */
export function getPeriodRange(
  date: string,
  repeatPeriod: RepeatPeriod,
  weekStartsOn: WeekStart,
): PeriodRange {
  const day = date.slice(0, 10);
  if (repeatPeriod === 'month') {
    const parsed = parseDateString(day);
    const year = parsed.getFullYear();
    const monthIndex = parsed.getMonth();
    const lastDay = daysInMonth(day);
    return {
      start: toDateString(year, monthIndex, 1),
      end: toDateString(year, monthIndex, lastDay),
    };
  }

  return {
    start: startOfWeek(day, weekStartsOn),
    end: endOfWeek(day, weekStartsOn),
  };
}

/** The period that contains D: the user's week, or the calendar month. */
export function periodBounds(
  node: Goal,
  date: string,
  weekStartsOn: WeekStart,
): PeriodRange {
  return getPeriodRange(date, node.repeatPeriod ?? 'week', weekStartsOn);
}

const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/**
 * A weekly step shown as Daily: every weekday is planned, and a yes/no step
 * has no target or a target of 7. Display only; period math stays weekly.
 */
export function isDaily(goal: Pick<Goal, 'repeatPeriod' | 'plannedDays' | 'unit' | 'targetAmount'>): boolean {
  if (goal.repeatPeriod !== 'week' || goal.plannedDays == null) {
    return false;
  }
  const selected = new Set(goal.plannedDays);
  if (!ALL_WEEKDAYS.every((day) => selected.has(day))) {
    return false;
  }
  return goal.unit != null || goal.targetAmount == null || goal.targetAmount === 7;
}

/** Clamp a stored times-per-day value to 1–12. Missing values are 1. */
export function storedTimesPerDay(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) {
    return 1;
  }
  const rounded = Math.round(value);
  if (rounded < 1) {
    return 1;
  }
  if (rounded > 12) {
    return 12;
  }
  return rounded;
}

/**
 * How many logs a Daily yes/no step needs before the day counts.
 * Weekly, monthly, and tracked steps always read as 1.
 */
export function timesPerDay(
  goal: Pick<Goal, 'repeatPeriod' | 'plannedDays' | 'unit' | 'targetAmount' | 'timesPerDay'>,
): number {
  if (goal.unit != null || !isDaily(goal)) {
    return 1;
  }
  return storedTimesPerDay(goal.timesPerDay);
}

function sameDay(entry: GoalEntry, goalId: string, date: string): boolean {
  return entry.goalId === goalId && entry.entryDate.slice(0, 10) === date.slice(0, 10);
}

/** Every log for one step on one calendar day. */
export function dayEntries(entries: GoalEntry[], goalId: string, date: string): GoalEntry[] {
  return entries.filter((entry) => sameDay(entry, goalId, date));
}

/** Session count. Each row is one session, including an existing null yes/no row. */
export function dayCount(entries: GoalEntry[], goalId: string, date: string): number {
  return dayEntries(entries, goalId, date).length;
}

/** Sum of amount-log values for one step on one day. Null values add nothing. */
export function dayTotal(entries: GoalEntry[], goalId: string, date: string): number {
  return dayEntries(entries, goalId, date).reduce(
    (sum, entry) => sum + (entry.value ?? 0),
    0,
  );
}

function entrySortKey(entry: GoalEntry): string {
  return `${entry.createdAt ?? ''}\u0000${entry.id}`;
}

/** Most recent log that day, by created_at. */
export function latestDayEntry(
  entries: GoalEntry[],
  goalId: string,
  date: string,
): GoalEntry | null {
  let latest: GoalEntry | null = null;
  for (const entry of dayEntries(entries, goalId, date)) {
    if (!latest || entrySortKey(entry) > entrySortKey(latest)) {
      latest = entry;
    }
  }
  return latest;
}

/**
 * Daily yes/no is complete at times_per_day sessions.
 * Other yes/no days are complete at one session.
 * Amount days are complete when the day's values sum to more than zero.
 */
export function isDayComplete(goal: Goal, entries: GoalEntry[], date: string): boolean {
  const count = dayCount(entries, goal.id, date);
  if (count === 0) {
    return false;
  }
  if (isTracked(goal)) {
    return dayTotal(entries, goal.id, date) > 0;
  }
  if (isDaily(goal)) {
    return count >= timesPerDay(goal);
  }
  return true;
}

export function dayProgress(
  goal: Goal,
  entries: GoalEntry[],
  date: string,
): { count: number; needed: number } {
  return {
    count: dayCount(entries, goal.id, date),
    needed: timesPerDay(goal),
  };
}

export type DayFill = 'none' | 'partial' | 'complete';

/** Complete, partial (Daily more-than-once only), or nothing logged. */
export function dayFill(goal: Goal, entries: GoalEntry[], date: string): DayFill {
  if (isDayComplete(goal, entries, date)) {
    return 'complete';
  }
  if (
    !isTracked(goal) &&
    isDaily(goal) &&
    timesPerDay(goal) > 1 &&
    dayCount(entries, goal.id, date) > 0
  ) {
    return 'partial';
  }
  return 'none';
}

/** Weekly and monthly days with two or more sessions. Daily uses the dot fill instead. */
export function daySessionMark(goal: Goal, entries: GoalEntry[], date: string): number | null {
  if (isDaily(goal)) {
    return null;
  }
  const count = dayCount(entries, goal.id, date);
  return count >= 2 ? count : null;
}

export type YesNoLogAction = 'insert' | 'remove-day' | 'full-sheet' | 'again-sheet';

/** What a tap on a yes/no step does for this day. Amount steps use the log sheet. */
export function yesNoLogAction(goal: Goal, entries: GoalEntry[], date: string): YesNoLogAction {
  const count = dayCount(entries, goal.id, date);
  if (isDaily(goal) && timesPerDay(goal) <= 1) {
    return count >= 1 ? 'remove-day' : 'insert';
  }
  if (isDaily(goal)) {
    return count >= timesPerDay(goal) ? 'full-sheet' : 'insert';
  }
  return count >= 1 ? 'again-sheet' : 'insert';
}

/**
 * This step's target expressed as a weekly amount.
 * Weekly yes/no is the target, or the planned-day count (at least 1).
 * Monthly stays target × 7 / days in that month.
 * Tracked steps still use target_amount, and return nothing when it is unset.
 */
export function weeklyTarget(
  goal: Goal,
  weekStartsOn: WeekStart,
  weekOf?: string,
): number | null {
  const tracked = goal.unit != null;
  const positive =
    goal.targetAmount != null && goal.targetAmount > 0 ? goal.targetAmount : null;

  if (goal.repeatPeriod === 'month') {
    if (goal.targetAmount == null) {
      return null;
    }
    const anchor = startOfWeek(weekOf?.slice(0, 10) ?? todayDateString(), weekStartsOn);
    return (goal.targetAmount * 7) / daysInMonth(anchor);
  }

  if (tracked) {
    return goal.targetAmount;
  }
  if (positive != null) {
    return positive;
  }
  const planned = goal.plannedDays?.length ?? 0;
  return planned > 0 ? planned : 1;
}

/**
 * This step's own entries in the period containing date.
 * Tracked steps sum values. Daily yes/no counts complete days.
 * Other yes/no steps count sessions (rows).
 */
export function periodTotal(
  node: Goal,
  entries: GoalEntry[],
  date: string,
  weekStartsOn: WeekStart,
): number {
  const range = periodBounds(node, date, weekStartsOn);
  const own = entries.filter(
    (entry) =>
      entry.goalId === node.id &&
      entry.entryDate >= range.start &&
      entry.entryDate <= range.end,
  );

  if (isTracked(node)) {
    return own.reduce((sum, entry) => sum + (entry.value ?? 0), 0);
  }

  if (isDaily(node)) {
    const dates = new Set(own.map((entry) => entry.entryDate.slice(0, 10)));
    let complete = 0;
    for (const day of dates) {
      if (isDayComplete(node, entries, day)) {
        complete += 1;
      }
    }
    return complete;
  }

  return own.length;
}

/** False when the step has no target amount. */
export function isPeriodTargetMet(
  node: Goal,
  entries: GoalEntry[],
  date: string,
  weekStartsOn: WeekStart,
): boolean {
  if (node.targetAmount == null) {
    return false;
  }
  return periodTotal(node, entries, date, weekStartsOn) >= node.targetAmount;
}

/** Actual start date, or the created date when that is unset. Date only. */
export function goalStartDate(node: Goal): string {
  return (node.actualStartDate ?? node.createdDate).slice(0, 10);
}

/** Repeating steps store planned days. An empty array still repeats. */
export function isRepeating(node: Goal): boolean {
  return node.plannedDays !== null;
}

export function isTracked(node: Goal): boolean {
  return node.unit !== null;
}

function weekDayDates(weekOf: string, weekStartsOn: WeekStart): Date[] {
  return weekDays(weekOf, weekStartsOn).map((day) => parseDateString(day));
}

function dateKey(date: Date): string {
  return toDateString(date.getFullYear(), date.getMonth(), date.getDate());
}

export type WeekTarget = {
  target: number | null;
  availableDays: Date[];
};

/**
 * Target for the user's week that contains weekOf.
 * In the week of the step's start (actual start, or created date), only days
 * on or after that start are available. Later and earlier weeks use weeklyTarget
 * and all seven days.
 * Daily: target is the available-day count.
 * Times per week: min(weekly target, available days, and planned days that
 * still fall on an available day). Planned day numbers stay Sunday = 0.
 * Amount per week: weekly target scaled by available days / 7, rounded.
 */
export function weekTargetFor(
  goal: Goal,
  weekOf: string,
  weekStartsOn: WeekStart,
): WeekTarget {
  const week = startOfWeek(weekOf, weekStartsOn);
  const allDays = weekDayDates(week, weekStartsOn);
  const start = goalStartDate(goal);
  if (week !== startOfWeek(start, weekStartsOn)) {
    return { target: weeklyTarget(goal, weekStartsOn, week), availableDays: allDays };
  }

  const availableDays = allDays.filter((day) => dateKey(day) >= start);
  const available = availableDays.length;
  const full = weeklyTarget(goal, weekStartsOn, week);

  if (isTracked(goal)) {
    return {
      target: full == null ? null : Math.round((full * available) / 7),
      availableDays,
    };
  }

  if (isDaily(goal)) {
    return { target: available, availableDays };
  }

  if (full == null) {
    return { target: null, availableDays };
  }

  let cap = available;
  if (goal.plannedDays != null && goal.plannedDays.length > 0) {
    const availableWeekdays = new Set(availableDays.map((day) => day.getDay()));
    const planned = goal.plannedDays.filter((day) => availableWeekdays.has(day)).length;
    cap = Math.min(available, planned);
  }

  return { target: Math.min(full, cap), availableDays };
}

/**
 * Dates that count toward a streak. A day is included once, and only when
 * isDayComplete says so.
 */
export function completionDates(node: Goal, entries: GoalEntry[]): string[] {
  const dates = new Set<string>();
  for (const entry of entries) {
    if (entry.goalId !== node.id) {
      continue;
    }
    const day = entry.entryDate.slice(0, 10);
    if (dates.has(day)) {
      continue;
    }
    if (isDayComplete(node, entries, day)) {
      dates.add(day);
    }
  }
  return [...dates];
}

export function buildChildrenMap(
  nodes: Goal[],
): Map<string | null, Goal[]> {
  const childrenMap = new Map<string | null, Goal[]>();

  for (const node of nodes) {
    const siblings = childrenMap.get(node.parentId);
    if (siblings) {
      siblings.push(node);
    } else {
      childrenMap.set(node.parentId, [node]);
    }
  }

  for (const siblings of childrenMap.values()) {
    siblings.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  return childrenMap;
}

export function isLeaf(
  node: Goal,
  childrenMap: Map<string | null, Goal[]>,
): boolean {
  return (childrenMap.get(node.id)?.length ?? 0) === 0;
}

/**
 * Repeating leaves of any status except done, plus one-time leaves that are
 * active. A top-level step with no children is a leaf.
 */
export function getActionableSteps(nodes: Goal[]): Goal[] {
  const childrenMap = buildChildrenMap(nodes);

  return nodes.filter((node) => {
    if (!isLeaf(node, childrenMap)) {
      return false;
    }
    if (isRepeating(node)) {
      return node.status !== 'done';
    }
    return node.status === 'active';
  });
}

/**
 * Sum of entry values on this step and descendants that use the same unit.
 * Null when the step does not track a unit. Null entry values are skipped.
 */
export function rollupTotal(
  node: Goal,
  nodes: Goal[],
  entries: GoalEntry[],
): number | null {
  if (node.unit == null) {
    return null;
  }

  const childrenMap = buildChildrenMap(nodes);
  const byId = new Map(nodes.map((item) => [item.id, item]));
  const matchingIds = new Set<string>();
  const seen = new Set<string>();
  const stack = [node.id];

  while (stack.length > 0) {
    const id = stack.pop();
    if (id == null || seen.has(id)) {
      continue;
    }
    seen.add(id);

    const current = id === node.id ? node : byId.get(id);
    if (current && current.unit === node.unit) {
      matchingIds.add(id);
    }

    for (const child of childrenMap.get(id) ?? []) {
      stack.push(child.id);
    }
  }

  let total = 0;
  for (const entry of entries) {
    if (matchingIds.has(entry.goalId) && entry.value != null) {
      total += entry.value;
    }
  }

  return total;
}

export type PaceInfo = {
  pctDone: number;
  pctExpected: number;
  delta: number;
  onPace: boolean;
};

function calendarDaysBetween(start: string, end: string): number {
  const ms =
    parseDateString(end.slice(0, 10)).getTime() -
    parseDateString(start.slice(0, 10)).getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * Cumulative pace from the actual start (or created date) through the target end.
 * Null when there is no target amount or deadline, or the deadline is not after the start.
 */
export function paceInfo(
  node: Goal,
  total: number,
  today: string,
): PaceInfo | null {
  const start = goalStartDate(node);
  const deadline = node.targetEndDate?.slice(0, 10) || null;
  if (node.targetAmount == null || !deadline || deadline <= start) {
    return null;
  }

  const totalDays = calendarDaysBetween(start, deadline) + 1;
  const elapsedDays = Math.min(
    totalDays,
    Math.max(0, calendarDaysBetween(start, today.slice(0, 10)) + 1),
  );
  const pctDone = (total / node.targetAmount) * 100;
  const pctExpected = (elapsedDays / totalDays) * 100;
  const delta = pctDone - pctExpected;

  return {
    pctDone,
    pctExpected,
    delta,
    onPace: Math.abs(delta) < 1,
  };
}
