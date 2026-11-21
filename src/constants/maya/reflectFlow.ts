/** Maya's copy for Reflect with Maya. Edit wording here. */

export const REFLECT_FLOW = {
  reflecting: 'Reflecting',
  hub: {
    strong: 'That was a strong week, [name]. Way to show up for yourself.',
    solid: 'Solid week, [name]. You kept things moving.',
    progress: "You made progress, [name], and that counts. Let's see what would make next week easier.",
    quiet: "Some weeks are like that, [name]. Let's figure out what's in the way.",
    coachHigh:
      'Many high achievers like you build momentum by working with a coach who helps them accelerate their success.',
    coachHighLink: 'Meet an Achievement Coach →',
    coachSolid:
      "High achievers turn solid into great with a coach who helps them find what's holding back the last 20%.",
    coachSolidLink: 'Meet an Achievement Coach →',
    coachLow:
      "Even high achievers have weeks that feel harder than they should. A coach can help you find what's in the way.",
    coachLowLink: 'Talk with a coach →',
    coachZero:
      "High achievers don't figure it out alone. An Achievement Coach can help you get moving again.",
    coachZeroLink: 'Talk with a coach →',
    pick: "Pick a goal to reflect on. I'd start with the ones under Needs attention.",
    exit: 'Exit',
    leaveAsk: 'Leave the reflection? Your goal changes are already saved.',
    keepGoing: 'Keep going',
  },
  wrap: {
    partnerOne: 'Checked in with [partner name] this week? Send a quick note →',
    partnerMany: 'Checked in with your accountability partners this week? Send a quick note →',
    send: 'Send a quick note',
    skip: 'Skip',
    partnerNone: 'Want an accountability partner? Invite with a code →',
    invite: 'Invite with a code',
    notNow: 'Not now',
    fresh: 'Anything new you want to start next week?',
    add: 'Add a goal',
    done: 'Done',
    closing: "Nice work, [name]. I'll check in again on [reflection day name].",
    closingSelf: 'Nice work, [name].',
    close: 'Close',
  },
  own: {
    glance:
      'Your week at a glance. Tap a goal to reflect on it and make any changes for next week.',
    done: 'Reflection done. Nice work.',
  },
  you: 'You: [chip]',
  coach: 'Talk with an Achievement Coach',
  showMe: 'Show me →',
  weekOf: 'Week of [Mon D–Mon D]',
  r3b: {
    full: "You got [N / T unit]. That's [P]%. Way to go!",
    solid: "You got [N / T unit]. That's [P]%. Not bad!",
    low: "You got [N / T unit]. That's [P]%. Every bit counts.",
    askTrackedWeek: 'Does [T unit] a week still feel right?',
    askTimesWeek: 'Does [T] [noun] a week still feel right?',
    askDaily: 'Does every day still feel right, or would a few days a week fit better?',
    askDailyTimes: 'Does [N] times a day still feel right?',
    askMonth: 'Does [T] [noun] a month still feel right?',
    tipHigh:
      'A good target should stretch you. If this one felt easy, nudge it up so it keeps doing something for you.',
    tipSolid:
      "The best targets are meaningfully challenging but still within reach. Close like this usually means you're right there.",
    tipLow:
      'A target you can actually hit builds momentum. Start where you can win, then build from there.',
    zero:
      'No [time/sessions] logged on [goal] this week. That happens. Take a look at this goal and see if it still fits. You can change the target, add a step, or pause it.',
    none: "Take a look at [goal] and update anything that's changed.",
    coach: 'Something getting in the way? Talk with an Achievement Coach →',
    parentWeek: "Here's your week on [goal]:",
    parentBullet: '• [step]: [N / T unit] ([P]%)',
    parentAttention: '[lowest step] could use the most attention.',
    parentOpen: 'Open [lowest step] →',
    parentAll: 'Every step hit its target. Way to go!',
    parentWhy: 'Remember why you started: "[why]"',
    parentOneTime:
      'You\'ve finished [done] of [total] steps on [goal]. Next up is "[first open step in plan order]". If that\'s changed, update it below.',
    parentNone:
      "[goal] doesn't have any steps yet. What's one thing you could do this week to move it forward? Add it as a step below.",
  },
  r3c: {
    job: 'You finished everything under [current branch]. Ready to move on to [next branch]?',
    yes: 'Yes',
    yesReply: 'Nice. Add the first steps for [next branch] below.',
    notYet: 'Not yet',
    notYetReply: 'No rush. Finish strong where you are.',
    other:
      "You finished everything you had planned for [goal or branch title]. Nice work. What's next?",
    add: "I'll add it",
    walk: 'Walk me through it',
    unsure: 'Not sure yet',
    unsureReply: "That's normal. An Achievement Coach can help you figure it out.",
    done: 'This goal is done',
    doneReply: "Tap the status to mark it done. That's huge, [name]!",
    applyCoaching:
      'Time to get your applications out there. Here are a few suggested steps to start strong. Select the ones that resonate with you. Re-phrase them, change them, and add as many more as you want.',
    confirm: 'Confirm',
    ready: "You're all set for [branch]. They're on your goal now.",
    back: 'Back to my goal',
    figure: "Let's figure it out. What's the next thing you need to tackle for [goal]?",
    example: 'e.g. Find a gym near campus',
    firstSteps: 'Good one. What are the first steps to get it moving? Add as many as you want.',
    addOne: 'Add',
    thatsIt: "That's it",
    nice: "Nice. That's on your goal now.",
    skipped: 'No problem. You can add steps for [branch or goal] below.',
  },
  r3d: {
    comment:
      'Your target date is coming up fast. You may want to push it back or add more hours a week.',
  },
} as const;
