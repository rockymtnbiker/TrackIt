import { REFLECT_FLOW } from '../constants/maya/reflectFlow';
import { JOB_BRANCHES } from '../constants/maya/jobFlow';
import { DETAIL_LABELS, targetAmountLabel } from './goalDetailText';
import { periodTotalAsOf } from './asOfDate';
import {
  buildChildrenMap,
  isDaily,
  isRepeating,
  isTracked,
  needsNextStep,
  periodBounds,
  periodTarget,
  targetFor,
  timesPerDay,
  weekTargetFor,
} from './goalTree';
import { setGoalStatus } from './goalTreeApi';
import { isTight, type JobBranchId } from './mayaJob';
import { isCoachedBranch } from './reflectNextSteps';
import { todayLocal } from './localDate';
import { formatQty } from './reflectionFlow';
import type { WeekStart } from './settingsApi';
import type { Goal, GoalEntry } from '../types/goal';
import { endOfWeek, startOfWeek } from './week';
import { REFLECT_POINT } from './reflectPoint';

export type ReflectStepId = 'r3b' | 'r3c' | 'r3d';

export type ReflectR3b = 'well' | 'busy' | 'stuck' | 'fit';
export type ReflectR3c = 'yes' | 'notYet' | 'add' | 'walk' | 'unsure' | 'done';
export type ReflectR3d = 'date' | 'hours' | 'keep';
export type ReflectChipId = ReflectR3b | ReflectR3c | ReflectR3d;

export type ReflectAnswers = {
  r3b: ReflectR3b | null;
  r3c: ReflectR3c | null;
  r3d: ReflectR3d | null;
};

export type ReflectChip = { id: ReflectChipId; label: string };

export type ReflectPending = {
  step: ReflectStepId;
  prompt: string;
  chips: ReflectChip[];
};

export type ReflectTurn = {
  prompt: string;
  you: string;
  reply: string | null;
  showCoach: boolean;
};

export type ReflectExchange = {
  answers: ReflectAnswers;
  turns: ReflectTurn[];
  pending: ReflectPending | null;
};

export type ReflectSnapshot = {
  goal: Goal;
  nodes: Goal[];
  entries: GoalEntry[];
  weekStart: string;
  weekStartsOn: WeekStart;
  today: string;
};

export type ReflectEffect =
  | { type: 'point'; id: string }
  | { type: 'coach' }
  | { type: 'advance'; currentId: string; nextId: string; pointId: string }
  | { type: 'handoff'; mode: 'branch'; parentId: string; subject: string }
  | { type: 'handoff'; mode: 'walk'; subject: string };

export type ReflectChoiceResult = {
  you: string;
  reply: string | null;
  showCoach: boolean;
  effects: ReflectEffect[];
};

type JobBranch = { goal: Goal; id: JobBranchId };

function fill(template: string, values: Record<string, string>): string {
  let text = template;
  for (const [key, value] of Object.entries(values)) {
    text = text.split(`[${key}]`).join(value);
  }
  return text;
}

function goalLabel(goal: Goal): string {
  return goal.title.trim() || 'Untitled';
}

function withName(template: string, name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return template.replace(', [name]', '');
  }
  return template.replace('[name]', trimmed);
}

/**
 * A Maya job goal is a top-level goal whose branch-titled children are a suffix of
 * Decide → Update resume → Apply and interview, in that order. The job flow stores
 * no separate flag.
 */
export function mayaJobBranches(goal: Goal, nodes: Goal[]): JobBranch[] | null {
  if (goal.parentId != null) {
    return null;
  }
  const children = buildChildrenMap(nodes).get(goal.id) ?? [];
  const found: JobBranch[] = [];
  for (const child of children) {
    const match = JOB_BRANCHES.find((branch) => branch.title === child.title.trim());
    if (match) {
      found.push({ goal: child, id: match.id });
    }
  }
  if (found.length === 0) {
    return null;
  }
  const order = JOB_BRANCHES.map((branch) => branch.id);
  const ids = found.map((item) => item.id);
  const suffix = order.some((_, start) => {
    const slice = order.slice(start);
    return slice.length === ids.length && slice.every((id, index) => id === ids[index]);
  });
  return suffix ? found : null;
}

function currentBranch(branches: JobBranch[]): JobBranch | null {
  return branches.find((item) => item.goal.status === 'active') ?? null;
}

function nextPendingBranch(branches: JobBranch[], current: JobBranch): JobBranch | null {
  const index = branches.findIndex((item) => item.goal.id === current.goal.id);
  return branches.slice(index + 1).find((item) => item.goal.status === 'pending') ?? null;
}

