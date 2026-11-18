import {
  JOB_APPLY_STEP,
  JOB_BECAUSE,
  JOB_BLOCK,
  JOB_BRANCHES,
  JOB_CARD,
  JOB_CLOSING,
  JOB_DATE,
  JOB_FOLLOWS,
  JOB_HELPER,
  JOB_HOLD,
  JOB_HOURS,
  JOB_IMPORTANCE,
  JOB_LEVEL,
  JOB_STAGE,
  JOB_TIGHT,
  JOB_WHY,
  type JobFollowId,
} from '../constants/maya/jobFlow';
import { createGoal, deleteGoal, type GoalInput } from './goalTreeApi';
import { parseLocalDate, todayLocal, toLocalDateString } from './localDate';
import { datePlusMonths } from './mayaShape';
import type { MayaLevel } from './settingsApi';
import type { StepDraft } from './mayaShape';
import { formatDate } from '../utils/date';

export type JobStepId =
  | 'why'
  | 'importance'
  | 'importanceLow'
  | 'stage'
  | 'date'
  | 'hours'
  | 'tight'
  | 'hold'
  | 'block'
  | 'start'
  | 'coach'
  | 'card'
  | 'helper'
  | 'invite'
  | 'helperLater'
  | 'level';

export type JobStageId = 'not-started' | 'applying' | 'interviewing';
export type JobHoursId = '1-2' | '3-5' | '6-10' | 'skip';
export type JobDateChoice = 'semester' | 'summer' | '3' | '6' | 'pick';
export type JobBranchId = (typeof JOB_BRANCHES)[number]['id'];
export type JobReask = 'date' | 'hours' | null;

export type JobDraft = {
  why: string;
  importance: number | null;
  lowChoice: 'keep' | 'else' | null;
  stage: JobStageId | null;
  targetDate: string | null;
  dateChoice: JobDateChoice | null;
  hours: JobHoursId | null;
  hoursConfirmed: boolean;
  hoursNote: boolean;
  tightShown: boolean;
  tightChoice: 'date' | 'hours' | 'keep' | null;
  reask: JobReask;
  resumeTo: JobStepId | null;
  pendingAfterTight: JobStepId | null;
  follow: JobFollowId | null;
  blockTime: 'yes' | 'unsure' | null;
  startWith: 'a' | 'b' | 'own' | null;
  calendarStep: boolean;
  steps: StepDraft[];
  stepsFor: JobFollowId | null;
  title: string;
  helper: string | null;
  invite: 'now' | 'later' | null;
  level: MayaLevel;
  levelChosen: boolean;
};

export type JobMove =
  | { type: 'step'; id: JobStepId; job: JobDraft }
  | { type: 'area' }
  | { type: 'save'; job: JobDraft }
  | { type: 'own'; job: JobDraft };

const HOURS_AMOUNT: Record<Exclude<JobHoursId, 'skip'>, number> = {
  '1-2': 1,
  '3-5': 3,
  '6-10': 6,
};

const HOURS_LABEL: Record<JobHoursId, string> = {
  '1-2': JOB_HOURS.low,
  '3-5': JOB_HOURS.mid,
  '6-10': JOB_HOURS.high,
  skip: JOB_HOURS.skip,
};

export function createJobDraft(temp: string, level: MayaLevel): JobDraft {
  return {
    why: '',
    importance: null,
    lowChoice: null,
    stage: null,
    targetDate: null,
    dateChoice: null,
    hours: preselectHours(temp),
    hoursConfirmed: false,
    hoursNote: false,
    tightShown: false,
    tightChoice: null,
    reask: null,
    resumeTo: null,
    pendingAfterTight: null,
    follow: null,
    blockTime: null,
    startWith: null,
    calendarStep: false,
    steps: [],
    stepsFor: null,
    title: JOB_CARD.goalTitle,
    helper: null,
    invite: null,
    level,
    levelChosen: false,
  };
}

export function preselectHours(temp: string): JobHoursId | null {
  if (temp === 'stretched' || temp === 'stuck') {
    return '1-2';
  }
  if (temp === 'handling') {
    return '3-5';
  }
  if (temp === 'level-up') {
    return '6-10';
  }
  return null;
}

export function jobDateFor(choice: Exclude<JobDateChoice, 'pick'>, today = todayLocal()): string {
  if (choice === 'semester') {
    return nextOf(today, [
      [4, 15],
      [11, 15],
    ]);
  }
  if (choice === 'summer') {
    return nextOf(today, [[5, 1]]);
  }
  if (choice === '3') {
    return datePlusMonths(today, 3);
  }
  return datePlusMonths(today, 6);
}

