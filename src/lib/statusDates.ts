import type { GoalStatus } from '../types/goal';
import { normalizeDateOnly } from './localDate';

/**
 * Actual-date rules when a goal's status changes:
 * - active: set actual_start_date to today if null
 * - done: set actual_end_date to the chosen day, or today
 * - any other status: clear actual_end_date
 */
export function captureStatusDates(
  newStatus: GoalStatus,
  existing: {
    actual_start_date: string | null;
    actual_end_date: string | null;
  },
  today: string,
  endDate?: string,
): Record<string, string | null> {
  const updates: Record<string, string | null> = { status: newStatus };

  if (newStatus === 'active' && !existing.actual_start_date) {
    updates.actual_start_date = normalizeDateOnly(today) ?? today;
  }

  if (newStatus === 'done') {
    updates.actual_end_date = normalizeDateOnly(endDate) ?? normalizeDateOnly(today) ?? today;
  } else {
    updates.actual_end_date = null;
  }

  return updates;
}