export type ReflectWeekStat = {
  total: number;
  target: number;
  /** "30 / 60 minutes" or "2 of 3". */
  count: string;
  /** Target phrase used as [T]. */
  targetLabel: string;
  /** "minutes" or "sessions". */
  noun: string;
  percent: number;
};

function reflectAsOf(weekStart: string, weekStartsOn: WeekStart, today: string): string {
  return weekStart === startOfWeek(today, weekStartsOn) ? today : endOfWeek(weekStart, weekStartsOn);
}

function buildStat(goal: Goal, total: number, target: number): ReflectWeekStat {
  const percent = Math.round((total / target) * 100);
  const tracked = isTracked(goal);
  const noun = tracked && goal.unit ? goal.unit : 'sessions';
  const targetLabel = tracked
    ? `${formatQty(target)} ${goal.unit ?? ''}`.trim()
    : formatQty(target);
  const count = tracked
    ? `${formatQty(total)} / ${formatQty(target)} ${goal.unit ?? ''}`.trim()
    : isDaily(goal)
      ? `${formatQty(total)} of ${formatQty(target)} days`
      : `${formatQty(total)} of ${formatQty(target)}`;
  return { total, target, count, targetLabel, noun, percent };
}

/** Reflected week's count. Null when the goal has no weekly target. Monthly stays out so parent summaries do not change. */
export function reflectWeekStat(
  goal: Goal,
  entries: GoalEntry[],
  weekStart: string,
  weekStartsOn: WeekStart,
  today: string,
): ReflectWeekStat | null {
  if (!isRepeating(goal) || goal.repeatPeriod === 'month') {
    return null;
  }
  const { target } = weekTargetFor(goal, weekStart, weekStartsOn);
  if (target == null || target <= 0) {
    return null;
  }
  const total = periodTotalAsOf(
    goal,
    entries,
    reflectAsOf(weekStart, weekStartsOn, today),
    weekStartsOn,
  );
  return buildStat(goal, total, target);
}

/** Month containing the reflected week. Leaf comments only. */
function monthStat(goal: Goal, snapshot: ReflectSnapshot): ReflectWeekStat | null {
  if (!isRepeating(goal) || goal.repeatPeriod !== 'month') {
    return null;
  }
  const asOf = reflectAsOf(snapshot.weekStart, snapshot.weekStartsOn, snapshot.today);
  const target = periodTarget(goal, asOf, snapshot.weekStartsOn);
  if (target == null || target <= 0) {
    return null;
  }
  const total = periodTotalAsOf(goal, snapshot.entries, asOf, snapshot.weekStartsOn);
  return buildStat(goal, total, target);
}

export type ReflectCommentLine = {
  text: string;
  /** Step row. Sits closer than a new paragraph. */
  bullet?: boolean;
};

export type ReflectWeekComment = {
  lines: ReflectCommentLine[];
  /** Existing point-to id, or null when nothing is outlined. */
  pointId: string | null;
  coach: boolean;
  /** Opens that step's Goal page in reflect mode. */
  openStep: { id: string; label: string } | null;
};

function comment(
  text: string,
  options: { pointId?: string | null; coach?: boolean } = {},
): ReflectWeekComment {
  return {
    lines: [{ text }],
    pointId: options.pointId ?? null,
    coach: options.coach === true,
    openStep: null,
  };
}

const QUIET_COMMENT: ReflectWeekComment = {
  lines: [],
  pointId: null,
  coach: false,
  openStep: null,
};

/** Depth-first, sibling sort order. Does not include the goal itself. */
function stepsBelow(goal: Goal, nodes: Goal[]): Goal[] {
  const map = buildChildrenMap(nodes);
  const steps: Goal[] = [];
  const walk = (id: string) => {
    for (const child of map.get(id) ?? []) {
      steps.push(child);
      walk(child.id);
    }
  };
  walk(goal.id);
  return steps;
}

function weekStat(goal: Goal, snapshot: ReflectSnapshot): ReflectWeekStat | null {
  return reflectWeekStat(
    goal,
    snapshot.entries,
    snapshot.weekStart,
    snapshot.weekStartsOn,
    snapshot.today,
  );
}

/**
 * Parent goals. Null lets the leaf comment run, including the generic fallback.
 * An empty comment means What's next already covers this goal.
 */
