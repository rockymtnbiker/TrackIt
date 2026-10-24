/**
 * Device calendar dates as 'YYYY-MM-DD'.
 * Never use Date#toISOString or `new Date('YYYY-MM-DD')` for these.
 * `new Date('2026-10-23')` parses as UTC midnight, which is Oct 22 in Denver.
 */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 'YYYY-MM-DD' from the device's local date. */
export function todayLocal(): string {
  return toLocalDateString(new Date());
}

/** Local calendar day. Uses getFullYear/getMonth/getDate, never toISOString. */
export function toLocalDateString(d: Date): string {
  const year = String(d.getFullYear()).padStart(4, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 'YYYY-MM-DD' -> local midnight via new Date(y, m - 1, d). */
export function parseLocalDate(s: string): Date {
  const match = DATE_ONLY.exec(s.trim());
  if (!match) {
    return new Date(NaN);
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/**
 * Date-only text stays as written.
 * A timestamptz (created_date) becomes the device's calendar day.
 * The first 10 characters of an ISO timestamp are the UTC date — never use that.
 */
export function localCalendarDay(value: string | null | undefined): string {
  if (value == null) {
    return '';
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return '';
  }
  if (DATE_ONLY.test(trimmed)) {
    return trimmed;
  }
  const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return toLocalDateString(parsed);
}

/**
 * Rewrite a calendar date through the local helpers.
 * The date prefix is the calendar day. Do not pass a timestamptz here.
 */
export function normalizeDateOnly(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const day = value.trim().slice(0, 10);
  if (!DATE_ONLY.test(day)) {
    return null;
  }
  return toLocalDateString(parseLocalDate(day));
}
