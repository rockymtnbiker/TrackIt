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
      {
        key: 'welcome',
        highlight: 'all',
        title: 'Welcome to TrackIt',
        body: "Where ambitions become reachable and achievers connect. TrackIt isn't a habit tracker. It's a system that accelerates your growth as you intentionally become your best you. Here's how it works.",
      },
      {
        key: 'plan',
        highlight: 'plan',
        title: 'Plan',
        body: 'A goal without a plan is just a dream. Write your goal and why it matters, then break it into steps you can act on. Do it on your own, or let Maya, your automated assistant, help you find a direction that fits you.',
      },
      {
        key: 'do',
        highlight: 'do',
        title: 'Do',
        body: "Goals don't achieve themselves. Follow through on the steps you chose, at your own pace. Your goals stay in front of you every day, so you stay focused on what matters most and can see what you've done.",
      },
      {
        key: 'reflect',
        highlight: 'reflect',
        title: 'Reflect',
        body: "Each week, take a few minutes to celebrate your wins, adjust what isn't working, and set up next week for success.",
      },
      {
        key: 'connect',
        highlight: 'connect',
        title: 'Connect',
        body: "You don't have to do it alone. Invite an accountability partner, talk with an Achievement Coach, or chat with Maya anytime.",
      },
    ],
    next: 'Next',
    letsGo: "Let's go",
    back: 'Back',
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
