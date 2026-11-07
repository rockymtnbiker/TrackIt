export type MayaDestination =
  | { type: 'node'; id: string }
  | { type: 'close' }
  | { type: 'setup' }
  | { type: 'shape' };

export type MayaOptionTo = MayaDestination | { type: 'fix' };

export type MayaOption = {
  id: string;
  label: string;
  /** Short clause after "mostly because" in the playback. */
  phrase?: string;
  /** Where a choice-routed node goes when this option is chosen. */
  to?: MayaOptionTo;
  /** First question of this area's branch. No branch means go to better. */
  branch?: string;
  /** Node whose chosen option supplies the playback phrase. */
  phraseNode?: string;
};

export type MayaNext =
  | { type: 'goto'; id: string }
  | { type: 'choice' }
  | { type: 'areas' }
  | { type: 'branch' }
  | { type: 'scale'; minHigh: number; high: string; low: string }
  | { type: 'fix' };

export type MayaNodeKind = 'message' | 'single' | 'multi' | 'text' | 'scale' | 'playback';

export type MayaNode = {
  id: string;
  kind: MayaNodeKind;
  text: string;
  options?: MayaOption[];
  /** Options are the choices already made on this node. */
  optionsFrom?: string;
  placeholder?: string;
  skippable?: boolean;
  /** This node's chosen option phrase can appear in the playback. */
  playsPhrase?: boolean;
  scaleMin?: number;
  scaleMax?: number;
  next: MayaNext;
};

export type MayaContent = {
  startId: string;
  areaId: string;
  pickId: string;
  betterId: string;
  nodes: MayaNode[];
};

