/** Postgres `time` as `HH:MM:SS`, or null when the reminder is off. */
export function normalizeClock(value: string | null | undefined): string | null {
  if (value == null || value.trim() === '') {
    return null;
  }
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    return null;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

export function clockParts(value: string): { hour: number; minute: number } | null {
  const clock = normalizeClock(value);
  if (!clock) {
    return null;
  }
  const [hour, minute] = clock.split(':');
  return { hour: Number(hour), minute: Number(minute) };
}

export function dateAtClock(value: string, fallbackHour: number, fallbackMinute: number): Date {
  const parts = clockParts(value) ?? { hour: fallbackHour, minute: fallbackMinute };
  const date = new Date();
  date.setHours(parts.hour, parts.minute, 0, 0);
  return date;
}

export function clockFromDate(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:00`;
}
