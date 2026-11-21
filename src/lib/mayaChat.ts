import { MAYA_DISCOVER, type MayaNode } from '../constants/maya/discover';
import type { MayaLevel } from './settingsApi';
import {
  isAnswered,
  nodeById,
  resolveNext,
  visibleOptions,
  type MayaAnswers,
  type MayaStep,
} from './mayaFlow';
import { createJobDraft, submitJob, type JobDraft, type JobStepId } from './mayaJob';
import { todayLocal } from './localDate';
import {
  createShapeDraft,
  focusKey,
  shapeSequence,
  type ShapeDraft,
  type ShapeStepId,
} from './mayaShape';

export type StepRef =
  | { kind: 'discover'; id: string }
  | { kind: 'shape'; id: ShapeStepId }
  | { kind: 'job'; id: JobStepId };

type WalkSnap = {
  answers: MayaAnswers;
  draft: ShapeDraft | null;
  job: JobDraft | null;
};

export type MayaWalk = {
  path: StepRef[];
  /** Index of the question being answered. Equal to path.length once the goal is saved. */
  cursor: number;
  answers: MayaAnswers;
  draft: ShapeDraft | null;
  /** Get a job answers. Null for every other area. */
  job: JobDraft | null;
  /**
   * Shape steps cut off by a changed answer. Restored when the same coaching
   * focus is reached again; dropped when the focus changes.
   */
  shapeHold: StepRef[];
  /** Cursor to restore when a rewound question is answered the same way. */
  resumeAt: number | null;
  /** Chat state from the moment the user went back. */
  anchor: WalkSnap | null;
  /** State when each question was first shown, before that answer and later edits. */
  arrived: WalkSnap[];
  action?: 'setup' | 'close' | 'save' | 'own';
};

export type WalkOptions = {
  ageKnown: boolean;
  tempKnown: boolean;
  /** Stored temperature, used when that question is skipped. */
  temp: string | null;
  askLevel: boolean;
  level: MayaLevel;
};

const BRANCH_IDS = new Set([
  'pickOne',
  'healthArea',
  'workoutHard',
  'eatHard',
  'sleepHard',
  'weightGoal',
]);

/** Answers restored automatically when a changed path rejoins the shared questions. */
const KEPT_ON_REJOIN = new Set(['better', 'want']);

export function initialWalk(): MayaWalk {
  return land({
    path: [{ kind: 'discover', id: MAYA_DISCOVER.startId }],
    cursor: 0,
    answers: {},
    draft: null,
    job: null,
    shapeHold: [],
    resumeAt: null,
    anchor: null,
    arrived: [],
  });
}

export function rewindWalk(walk: MayaWalk, index: number): MayaWalk {
  if (index < 0 || index >= walk.cursor || index >= walk.path.length) {
    return walk;
  }
  return {
    ...walk,
    cursor: index,
    shapeHold: [],
    action: undefined,
    resumeAt: walk.resumeAt ?? walk.cursor,
    anchor: walk.anchor ?? snapOf(walk),
  };
}

/** Another job-flow goal starts again at the area question. Age and temperature stay. */
export function jobAnotherWalk(answers: MayaAnswers): MayaWalk {
  const kept: MayaAnswers = {};
  if (typeof answers.age === 'string' && answers.age) {
    kept.age = answers.age;
  }
  if (typeof answers.temp === 'string' && answers.temp) {
    kept.temp = answers.temp;
  }
  return land({
    path: [{ kind: 'discover', id: 'area' }],
    cursor: 0,
    answers: kept,
    draft: null,
    job: null,
    shapeHold: [],
    resumeAt: null,
    anchor: null,
    arrived: [],
  });
}

export function nextGoalWalk(answers: MayaAnswers): MayaWalk {
  const kept: MayaAnswers = {};
  if (typeof answers.age === 'string' && answers.age) {
    kept.age = answers.age;
  }
  if (typeof answers.temp === 'string' && answers.temp) {
    kept.temp = answers.temp;
  }
  return land({
    path: [{ kind: 'discover', id: kept.temp ? 'area' : 'temp' }],
    cursor: 0,
    answers: kept,
    draft: null,
    job: null,
    shapeHold: [],
    resumeAt: null,
    anchor: null,
    arrived: [],
  });
}

