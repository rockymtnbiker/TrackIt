import AsyncStorage from '@react-native-async-storage/async-storage';

/** Do: tap the circle to log progress or mark a step done. */
export const TIP_DO_LOG = 'do.log';

/** Do: tap a goal or step name to open its page. */
export const TIP_DO_OPEN_GOAL = 'do.open-goal';

function storageKey(userId: string): string {
  return `tips_dismissed:${userId}`;
}

const tails = new Map<string, Promise<unknown>>();

/** Keep each user's reads and writes in order so a reset cannot be overwritten. */
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

function parseIds(raw: string | null): string[] | null {
  if (raw == null) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    return null;
  }
}

/** Dismissed tip ids. Null means the read failed; callers should hide tips. */
export function getDismissedTips(userId: string): Promise<string[] | null> {
  return enqueue(userId, async () => {
    try {
      const raw = await AsyncStorage.getItem(storageKey(userId));
      return parseIds(raw);
    } catch {
      return null;
    }
  });
}

/** Remember a dismissed tip. Failures are ignored so the screen never blocks. */
export function dismissTip(userId: string, tipId: string): Promise<void> {
  return enqueue(userId, async () => {
    try {
      const raw = await AsyncStorage.getItem(storageKey(userId));
      const current = parseIds(raw);
      if (current == null || current.includes(tipId)) {
        return;
      }
      await AsyncStorage.setItem(storageKey(userId), JSON.stringify([...current, tipId]));
    } catch {
      // Leave the screen usable if storage is unavailable.
    }
  });
}

/** Clear every dismissed tip for this user. Returns false when storage fails. */
export function resetTips(userId: string): Promise<boolean> {
  return enqueue(userId, async () => {
    try {
      await AsyncStorage.removeItem(storageKey(userId));
      return true;
    } catch {
      return false;
    }
  });
}
