import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WeekStart } from './settingsApi';
import { localCalendarDay, parseLocalDate, toLocalDateString } from './localDate';
import type { Goal } from '../types/goal';
import { addDays, formatOptionalDateRange } from '../utils/date';
import { startOfWeek } from './week';

export type PlanDonePreset =
  | 'week'
  | '2weeks'
  | 'month'
  | '3months'
  | '6months'
  | 'year'
  | 'all'
  | 'custom';

export type PlanDoneRange =
  | { preset: Exclude<PlanDonePreset, 'custom'> }
  | { preset: 'custom'; start: string; end: string };

export const DEFAULT_PLAN_DONE_RANGE: PlanDoneRange = { preset: 'all' };

export const PLAN_DONE_OPTIONS: { preset: PlanDonePreset; label: string }[] = [
  { preset: 'week', label: 'This week' },
  { preset: '2weeks', label: '2 weeks' },
  { preset: 'month', label: '1 month' },
  { preset: '3months', label: '3 months' },
  { preset: '6months', label: '6 months' },
  { preset: 'year', label: '1 year' },
  { preset: 'all', label: 'All time' },
  { preset: 'custom', label: 'Custom' },
];

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function storageKey(userId: string): string {
  return `plan-done-range:${userId}`;
}

function isLocalDay(value: unknown): value is string {
  return typeof value === 'string' && DATE_ONLY.test(value);
}

/** Today minus whole calendar months, clamped to the last day of the target month. */
function addCalendarMonths(dateString: string, months: number): string {
  const date = parseLocalDate(dateString.slice(0, 10));
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, daysInMonth));
  return toLocalDateString(date);
}

export function parsePlanDoneRange(raw: string | null): PlanDoneRange | null {
  if (!raw) {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') {
    return null;
  }
  const preset = (value as { preset?: unknown }).preset;
  if (typeof preset !== 'string' || !PLAN_DONE_OPTIONS.some((option) => option.preset === preset)) {
    return null;
  }
  if (preset !== 'custom') {
    return { preset: preset as Exclude<PlanDonePreset, 'custom'> };
  }
  const start = (value as { start?: unknown }).start;
  const end = (value as { end?: unknown }).end;
  if (!isLocalDay(start) || !isLocalDay(end) || start > end) {
    return null;
  }
  return { preset: 'custom', start, end };
}

export async function loadPlanDoneRange(userId: string): Promise<PlanDoneRange> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    return parsePlanDoneRange(raw) ?? DEFAULT_PLAN_DONE_RANGE;
  } catch {
    return DEFAULT_PLAN_DONE_RANGE;
  }
}

export async function savePlanDoneRange(userId: string, range: PlanDoneRange): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(range));
  } catch {
    // The strip still updates in memory if storage is unavailable.
  }
}

/** Inclusive local dates. Null when every done goal counts. */
export function planDoneBounds(
  range: PlanDoneRange,
  today: string,
  weekStartsOn: WeekStart,
): { start: string; end: string } | null {
  const day = localCalendarDay(today);
  switch (range.preset) {
    case 'all':
      return null;
    case 'week':
      return { start: startOfWeek(day, weekStartsOn), end: day };
    case '2weeks':
      return { start: addDays(day, -14), end: day };
    case 'month':
      return { start: addCalendarMonths(day, -1), end: day };
    case '3months':
      return { start: addCalendarMonths(day, -3), end: day };
    case '6months':
      return { start: addCalendarMonths(day, -6), end: day };
    case 'year':
      return { start: addCalendarMonths(day, -12), end: day };
    case 'custom':
      return { start: range.start, end: range.end };
    default:
      return null;
  }
}

export function planDoneRangeLabel(range: PlanDoneRange): string {
  if (range.preset === 'custom') {
    return formatOptionalDateRange(range.start, range.end) ?? 'Custom';
  }
  return PLAN_DONE_OPTIONS.find((option) => option.preset === range.preset)?.label ?? 'All time';
}

export function planSummaryCounts(
  nodes: Goal[],
  range: PlanDoneRange,
  weekStartsOn: WeekStart,
  today: string,
): { done: number; active: number } {
  const bounds = planDoneBounds(range, today, weekStartsOn);
  let done = 0;
  let active = 0;

  for (const node of nodes) {
    if (node.parentId != null) {
      continue;
    }
    if (node.status === 'active') {
      active += 1;
    }
    if (node.status !== 'done') {
      continue;
    }
    if (!bounds) {
      done += 1;
      continue;
    }
    const ended = localCalendarDay(node.actualEndDate);
    if (ended && ended >= bounds.start && ended <= bounds.end) {
      done += 1;
    }
  }

  return { done, active };
}

export function planSummaryText(
  nodes: Goal[],
  range: PlanDoneRange,
  weekStartsOn: WeekStart,
  today: string,
): string {
  const { done, active } = planSummaryCounts(nodes, range, weekStartsOn, today);
  return `${done} done · ${active} active · ${planDoneRangeLabel(range)}`;
}
