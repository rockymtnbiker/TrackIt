let pendingFreshGoalId: string | null = null;
let pendingCoachSupport = false;
let onFinished: (() => void) | null = null;

export function setOnboardingFinishedHandler(handler: (() => void) | null): void {
  onFinished = handler;
}

/** Remember the new goal, then let the root swap from onboarding to the tabs. */
export function finishOnboarding(goalId: string): void {
  pendingFreshGoalId = goalId;
  pendingCoachSupport = false;
  onFinished?.();
}

/** Onboarding is already saved. Open Connect's coach request instead of Do. */
export function finishOnboardingToCoach(): void {
  pendingFreshGoalId = null;
  pendingCoachSupport = true;
  onFinished?.();
}

export function takeFreshGoalId(): string | null {
  const goalId = pendingFreshGoalId;
  pendingFreshGoalId = null;
  return goalId;
}

export function takeCoachSupport(): boolean {
  const open = pendingCoachSupport;
  pendingCoachSupport = false;
  return open;
}
