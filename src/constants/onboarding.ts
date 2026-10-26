export const ONBOARDING_STEP_COUNT = 4;
export const DISPLAY_NAME_MIN = 1;
export const DISPLAY_NAME_MAX = 40;

export const ONBOARDING = {
  welcome: {
    headline: 'Set goals. Do the work. See yourself level up.',
    next: 'Next',
    skip: 'Skip',
    comingSoon: 'Coming soon',
  },
  howItWorks: {
    cards: [
      { key: 'plan', title: 'Plan', body: 'Set a goal and break it into steps.' },
      { key: 'do', title: 'Do', body: 'Check things off each day.' },
      { key: 'review', title: 'Review', body: 'Look back each week and adjust.' },
    ],
    help: "Need help? It's in Connect.",
    next: 'Next',
    skip: 'Skip',
  },
  name: {
    title: 'What should we call you?',
    placeholder: 'Your name',
    next: 'Next',
    saveError: 'Could not save your name.',
    loadError: 'Could not load your name.',
  },
  firstGoal: {
    title: 'Set your first goal',
    start: 'Start',
  },
} as const;