function parentWeekComment(snapshot: ReflectSnapshot): ReflectWeekComment | null {
  const goal = goalLabel(snapshot.goal);
  const below = stepsBelow(snapshot.goal, snapshot.nodes);
  if (below.length === 0) {
    if (weekStat(snapshot.goal, snapshot) || monthStat(snapshot.goal, snapshot)) {
      return null;
    }
    return comment(fill(REFLECT_FLOW.r3b.parentNone, { goal }), { pointId: REFLECT_POINT.addStep });
  }

  const ranked = below
    .filter((step) => isRepeating(step))
    .map((step, index) => ({ step, index, stat: weekStat(step, snapshot) }))
    .filter((item): item is { step: Goal; index: number; stat: ReflectWeekStat } => item.stat != null)
    .sort((a, b) => a.stat.percent - b.stat.percent || a.index - b.index);

  if (below.some((step) => isRepeating(step))) {
    if (ranked.length === 0) {
      return null;
    }
    const lowest = ranked[0];
    if (!lowest) {
      return null;
    }
    const allHit = ranked.every((item) => item.stat.percent >= 100);
    const overall = Math.round(
      ranked.reduce((sum, item) => sum + item.stat.percent, 0) / ranked.length,
    );
    const lines: ReflectCommentLine[] = [
      { text: fill(REFLECT_FLOW.r3b.parentWeek, { goal }) },
      ...ranked.slice(0, 3).map((item) => ({
        bullet: true,
        text: fill(REFLECT_FLOW.r3b.parentBullet, {
          step: goalLabel(item.step),
          'N / T unit': item.stat.count,
          P: String(item.stat.percent),
        }),
      })),
      {
        text: allHit
          ? REFLECT_FLOW.r3b.parentAll
          : fill(REFLECT_FLOW.r3b.parentAttention, { 'lowest step': goalLabel(lowest.step) }),
      },
    ];
    const why = snapshot.goal.why?.trim() ?? '';
    if (overall < 50 && why) {
      lines.push({ text: fill(REFLECT_FLOW.r3b.parentWhy, { why }) });
    }
    return {
      lines,
      pointId: null,
      coach: false,
      openStep: allHit
        ? null
        : {
            id: lowest.step.id,
            label: fill(REFLECT_FLOW.r3b.parentOpen, { 'lowest step': goalLabel(lowest.step) }),
          },
    };
  }

  const leaves = below.filter((step) => !below.some((other) => other.parentId === step.id));
  const done = leaves.filter((step) => step.status === 'done').length;
  if (leaves.length > 0 && done === leaves.length) {
    return QUIET_COMMENT;
  }
  const next = leaves.find((step) => step.status !== 'done');
  if (!next) {
    return null;
  }
  return comment(
    fill(REFLECT_FLOW.r3b.parentOneTime, {
      done: String(done),
      total: String(leaves.length),
      goal,
      'first open step in plan order': goalLabel(next),
    }),
    { pointId: REFLECT_POINT.step(next.id) },
  );
}

/** Target in effect for the reflected week, or the month that contains it. */
function goalInEffect(goal: Goal, snapshot: ReflectSnapshot): Goal {
  const asOf = reflectAsOf(snapshot.weekStart, snapshot.weekStartsOn, snapshot.today);
  const range = periodBounds(goal, asOf, snapshot.weekStartsOn);
  return { ...goal, ...targetFor(goal, range.start, range.end) };
}

/**
 * Question after the "You got" line. "times" unless the step already has a unit.
 * Titles are not mined for a noun.
 */
function targetQuestion(goal: Goal, snapshot: ReflectSnapshot, stat: ReflectWeekStat): string {
  const view = goalInEffect(goal, snapshot);
  const stored =
    view.targetAmount != null && view.targetAmount > 0 ? view.targetAmount : null;
  const unit = view.unit?.trim() ?? '';
  if (view.repeatPeriod === 'month') {
    const count = stored ?? (view.plannedDays?.length || stat.target);
    return fill(REFLECT_FLOW.r3b.askMonth, {
      T: formatQty(count),
      noun: unit || 'times',
    });
  }
  if (unit) {
    const count = stored ?? stat.target;
    return fill(REFLECT_FLOW.r3b.askTrackedWeek, {
      'T unit': `${formatQty(count)} ${unit}`.trim(),
    });
  }
  if (isDaily(view)) {
    const perDay = timesPerDay(view);
    if (perDay > 1) {
      return fill(REFLECT_FLOW.r3b.askDailyTimes, { N: formatQty(perDay) });
    }
    return REFLECT_FLOW.r3b.askDaily;
  }
  const times = stored ?? (view.plannedDays?.length || stat.target);
  return fill(REFLECT_FLOW.r3b.askTimesWeek, { T: formatQty(times), noun: 'times' });
}

