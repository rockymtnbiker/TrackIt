import type { WeekStart } from './settingsApi';
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
