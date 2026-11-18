/** All Maya copy for the Get a job flow. Edit wording here. */

export const JOB_OPENING = {
  intro:
    "Hey [name], I'm Maya, your Automated Advisor. I'm here to help you become your best you. Let's get you started. I'll ask you a few questions and then suggest some options based on your answers. Go with my suggestions or customize them to fit better.",
  letsGo: "Let's go",
  own: 'I already know what I want',
  temp: "Before we dive in, how's life feeling lately?",
  area: 'Which of these is taking up the most space in your head right now?',
  job: 'Get a job',
} as const;

export const JOB_WHY = {
  prompt: 'Finish this sentence: I want to get a job so that I can…',
  tuition: 'pay for tuition and other expenses',
  care: 'do work I actually care about',
  own: '✏️ In my own words',
  sentence: 'I want to get a job so that I can ___.',
} as const;

export const JOB_IMPORTANCE = {
  prompt: 'On a scale of 1–10, how important is this to you right now?',
  low: 'Fair. What would make it an 8? Or is something else actually more important right now?',
  keep: 'Keep going',
  else: 'Something else is more important',
} as const;

export const JOB_STAGE = {
  prompt: 'Where are you in the search?',
  notStarted: "Haven't started applying",
  applying: 'Applying, but not getting interviews',
  interviewing: 'Interviewing, but no call backs',
} as const;

export const JOB_DATE = {
  notStarted:
    "No problem, everyone starts somewhere. Before we get into the details, let's set a target. When do you want to have a job by?",
  applying:
    "Oh, that's so frustrating! The good news is that it happens to a lot of people, and there's plenty we can do to improve your chances. Before we get into what's going on, let's set a target. When do you want to have a job by?",
  interviewing:
    "That's so awesome! You're SO close! Before we dig in, let's set a target. When do you want to have a job by?",
  semester: 'End of this semester',
  summer: 'This summer',
  three: 'In 3 months',
  six: 'In 6 months',
  pick: 'Pick a date',
} as const;

export const JOB_HOURS = {
  prompt: 'How much time are you realistically going to give this effort each week?',
  low: '1–2 hours',
  mid: '3–5 hours',
  high: '6–10 hours',
  skip: 'Skip',
  smaller: "That's okay. Want to start with a smaller amount?",
} as const;

export const JOB_TIGHT = {
  prompt:
    "That's a fast timeline from where you are. Want to push the date back, or put in more hours a week?",
  date: 'Push the date back',
  hours: 'More hours a week',
  keep: 'Keep my answers',
} as const;

export const JOB_AI_WARNING =
  "One heads-up: don't let the AI write it for you. It tends to stretch the truth, and hiring managers see so many AI resumes that generic ones get tossed. Use it to find your strengths, then write it your way.";

export const JOB_HOLD = {
  notStarted:
    "Okay, you've got a target and the time to get there. Now let's figure out where to start. What's holding you back?",
  applying:
    "Okay, you've got a target and the time to get there. Now let's figure out why your applications aren't landing. Does one of these sound like you?",
  interviewing:
    "Okay, you've got a target and the time to get there. Now let's look at what's happening in your interviews. Which of these sounds most like you?",
} as const;

export type JobFollowId = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i' | 'j' | 'k' | 'l';

export type JobFollow = {
  id: JobFollowId;
  label: string;
  coaching: string;
  steps: string[];
  warning: boolean;
};

const STEPS_TAIL =
  'Select the ones that resonate with you. Re-phrase them, change them, and add as many more as you want.';

