import type { ReflectionAnswerId } from '../reflection';

/** What Maya says during the weekly reflection. */
export const MAYA_REFLECTION = {
  hello: "Hey [name]. Let's look back on your week.",
  helloNoName: "Hey. Let's look back on your week.",
  wins: 'You [first] and [second].',
  winOne: 'You [first].',
  adjustIntro: "Let's look at a couple of goals that could use some attention.",
  howDid: 'How did [goal] go this week?',
  busy: "Busy weeks happen. Let's make this fit the week you actually have.",
  slipped: 'Easy fix. A reminder can do the remembering for you.',
  feeling: 'That happens to everyone. Sometimes it helps to remember why you started.',
  start: "That usually means the next step is too big. Let's make it smaller.",
  cameUp: 'Life does that. Fresh start next week.',
  fine: 'Good. Slow and steady still counts.',
  nothingSlowed: 'Nothing slowed you down this week. Nice work.',
  otherGoals: 'Want to look at any other goals?',
  partnerYes: "Love it. That's what keeps people going.",
  coachBroughtBack:
    'Weeks like this are exactly when an Achievement Coach helps most. Want to talk with one?',
  nextIntro: "Let's set up next week.",
  summaryIntro: "Here's what we changed.",
  noChanges: 'No changes. Same plan next week.',
  close: 'Nice work, [name]. See you [day] for your next reflection.',
  closeNoName: 'Nice work. See you [day] for your next reflection.',
} as const;

const ADJUST_LINES: Record<ReflectionAnswerId, string> = {
  busy: MAYA_REFLECTION.busy,
  slipped: MAYA_REFLECTION.slipped,
  feeling: MAYA_REFLECTION.feeling,
  start: MAYA_REFLECTION.start,
  'came-up': MAYA_REFLECTION.cameUp,
  fine: MAYA_REFLECTION.fine,
};

export function mayaHello(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return MAYA_REFLECTION.helloNoName;
  }
  return MAYA_REFLECTION.hello.replace('[name]', trimmed);
}

export function mayaWinsLine(wins: string[]): string | null {
  if (wins.length === 0) {
    return null;
  }
  if (wins.length === 1) {
    return MAYA_REFLECTION.winOne.replace('[first]', wins[0]);
  }
  return MAYA_REFLECTION.wins.replace('[first]', wins[0]).replace('[second]', wins[1]);
}

export function mayaAdjustLine(answer: ReflectionAnswerId): string {
  return ADJUST_LINES[answer];
}

export function mayaClose(name: string, day: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return MAYA_REFLECTION.closeNoName.replace('[day]', day);
  }
  return MAYA_REFLECTION.close.replace('[name]', trimmed).replace('[day]', day);
}
