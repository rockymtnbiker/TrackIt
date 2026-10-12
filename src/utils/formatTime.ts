import { getActiveSettings, type TimeFormat } from '../lib/settingsApi';

function optionsFor(format: TimeFormat): Intl.DateTimeFormatOptions {
  if (format === '12h') {
    return { hour: 'numeric', minute: '2-digit', hour12: true };
  }
  if (format === '24h') {
    return { hour: '2-digit', minute: '2-digit', hour12: false };
  }
  return { hour: 'numeric', minute: '2-digit' };
}

/** Formats a clock time using the saved time format. `system` follows the device locale. */
export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, optionsFor(getActiveSettings().timeFormat)).format(
    date,
  );
}
