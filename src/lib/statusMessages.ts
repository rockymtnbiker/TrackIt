export type StatusTone = 'positive' | 'encourage';

export type StatusCopy = {
  message: string;
  tone: StatusTone;
};

export const PAST_DUE_PREFIX = 'Still in progress. ';
export const PAST_DUE_LINK = 'Set a new target date?';

const ON_TRACK = 'Right on track! Keep it up!';
const YOU_GOT_THIS = 'You got this!';
const EVERY_STEP = "Every step counts. Let's do it!";
const DONE = 'Done. Great job!';
const WEEK_COMPLETE = 'Way to go! 🎉';
const PAST_DUE = `${PAST_DUE_PREFIX}${PAST_DUE_LINK}`;

export function onTrackStatus(): StatusCopy {
  return { message: ON_TRACK, tone: 'positive' };
}

/**
 * Behind, or not started, while the existing can't-finish check still applies.
 * Only "not started" and "can't finish" uses the every-step line.
 */
export function behindStatus(started: boolean, canStillReach: boolean): StatusCopy {
  if (!started && !canStillReach) {
    return { message: EVERY_STEP, tone: 'encourage' };
  }
  return { message: YOU_GOT_THIS, tone: 'encourage' };
}

export function aheadStatus(percentAhead: number): StatusCopy {
  return {
    message: `${percentAhead}% ahead of schedule. Great job!`,
    tone: 'positive',
  };
}

export function pastDueStatus(): StatusCopy {
  return { message: PAST_DUE, tone: 'encourage' };
}

export function doneStatus(): StatusCopy {
  return { message: DONE, tone: 'positive' };
}

export function weekCompleteStatus(): StatusCopy {
  return { message: WEEK_COMPLETE, tone: 'positive' };
}

/** Encouragement for the Review weekly donut. pct is the rounded 0–100 display value. */
export function getWeekProgressMessage(pct: number, isCurrentWeek: boolean): StatusCopy {
  if (pct >= 80) {
    return { message: 'Outstanding!', tone: 'positive' };
  }
  if (pct >= 50) {
    return { message: 'Way to go!', tone: 'positive' };
  }
  if (pct >= 1) {
    return { message: 'Making progress!', tone: 'positive' };
  }
  if (isCurrentWeek) {
    return { message: "Let's get started!", tone: 'encourage' };
  }
  return { message: "Let's reset and adjust.", tone: 'encourage' };
}

const AHEAD_PATTERN = /^\d+% ahead of schedule\. Great job!$/;

export function toneForStatusText(text: string): StatusTone | null {
  if (
    text === ON_TRACK ||
    text === DONE ||
    text === WEEK_COMPLETE ||
    AHEAD_PATTERN.test(text)
  ) {
    return 'positive';
  }
  if (text === YOU_GOT_THIS || text === EVERY_STEP || text === PAST_DUE) {
    return 'encourage';
  }
  return null;
}