export function areaCommitted(walk: MayaWalk): boolean {
  const index = walk.path.findIndex(
    (step) => step.kind === 'discover' && step.id === MAYA_DISCOVER.areaId,
  );
  if (index < 0 || walk.cursor <= index) {
    return false;
  }
  const value = walk.answers[MAYA_DISCOVER.areaId];
  if (typeof value === 'string') {
    return value.length > 0;
  }
  return Array.isArray(value) && value.length > 0;
}

export function stepReached(walk: MayaWalk, kind: StepRef['kind'], id: string): boolean {
  const index = walk.path.findIndex((step) => step.kind === kind && step.id === id);
  return index >= 0 && index <= walk.cursor && index < walk.path.length;
}

export function stepCompleted(walk: MayaWalk, kind: StepRef['kind'], id: string): boolean {
  const index = walk.path.findIndex((step) => step.kind === kind && step.id === id);
  return index >= 0 && index < walk.cursor;
}

export function discoverAnswerLabel(id: string, answers: MayaAnswers): string {
  const node = nodeById(MAYA_DISCOVER, id);
  if (!node) {
    return '';
  }
  const value = answers[id];
  if (node.kind === 'multi') {
    const ids = Array.isArray(value) ? value : [];
    return (node.options ?? [])
      .filter((option) => ids.includes(option.id))
      .map((option) => option.label)
      .join(', ');
  }
  if (node.kind === 'scale') {
    return typeof value === 'number' ? String(value) : '';
  }
  if (typeof value !== 'string' || !value) {
    return '';
  }
  const options = node.optionsFrom ? visibleOptions(MAYA_DISCOVER, node, answers) : (node.options ?? []);
  return options.find((option) => option.id === value)?.label ?? value;
}

/** Move past the question at the cursor. A repeated answer keeps what followed; a new one starts over. */
export function continueWalk(walk: MayaWalk, options: WalkOptions): MayaWalk {
  const current = walk.path[walk.cursor];
  if (!current || walk.cursor >= walk.path.length) {
    return walk;
  }
  if (isRewind(walk) && answerUnchanged(walk)) {
    return restoreRewind(walk);
  }
  const start = isRewind(walk) ? discardForward(walk, options) : { ...walk, action: undefined };
  return advance(start, options);
}

function advance(start: MayaWalk, options: WalkOptions): MayaWalk {
  let path = start.path.slice(0, start.cursor + 1);
  let tail = start.path.slice(start.cursor + 1);
  let shapeHold = [...start.shapeHold];
  let answers = start.answers;
  let draft = start.draft;
  let job = start.job;
  let guard = 0;

  const finish = (cursor: number, action?: MayaWalk['action']): MayaWalk =>
    land({
      path: [...path, ...tail],
      cursor,
      answers,
      draft,
      job,
      shapeHold,
      resumeAt: null,
      anchor: null,
      arrived: start.arrived,
      action,
    });

  while (guard < 40) {
    guard += 1;
    const current = path[path.length - 1];
    if (!current) {
      return finish(0);
    }

    if (current.kind === 'job') {
      return finish(path.length - 1);
    }

    if (current.kind === 'shape') {
      const stepped = stepShape(current.id, path, tail, shapeHold, answers, options);
      path = stepped.path;
      tail = stepped.tail;
      shapeHold = stepped.shapeHold;
      if (stepped.done) {
        return finish(path.length - 1);
      }
      continue;
    }

    const node = nodeById(MAYA_DISCOVER, current.id);
    if (!node) {
      return finish(path.length - 1);
    }
    const skipped = skipKnown(resolveNext(MAYA_DISCOVER, node, answers), answers, options);
    answers = skipped.answers;
    const step = skipped.step;
    if (step.type === 'stay') {
      return finish(path.length - 1);
    }
    if (step.type === 'setup') {
      return finish(path.length - 1, 'setup');
    }
    if (step.type === 'close') {
      return finish(path.length - 1, 'close');
    }
    if (step.type === 'shape') {
      const entered = beginShape(path, tail, shapeHold, answers, draft, options);
      return land({
        path: entered.path,
        cursor: entered.cursor,
        answers,
        draft: entered.draft,
        job,
        shapeHold: entered.shapeHold,
        resumeAt: null,
        anchor: null,
        arrived: start.arrived,
      });
    }
    if (step.type === 'node' && step.id === 'job-entry') {
      return beginJob(path, answers, draft, options, start.arrived);
    }
    if (step.type !== 'node') {
      return finish(path.length - 1);
    }

    const next = takeDiscover(step.id, path, tail, shapeHold, answers);
    path = next.path;
    tail = next.tail;
    shapeHold = next.shapeHold;
    answers = next.answers;
    if (next.done) {
      return finish(path.length - 1);
    }
  }

  return finish(Math.max(0, path.length - 1));
}

