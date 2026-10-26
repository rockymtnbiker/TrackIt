type Listener = (keys: string[]) => void;

let listener: Listener | null = null;

export function setBadgeCelebrationListener(next: Listener | null): void {
  listener = next;
}

export function celebrateBadges(keys: string[]): void {
  if (keys.length > 0) {
    listener?.(keys);
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
