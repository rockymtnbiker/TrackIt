import { toLocalDateString } from './localDate';
import type { WeekReview } from './reviewApi';
import { addDays } from '../utils/date';

const COACH_REQUEST_DAYS = 30;
const COACH_LINE_WEEKS = 28;

export type CoachLineBand = 'high' | 'solid' | 'low' | 'zero';

export function coachLineBand(percent: number): CoachLineBand {
  if (percent >= 80) {
    return 'high';
  }
  if (percent >= 50) {
    return 'solid';
  }
  if (percent >= 1) {
    return 'low';
  }
  return 'zero';
}

function localDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return toLocalDateString(date);
}

function requestedRecently(day: string, today: string): boolean {
  return day.length > 0 && day >= addDays(today, -COACH_REQUEST_DAYS) && day <= today;
}

/** True when a coach request was sent in the last 30 days. */
export function coachRequestedRecently(
  reviews: WeekReview[],
  supportRequestAt: string | null,
  today: string,
): boolean {
  if (supportRequestAt && requestedRecently(localDay(supportRequestAt), today)) {
    return true;
  }
  return reviews.some(
    (review) =>
      review.coachCheckin === 'requested' && requestedRecently(localDay(review.completedAt), today),
  );
}

/**
 * Recap coach line for Reflect with Maya.
 * No stored show date counts as due, so the line can start. A line already
 * stored on this same week does not show again.
 */
export function shouldShowRecapCoachLine(input: {
  weekStart: string;
  percent: number;
  today: string;
  reviews: WeekReview[];
  supportRequestAt: string | null;
}): boolean {
  if (coachRequestedRecently(input.reviews, input.supportRequestAt, input.today)) {
    return false;
  }
  if (input.reviews.some((review) => review.weekStart === input.weekStart && review.coachLineShown)) {
    return false;
  }

  const firstMaya = !input.reviews.some((review) => review.maya);
  const shown = input.reviews
    .map((review) => review.coachLineShown)
    .filter((day): day is string => day != null && day.length > 0)
    .sort();
  const lastShown = shown.length > 0 ? shown[shown.length - 1] : null;
  const fourWeeks = lastShown == null || addDays(lastShown, COACH_LINE_WEEKS) <= input.weekStart;

  const previous = input.reviews
    .filter((review) => review.weekStart !== input.weekStart)
    .sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1))[0];
  const now = coachLineBand(input.percent);
  const bandChanged =
    previous != null &&
    coachLineBand(previous.donePct) !== now &&
    (now === 'high' || now === 'zero');

  return firstMaya || fourWeeks || bandChanged;
}