/** Next date on or after today. Months are 0-based. */
function nextOf(today: string, points: Array<[number, number]>): string {
  const date = parseLocalDate(today);
  const year = date.getFullYear();
  const candidates = [year, year + 1].flatMap((item) =>
    points.map(([month, day]) => toLocalDateString(new Date(item, month, day))),
  );
  return candidates.find((item) => item >= today) ?? candidates[candidates.length - 1] ?? today;
}

export function resolvedFollow(job: JobDraft): Exclude<JobFollowId, 'c'> | null {
  if (job.follow === 'c') {
    return job.startWith === 'a' || job.startWith === 'b' ? job.startWith : null;
  }
  if (job.follow) {
    return job.follow;
  }
  return null;
}

export function startingBranch(job: JobDraft): JobBranchId | null {
  const follow = resolvedFollow(job);
  if (follow === 'a') {
    return 'decide';
  }
  if (follow === 'b') {
    return 'resume';
  }
  if (follow) {
    return 'apply';
  }
  return null;
}

export function jobWhySentence(clause: string): string {
  const trimmed = clause.trim().replace(/[.?!]+$/u, '');
  return `I want to get a job so that I can ${trimmed}.`;
}

export function hoursLabel(hours: JobHoursId | null): string {
  if (!hours || hours === 'skip') {
    return 'time';
  }
  return HOURS_LABEL[hours];
}

function addDays(iso: string, days: number): string {
  const date = parseLocalDate(iso);
  date.setDate(date.getDate() + days);
  return toLocalDateString(date);
}

export function isTight(date: string, branch: JobBranchId, today = todayLocal()): boolean {
  if (branch === 'decide') {
    return date < datePlusMonths(today, 2);
  }
  if (branch === 'resume') {
    return date < addDays(today, 42);
  }
  return date < addDays(today, 21);
}

function stepTo(id: JobStepId, job: JobDraft): JobMove {
  const next = id === 'coach' ? ensureSteps(job) : job;
  return { type: 'step', id, job: next };
}

function ensureSteps(job: JobDraft): JobDraft {
  const follow = resolvedFollow(job);
  if (!follow || job.stepsFor === follow) {
    return job;
  }
  return {
    ...job,
    stepsFor: follow,
    steps: JOB_FOLLOWS[follow].steps.map((text, index) => ({
      id: `step-${index}`,
      text,
      checked: true,
    })),
  };
}

function afterBranchKnown(job: JobDraft, today: string): JobMove {
  const branch = startingBranch(job);
  if (
    job.stage === 'not-started' &&
    branch &&
    !job.tightShown &&
    job.targetDate &&
    isTight(job.targetDate, branch, today)
  ) {
    return stepTo('tight', { ...job, pendingAfterTight: 'coach' });
  }
  return stepTo('coach', job);
}

export function submitJob(
  draft: JobDraft,
  step: JobStepId,
  patch: Partial<JobDraft>,
  askLevel: boolean,
  today = todayLocal(),
): JobMove {
  const job: JobDraft = {
    ...draft,
    ...patch,
    ...(step === 'tight' ? { tightShown: true } : {}),
    ...(step === 'hours' ? { hoursNote: false } : {}),
  };
  if (step === 'why' || step === 'importance') {
    return step === 'why'
      ? stepTo('importance', job)
      : (job.importance ?? 0) >= 7
        ? stepTo('stage', job)
        : stepTo('importanceLow', job);
  }
  if (step === 'importanceLow') {
    if (job.lowChoice === 'else') {
      return { type: 'area' };
    }
    return stepTo('stage', job);
  }
  if (step === 'stage') {
    return stepTo('date', {
      ...job,
      follow: null,
      blockTime: null,
      startWith: null,
      steps: [],
      stepsFor: null,
      calendarStep: false,
      tightShown: false,
      tightChoice: null,
      reask: null,
      resumeTo: null,
      pendingAfterTight: null,
    });
  }
  if (step === 'date') {
    if (job.reask === 'date' && job.resumeTo) {
      return stepTo(job.resumeTo, { ...job, reask: null, resumeTo: null });
    }
    return stepTo('hours', job);
  }
  if (step === 'hours') {
    if (job.reask === 'hours' && job.resumeTo) {
      return stepTo(job.resumeTo, { ...job, reask: null, resumeTo: null });
    }
    if (
      job.stage !== 'not-started' &&
      !job.tightShown &&
      job.targetDate &&
      isTight(job.targetDate, 'apply', today)
    ) {
      return stepTo('tight', { ...job, pendingAfterTight: 'hold' });
    }
    return stepTo('hold', job);
  }
  if (step === 'tight') {
    if (job.reask === 'date') {
      return stepTo('date', job);
    }
    if (job.reask === 'hours') {
      return stepTo('hours', job);
    }
    return stepTo(job.pendingAfterTight ?? 'coach', { ...job, pendingAfterTight: null });
  }
  if (step === 'hold') {
    if (job.follow === 'c') {
      return stepTo('block', {
        ...job,
        blockTime: null,
        startWith: null,
        steps: [],
        stepsFor: null,
        calendarStep: false,
      });
    }
    return afterBranchKnown(
      {
        ...job,
        blockTime: null,
        startWith: null,
        steps: [],
        stepsFor: null,
        calendarStep: false,
      },
      today,
    );
  }
  if (step === 'block') {
    if (job.blockTime === 'unsure') {
      return stepTo('hours', { ...job, hoursConfirmed: false, hoursNote: true, calendarStep: false });
    }
    return stepTo('start', { ...job, calendarStep: true });
  }
  if (step === 'start') {
    if (job.startWith === 'own') {
      return { type: 'own', job };
    }
    return afterBranchKnown(job, today);
  }
  if (step === 'coach') {
    return stepTo('card', job);
  }
  if (step === 'card') {
    return stepTo('helper', job);
  }
  if (step === 'helper') {
    if (job.helper === 'unsure') {
      return stepTo('helperLater', job);
    }
    return stepTo('invite', job);
  }
  if (step === 'invite' || step === 'helperLater') {
    if (askLevel) {
      return stepTo('level', job);
    }
    return { type: 'save', job };
  }
  return { type: 'save', job };
}

