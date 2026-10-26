export type LearnVideo = {
  id: string;
  title: string;
  /** Real video URL. Null until the video is ready. */
  url: string | null;
};

export const LEARN_VIDEOS: LearnVideo[] = [
  { id: 'welcome', title: 'Welcome', url: null },
  { id: 'setting-a-goal', title: 'Setting a goal', url: null },
  { id: 'weekly-review', title: 'Your weekly review', url: null },
];

export const QUICK_READS: { title: string; body: string }[] = [
  {
    title: 'Write it down.',
    body: 'A goal you write down is a goal you can see, plan and check.',
  },
  {
    title: 'Make it measurable.',
    body: '"Get in shape" is a wish. "Run 12 miles a week" is a goal you can track.',
  },
  {
    title: 'Know your why.',
    body: 'On hard days, your reason matters more than your plan. Add it to every big goal.',
  },
  {
    title: 'Set a deadline.',
    body: 'A date turns "someday" into a pace you can keep.',
  },
  {
    title: 'Break it down.',
    body: 'Big goals happen one small step at a time. Split anything that feels too big.',
  },
  {
    title: 'Plan your week.',
    body: "Each week, decide which days you'll work on it. Plans can move; that's fine.",
  },
  {
    title: 'Track it daily.',
    body: 'A quick log keeps your streak alive and shows you the truth.',
  },
  {
    title: 'Review every week.',
    body: "Look at what worked, what didn't, and adjust. Small corrections add up.",
  },
  {
    title: 'Get a partner.',
    body: 'Sharing a goal with someone makes you far more likely to follow through.',
  },
];