export const MAYA_DISCOVER: MayaContent = {
  startId: 'intro',
  areaId: 'area',
  pickId: 'pickOne',
  betterId: 'better',
  nodes: [
    {
      id: 'intro',
      kind: 'message',
      text: "Hey [name], I'm Maya, your automated advisor. I'm here to help you become your best you. Want to figure out what to work on first together, or do you already know?",
      next: { type: 'choice' },
      options: [
        { id: 'help', label: 'Help me figure it out', to: { type: 'node', id: 'age' } },
        { id: 'know', label: 'I already know', to: { type: 'setup' } },
      ],
    },
    {
      id: 'age',
      kind: 'single',
      skippable: true,
      text: "First, a little about you. What's your age range?",
      next: { type: 'goto', id: 'temp' },
      options: [
        { id: 'under-18', label: 'Under 18' },
        { id: '18-24', label: '18–24' },
        { id: '25-34', label: '25–34' },
        { id: '35-49', label: '35–49' },
        { id: '50-plus', label: '50+' },
        { id: 'prefer-not', label: 'Prefer not to say' },
      ],
    },
    {
      id: 'temp',
      kind: 'single',
      text: "Before we pick anything, how's life feeling lately?",
      next: { type: 'goto', id: 'area' },
      options: [
        { id: 'level-up', label: 'Pretty good, I want to level up' },
        { id: 'handling', label: 'Busy but handling it' },
        { id: 'stretched', label: 'Stretched thin' },
        { id: 'stuck', label: 'Kind of stuck' },
      ],
    },
    {
      id: 'area',
      kind: 'multi',
      text: 'Which of these is taking up the most space in your head right now?',
      next: { type: 'areas' },
      options: [
        { id: 'classes', label: 'Classes and grades' },
        {
          id: 'job',
          label: 'Landing a job',
          branch: 'jobStage',
          phraseNode: 'jobHard',
        },
        { id: 'money', label: 'Money' },
        { id: 'health', label: 'Health and fitness', branch: 'healthArea' },
        { id: 'dating', label: 'Dating and relationships' },
        { id: 'friends', label: 'Friends and social life' },
        { id: 'faith', label: 'Faith or purpose' },
        { id: 'other', label: 'Something else' },
      ],
    },
    {
      id: 'pickOne',
      kind: 'single',
      optionsFrom: 'area',
      text: 'Totally normal to have a few. If one of these got better in the next three months, which would make the others easier?',
      next: { type: 'branch' },
    },
    {
      id: 'jobStage',
      kind: 'single',
      text: 'Where are you in the search?',
      next: { type: 'goto', id: 'jobHard' },
      options: [
        { id: 'not-started', label: "Haven't started" },
        { id: 'know', label: "I know what I want but haven't applied" },
        { id: 'applying', label: 'Applying, not hearing back' },
        { id: 'interviews', label: 'Interviews coming up' },
      ],
    },
    {
      id: 'jobHard',
      kind: 'single',
      playsPhrase: true,
      text: 'What feels like the hardest part?',
      next: { type: 'goto', id: 'better' },
      options: [
        {
          id: 'fit',
          label: "I'm not sure what kind of job fits me",
          phrase: "you're not sure what kind of job fits you",
        },
        {
          id: 'experience',
          label: "Everyone wants experience I don't have",
          phrase: "everyone wants experience you don't have",
        },
        {
          id: 'silence',
          label: 'I apply and never hear back',
          phrase: 'you apply and never hear back',
        },
        {
          id: 'resume',
          label: "My resume doesn't stand out",
          phrase: "your resume doesn't stand out",
        },
        {
          id: 'interviews',
          label: 'Interviews make me nervous',
          phrase: 'interviews make you nervous',
        },
        {
          id: 'time',
          label: 'Finding time with classes and work',
          phrase: "it's hard to find time around classes and work",
        },
        {
          id: 'network',
          label: "I don't know anyone in the field",
          phrase: "you don't know anyone in the field",
        },
      ],
    },
    {
      id: 'healthArea',
      kind: 'single',
      text: 'What would you most like to change?',
      next: { type: 'choice' },
      options: [
        {
          id: 'workout',
          label: 'Working out more consistently',
          to: { type: 'node', id: 'workoutHard' },
        },
        { id: 'eat', label: 'Eating better', to: { type: 'node', id: 'eatHard' } },
        { id: 'sleep', label: 'Sleeping better', to: { type: 'node', id: 'sleepHard' } },
        {
          id: 'weight',
          label: 'Changing my weight',
          to: { type: 'node', id: 'weightGoal' },
        },
      ],
    },
    {
      id: 'workoutHard',
      kind: 'single',
      playsPhrase: true,
      text: 'What usually gets in the way?',
      next: { type: 'goto', id: 'better' },
      options: [
        { id: 'time', label: "I don't have time", phrase: "you don't have time" },
        {
          id: 'fall-off',
          label: 'I start strong, then fall off',
          phrase: 'you start strong, then fall off',
        },
        { id: 'tired', label: "I'm too tired", phrase: "you're too tired" },
        {
          id: 'alone',
          label: "I don't have anyone to work out with",
          phrase: "you don't have anyone to work out with",
        },
      ],
    },
    {
      id: 'eatHard',
      kind: 'single',
      playsPhrase: true,
      text: 'What makes eating well hard?',
      next: { type: 'goto', id: 'better' },
      options: [
        {
          id: 'cost',
          label: 'Healthy food costs too much',
          phrase: 'healthy food costs too much',
        },
        {
          id: 'cook',
          label: "No time to cook, or I don't know how",
          phrase: "there's no time to cook, or you're not sure how",
        },
      ],
    },
    {
      id: 'sleepHard',
      kind: 'single',
      playsPhrase: true,
      text: 'What keeps you from sleeping well?',
      next: { type: 'goto', id: 'better' },
      options: [
        {
          id: 'phone',
          label: 'I stay up on my phone',
          phrase: 'you stay up on your phone',
        },
        { id: 'stress', label: 'Stress keeps me up', phrase: 'stress keeps you up' },
        {
          id: 'schedule',
          label: 'My schedule is all over the place',
          phrase: 'your schedule is all over the place',
        },
      ],
    },
    {
      id: 'weightGoal',
      kind: 'single',
      text: "What's your goal?",
      next: { type: 'goto', id: 'better' },
      options: [
        { id: 'lose', label: 'Lose weight' },
        { id: 'gain', label: 'Gain weight' },
        { id: 'muscle', label: 'Build muscle' },
      ],
    },
    {
      id: 'better',
      kind: 'text',
      text: "Imagine yourself three months from now, after you accomplish this goal. What's different?",
      placeholder: 'A sentence or two',
      next: { type: 'goto', id: 'want' },
    },
    {
      id: 'want',
      kind: 'scale',
      scaleMin: 1,
      scaleMax: 10,
      text: 'On a scale of 1–10, how much do you want this?',
      next: { type: 'scale', minHigh: 7, high: 'playback', low: 'wantLow' },
    },
    {
      id: 'wantLow',
      kind: 'single',
      text: 'Fair. What would make it an 8? Or is something else actually more important right now?',
      next: { type: 'choice' },
      options: [
        { id: 'keep', label: "Let's keep going", to: { type: 'node', id: 'playback' } },
        { id: 'else', label: 'Something else matters more', to: { type: 'node', id: 'area' } },
      ],
    },
    {
      id: 'playback',
      kind: 'playback',
      text: 'Okay, here\'s what I\'m hearing: [area] is the big one[because], and three months from now you\'d like to see this: "[better]". Did I get that right?',
      next: { type: 'choice' },
      options: [
        { id: 'yes', label: "Yep, that's it", to: { type: 'shape' } },
        { id: 'no', label: 'Not quite', to: { type: 'fix' } },
      ],
    },
  ],
};