function stepShape(
  currentId: ShapeStepId,
  path: StepRef[],
  tail: StepRef[],
  shapeHold: StepRef[],
  answers: MayaAnswers,
  options: WalkOptions,
): { path: StepRef[]; tail: StepRef[]; shapeHold: StepRef[]; done: boolean } {
  const sequence = shapeSequence(answers, options.askLevel);
  const index = sequence.indexOf(currentId);
  const nextId = index >= 0 ? sequence[index + 1] : undefined;
  if (!nextId) {
    return { path, tail, shapeHold, done: true };
  }
  const tailMatch = tail[0]?.kind === 'shape' && tail[0].id === nextId;
  const holdMatch = !tailMatch && shapeHold[0]?.kind === 'shape' && shapeHold[0].id === nextId;
  if (!tailMatch && !holdMatch) {
    return {
      path: [...path, { kind: 'shape', id: nextId }],
      tail: [],
      shapeHold: [
        ...shapeHold,
        ...tail.filter(
          (step) => step.kind === 'shape' && !shapeHold.some((held) => held.kind === 'shape' && held.id === step.id),
        ),
      ],
      done: true,
    };
  }
  const more = tailMatch ? tail.length > 1 || shapeHold.length > 0 : shapeHold.length > 1;
  const taken = takeHeld(nextId, tail, shapeHold);
  const step = taken.step ?? { kind: 'shape' as const, id: nextId };
  return {
    path: [...path, step],
    tail: taken.tail,
    shapeHold: taken.shapeHold,
    done: nextId === 'summary' || !more,
  };
}

function takeHeld(
  id: ShapeStepId,
  tail: StepRef[],
  shapeHold: StepRef[],
): { step: StepRef | null; tail: StepRef[]; shapeHold: StepRef[] } {
  if (tail[0]?.kind === 'shape' && tail[0].id === id) {
    return {
      step: tail[0],
      tail: tail.slice(1),
      shapeHold: shapeHold.filter((step) => !(step.kind === 'shape' && step.id === id)),
    };
  }
  const holdIndex = shapeHold.findIndex((step) => step.kind === 'shape' && step.id === id);
  if (holdIndex === 0) {
    return { step: shapeHold[0] ?? null, tail, shapeHold: shapeHold.slice(1) };
  }
  return { step: null, tail, shapeHold };
}