function bandComment(
  lead: string,
  tip: string,
  stat: ReflectWeekStat,
  goal: Goal,
  snapshot: ReflectSnapshot,
  coach: boolean,
): ReflectWeekComment {
  const opening = fill(lead, {
    'N / T unit': stat.count,
    P: String(stat.percent),
    T: stat.targetLabel,
  });
  return comment(`${opening} ${targetQuestion(goal, snapshot, stat)} ${tip}`, {
    pointId: REFLECT_POINT.target,
    coach,
  });
}

/** R3b comment. No chips. */
export function reflectWeekComment(snapshot: ReflectSnapshot): ReflectWeekComment {
  const parent = parentWeekComment(snapshot);
  if (parent) {
    return parent;
  }
  const goal = goalLabel(snapshot.goal);
  const stat = weekStat(snapshot.goal, snapshot) ?? monthStat(snapshot.goal, snapshot);
  if (!stat || stat.total <= 0) {
    if (!stat) {
      return comment(fill(REFLECT_FLOW.r3b.none, { goal }));
    }
    return comment(fill(REFLECT_FLOW.r3b.zero, { 'time/sessions': stat.noun, goal }), {
      coach: true,
    });
  }
  if (stat.percent >= 100) {
    return bandComment(REFLECT_FLOW.r3b.full, REFLECT_FLOW.r3b.tipHigh, stat, snapshot.goal, snapshot, false);
  }
  if (stat.percent >= 50) {
    return bandComment(
      REFLECT_FLOW.r3b.solid,
      REFLECT_FLOW.r3b.tipSolid,
      stat,
      snapshot.goal,
      snapshot,
      false,
    );
  }
  return bandComment(REFLECT_FLOW.r3b.low, REFLECT_FLOW.r3b.tipLow, stat, snapshot.goal, snapshot, true);
}

/** R3d comment when the job date is tight. No chips. */
export function reflectDateComment(snapshot: ReflectSnapshot): string | null {
  const branches = mayaJobBranches(snapshot.goal, snapshot.nodes);
  if (!branches) {
    return null;
  }
  const current = currentBranch(branches);
  const date = snapshot.goal.targetEndDate?.slice(0, 10) ?? '';
  if (!current || !date || !isTight(date, current.id, snapshot.today)) {
    return null;
  }
  return REFLECT_FLOW.r3d.comment;
}

/** Which detail-card row the reflection outlines. */
export function reflectDetailPoint(
  goal: Goal,
  sectionId: 'timeline' | 'track' | 'repeat' | 'notes',
  label: string,
): 'target' | 'targetEnd' | null {
  if (label === DETAIL_LABELS.targetEnd) {
    return 'targetEnd';
  }
  const repeating = goal.plannedDays != null;
  if (
    goal.unit != null &&
    goal.targetAmount != null &&
    goal.targetAmount > 0 &&
    sectionId === 'track' &&
    label === targetAmountLabel(true, repeating, goal.repeatPeriod)
  ) {
    return 'target';
  }
  if (
    goal.unit == null &&
    sectionId === 'repeat' &&
    label === DETAIL_LABELS.period &&
    (repeating || (goal.targetAmount != null && goal.targetAmount > 0))
  ) {
    return 'target';
  }
  return null;
}

function r3cPending(snapshot: ReflectSnapshot): ReflectPending | null {
  const branches = mayaJobBranches(snapshot.goal, snapshot.nodes);
  if (branches) {
    const current = currentBranch(branches);
    if (!current || !needsNextStep(current.goal, snapshot.nodes)) {
      return null;
    }
    const next = nextPendingBranch(branches, current);
    if (next) {
      return {
        step: 'r3c',
        prompt: fill(REFLECT_FLOW.r3c.job, {
          'current branch': goalLabel(current.goal),
          'next branch': goalLabel(next.goal),
        }),
        chips: [
          { id: 'yes', label: REFLECT_FLOW.r3c.yes },
          { id: 'notYet', label: REFLECT_FLOW.r3c.notYet },
        ],
      };
    }
    return {
      step: 'r3c',
      prompt: fill(REFLECT_FLOW.r3c.other, { 'goal or branch title': goalLabel(current.goal) }),
      chips: otherChips(),
    };
  }
  if (!needsNextStep(snapshot.goal, snapshot.nodes)) {
    return null;
  }
  return {
    step: 'r3c',
    prompt: fill(REFLECT_FLOW.r3c.other, { 'goal or branch title': goalLabel(snapshot.goal) }),
    chips: otherChips(),
  };
}