function followOptions(stage: JobStageId | null): JobFollowId[] {
  if (stage === 'applying') {
    return ['d', 'e', 'f', 'g'];
  }
  if (stage === 'interviewing') {
    return ['h', 'i', 'j', 'k', 'l'];
  }
  return ['a', 'b', 'c'];
}

export function jobFollowChoices(job: JobDraft): Array<{ id: JobFollowId; label: string }> {
  return followOptions(job.stage).map((id) => ({ id, label: JOB_FOLLOWS[id].label }));
}

export function jobPrompt(step: JobStepId, job: JobDraft): string[] {
  if (step === 'why') {
    return [JOB_WHY.prompt];
  }
  if (step === 'importance') {
    return [JOB_IMPORTANCE.prompt];
  }
  if (step === 'importanceLow') {
    return [JOB_IMPORTANCE.low];
  }
  if (step === 'stage') {
    return [JOB_STAGE.prompt];
  }
  if (step === 'date') {
    if (job.stage === 'applying') {
      return [JOB_DATE.applying];
    }
    if (job.stage === 'interviewing') {
      return [JOB_DATE.interviewing];
    }
    return [JOB_DATE.notStarted];
  }
  if (step === 'hours') {
    return job.hoursNote ? [JOB_HOURS.smaller, JOB_HOURS.prompt] : [JOB_HOURS.prompt];
  }
  if (step === 'tight') {
    return [JOB_TIGHT.prompt];
  }
  if (step === 'hold') {
    if (job.stage === 'applying') {
      return [JOB_HOLD.applying];
    }
    if (job.stage === 'interviewing') {
      return [JOB_HOLD.interviewing];
    }
    return [JOB_HOLD.notStarted];
  }
  if (step === 'block') {
    return [JOB_BLOCK.prompt.replace('[hours]', hoursLabel(job.hours))];
  }
  if (step === 'start') {
    return [JOB_FOLLOWS.c.coaching, JOB_BLOCK.loved];
  }
  if (step === 'coach') {
    const follow = resolvedFollow(job);
    return follow ? [JOB_FOLLOWS[follow].coaching] : [];
  }
  if (step === 'card') {
    return [jobCardSentence(job)];
  }
  if (step === 'helper') {
    return [JOB_HELPER.prompt];
  }
  if (step === 'helperLater') {
    return [JOB_HELPER.unsureLine];
  }
  if (step === 'level') {
    return [JOB_LEVEL.prompt];
  }
  return [];
}