function takeDiscover(
  id: string,
  path: StepRef[],
  tail: StepRef[],
  shapeHold: StepRef[],
  answers: MayaAnswers,
): { path: StepRef[]; tail: StepRef[]; shapeHold: StepRef[]; answers: MayaAnswers; done: boolean } {
  const seen = path.some((step) => step.kind === 'discover' && step.id === id);
  const reask = seen && (id === MAYA_DISCOVER.areaId || BRANCH_IDS.has(id));
  if (reask) {
    return askFresh(id, path, tail, shapeHold, answers);
  }

  if (tail[0]?.kind === 'discover' && tail[0].id === id) {
    const matched = tail[0];
    const rest = tail.slice(1);
    const keepWalking = passedQuestion(id, rest, shapeHold, answers);
    return {
      path: [...path, matched],
      tail: rest,
      shapeHold,
      answers,
      done: !keepWalking,
    };
  }

  const at = tail.findIndex((step) => step.kind === 'discover' && step.id === id);
  if (at >= 0) {
    const skipped = tail.slice(0, at);
    const matched = tail[at];
    const rest = tail.slice(at + 1);
    if (!matched) {
      return askFresh(id, path, tail, shapeHold, answers);
    }
    const nextHold = [
      ...shapeHold,
      ...skipped.filter((step) => step.kind === 'shape'),
      ...rest.filter((step) => step.kind === 'shape'),
    ];
    const keepWalking = passedQuestion(id, rest, nextHold, answers);
    return {
      path: [...path, matched],
      tail: rest.filter((step) => step.kind === 'discover'),
      shapeHold: nextHold,
      answers: withoutBranch(answers, skipped, id),
      done: !keepWalking,
    };
  }

  const node = nodeById(MAYA_DISCOVER, id);
  if (node && isAnswered(node, answers) && KEPT_ON_REJOIN.has(id)) {
    const kept = parkShape(tail, shapeHold);
    return {
      path: [...path, { kind: 'discover', id }],
      tail: [],
      shapeHold: kept.shapeHold,
      answers: withoutBranch(answers, tail, id),
      done: false,
    };
  }

  return askFresh(id, path, tail, shapeHold, answers);
}

function askFresh(
  id: string,
  path: StepRef[],
  tail: StepRef[],
  shapeHold: StepRef[],
  answers: MayaAnswers,
): { path: StepRef[]; tail: StepRef[]; shapeHold: StepRef[]; answers: MayaAnswers; done: boolean } {
  const kept = parkShape(tail, shapeHold);
  let nextAnswers = withoutBranch(answers, tail, id);
  if (id === 'playback') {
    const copy = { ...nextAnswers };
    delete copy.playback;
    nextAnswers = copy;
  }
  return {
    path: [...path, { kind: 'discover', id }],
    tail: [],
    shapeHold: kept.shapeHold,
    answers: nextAnswers,
    done: true,
  };
}

/** True when this question was already left behind, so its answer can be restored. */
function passedQuestion(
  id: string,
  after: StepRef[],
  shapeHold: StepRef[],
  answers: MayaAnswers,
): boolean {
  const movedOn = after.length > 0 || shapeHold.some((step) => step.kind === 'shape');
  if (!movedOn) {
    return false;
  }
  const node = nodeById(MAYA_DISCOVER, id);
  if (!node) {
    return false;
  }
  return isAnswered(node, answers) || node.skippable === true;
}

function parkShape(tail: StepRef[], shapeHold: StepRef[]): { shapeHold: StepRef[] } {
  return { shapeHold: [...shapeHold, ...tail.filter((step) => step.kind === 'shape')] };
}

function withoutBranch(answers: MayaAnswers, skipped: StepRef[], keepId: string): MayaAnswers {
  let changed = false;
  const next = { ...answers };
  for (const step of skipped) {
    if (step.kind === 'discover' && BRANCH_IDS.has(step.id) && step.id !== keepId) {
      delete next[step.id];
      changed = true;
    }
  }
  return changed ? next : answers;
}

