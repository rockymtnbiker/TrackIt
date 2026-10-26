let pendingFreshGoalId: string | null = null;
let onFinished: (() => void) | null = null;

export function setOnboardingFinishedHandler(handler: (() => void) | null): void {
  onFinished = handler;
}

/** Remember the new goal, then let the root swap from onboarding to the tabs. */
export function finishOnboarding(goalId: string): void {
  pendingFreshGoalId = goalId;
  onFinished?.();
}

export function takeFreshGoalId(): string | null {
  const goalId = pendingFreshGoalId;
  pendingFreshGoalId = null;
  return goalId;
}
