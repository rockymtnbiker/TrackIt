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
import {
  createShapeDraft,
  focusKey,
  shapeSequence,
  type ShapeDraft,
  type ShapeStepId,
} from './mayaShape';

export type StepRef =
  | { kind: 'discover'; id: string }
  | { kind: 'shape'; id: ShapeStepId };

export type MayaWalk = {
  path: StepRef[];
  /** Index of the question being answered. Equal to path.length once the goal is saved. */
  cursor: number;
  answers: MayaAnswers;
  draft: ShapeDraft | null;
  /**
   * Shape steps cut off by a changed answer. Restored when the same coaching
   * focus is reached again; dropped when the focus changes.
   */
  shapeHold: StepRef[];
  action?: 'setup' | 'close';
};

export type WalkOptions = {
  ageKnown: boolean;
  askLevel: boolean;
  level: MayaLevel;
};

const BRANCH_IDS = new Set([
  'pickOne',
  'jobStage',
  'jobHard',
  'healthArea',
  'workoutHard',
  'eatHard',
  'sleepHard',
  'weightGoal',
]);

/** Answers restored automatically when a changed path rejoins the shared questions. */
const KEPT_ON_REJOIN = new Set(['better', 'want']);

export function initialWalk(): MayaWalk {
  return {
    path: [{ kind: 'discover', id: MAYA_DISCOVER.startId }],
    cursor: 0,
    answers: {},
    draft: null,
    shapeHold: [],
  };
}

export function rewindWalk(walk: MayaWalk, index: number): MayaWalk {
  if (index < 0 || index > walk.cursor || index >= walk.path.length) {
    return walk;
  }
  return { ...walk, cursor: index, shapeHold: [], action: undefined };
}

export function nextGoalWalk(answers: MayaAnswers): MayaWalk {
  const age = answers.age;
  return {
    path: [{ kind: 'discover', id: 'temp' }],
    cursor: 0,
    answers: typeof age === 'string' && age ? { age } : {},
    draft: null,
    shapeHold: [],
  };
}

export function areaCommitted(walk: MayaWalk): boolean {
  const index = walk.path.findIndex(
    (step) => step.kind === 'discover' && step.id === MAYA_DISCOVER.areaId,
  );
  if (index < 0 || walk.cursor <= index) {
    return false;
  }
  const value = walk.answers[MAYA_DISCOVER.areaId];
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

/** Move past the question at the cursor, restoring later answers that still apply. */
export function continueWalk(walk: MayaWalk, options: WalkOptions): MayaWalk {
  const current = walk.path[walk.cursor];
  if (!current || walk.cursor >= walk.path.length) {
    return walk;
  }
  return advance({ ...walk, action: undefined }, options);
}

function advance(start: MayaWalk, options: WalkOptions): MayaWalk {
  let path = start.path.slice(0, start.cursor + 1);
  let tail = start.path.slice(start.cursor + 1);
  let shapeHold = [...start.shapeHold];
  let answers = start.answers;
  let draft = start.draft;
  let guard = 0;

  const finish = (cursor: number, action?: MayaWalk['action']): MayaWalk => ({
    path: [...path, ...tail],
    cursor,
    answers,
    draft,
    shapeHold,
    action,
  });

  while (guard < 40) {
    guard += 1;
    const current = path[path.length - 1];
    if (!current) {
      return finish(0);
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
    const step = skipKnownAge(resolveNext(MAYA_DISCOVER, node, answers), options.ageKnown);
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
      return {
        path: entered.path,
        cursor: entered.cursor,
        answers,
        draft: entered.draft,
        shapeHold: entered.shapeHold,
      };
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

function skipKnownAge(step: MayaStep, ageKnown: boolean): MayaStep {
  if (!ageKnown || step.type !== 'node' || step.id !== 'age') {
    return step;
  }
  const age = nodeById(MAYA_DISCOVER, 'age');
  if (!age) {
    return step;
  }
  const next = resolveNext(MAYA_DISCOVER, age, {});
  return next.type === 'stay' ? step : next;
}

export function currentDiscoverNode(walk: MayaWalk): MayaNode | null {
  const step = walk.path[walk.cursor];
  if (!step || step.kind !== 'discover' || walk.cursor >= walk.path.length) {
    return null;
  }
  return nodeById(MAYA_DISCOVER, step.id);
}