function beginShape(
  path: StepRef[],
  tail: StepRef[],
  shapeHold: StepRef[],
  answers: MayaAnswers,
  draft: ShapeDraft | null,
  options: WalkOptions,
): { path: StepRef[]; cursor: number; draft: ShapeDraft; shapeHold: StepRef[] } {
  const key = focusKey(answers);
  let nextDraft = draft;
  let hold = [...shapeHold, ...tail.filter((step) => step.kind === 'shape')];
  if (!nextDraft || nextDraft.focusKey !== key) {
    nextDraft = { ...createShapeDraft(answers), level: options.level };
    hold = [];
  }
  const sequence = shapeSequence(answers, options.askLevel);
  let nextPath = path;
  for (const id of sequence) {
    if (id === 'summary') {
      const summary = hold.find((step) => step.kind === 'shape' && step.id === 'summary');
      nextPath = [...nextPath, summary ?? { kind: 'shape', id: 'summary' }];
      return { path: nextPath, cursor: nextPath.length - 1, draft: nextDraft, shapeHold: [] };
    }
    const nextHold = hold.find((step) => step.kind === 'shape');
    if (nextHold?.kind === 'shape' && nextHold.id === id) {
      const more = hold.filter((step) => step.kind === 'shape').length > 1;
      nextPath = [...nextPath, nextHold];
      hold = hold.filter((step) => step !== nextHold);
      if (!more) {
        return { path: nextPath, cursor: nextPath.length - 1, draft: nextDraft, shapeHold: hold };
      }
      continue;
    }
    nextPath = [...nextPath, { kind: 'shape', id }];
    return { path: nextPath, cursor: nextPath.length - 1, draft: nextDraft, shapeHold: hold };
  }
  return {
    path: nextPath,
    cursor: Math.max(0, nextPath.length - 1),
    draft: nextDraft,
    shapeHold: hold,
  };
}

function skipKnown(
  step: MayaStep,
  answers: MayaAnswers,
  options: WalkOptions,
): { step: MayaStep; answers: MayaAnswers } {
  let next = step;
  let nextAnswers = answers;
  if (options.ageKnown && next.type === 'node' && next.id === 'age') {
    const age = nodeById(MAYA_DISCOVER, 'age');
    if (age) {
      const skipped = resolveNext(MAYA_DISCOVER, age, nextAnswers);
      if (skipped.type !== 'stay') {
        next = skipped;
      }
    }
  }
  if (options.tempKnown && options.temp && next.type === 'node' && next.id === 'temp') {
    nextAnswers = { ...nextAnswers, temp: options.temp };
    const temp = nodeById(MAYA_DISCOVER, 'temp');
    if (temp) {
      const skipped = resolveNext(MAYA_DISCOVER, temp, nextAnswers);
      if (skipped.type !== 'stay') {
        next = skipped;
      }
    }
  }
  return { step: next, answers: nextAnswers };
}

function beginJob(
  path: StepRef[],
  answers: MayaAnswers,
  draft: ShapeDraft | null,
  options: WalkOptions,
  arrived: WalkSnap[],
): MayaWalk {
  const temp = typeof answers.temp === 'string' ? answers.temp : '';
  const nextPath: StepRef[] = [...path, { kind: 'job', id: 'why' }];
  return land({
    path: nextPath,
    cursor: nextPath.length - 1,
    answers,
    draft,
    job: createJobDraft(temp, options.level),
    shapeHold: [],
    resumeAt: null,
    anchor: null,
    arrived,
  });
}

/** Move one step in the Get a job flow. The patch is the answer just given. */
export function continueJob(walk: MayaWalk, patch: Partial<JobDraft>, options: WalkOptions): MayaWalk {
  const step = walk.path[walk.cursor];
  if (!step || step.kind !== 'job' || !walk.job) {
    return walk;
  }
  const merged: JobDraft = { ...walk.job, ...patch };
  if (isRewind(walk) && walk.anchor?.job && jobFieldsEqual(step.id, merged, walk.anchor.job)) {
    return restoreRewind(walk);
  }
  const base = isRewind(walk) ? jobBase(walk, step.id, merged, options) : walk.job;
  const move = submitJob(base, step.id, patch, options.askLevel);
  const source = isRewind(walk) ? discardForward(walk, options) : walk;
  if (move.type === 'area') {
    return leaveJobForArea(source);
  }
  const job = move.job;
  if (move.type === 'save' || move.type === 'own') {
    return { ...source, job, action: move.type };
  }
  const path = [...source.path.slice(0, source.cursor + 1), { kind: 'job' as const, id: move.id }];
  return land({
    path,
    cursor: path.length - 1,
    answers: source.answers,
    draft: source.draft,
    job,
    shapeHold: [],
    resumeAt: null,
    anchor: null,
    arrived: source.arrived,
  });
}