export function jobAnswerLabel(step: JobStepId, job: JobDraft): string | null {
  if (step === 'why') {
    return job.why.trim() || null;
  }
  if (step === 'importance') {
    return job.importance == null ? null : String(job.importance);
  }
  if (step === 'importanceLow') {
    if (job.lowChoice === 'keep') {
      return JOB_IMPORTANCE.keep;
    }
    if (job.lowChoice === 'else') {
      return JOB_IMPORTANCE.else;
    }
    return null;
  }
  if (step === 'stage') {
    if (job.stage === 'not-started') {
      return JOB_STAGE.notStarted;
    }
    if (job.stage === 'applying') {
      return JOB_STAGE.applying;
    }
    if (job.stage === 'interviewing') {
      return JOB_STAGE.interviewing;
    }
    return null;
  }
  if (step === 'date') {
    if (job.dateChoice === 'semester') {
      return JOB_DATE.semester;
    }
    if (job.dateChoice === 'summer') {
      return JOB_DATE.summer;
    }
    if (job.dateChoice === '3') {
      return JOB_DATE.three;
    }
    if (job.dateChoice === '6') {
      return JOB_DATE.six;
    }
    if (job.dateChoice === 'pick' && job.targetDate) {
      return formatDate(job.targetDate);
    }
    return null;
  }
  if (step === 'hours') {
    return job.hoursConfirmed && job.hours ? HOURS_LABEL[job.hours] : null;
  }
  if (step === 'tight') {
    if (job.tightChoice === 'date') {
      return JOB_TIGHT.date;
    }
    if (job.tightChoice === 'hours') {
      return JOB_TIGHT.hours;
    }
    if (job.tightChoice === 'keep') {
      return JOB_TIGHT.keep;
    }
    return null;
  }
  if (step === 'hold') {
    return job.follow ? JOB_FOLLOWS[job.follow].label : null;
  }
  if (step === 'block') {
    if (job.blockTime === 'yes') {
      return JOB_BLOCK.yes;
    }
    if (job.blockTime === 'unsure') {
      return JOB_BLOCK.unsure;
    }
    return null;
  }
  if (step === 'start') {
    if (job.startWith === 'a') {
      return JOB_BLOCK.figure;
    }
    if (job.startWith === 'b') {
      return JOB_BLOCK.resume;
    }
    if (job.startWith === 'own') {
      return JOB_BLOCK.own;
    }
    return null;
  }
  if (step === 'coach') {
    const kept = job.steps.filter((item) => item.checked && item.text.trim());
    return kept.length > 0 ? kept.map((item) => item.text.trim()).join(' · ') : null;
  }
  if (step === 'card') {
    return JOB_CARD.looksRight;
  }
  if (step === 'helper') {
    return helperLabel(job.helper);
  }
  if (step === 'invite') {
    if (job.invite === 'now') {
      return JOB_HELPER.invite;
    }
    if (job.invite === 'later') {
      return JOB_HELPER.later;
    }
    return null;
  }
  if (step === 'level') {
    if (!job.levelChosen) {
      return null;
    }
    if (job.level === 'lots') {
      return JOB_LEVEL.lots;
    }
    if (job.level === 'self') {
      return JOB_LEVEL.self;
    }
    return JOB_LEVEL.occasional;
  }
  return null;
}

function helperLabel(id: string | null): string | null {
  if (id === 'friend') {
    return JOB_HELPER.friend;
  }
  if (id === 'classmate') {
    return JOB_HELPER.classmate;
  }
  if (id === 'family') {
    return JOB_HELPER.family;
  }
  if (id === 'hunter') {
    return JOB_HELPER.hunter;
  }
  if (id === 'unsure') {
    return JOB_HELPER.unsure;
  }
  return null;
}

export function jobCardSentence(job: JobDraft): string {
  const follow = resolvedFollow(job);
  const because = follow ? JOB_BECAUSE[follow] : { since: '', start: '' };
  return JOB_CARD.sentence
    .replace('[date]', job.targetDate ? formatDate(job.targetDate) : '')
    .replace('[why]', job.why.trim())
    .replace('[SINCE]', because.since)
    .replace('[START]', because.start);
}

export function jobCardLines(job: JobDraft): Array<{ title: string; steps: string[]; current: boolean }> {
  const branch = startingBranch(job);
  const start = JOB_BRANCHES.findIndex((item) => item.id === branch);
  const kept = job.steps
    .filter((item) => item.checked && item.text.trim() && item.text.trim() !== JOB_APPLY_STEP)
    .map((item) => item.text.trim());
  if (job.calendarStep) {
    kept.push(JOB_BLOCK.calendar);
  }
  const applyKept = job.steps.some((item) => item.checked && item.text.trim() === JOB_APPLY_STEP);
  return JOB_BRANCHES.slice(start < 0 ? 0 : start).map((item) => ({
    title: item.id === branch ? `${item.title} · ${JOB_CARD.startHere}` : item.title,
    current: item.id === branch,
    steps:
      item.id === branch
        ? kept
        : item.id === 'apply' && applyKept && branch !== 'apply'
          ? [JOB_APPLY_STEP]
          : [],
  }));
}

