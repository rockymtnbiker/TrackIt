import AsyncStorage from '@react-native-async-storage/async-storage';

export type ReflectionPath = 'maya' | 'own';

function storageKey(userId: string): string {
  return `reflection-choice:${userId}`;
}

const tails = new Map<string, Promise<unknown>>();

/** Keep each user's reads and writes in order. */
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

export function getReflectionPath(userId: string): Promise<ReflectionPath | null> {
  return enqueue(userId, async () => {
    try {
      const raw = await AsyncStorage.getItem(storageKey(userId));
      return raw === 'maya' || raw === 'own' ? raw : null;
    } catch {
      return null;
    }
  });
}

export function saveReflectionPath(userId: string, path: ReflectionPath): Promise<void> {
  return enqueue(userId, async () => {
    try {
      await AsyncStorage.setItem(storageKey(userId), path);
    } catch {
      // The screen still continues if storage is unavailable.
    }
  });
}
