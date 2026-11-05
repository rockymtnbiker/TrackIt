import type { MayaLevel } from '../../lib/settingsApi';

/** Wording for Maya on Do, after a log, and in Profile. */

export const MAYA_DAILY = {
  lotsWithStep:
    '[Greeting], [name]. [Habit] today. A good place to start: [step].',
  lotsPlain: "[Greeting], [name]. [Habit] today. You've got this.",
  lotsNoNameWithStep: '[Greeting]. [Habit] today. A good place to start: [step].',
  lotsNoNamePlain: "[Greeting]. [Habit] today. You've got this.",
  occasional:
    "You've still got time to hit your week on [goal]. One short [habit] block today makes a difference.",
  firstLog: 'First one done. Nice start!',
  weekComplete: 'Week complete. Way to go! 🎉',
  nudge:
    'Nice start. Want someone in your corner? Invite [helper] to be your accountability partner.',
  invite: 'Invite someone',
  notNow: 'Not now',
  dismiss: 'Dismiss',
  checkIns: "Maya's check-ins",
} as const;

export const MAYA_LOTS_TOASTS = [
  'Nice work!',
  "That's how it's done.",
  'One more in the books.',
  'Momentum!',
] as const;

export const MAYA_CHECKIN_OPTIONS: { value: MayaLevel; label: string }[] = [
  { value: 'lots', label: 'Lots of encouragement' },
  { value: 'occasional', label: 'Occasional' },
  { value: 'self', label: "I'm self-motivated" },
];

const HELPER_PHRASE: Record<string, string> = {
  friend: 'a friend or classmate',
  family: 'someone in your family',
  professor: 'a professor or advisor',
  careerCenter: 'a friend',
  notSure: 'a friend',
};

export function timeGreeting(hour: number): 'Morning' | 'Afternoon' | 'Evening' {
  if (hour < 12) {
    return 'Morning';
  }
  if (hour < 17) {
    return 'Afternoon';
  }
  return 'Evening';
}

export function helperPhrase(stored: string | null): string {
  if (!stored) {
    return 'a friend';
  }
  return HELPER_PHRASE[stored] ?? 'a friend';
}

export function lotsDailyLine(
  greeting: string,
  name: string,
  habit: string,
  step: string | null,
): string {
  const trimmed = name.trim();
  if (!trimmed) {
    const template = step ? MAYA_DAILY.lotsNoNameWithStep : MAYA_DAILY.lotsNoNamePlain;
    return fill(template, { Greeting: greeting, Habit: habit, step: step ?? '' });
  }
  const template = step ? MAYA_DAILY.lotsWithStep : MAYA_DAILY.lotsPlain;
  return fill(template, { Greeting: greeting, name: trimmed, Habit: habit, step: step ?? '' });
}

export function occasionalDailyLine(goalTitle: string, habit: string): string {
  return fill(MAYA_DAILY.occasional, {
    goal: goalTitle.trim() || 'your goal',
    habit: habit.trim().toLowerCase() || 'habit',
  });
}

export function nudgeLine(storedHelper: string | null): string {
  return fill(MAYA_DAILY.nudge, { helper: helperPhrase(storedHelper) });
}

export function lotsToast(index: number): string {
  const phrases = MAYA_LOTS_TOASTS;
  const phrase = phrases[index % phrases.length] ?? phrases[0];
  return phrase;
}

function fill(template: string, vars: Record<string, string>): string {
  let text = template;
  for (const [key, value] of Object.entries(vars)) {
    text = text.split(`[${key}]`).join(value);
  }
  return text;
}
