import type { WeekdayIndex, WeekStart } from './settingsApi';
import { parseLocalDate } from './localDate';
import { addDays } from '../utils/date';

const SHORT_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const FULL_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** Stored weekday numbers (0 = Sunday … 6 = Saturday) in display order. */
export function weekdayOrder(weekStartsOn: WeekStart): number[] {
  return Array.from({ length: 7 }, (_, index) => (weekStartsOn + index) % 7);
}

export function startOfWeek(date: string, weekStartsOn: WeekStart): string {
  const day = date.slice(0, 10);
  const weekday = parseLocalDate(day).getDay();
  const offset = (weekday - weekStartsOn + 7) % 7;
  return addDays(day, -offset);
}

export function endOfWeek(date: string, weekStartsOn: WeekStart): string {
  return addDays(startOfWeek(date, weekStartsOn), 6);
}

/** Seven date strings for the week that contains date, in display order. */
export function weekDays(date: string, weekStartsOn: WeekStart): string[] {
  const start = startOfWeek(date, weekStartsOn);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

/** Short weekday labels in display order, such as Sun–Sat or Mon–Sun. */
export function weekdayLabels(weekStartsOn: WeekStart): string[] {
  return weekdayOrder(weekStartsOn).map((day) => SHORT_LABELS[day]);
}

export function weekdayName(date: string): string {
  return FULL_NAMES[parseLocalDate(date.slice(0, 10)).getDay()];
}

/** Short labels Sunday through Saturday. */
export function calendarDayLabels(): readonly string[] {
  return SHORT_LABELS;
}

function weekdayIndex(date: string): number {
  return parseLocalDate(date.slice(0, 10)).getDay();
}

/** True on the reflection weekday and the weekday after it. */
export function isReflectionWindow(date: string, reflectionDay: WeekdayIndex): boolean {
  const weekday = weekdayIndex(date);
  return weekday === reflectionDay || weekday === (reflectionDay + 1) % 7;
}

/**
 * Week a reflection is about.
 * On the reflection day and the day after, the latest week that has already ended.
 * Every other day, the week that contains today.
 */
export function reflectionTargetWeek(
  date: string,
  weekStartsOn: WeekStart,
  reflectionDay: WeekdayIndex,
): string {
  const current = startOfWeek(date, weekStartsOn);
  if (!isReflectionWindow(date, reflectionDay)) {
    return current;
  }
  const lastDay = endOfWeek(date, weekStartsOn);
  return lastDay <= date.slice(0, 10) ? current : addDays(current, -7);
}

/** The reflection weekday inside the week that contains `date`. */
export function reflectionDateInWeek(
  date: string,
  weekStartsOn: WeekStart,
  reflectionDay: WeekdayIndex,
): string {
  const start = startOfWeek(date, weekStartsOn);
  const offset = (reflectionDay - weekdayIndex(start) + 7) % 7;
  return addDays(start, offset);
}
