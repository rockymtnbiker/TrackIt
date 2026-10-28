import type { GoalEntry, Goal, GoalTarget, RepeatPeriod } from '../types/goal';
import { normalizeDateOnly, parseLocalDate, toLocalDateString, todayLocal } from './localDate';
import { toDateString } from '../utils/date';
import { getActiveSettings, type WeekStart } from './settingsApi';
import { endOfWeek, startOfWeek, weekDays } from './week';

export type PeriodRange = {
  start: string;
  end: string;
};

function daysInMonth(date: string): number {
  const parsed = parseLocalDate(date.slice(0, 10));
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
    const parsed = parseLocalDate(day);
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

export type EffectiveTarget = {
  targetAmount: number | null;
  repeatPeriod: RepeatPeriod | null;
  plannedDays: number[] | null;
  timesPerDay: number;
};

/**
 * Target in effect for a period: the history row with the latest effectiveFrom
 * on or before the period's last day. No row means the goal's own fields.
 */
export function targetFor(
  goal: Goal,
  periodStart: string,
  periodEnd: string,
): EffectiveTarget {
  const start = normalizeDateOnly(periodStart) ?? periodStart.slice(0, 10);
  const endDay = normalizeDateOnly(periodEnd) ?? periodEnd.slice(0, 10);
  const end = endDay < start ? start : endDay;
  let chosen: GoalTarget | null = null;
  for (const row of goal.targetHistory ?? []) {
    if (row.effectiveFrom <= end) {
      chosen = row;
    } else {
      break;
    }
  }
  if (!chosen) {
    return {
      targetAmount: goal.targetAmount,
      repeatPeriod: goal.repeatPeriod,
      plannedDays: goal.plannedDays,
      timesPerDay: goal.timesPerDay,
    };
  }
  return {
    targetAmount: chosen.targetAmount,
    repeatPeriod: chosen.repeatPeriod,
    plannedDays: chosen.plannedDays,
    timesPerDay: chosen.timesPerDay,
  };
}

function withTarget(goal: Goal, effective: EffectiveTarget): Goal {
  return {
    ...goal,
    targetAmount: effective.targetAmount,
    repeatPeriod: effective.repeatPeriod,
    plannedDays: effective.plannedDays,
    timesPerDay: effective.timesPerDay,
  };
}

/** Repeating steps use the target in effect for the period containing date. */
function goalForDate(goal: Goal, date: string, weekStartsOn?: WeekStart): Goal {
  if (!isRepeating(goal)) {
    return goal;
  }
  const weekStart = weekStartsOn ?? getActiveSettings().weekStart;
  const range = periodBounds(goal, date, weekStart);
  return withTarget(goal, targetFor(goal, range.start, range.end));
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
  const subject = goalForDate(goal, date);
  if (isTracked(goal)) {
    return dayTotal(entries, goal.id, date) > 0;
  }
  if (isDaily(subject)) {
    return count >= timesPerDay(subject);
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
    needed: timesPerDay(goalForDate(goal, date)),
  };
}

export type DayFill = 'none' | 'partial' | 'complete';

/** Complete, partial (Daily more-than-once only), or nothing logged. */
export function dayFill(goal: Goal, entries: GoalEntry[], date: string): DayFill {
  const subject = goalForDate(goal, date);
  if (isDayComplete(goal, entries, date)) {
    return 'complete';
  }
  if (
    !isTracked(goal) &&
    isDaily(subject) &&
    timesPerDay(subject) > 1 &&
    dayCount(entries, goal.id, date) > 0
  ) {
    return 'partial';
  }
  return 'none';
}

/** Weekly and monthly days with two or more sessions. Daily uses the dot fill instead. */
export function daySessionMark(goal: Goal, entries: GoalEntry[], date: string): number | null {
  if (isDaily(goalForDate(goal, date))) {
    return null;
  }
  const count = dayCount(entries, goal.id, date);
  return count >= 2 ? count : null;
}

export type YesNoLogAction = 'insert' | 'remove-day' | 'full-sheet' | 'again-sheet';

/** What a tap on a yes/no step does for this day. Amount steps use the log sheet. */
export function yesNoLogAction(goal: Goal, entries: GoalEntry[], date: string): YesNoLogAction {
  const subject = goalForDate(goal, date);
  const count = dayCount(entries, goal.id, date);
  if (isDaily(subject) && timesPerDay(subject) <= 1) {
    return count >= 1 ? 'remove-day' : 'insert';
  }
  if (isDaily(subject)) {
    return count >= timesPerDay(subject) ? 'full-sheet' : 'insert';
  }
  return count >= 1 ? 'again-sheet' : 'insert';
}

/**
 * This step's target expressed as a weekly amount.
 * Weekly yes/no is the target, or the planned-day count (at least 1).
 * Monthly stays target × 7 / days in that month.
 * Tracked steps still use target_amount, and return nothing when it is unset.
 */
function weeklyAmount(
  goal: Goal,
  weekStartsOn: WeekStart,
  anchor: string,
): number | null {
  const tracked = goal.unit != null;
  const positive =
    goal.targetAmount != null && goal.targetAmount > 0 ? goal.targetAmount : null;

  if (goal.repeatPeriod === 'month') {
    if (goal.targetAmount == null) {
      return null;
    }
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
 * This step's target expressed as a weekly amount.
 * Repeating steps use the target in effect for that week.
 * A week from before the step repeated has no target.
 */
export function weeklyTarget(
  goal: Goal,
  weekStartsOn: WeekStart,
  weekOf?: string,
): number | null {
  const anchor = startOfWeek(weekOf?.slice(0, 10) ?? todayLocal(), weekStartsOn);
  const subject = isRepeating(goal)
    ? withTarget(goal, targetFor(goal, anchor, endOfWeek(anchor, weekStartsOn)))
    : goal;
  if (isRepeating(goal) && !isRepeating(subject)) {
    return null;
  }
  return weeklyAmount(subject, weekStartsOn, anchor);
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
  const subject = goalForDate(node, date, weekStartsOn);
  const own = entries.filter(
    (entry) =>
      entry.goalId === node.id &&
      entry.entryDate >= range.start &&
      entry.entryDate <= range.end,
  );

  if (isTracked(node)) {
    return own.reduce((sum, entry) => sum + (entry.value ?? 0), 0);
  }

  if (isDaily(subject)) {
    const dates = new Set(own.map((entry) => entry.entryDate.slice(0, 10)));
    let complete = 0;
    for (const day of dates) {
      if (isDayComplete(subject, entries, day)) {
        complete += 1;
      }
    }
    return complete;
  }

  return own.length;
}

/**
 * Target number for the period containing date.
 * Weeks use weekTargetFor, including start-week proration.
 * Months use the target in effect on the month's last day.
 */
export function periodTarget(
  goal: Goal,
  date: string,
  weekStartsOn: WeekStart,
): number | null {
  if ((goal.repeatPeriod ?? 'week') === 'month') {
    const range = periodBounds(goal, date, weekStartsOn);
    const subject = withTarget(goal, targetFor(goal, range.start, range.end));
    if (subject.targetAmount != null && subject.targetAmount > 0) {
      return subject.targetAmount;
    }
    const planned = subject.plannedDays?.length ?? 0;
    return planned > 0 ? planned : null;
  }
  return weekTargetFor(goal, date, weekStartsOn).target;
}

/** False when the period has no target. */
export function isPeriodTargetMet(
  node: Goal,
  entries: GoalEntry[],
  date: string,
  weekStartsOn: WeekStart,
): boolean {
  const target = periodTarget(node, date, weekStartsOn);
  if (target == null || target <= 0) {
    return false;
  }
  return periodTotal(node, entries, date, weekStartsOn) >= target;
}

/** Actual start date, or the created date when that is unset. Date only. */
export function goalStartDate(node: Goal): string {
  return normalizeDateOnly(node.actualStartDate) ?? normalizeDateOnly(node.createdDate) ?? '';
}

/** Repeating steps store planned days. An empty array still repeats. */
export function isRepeating(node: Goal): boolean {
  return node.plannedDays !== null;
}

export function isTracked(node: Goal): boolean {
  return node.unit !== null;
}

/** One-time steps and goals with no unit. Repeating and tracked items are excluded. */
export function canSetProgress(node: Goal): boolean {
  return !isRepeating(node) && !isTracked(node);
}

export type GoalTree = {
  nodes: Goal[];
  entries: GoalEntry[];
};

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Current percent for a goal.
 * Done one-time goals are 100. Repeating goals have no percent.
 * A tracked one-time goal with a target uses its rolled-up total.
 * An untracked one-time leaf uses progress_pct.
 * A parent uses its own estimate when set, otherwise the average of its
 * non-repeating children.
 */
export function effectivePct(goal: Goal, tree: GoalTree): number | null {
  return effectivePctSeen(goal, tree, new Set());
}

function effectivePctSeen(goal: Goal, tree: GoalTree, seen: Set<string>): number | null {
  if (seen.has(goal.id)) {
    return null;
  }
  seen.add(goal.id);

  if (isRepeating(goal)) {
    return null;
  }
  if (goal.status === 'done') {
    return 100;
  }
  if (isTracked(goal) && goal.targetAmount != null && goal.targetAmount > 0) {
    const total = rollupTotal(goal, tree.nodes, tree.entries) ?? 0;
    return clampPct(Math.min(100, (total / goal.targetAmount) * 100));
  }

  const children = buildChildrenMap(tree.nodes).get(goal.id) ?? [];
  if (children.length === 0) {
    return isTracked(goal) ? null : (goal.progressPct ?? 0);
  }
  if (goal.progressPct != null) {
    return clampPct(goal.progressPct);
  }

  const values: number[] = [];
  for (const child of children) {
    if (isRepeating(child)) {
      continue;
    }
    const pct = effectivePctSeen(child, tree, seen);
    if (pct != null) {
      values.push(pct);
    }
  }
  if (values.length === 0) {
    return null;
  }
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return clampPct(average);
}

/**
 * Every direct child is done and this goal is still open.
 * Repeating children are never done, so a goal with a repeating step does not qualify.
 */
export function needsNextStep(goal: Goal, tree: Goal[]): boolean {
  if (goal.status === 'done') {
    return false;
  }
  const children = buildChildrenMap(tree).get(goal.id) ?? [];
  if (children.length === 0) {
    return false;
  }
  return children.every((child) => child.status === 'done');
}

/** A parent whose percent is the user's own estimate rather than an average of steps. */
export function isEstimate(goal: Goal, nodes: Goal[]): boolean {
  if (goal.progressPct == null || isRepeating(goal)) {
    return false;
  }
  return (buildChildrenMap(nodes).get(goal.id)?.length ?? 0) > 0;
}

function weekDayDates(weekOf: string, weekStartsOn: WeekStart): Date[] {
  return weekDays(weekOf, weekStartsOn).map((day) => parseLocalDate(day));
}

function dateKey(date: Date): string {
  return toLocalDateString(date);
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
  const subject = isRepeating(goal)
    ? withTarget(goal, targetFor(goal, week, endOfWeek(week, weekStartsOn)))
    : goal;
  if (isRepeating(goal) && !isRepeating(subject)) {
    return { target: null, availableDays: allDays };
  }

  const start = goalStartDate(goal);
  if (week !== startOfWeek(start, weekStartsOn)) {
    return { target: weeklyAmount(subject, weekStartsOn, week), availableDays: allDays };
  }

  const availableDays = allDays.filter((day) => dateKey(day) >= start);
  const available = availableDays.length;
  const full = weeklyAmount(subject, weekStartsOn, week);

  if (isTracked(goal)) {
    return {
      target: full == null ? null : Math.round((full * available) / 7),
      availableDays,
    };
  }

  if (isDaily(subject)) {
    return { target: available, availableDays };
  }

  if (full == null) {
    return { target: null, availableDays };
  }

  let cap = available;
  if (subject.plannedDays != null && subject.plannedDays.length > 0) {
    const availableWeekdays = new Set(availableDays.map((day) => day.getDay()));
    const planned = subject.plannedDays.filter((day) => availableWeekdays.has(day)).length;
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
    parseLocalDate(end.slice(0, 10)).getTime() -
    parseLocalDate(start.slice(0, 10)).getTime();
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
