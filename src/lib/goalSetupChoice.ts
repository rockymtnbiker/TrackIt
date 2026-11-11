import AsyncStorage from '@react-native-async-storage/async-storage';

export type GoalSetupChoice = 'maya' | 'own';

function storageKey(userId: string): string {
  return `goal_setup_choice:${userId}`;
}

const tails = new Map<string, Promise<unknown>>();

/** Keep each user's reads and writes in order so a newer choice cannot be overwritten. */
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

function parseChoice(raw: string | null): GoalSetupChoice | null {
  if (raw === 'maya' || raw === 'own') {
    return raw;
  }
  return null;
}

/** Last setup choice. Null means none saved, or the read failed. */
export function getGoalSetupChoice(userId: string): Promise<GoalSetupChoice | null> {
  return enqueue(userId, async () => {
    try {
      const raw = await AsyncStorage.getItem(storageKey(userId));
      return parseChoice(raw);
    } catch {
      return null;
    }
  });
}

/** Remember the last setup choice. Failures are ignored so the screen never blocks. */
export function saveGoalSetupChoice(userId: string, choice: GoalSetupChoice): Promise<void> {
  return enqueue(userId, async () => {
    try {
      await AsyncStorage.setItem(storageKey(userId), choice);
    } catch {
      // Leave the screen usable if storage is unavailable.
    }
  });
}