function otherChips(): ReflectChip[] {
  return [
    { id: 'add', label: REFLECT_FLOW.r3c.add },
    { id: 'walk', label: REFLECT_FLOW.r3c.walk },
    { id: 'unsure', label: REFLECT_FLOW.r3c.unsure },
    { id: 'done', label: REFLECT_FLOW.r3c.done },
  ];
}

export function reflectPending(
  after: 'start' | ReflectStepId,
  snapshot: ReflectSnapshot,
): ReflectPending | null {
  if (after === 'start' || after === 'r3b') {
    return r3cPending(snapshot);
  }
  return null;
}

export function reflectChoice(
  pending: ReflectPending,
  chipId: ReflectChipId,
  snapshot: ReflectSnapshot,
  name: string,
): ReflectChoiceResult | null {
  const chip = pending.chips.find((item) => item.id === chipId);
  if (!chip) {
    return null;
  }
  const you = fill(REFLECT_FLOW.you, { chip: chip.label });
  if (chipId === 'yes') {
    const branches = mayaJobBranches(snapshot.goal, snapshot.nodes);
    const current = branches ? currentBranch(branches) : null;
    const next = branches && current ? nextPendingBranch(branches, current) : null;
    if (!current || !next) {
      return null;
    }
    const subject = goalLabel(next.goal);
    if (isCoachedBranch(next.goal.title)) {
      return {
        you,
        reply: null,
        showCoach: false,
        effects: [
          {
            type: 'advance',
            currentId: current.goal.id,
            nextId: next.goal.id,
            pointId: REFLECT_POINT.step(next.goal.id),
          },
          { type: 'handoff', mode: 'branch', parentId: next.goal.id, subject },
        ],
      };
    }
    return {
      you,
      reply: fill(REFLECT_FLOW.r3c.yesReply, { 'next branch': subject }),
      showCoach: false,
      effects: [
        {
          type: 'advance',
          currentId: current.goal.id,
          nextId: next.goal.id,
          pointId: REFLECT_POINT.step(next.goal.id),
        },
      ],
    };
  }
  if (chipId === 'notYet') {
    return { you, reply: REFLECT_FLOW.r3c.notYetReply, showCoach: false, effects: [] };
  }
  if (chipId === 'add') {
    return {
      you,
      reply: null,
      showCoach: false,
      effects: [{ type: 'point', id: REFLECT_POINT.addStep }],
    };
  }
  if (chipId === 'walk') {
    const branches = mayaJobBranches(snapshot.goal, snapshot.nodes);
    const current = branches ? currentBranch(branches) : null;
    return {
      you,
      reply: null,
      showCoach: false,
      effects: [
        {
          type: 'handoff',
          mode: 'walk',
          subject: current ? goalLabel(current.goal) : goalLabel(snapshot.goal),
        },
      ],
    };
  }
  if (chipId === 'unsure') {
    return {
      you,
      reply: REFLECT_FLOW.r3c.unsureReply,
      showCoach: false,
      effects: [{ type: 'coach' }],
    };
  }
  if (chipId === 'done') {
    return {
      you,
      reply: withName(REFLECT_FLOW.r3c.doneReply, name),
      showCoach: false,
      effects: [{ type: 'point', id: REFLECT_POINT.status }],
    };
  }
  return null;
}

export function applyReflectAnswer(answers: ReflectAnswers, chipId: ReflectChipId): ReflectAnswers {
  if (chipId === 'well' || chipId === 'busy' || chipId === 'stuck' || chipId === 'fit') {
    return { ...answers, r3b: chipId };
  }
  if (
    chipId === 'yes' ||
    chipId === 'notYet' ||
    chipId === 'add' ||
    chipId === 'walk' ||
    chipId === 'unsure' ||
    chipId === 'done'
  ) {
    return { ...answers, r3c: chipId };
  }
  return { ...answers, r3d: chipId };
}

export const EMPTY_REFLECT_ANSWERS: ReflectAnswers = { r3b: null, r3c: null, r3d: null };

/** Mark the current branch done and the next one active. Dates go through setGoalStatus. */
export async function advanceJobBranch(
  currentId: string,
  nextId: string,
  today = todayLocal(),
): Promise<Goal[]> {
  const done = await setGoalStatus(currentId, 'done', today);
  try {
    const active = await setGoalStatus(nextId, 'active');
    return [done, active];
  } catch (error) {
    await setGoalStatus(currentId, 'active').catch(() => {});
    throw error;
  }
}
