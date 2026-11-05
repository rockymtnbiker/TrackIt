/** Wording for the Maya Shape steps. Edit this file to change what Maya says. */

export type CoachingScript = {
  /** Shown above the step list. Empty when this area has no coaching line. */
  lead: string;
  steps: string[];
  /** Second Maya bubble on the same screen, after the steps. */
  follow: string | null;
  /** Skip the coaching screen and show `lead` on the habit screen instead. */
  skipScreen: boolean;
};

export type HabitChoice = {
  id: string;
  label: string;
  /** Minutes per week, or times per week. */
  amount: number;
};

export type HabitKind = 'minutes' | 'times';

export type HabitCopy = {
  name: string;
  kind: HabitKind;
  choices: HabitChoice[];
  /** Minutes habits can take a typed amount. */
  allowMore: boolean;
};

export const SHAPE_COPY = {
  namePrompt: "Here's a first draft of your goal. Make it yours.",
  targetDate: 'Target date',
  habitPrompt: "Now let's make time for it. How much can you realistically give this each week?",
  daysPrompt: 'Which days work best?',
  more: 'More',
  minutesPlaceholder: 'Minutes',
  helperPrompt: "Who's one person who could help with this?",
  levelPrompt: 'Last thing: how much should I check in with you?',
  addStep: '+ Add your own step',
  why: 'Why',
  looksGood: 'Looks good',
  changeSomething: 'Change something',
  saving: 'Saving…',
} as const;

export const GOAL_TITLES = {
  job: 'Have 5 solid job applications out',
  workout: 'Work out consistently',
  eat: 'Eat better',
  sleep: 'Sleep better',
  lose: 'Lose weight',
  gain: 'Gain weight',
  muscle: 'Build muscle',
} as const;

/** Job "finding time" starts the habit at 30 minutes on Tuesday and Thursday. */
export const TIME_PRESET = {
  choiceId: '30',
  days: [2, 4],
} as const;

const MINUTE_CHOICES: HabitChoice[] = [
  { id: '30', label: '30 min', amount: 30 },
  { id: '60', label: '1 hour', amount: 60 },
  { id: '120', label: '2 hours', amount: 120 },
];

export const JOB_HABIT: HabitCopy = {
  name: 'Job search time',
  kind: 'minutes',
  choices: MINUTE_CHOICES,
  allowMore: true,
};

export const WORKOUT_HABIT: HabitCopy = {
  name: 'Workout time',
  kind: 'minutes',
  choices: MINUTE_CHOICES,
  allowMore: true,
};

export const OTHER_HABIT: HabitCopy = {
  name: 'Time for this',
  kind: 'minutes',
  choices: MINUTE_CHOICES,
  allowMore: true,
};

export const EAT_HABIT: HabitCopy = {
  name: 'Meal prep',
  kind: 'times',
  allowMore: false,
  choices: [
    { id: '1', label: '1', amount: 1 },
    { id: '2', label: '2', amount: 2 },
    { id: '3', label: '3', amount: 3 },
  ],
};

export const SLEEP_HABIT: HabitCopy = {
  name: 'Wind-down routine',
  kind: 'times',
  allowMore: false,
  choices: [
    { id: '3', label: '3', amount: 3 },
    { id: '5', label: '5', amount: 5 },
    { id: '7', label: '7', amount: 7 },
  ],
};

export const HELPER_OPTIONS = [
  { id: 'friend', label: 'A friend or classmate' },
  { id: 'family', label: 'Family' },
  { id: 'professor', label: 'A professor or advisor' },
  { id: 'career', label: 'Career center' },
  { id: 'unsure', label: 'Not sure yet' },
] as const;

export const LEVEL_OPTIONS = [
  { id: 'lots', label: 'Lots of encouragement' },
  { id: 'occasional', label: 'Occasional' },
  { id: 'self', label: "I'm self-motivated" },
] as const;

const OPEN_SCRIPT: CoachingScript = {
  lead: '',
  steps: [],
  follow: null,
  skipScreen: false,
};

