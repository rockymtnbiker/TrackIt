export type LearnTab = 'plan' | 'do' | 'reflect' | 'connect';

export type LearnItem = {
  id: string;
  title: string;
  /** One line shown on the Learn list. */
  summary: string;
  tabs: LearnTab[];
  kind: 'text' | 'howItWorks';
  body?: string;
  /** Reserved for a later video. Unused for now. */
  videoUrl?: string;
};

export const LEARN_ITEMS: LearnItem[] = [
  {
    id: 'how-it-works',
    title: 'How TrackIt works',
    summary: 'Plan, Do, Reflect, and Connect.',
    tabs: ['plan', 'do', 'reflect', 'connect'],
    kind: 'howItWorks',
  },
  {
    id: 'write-it-down',
    title: 'Write it down.',
    summary: 'A goal you write down is a goal you can see, plan and check.',
    tabs: ['plan'],
    kind: 'text',
    body: 'A goal you write down is a goal you can see, plan and check.',
  },
  {
    id: 'make-it-measurable',
    title: 'Make it measurable.',
    summary: '"Get in shape" is a wish. "Run 12 miles a week" is a goal you can track.',
    tabs: ['plan'],
    kind: 'text',
    body: '"Get in shape" is a wish. "Run 12 miles a week" is a goal you can track.',
  },
  {
    id: 'know-your-why',
    title: 'Know your why.',
    summary: 'On hard days, your reason matters more than your plan. Add it to every big goal.',
    tabs: ['plan'],
    kind: 'text',
    body: 'On hard days, your reason matters more than your plan. Add it to every big goal.',
  },
  {
    id: 'set-a-deadline',
    title: 'Set a deadline.',
    summary: 'A date turns "someday" into a pace you can keep.',
    tabs: ['plan'],
    kind: 'text',
    body: 'A date turns "someday" into a pace you can keep.',
  },
  {
    id: 'break-it-down',
    title: 'Break it down.',
    summary: 'Big goals happen one small step at a time. Split anything that feels too big.',
    tabs: ['plan'],
    kind: 'text',
    body: 'Big goals happen one small step at a time. Split anything that feels too big.',
  },
  {
    id: 'plan-your-week',
    title: 'Plan your week.',
    summary: "Each week, decide which days you'll work on it. Plans can move; that's fine.",
    tabs: ['plan'],
    kind: 'text',
    body: "Each week, decide which days you'll work on it. Plans can move; that's fine.",
  },
  {
    id: 'track-it-daily',
    title: 'Track it daily.',
    summary: 'A quick log keeps your streak alive and shows you the truth.',
    tabs: ['do'],
    kind: 'text',
    body: 'A quick log keeps your streak alive and shows you the truth.',
  },
  {
    id: 'review-every-week',
    title: 'Review every week.',
    summary: "Look at what worked, what didn't, and adjust. Small corrections add up.",
    tabs: ['reflect'],
    kind: 'text',
    body: "Look at what worked, what didn't, and adjust. Small corrections add up.",
  },
  {
    id: 'get-a-partner',
    title: 'Get a partner.',
    summary: 'Sharing a goal with someone makes you far more likely to follow through.',
    tabs: ['connect'],
    kind: 'text',
    body: 'Sharing a goal with someone makes you far more likely to follow through.',
  },
];

export function learnItem(id: string): LearnItem | undefined {
  return LEARN_ITEMS.find((item) => item.id === id);
}

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