export function jobTimeLine(job: JobDraft): string | null {
  if (!job.hoursConfirmed || !job.hours || job.hours === 'skip') {
    return null;
  }
  return JOB_CARD.timeLine.replace('[hours]', HOURS_LABEL[job.hours]);
}

export function jobTitleLine(job: JobDraft): string {
  return JOB_CARD.titleLine.replace('[date]', job.targetDate ? formatDate(job.targetDate) : '');
}

export function jobClosingLine(name: string, day: string, level: MayaLevel): string {
  const template = level === 'self' ? JOB_CLOSING.self : JOB_CLOSING.set;
  const trimmed = name.trim();
  const text = trimmed ? template.replace('[name]', trimmed) : template.replace(', [name]', '');
  return text.replace('[day]', day);
}

/** Stored helper id for the existing nudge phrase. Null when they are not sure. */
export function jobHelperStorageId(helper: string | null): string | null {
  if (helper === 'family') {
    return 'family';
  }
  if (helper === 'friend' || helper === 'classmate' || helper === 'hunter') {
    return 'friend';
  }
  return null;
}

function keptOneTime(job: JobDraft): string[] {
  const titles = job.steps
    .filter((item) => item.checked && item.text.trim() && item.text.trim() !== JOB_APPLY_STEP)
    .map((item) => item.text.trim());
  if (job.calendarStep && !titles.includes(JOB_BLOCK.calendar)) {
    titles.push(JOB_BLOCK.calendar);
  }
  return titles;
}

function wantsApplyStep(job: JobDraft): boolean {
  return job.steps.some((item) => item.checked && item.text.trim() === JOB_APPLY_STEP);
}

export function jobGoalTree(job: JobDraft, today = todayLocal()): GoalInput & { children: GoalNode[] } {
  const children: GoalNode[] = [];
  if (job.hoursConfirmed && job.hours && job.hours !== 'skip') {
    children.push({
      title: 'Job search time',
      status: 'active',
      actualStartDate: today,
      repeatPeriod: 'week',
      plannedDays: [],
      unit: 'hours',
      targetAmount: HOURS_AMOUNT[job.hours],
      children: [],
    });
  }
  const branch = startingBranch(job);
  const start = JOB_BRANCHES.findIndex((item) => item.id === branch);
  if (start >= 0) {
    const oneTime = keptOneTime(job);
    const applyStep = wantsApplyStep(job);
    for (const item of JOB_BRANCHES.slice(start)) {
      const active = item.id === branch;
      const kids: GoalNode[] = [];
      if (active) {
        for (const title of oneTime) {
          kids.push({ title, status: 'pending', unit: null, children: [] });
        }
      }
      if (item.id === 'apply' && applyStep) {
        kids.push({
          title: JOB_APPLY_STEP,
          status: 'active',
          actualStartDate: today,
          repeatPeriod: 'week',
          plannedDays: [],
          unit: 'applications',
          targetAmount: 5,
          children: [],
        });
      }
      children.push({
        title: item.title,
        status: active ? 'active' : 'pending',
        actualStartDate: active ? today : null,
        unit: null,
        children: kids,
      });
    }
  } else if (job.calendarStep) {
    children.push({ title: JOB_BLOCK.calendar, status: 'pending', unit: null, children: [] });
  }
  return {
    title: job.title.trim() || JOB_CARD.goalTitle,
    why: job.why.trim() ? jobWhySentence(job.why) : null,
    category: 'career',
    status: 'active',
    actualStartDate: today,
    targetEndDate: job.targetDate,
    unit: null,
    children,
  };
}

type GoalNode = GoalInput & { children: GoalNode[] };

export async function saveJobGoal(job: JobDraft, today = todayLocal()): Promise<string> {
  const tree = jobGoalTree(job, today);
  const created: string[] = [];
  try {
    return await createNode(tree, null, created);
  } catch (error) {
    for (let index = created.length - 1; index >= 0; index -= 1) {
      const id = created[index];
      if (!id) {
        continue;
      }
      try {
        await deleteGoal(id);
      } catch {
        // Keep removing the rest so a retry does not leave a half-built goal.
      }
    }
    throw error;
  }
}

async function createNode(node: GoalNode, parentId: string | null, created: string[]): Promise<string> {
  const { children, ...input } = node;
  const saved = await createGoal({ ...input, parentId });
  created.push(saved.id);
  for (const child of children) {
    await createNode(child, saved.id, created);
  }
  return saved.id;
}