export const JOB_FOLLOWS: Record<JobFollowId, JobFollow> = {
  a: {
    id: 'a',
    label: "I'm not sure what kind of job I want",
    coaching: `Have you thought about talking to someone who works in a field that interests you? It's one of the best ways to compare careers, build your network, and sharpen your goals. Most people are happy to give you 20 minutes. You can also find job descriptions online to help narrow the search to something that you're qualified for and that interests you. Here are a few suggested steps to get you moving in the right direction. ${STEPS_TAIL}`,
    steps: [
      'Do a quick online search for a few jobs that sound interesting and read their job descriptions',
      'List 3–5 jobs that sound interesting',
      'Ask 2 people who have those jobs for a 20-minute chat',
      'Book one career center appointment',
    ],
    warning: false,
  },
  b: {
    id: 'b',
    label: "I don't know what to put on my resume",
    coaching: `A great resume shows what you can do, not just where you've been. Recruiters skim fast, so lead with results. 'Did inventory' tells them what your job was. 'Cut counting time by 20%' tells them what you can do. If you don't have much work experience yet, pull from class projects, volunteering, clubs, sports, and things you handle at home. They all count. Most companies also run resumes through software that scans for keywords from the job description, so use their words wherever they're true for you. Here are a few suggested steps to make your resume stand out. ${STEPS_TAIL}`,
    steps: [
      "Identify 5 skills I've acquired + 1 example each",
      'Turn 3 resume bullets into results with a number',
      'Add a class project, volunteer role, or club role',
      "Use my favorite AI tool to compare my resume with a job description and spot accomplishments I'm overlooking",
      "Add the posting's keywords wherever they're true for me",
    ],
    warning: true,
  },
  c: {
    id: 'c',
    label: 'Finding time with classes and work',
    coaching:
      "Try treating it like a class. A couple of short blocks on your calendar each week beats a stressful all-nighter. Let's make the time you set aside count.",
    steps: [],
    warning: false,
  },
  d: {
    id: 'd',
    label: "I'm applying to a lot of different job titles",
    coaching: `Casting a wide net feels productive, but it usually backfires. When you apply everywhere, each application ends up generic and the fit isn't there. Going narrower usually gets you further. Here are a few suggested steps to find your focus. ${STEPS_TAIL}`,
    steps: [
      "List what I'm good at and what I enjoy, then match it to job titles",
      "Ask someone who has that job what it's really like",
      'Pick no more than 2 job titles and only apply to those',
      'Apply to 5 jobs a week',
    ],
    warning: false,
  },
  e: {
    id: 'e',
    label: 'I send the same resume to every job',
    coaching: `Most companies run every resume through software that scans for keywords from the job description before a person sees it, and then a recruiter skims it in seconds. One resume can't match every posting. Lead with results, not duties: 'Did inventory' tells them what your job was. 'Cut counting time by 20%' tells them what you can do. Here are a few suggested steps to tailor yours without starting from scratch. ${STEPS_TAIL}`,
    steps: [
      'Apply to 5 jobs a week',
      "Use my favorite AI tool to compare my resume with a job description and spot accomplishments I'm overlooking",
      'Rewrite 3 bullets to show a result with a number',
      "Add the posting's keywords wherever they're true for me",
      'Tailor my cover letter to each posting with my best skills + examples',
      "Have the school's career center review my resume",
    ],
    warning: true,
  },
  f: {
    id: 'f',
    label: "I'm missing some of the requirements",
    coaching: `Applying a bit outside the list is fine. Many requirements are a wish list. But if you're missing the core ones, it's an easy no. You probably have more proof of what you can do than you think, from classes, jobs, and clubs. Here are a few suggested steps to find jobs where you're a strong match. ${STEPS_TAIL}`,
    steps: [
      "Identify 5 skills I've acquired + 1 example each",
      'Before I apply, check that I meet most of the core requirements',
      'Apply to 5 jobs a week',
    ],
    warning: false,
  },
  g: {
    id: 'g',
    label: 'None of these really fit',
    coaching: `That's okay. It isn't always obvious what's holding an application back. The fastest way to figure that out is to look at your applications the way an employer would and find the gaps. Here are a few suggested steps to do that. ${STEPS_TAIL}`,
    steps: [
      "Use my favorite AI tool to compare 3 postings I applied to with my resume, and find which skills or keywords they wanted that my resume doesn't show",
      'Get one application reviewed by the school career center',
      'Fix the biggest gap I find before my next application',
      'Apply to 5 jobs a week',
    ],
    warning: true,
  },
  h: {
    id: 'h',
    label: 'I get nervous and my mind goes blank',
    coaching: `Nerves are totally normal. The fix is practice. Once you've told your best stories a few times, you're not making it up on the spot anymore. Here are a few suggested steps to start practicing. ${STEPS_TAIL}`,
    steps: [
      'Apply to 5 jobs a week',
      'Write 5 stories using STAR: situation, task, action, result',
      'Do one mock interview at the school career center',
      'Practice my answers out loud with a friend',
    ],
    warning: false,
  },
  i: {
    id: 'i',
    label: 'When they ask about my experience, I mostly repeat my resume',
    coaching: `Your resume got you the interview. Now they want the story behind it. A short story about what you actually did makes it real. Here are a few suggested steps to get your stories ready. ${STEPS_TAIL}`,
    steps: [
      'Apply to 5 jobs a week',
      'Pick 5 things from my resume and write the story behind each (situation, task, action, result)',
      'Match each story to a common interview question',
      'Practice telling each one out loud in under 2 minutes',
    ],
    warning: false,
  },
  j: {
    id: 'j',
    label: 'I go in without researching the company much',
    coaching: `Interviewers can tell who did their homework. A little prep shows you actually want this job. Here are a few suggested steps for your next interview. ${STEPS_TAIL}`,
    steps: [
      'Apply to 5 jobs a week',
      'Research each company before the interview',
      'Prepare 2 questions to ask them',
      'Reread the job posting the night before',
    ],
    warning: false,
  },
  k: {
    id: 'k',
    label: "I don't follow up after the interview",
    coaching: `A short follow-up keeps you top of mind and shows you're serious. Serious job seekers never skip it. Mention one thing you talked about in the interview so they remember you. Here are a few suggested steps to make it easy. ${STEPS_TAIL}`,
    steps: [
      'Apply to 5 jobs a week',
      'Send a follow-up note within 24 hours',
      "Check in once if I haven't heard back in a week",
    ],
    warning: false,
  },
  l: {
    id: 'l',
    label: 'None of these really fit',
    coaching: `Getting interviews means your application works. Now it's about the in-person interaction, and that gets better with practice and feedback. One easy way to get feedback: near the end of your next interview, ask, 'Is there anything about my background you'd want to know more about before making a decision?' It gives you a chance to clear up a concern while you're still in the room. Here are a few suggested steps to start with. ${STEPS_TAIL}`,
    steps: [
      'Apply to 5 jobs a week',
      'Ask my feedback question toward the end of my next interview',
      'Do one mock interview at the school career center',
      'Write 5 stories using STAR',
    ],
    warning: false,
  },
};

