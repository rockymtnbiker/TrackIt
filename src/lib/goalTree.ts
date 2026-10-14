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

/** Logged count for one entry. No row is 0. A null value is one log. */
export function dayCount(entry: GoalEntry | null | undefined): number {
  if (!entry) {
    return 0;
  }
  if (entry.value == null) {
    return 1;
  }
  return entry.value;
}

export function isDayComplete(
  goal: Pick<Goal, 'repeatPeriod' | 'plannedDays' | 'unit' | 'targetAmount' | 'timesPerDay'>,
  entry: GoalEntry | null | undefined,
): boolean {
  if (!entry) {
    return false;
  }
  return dayCount(entry) >= timesPerDay(goal);
}

export function dayProgress(
  goal: Pick<Goal, 'repeatPeriod' | 'plannedDays' | 'unit' | 'targetAmount' | 'timesPerDay'>,
  entry: GoalEntry | null | undefined,
): { count: number; needed: number } {
  return { count: dayCount(entry), needed: timesPerDay(goal) };
}

export type DayFill = 'none' | 'partial' | 'complete';

/** Complete, partial (some logs, not enough), or nothing logged. */
export function dayFill(
  goal: Pick<Goal, 'repeatPeriod' | 'plannedDays' | 'unit' | 'targetAmount' | 'timesPerDay'>,
  entry: GoalEntry | null | undefined,
): DayFill {
  if (isDayComplete(goal, entry)) {
    return 'complete';
  }
  if (dayCount(entry) > 0) {
    return 'partial';
  }
  return 'none';
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
 * Tracked steps sum values. Yes/no steps count complete days only.
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

  return own.filter((entry) => isDayComplete(node, entry)).length;
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
 * Dates that count toward a streak. Tracked steps count a day only when the
 * entry value is greater than zero. Yes/no steps count complete days only.
 */
export function completionDates(node: Goal, entries: GoalEntry[]): string[] {
  return entries
    .filter((entry) => entry.goalId === node.id)
    .filter((entry) =>
      isTracked(node) ? (entry.value ?? 0) > 0 : isDayComplete(node, entry),
    )
    .map((entry) => entry.entryDate);
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