function leaveJobForArea(walk: MayaWalk): MayaWalk {
  const index = walk.path.findIndex((step) => step.kind === 'discover' && step.id === 'area');
  const path = index >= 0 ? walk.path.slice(0, index + 1) : [{ kind: 'discover' as const, id: 'area' }];
  const answers = { ...walk.answers };
  delete answers.area;
  delete answers.pickOne;
  return land({
    path,
    cursor: path.length - 1,
    answers,
    draft: null,
    job: null,
    shapeHold: [],
    resumeAt: null,
    anchor: null,
    arrived: walk.arrived.slice(0, path.length),
  });
}

const JOB_FIELDS: Record<JobStepId, (keyof JobDraft)[]> = {
  why: ['why'],
  importance: ['importance'],
  importanceLow: ['lowChoice'],
  stage: ['stage'],
  date: ['dateChoice', 'targetDate'],
  hours: ['hours', 'hoursConfirmed'],
  tight: ['tightChoice'],
  hold: ['follow'],
  block: ['blockTime'],
  start: ['startWith'],
  coach: ['steps', 'stepsFor'],
  card: ['title', 'targetDate', 'dateChoice', 'steps'],
  helper: ['helper'],
  invite: ['invite'],
  helperLater: [],
  level: ['level', 'levelChosen'],
};

const SHAPE_FIELDS: Record<ShapeStepId, (keyof ShapeDraft)[]> = {
  coach: ['steps'],
  name: ['title'],
  habit: ['habitChoice', 'habitCustom', 'days', 'habitSkipped'],
  helper: ['helper'],
  level: ['level'],
  summary: ['title', 'targetDate', 'steps', 'habitChoice', 'habitCustom', 'days', 'habitSkipped', 'helper'],
};

function isRewind(walk: MayaWalk): boolean {
  return walk.resumeAt != null && walk.anchor != null && walk.resumeAt > walk.cursor;
}

function restoreRewind(walk: MayaWalk): MayaWalk {
  return {
    ...walk,
    cursor: walk.resumeAt ?? walk.cursor,
    resumeAt: null,
    anchor: null,
    action: undefined,
  };
}

function answerUnchanged(walk: MayaWalk): boolean {
  const step = walk.path[walk.cursor];
  const anchor = walk.anchor;
  if (!step || !anchor) {
    return false;
  }
  if (step.kind === 'discover') {
    return sameValue(walk.answers[step.id], anchor.answers[step.id]);
  }
  if (step.kind === 'shape') {
    return walk.draft != null && anchor.draft != null && shapeFieldsEqual(step.id, walk.draft, anchor.draft);
  }
  return walk.job != null && anchor.job != null && jobFieldsEqual(step.id, walk.job, anchor.job);
}

/** Drop the chat after the question being changed and rebuild what that question owns. */
function discardForward(walk: MayaWalk, options: WalkOptions): MayaWalk {
  const step = walk.path[walk.cursor];
  const path = walk.path.slice(0, walk.cursor + 1);
  const snap = walk.arrived[walk.cursor];
  const answers = answersAfterChange(walk, path);
  let draft: ShapeDraft | null = path.some((item) => item.kind === 'shape')
    ? cloneDraft(snap?.draft ?? walk.draft)
    : null;
  const job = path.some((item) => item.kind === 'job') ? cloneJob(snap?.job ?? walk.job) : null;
  if (step?.kind === 'shape' && walk.draft) {
    draft = shapeBase(snap?.draft ?? null, walk.draft, step.id, answers, options);
  }
  return {
    ...walk,
    path,
    answers,
    draft,
    job,
    shapeHold: [],
    resumeAt: null,
    anchor: null,
    arrived: walk.arrived.slice(0, path.length),
    action: undefined,
  };
}

