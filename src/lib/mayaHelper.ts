import AsyncStorage from '@react-native-async-storage/async-storage';

/** Stored value for the Shape "Who can help" answer. */
export type MayaHelper = 'friend' | 'family' | 'professor' | 'careerCenter' | 'notSure';

const STORED_HELPER: Record<string, MayaHelper> = {
  friend: 'friend',
  family: 'family',
  professor: 'professor',
  career: 'careerCenter',
  careerCenter: 'careerCenter',
  unsure: 'notSure',
  notSure: 'notSure',
};

function storageKey(userId: string, goalId: string): string {
  return `maya-helper:${userId}:${goalId}`;
}

function dismissedKey(userId: string): string {
  return `maya-daily-dismissed:${userId}`;
}

function nudgeKey(userId: string, goalId: string): string {
  return `maya-nudge:${userId}:${goalId}`;
}

const tails = new Map<string, Promise<unknown>>();

/** Keep each user's writes in order, same as the dismissed-tips storage. */
function enqueue<T>(userId: string, task: () => Promise<T>): Promise<T> {
  const previous = tails.get(userId) ?? Promise.resolve();
  const run = previous.then(task, task);
  tails.set(
    userId,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

/** Remember who can help with this goal. Failures are ignored so saving still finishes. */
export function saveMayaHelper(
  userId: string,
  goalId: string,
  helperId: string | null,
): Promise<void> {
  const value = helperId ? STORED_HELPER[helperId] : undefined;
  if (!userId || !goalId || !value) {
    return Promise.resolve();
  }
  return enqueue(userId, async () => {
    try {
      await AsyncStorage.setItem(storageKey(userId, goalId), value);
    } catch {
      // The goal is already saved. A missed note should not block the closing screen.
    }
  });
}

export function getMayaHelper(userId: string, goalId: string): Promise<MayaHelper | null> {
  return enqueue(userId, async () => {
    try {
      const raw = await AsyncStorage.getItem(storageKey(userId, goalId));
      if (!raw) {
        return null;
      }
      return STORED_HELPER[raw] ?? null;
    } catch {
      return null;
    }
  });
}

/** Goal ids that have a Maya helper note. The key's existence marks a Maya goal. */
export function listMayaGoalIds(userId: string): Promise<string[]> {
  return enqueue(userId, async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const prefix = `maya-helper:${userId}:`;
      return keys
        .filter((key) => key.startsWith(prefix))
        .map((key) => key.slice(prefix.length));
    } catch {
      return [];
    }
  });
}

export function getMayaDailyDismissed(userId: string): Promise<string | null> {
  return enqueue(userId, async () => {
    try {
      return await AsyncStorage.getItem(dismissedKey(userId));
    } catch {
      return null;
    }
  });
}

export function dismissMayaDaily(userId: string, day: string): Promise<void> {
  return enqueue(userId, async () => {
    try {
      await AsyncStorage.setItem(dismissedKey(userId), day);
    } catch {
      // The card is already hidden in memory.
    }
  });
}

export function mayaNudgeWasShown(userId: string, goalId: string): Promise<boolean> {
  return enqueue(userId, async () => {
    try {
      return (await AsyncStorage.getItem(nudgeKey(userId, goalId))) === 'shown';
    } catch {
      return false;
    }
  });
}

export function markMayaNudgeShown(userId: string, goalId: string): Promise<void> {
  return enqueue(userId, async () => {
    try {
      await AsyncStorage.setItem(nudgeKey(userId, goalId), 'shown');
    } catch {
      // A session ref still keeps the sheet from repeating immediately.
    }
  });
}
