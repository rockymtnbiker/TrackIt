type Listener = (keys: string[]) => void;

let listener: Listener | null = null;
const watchers = new Set<Listener>();
const dismissWatchers = new Set<() => void>();

export function setBadgeCelebrationListener(next: Listener | null): void {
  listener = next;
}

/** Maya uses this so a toast does not sit on top of a badge. */
export function watchBadgeCelebrations(watcher: Listener): () => void {
  watchers.add(watcher);
  return () => {
    watchers.delete(watcher);
  };
}

export function watchBadgeCelebrationDismissed(watcher: () => void): () => void {
  dismissWatchers.add(watcher);
  return () => {
    dismissWatchers.delete(watcher);
  };
}

export function noteBadgeCelebrationDismissed(): void {
  for (const watcher of dismissWatchers) {
    watcher();
  }
}

export function celebrateBadges(keys: string[]): void {
  if (keys.length === 0) {
    return;
  }
  listener?.(keys);
  for (const watcher of watchers) {
    watcher(keys);
  }
}

/** Check badges and show anything newly earned. Does not block the caller. */
export function awardBadges(): void {
  void import('./badges')
    .then(({ checkBadges }) => checkBadges())
    .then((keys) => celebrateBadges(keys))
    .catch((error) => {
      console.warn('Failed to check badges', error);
    });
}