function answersAfterChange(walk: MayaWalk, path: StepRef[]): MayaAnswers {
  const step = path[path.length - 1];
  const snap = walk.arrived[walk.cursor];
  const answers: MayaAnswers = { ...(snap ? cloneAnswers(snap.answers) : {}) };
  if (step?.kind === 'discover') {
    const value = walk.answers[step.id];
    if (value === undefined) {
      delete answers[step.id];
    } else {
      answers[step.id] = cloneAnswer(value);
    }
  }
  const kept = walk.anchor?.answers ?? walk.answers;
  if (step?.kind !== 'discover' || step.id !== 'age') {
    if (kept.age !== undefined) {
      answers.age = kept.age;
    }
  }
  if (step?.kind !== 'discover' || step.id !== 'temp') {
    if (kept.temp !== undefined) {
      answers.temp = kept.temp;
    }
  }
  const ids = new Set(path.filter((item) => item.kind === 'discover').map((item) => item.id));
  const next: MayaAnswers = {};
  for (const [key, value] of Object.entries(answers)) {
    if (ids.has(key) || key === 'age' || key === 'temp') {
      next[key] = value;
    }
  }
  return next;
}

function shapeBase(
  snap: ShapeDraft | null,
  live: ShapeDraft,
  step: ShapeStepId,
  answers: MayaAnswers,
  options: WalkOptions,
): ShapeDraft {
  const base = snap ? cloneDraft(snap)! : createShapeDraft(answers, todayLocal(), options.level);
  copyFields(base, live, SHAPE_FIELDS[step]);
  return base;
}

function jobBase(walk: MayaWalk, step: JobStepId, merged: JobDraft, options: WalkOptions): JobDraft {
  const snap = walk.arrived[walk.cursor]?.job ?? null;
  if (!snap) {
    return merged;
  }
  const temp = typeof walk.answers.temp === 'string' ? walk.answers.temp : '';
  const base = cloneJob(snap) ?? createJobDraft(temp, options.level);
  copyFields(base, merged, JOB_FIELDS[step]);
  return base;
}

function jobFieldsEqual(step: JobStepId, left: JobDraft, right: JobDraft): boolean {
  return fieldsEqual(JOB_FIELDS[step], left, right);
}

function shapeFieldsEqual(step: ShapeStepId, left: ShapeDraft, right: ShapeDraft): boolean {
  return fieldsEqual(SHAPE_FIELDS[step], left, right);
}

function fieldsEqual<T>(fields: (keyof T)[], left: T, right: T): boolean {
  return fields.every((field) => JSON.stringify(left[field] ?? null) === JSON.stringify(right[field] ?? null));
}

function copyFields<T>(target: T, source: T, fields: (keyof T)[]): void {
  for (const field of fields) {
    const value = source[field];
    target[field] = (
      value != null && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value
    ) as T[keyof T];
  }
}

function land(walk: MayaWalk): MayaWalk {
  const arrived = walk.arrived.slice();
  if (!arrived[walk.cursor]) {
    arrived[walk.cursor] = snapOf(walk);
  }
  return { ...walk, arrived };
}

function snapOf(walk: MayaWalk): WalkSnap {
  return {
    answers: cloneAnswers(walk.answers),
    draft: cloneDraft(walk.draft),
    job: cloneJob(walk.job),
  };
}

function cloneAnswers(answers: MayaAnswers): MayaAnswers {
  return JSON.parse(JSON.stringify(answers)) as MayaAnswers;
}

function cloneAnswer(value: MayaAnswers[string]): MayaAnswers[string] {
  return JSON.parse(JSON.stringify(value)) as MayaAnswers[string];
}

function cloneDraft(draft: ShapeDraft | null): ShapeDraft | null {
  return draft ? (JSON.parse(JSON.stringify(draft)) as ShapeDraft) : null;
}

function cloneJob(job: JobDraft | null): JobDraft | null {
  return job ? (JSON.parse(JSON.stringify(job)) as JobDraft) : null;
}

function sameValue(left: MayaAnswers[string] | undefined, right: MayaAnswers[string] | undefined): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export function currentDiscoverNode(walk: MayaWalk): MayaNode | null {
  const step = walk.path[walk.cursor];
  if (!step || step.kind !== 'discover' || walk.cursor >= walk.path.length) {
    return null;
  }
  return nodeById(MAYA_DISCOVER, step.id);
}