export const JOB_NOT_STARTED: JobFollowId[] = ['a', 'b', 'c'];
export const JOB_APPLYING: JobFollowId[] = ['d', 'e', 'f', 'g'];
export const JOB_INTERVIEWING: JobFollowId[] = ['h', 'i', 'j', 'k', 'l'];

export const JOB_BLOCK = {
  prompt: 'Are you willing to block out your [hours] on your calendar each week?',
  yes: "Yes, I'll block it out",
  unsure: 'Not sure yet',
  loved:
    "Love it. Now that you're going to make time for it, how do you want to start using that time?",
  figure: 'Figure out what kind of job I want',
  resume: 'Write my resume',
  own: 'I can take it from here',
  calendar: 'Put my job search time on my calendar',
} as const;

export const JOB_CARD = {
  sentence:
    "Great. Here's what we've captured for your goal so far. You want to get a job by [date] so that you can [why]. Since [SINCE], you'll start [START], with the steps you picked. It's your goal, so change anything you'd like.",
  titleLine: 'Get a job · by [date]',
  timeLine: 'Job search time · [hours] a week',
  startHere: 'start here',
  looksRight: 'Looks right',
  edit: 'Edit',
  goalTitle: 'Get a job',
} as const;

export const JOB_BECAUSE: Record<
  Exclude<JobFollowId, 'c'>,
  { since: string; start: string }
> = {
  a: { since: "you're still deciding what kind of job you want", start: 'there' },
  b: { since: "you're not sure what to put on your resume", start: 'with your resume' },
  d: { since: "you're applying to a lot of different job titles", start: 'by narrowing your focus' },
  e: { since: "you're sending the same resume to every job", start: 'by tailoring your applications' },
  f: {
    since: "you're missing some of the requirements on the jobs you apply for",
    start: "by finding jobs where you're a strong match",
  },
  g: {
    since: "you're applying but not sure why you're not getting interviews",
    start: "by finding what's holding your applications back",
  },
  h: { since: 'you get nervous in interviews', start: 'with practice' },
  i: { since: 'you mostly repeat your resume in interviews', start: 'by getting your stories ready' },
  j: { since: 'you go in without researching the company much', start: 'with interview prep' },
  k: { since: "you don't follow up after interviews", start: 'by making follow-ups easy' },
  l: { since: "you're getting interviews but no call backs", start: 'with practice and feedback' },
};

export const JOB_BRANCHES = [
  { id: 'decide', title: 'Decide what kind of job I want' },
  { id: 'resume', title: 'Update resume' },
  { id: 'apply', title: 'Apply and interview' },
] as const;

export const JOB_APPLY_STEP = 'Apply to 5 jobs a week';

export const JOB_HELPER = {
  prompt:
    "Goals are easier to stick with when someone's in your corner. An accountability partner is a friend you check in with frequently. They can see this goal and cheer you on. Who could that be for you?",
  friend: 'A friend or roommate',
  classmate: 'A classmate',
  family: 'A family member',
  hunter: "Someone else who's job hunting",
  unsure: 'Not sure yet',
  invite: 'Invite them now',
  later: "I'll do it later",
  unsureLine: 'No problem. You can invite someone anytime from Connect.',
} as const;

export const JOB_LEVEL = {
  prompt: 'Last thing: how much should I check in with you?',
  lots: 'Lots of encouragement',
  occasional: 'Occasional',
  self: 'Self-motivated',
} as const;

export const JOB_CLOSING = {
  set: "Nice work, [name]. Your goal is set. I'll check in with you on [day] to see how your first week went, and I'm always here in Connect if you need me before then.",
  self: "Nice work, [name]. Your goal is set. I won't bug you, but I'm always here in Connect if you need me.",
  coach:
    "If you'd like more help along the way, an Achievement Coach is a real person who works with you one-on-one. They can help you break down your next steps, work through anything that gets in the way, and keep your momentum going. Want to talk with one?",
  talk: 'Talk with an Achievement Coach',
  another: "Let's write another goal",
  sent: 'Got it. A coach will reach out soon.',
  close: 'Close chat',
} as const;