export const JOB_SCRIPTS: Record<string, CoachingScript> = {
  fit: {
    lead: "Have you thought about talking to someone who works in a field that interests you? It's one of the best ways to compare careers, build your network, and sharpen your goals. Most people are happy to give you 20 minutes.",
    steps: [
      'List 3–5 roles that sound interesting',
      'Ask 2 people in those roles for a 20-minute chat',
      'Book one career center appointment',
    ],
    follow: null,
    skipScreen: false,
  },
  experience: {
    lead: "Here's the thing: entry-level employers expect you to be new. What they want is proof you can do the work, and you probably have more of that than you think, from classes, jobs, and clubs.",
    steps: [
      "Write down 5 skills you've built, with one example each",
      'Search only entry-level, junior, or intern titles this week',
      'Add one class project to your resume',
    ],
    follow: null,
    skipScreen: false,
  },
  silence: {
    lead: "That silence is rough, and it's not just you. What usually works better is applying to fewer jobs and making each one count. A referral from someone inside helps more than anything.",
    steps: [
      'Pick 1–2 job titles and apply only to those',
      "Tailor your resume to each posting's keywords",
      'Ask one person at a target company for a quick chat',
    ],
    follow: null,
    skipScreen: false,
  },
  resume: {
    lead: 'Most companies run every resume, even for entry-level jobs, through software that scans for keywords from the job description before a person sees it. Then a recruiter skims it in seconds. So use their words, and lead with results that have numbers.',
    steps: [
      'Use your favorite AI tool to compare your resume with a job description and spot accomplishments you might be overlooking',
      'Rewrite 3 bullets in your own words to show a result with a number',
      "Add the posting's keywords wherever they're true for you",
      'Get one review from the career center',
    ],
    follow:
      "One heads-up: don't let the AI write it for you. It tends to stretch the truth, and hiring managers see so many AI resumes that generic ones get tossed. Use it to find your strengths, then write it your way.",
    skipScreen: false,
  },
  interviews: {
    lead: "Totally normal. The fix is practice. Once you've told your best stories a few times, you're not making it up on the spot anymore.",
    steps: [
      'Write 5 stories using STAR: situation, task, action, result',
      'Do one mock interview at the career center',
      'Practice your answers out loud with a friend',
    ],
    follow: null,
    skipScreen: false,
  },
  time: {
    lead: 'Try treating it like a class. A couple of short blocks on your calendar each week beats a stressful all-nighter.',
    steps: [],
    follow: null,
    skipScreen: true,
  },
  network: {
    lead: "Alumni from your school are a great place to start. They've been where you are, and most are glad to help. Ask for advice, not a job. Opportunities tend to follow.",
    steps: [
      'Find 5 alumni in your target field on LinkedIn',
      'Message 1 alum asking for a short chat',
      'Send a thank-you after each conversation',
    ],
    follow: null,
    skipScreen: false,
  },
};

export const WORKOUT_SCRIPTS: Record<string, CoachingScript> = {
  time: {
    lead: "You don't need an hour. Ten minutes counts, and short workouts are a lot easier to keep than long ones you end up skipping.",
    steps: [
      'Pick one thing you can do anywhere: a walk, a run, bodyweight moves',
      'Lay out your gear the night before',
    ],
    follow: null,
    skipScreen: false,
  },
  'fall-off': {
    lead: "That's the most common pattern there is. Start smaller than you think you need, and if you miss a day, just pick it back up. One miss doesn't erase the week.",
    steps: [
      'Choose an activity you actually enjoy',
      'If you miss one, do the next one as planned',
    ],
    follow: null,
    skipScreen: false,
  },
  tired: {
    lead: "Here's the funny thing: moving a little usually gives you more energy, not less. Start easy and see how you feel.",
    steps: [
      'Begin with a 10-minute walk',
      'Work out at the time of day you usually feel best',
      'Take a look at your sleep; it might be the real fix',
    ],
    follow: null,
    skipScreen: false,
  },
  alone: {
    lead: 'Working out with someone makes it more fun and a lot harder to skip. Even one friend changes things.',
    steps: [
      'Ask a friend or roommate to join you once a week',
      'Try a campus rec class or intramural team',
    ],
    follow: null,
    skipScreen: false,
  },
};

export const EAT_SCRIPTS: Record<string, CoachingScript> = {
  cost: {
    lead: 'Eating well can actually cost less than eating out. A few cheap staples go a long way.',
    steps: [
      'Make a grocery list before you shop',
      "Buy frozen fruits and veggies; they're cheap and they last",
      'Cook at home one more night a week than you do now',
    ],
    follow: null,
    skipScreen: false,
  },
  cook: {
    lead: "Cooking once can cover a few meals. You don't have to prep everything, just the meals that usually go sideways.",
    steps: ['Learn 3 simple go-to meals', 'Trade cooking nights with a roommate'],
    follow: null,
    skipScreen: false,
  },
};

export const SLEEP_SCRIPTS: Record<string, CoachingScript> = {
  phone: {
    lead: 'Your phone is designed to keep you up. Putting it out of reach is way easier than relying on willpower at midnight.',
    steps: ['Charge your phone across the room', 'Set a wind-down alarm'],
    follow: null,
    skipScreen: false,
  },
  stress: {
    lead: "Super common. Getting what's on your mind onto paper before bed can quiet it down. And if stress is sticking around most days, your campus counseling center is a great place to talk it through.",
    steps: [
      "Write tomorrow's to-do list before bed",
      'Skip all-nighters; sleep helps on exams more than cramming',
    ],
    follow: null,
    skipScreen: false,
  },
  schedule: {
    lead: 'Your body likes routine. Waking up around the same time every day, weekends too, makes falling asleep a lot easier.',
    steps: [
      'Pick a wake-up time and keep it all 7 days',
      'Count back 7–9 hours to set your bedtime',
      'Cut off caffeine by mid-afternoon',
    ],
    follow: null,
    skipScreen: false,
  },
};

export const WEIGHT_SCRIPT: CoachingScript = {
  lead: "That's a really common goal, and a solid one. The scale bounces around day to day, so let's build your plan around what you can control: how you move, eat, and sleep. Those are what move the number over time.",
  steps: [
    "Cook more of your own meals so you know what's in them",
    'Ask a doctor, dietitian, or your campus health center what target and pace make sense for you',
  ],
  follow:
    "One more thing, because it matters: if food or your weight feels stressful most days, you don't have to carry that alone. Talk to someone you trust, like a close friend or a professional. You deserve that kind of support.",
  skipScreen: false,
};

export function openScript(): CoachingScript {
  return OPEN_SCRIPT;
}
