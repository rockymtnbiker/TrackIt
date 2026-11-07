import {
  REFLECTION_ANSWERS,
  REFLECTION_COPY,
  type ReflectionAnswerId,
} from '../constants/reflection';
import type { Connection } from '../types/community';
import type { Goal, GoalEntry } from '../types/goal';
import { WEEKDAY_SHORT_LABELS, addDays, getWeekday } from '../utils/date';
import { periodTotalAsOf } from './asOfDate';
import { goalStreaks } from './goalAnalysis';
import { buildChildrenMap, goalStartDate, isLeaf, isRepeating, weekTargetFor } from './goalTree';
import { parseLocalDate, todayLocal } from './localDate';
import type { CoachCheckin, PartnerCheckin, WeekReview } from './reviewApi';
import type { WeekStart } from './settingsApi';
import { getWeekProgressMessage } from './statusMessages';
import { endOfWeek, startOfWeek } from './week';
import { getWeeklyItems } from './weeklyReview';

export type AnswerRecord = { goal_id: string; answer: ReflectionAnswerId };

export function formatQty(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function planOrder(nodes: Goal[]): Goal[] {
  const childrenMap = buildChildrenMap(nodes);
  const ordered: Goal[] = [];
  const walk = (node: Goal) => {
    ordered.push(node);
    for (const child of childrenMap.get(node.id) ?? []) {
      walk(child);
    }
  };
  for (const root of childrenMap.get(null) ?? []) {
    walk(root);
  }
  const seen = new Set(ordered.map((node) => node.id));
  for (const node of nodes) {
    if (!seen.has(node.id)) {
      ordered.push(node);
    }
  }
  return ordered;
}

export function winLines(
  nodes: Goal[],
  entries: GoalEntry[],
  asOf: string,
  weekStart: string,
  weekStartsOn: WeekStart,
): string[] {
  const weekEnd = endOfWeek(weekStart, weekStartsOn);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const lines: string[] = [];
  const parentTitle = (goal: Goal): string | null => {
    if (goal.parentId == null) {
      return null;
    }
    return byId.get(goal.parentId)?.title ?? null;
  };
  const push = (goal: Goal, detail: string) => {
    const parent = parentTitle(goal);
    const name = goal.title || 'Untitled';
    lines.push(`${parent ? `${parent} · ` : ''}${name} · ${detail}`);
  };

  for (const goal of planOrder(nodes)) {
    if (isRepeating(goal)) {
      continue;
    }
    const completed = goal.actualEndDate?.slice(0, 10) || null;
    if (completed == null || completed < weekStart || completed > weekEnd || completed > asOf) {
      continue;
    }
    push(goal, REFLECTION_COPY.winDone.replace('[day]', WEEKDAY_SHORT_LABELS[getWeekday(completed)]));
  }
  for (const goal of planOrder(nodes)) {
    if (!isRepeating(goal)) {
      continue;
    }
    const { target } = weekTargetFor(goal, weekStart, weekStartsOn);
    if (target == null || target <= 0) {
      continue;
    }
    const total = periodTotalAsOf(goal, entries, asOf, weekStartsOn);
    if (total < target) {
      continue;
    }
    push(
      goal,
      REFLECTION_COPY.winMet.replace('[total]', formatQty(total)).replace('[target]', formatQty(target)),
    );
  }
  for (const goal of planOrder(nodes)) {
    if (!isRepeating(goal)) {
      continue;
    }
    const streak = goalStreaks(goal, entries, asOf, weekStartsOn);
    if (streak == null || streak.current < 3) {
      continue;
    }
    push(
      goal,
      REFLECTION_COPY.winStreak.replace('[count]', String(streak.current)).replace('[unit]', streak.unit),
    );
  }
  return lines.slice(0, 2);
}

function goalItems(goalId: string, nodes: Goal[], items: { goalId: string; partial: number }[]) {
  const childrenMap = buildChildrenMap(nodes);
  const ids = new Set<string>();
  const walk = (id: string) => {
    ids.add(id);
    for (const child of childrenMap.get(id) ?? []) {
      walk(child.id);
    }
  };
  walk(goalId);
  return items.filter((item) => ids.has(item.goalId));
}

export function candidatesFor(nodes: Goal[], weekEnd: string): Goal[] {
  return nodes
    .filter(
      (goal) => goal.parentId == null && goal.status !== 'done' && goalStartDate(goal) <= weekEnd,
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function pickLowest(
  nodes: Goal[],
  entries: GoalEntry[],
  weekStart: string,
  asOf: string,
  weekStartsOn: WeekStart,
): string[] {
  const review = getWeeklyItems(
    nodes,
    entries,
    parseLocalDate(weekStart),
    parseLocalDate(asOf),
    weekStartsOn,
  );
  const weekEnd = endOfWeek(weekStart, weekStartsOn);
  const ranked = candidatesFor(nodes, weekEnd)
    .map((goal) => {
      const mine = goalItems(goal.id, nodes, review.items);
      const pct = mine.length === 0 ? 0 : mine.reduce((sum, item) => sum + item.partial, 0) / mine.length;
      return { id: goal.id, pct, sortOrder: goal.sortOrder };
    })
    .filter((row) => row.pct < 1)
    .sort((a, b) => a.pct - b.pct || a.sortOrder - b.sortOrder);
  return ranked.slice(0, 2).map((row) => row.id);
}

export function personName(connection: Connection): string {
  return connection.displayName?.trim() || connection.email?.trim() || 'your accountability partner';
}

export function describeChanges(before: Goal[], after: Goal[]): string[] {
  const lines: string[] = [];
  const previous = new Map(before.map((goal) => [goal.id, goal]));
  const nextIds = new Set(after.map((goal) => goal.id));
  for (const goal of after) {
    const title = goal.title || 'Untitled';
    const old = previous.get(goal.id);
    if (!old) {
      lines.push(REFLECTION_COPY.addedStep.replace('[title]', title));
      continue;
    }
    if (old.title !== goal.title) {
      lines.push(
        REFLECTION_COPY.renamedStep
          .replace('[from]', old.title || 'Untitled')
          .replace('[to]', title),
      );
    }
    if (old.status !== 'done' && goal.status === 'done') {
      lines.push(REFLECTION_COPY.markedDone.replace('[title]', title));
    }
    if (!(old.why ?? '').trim() && (goal.why ?? '').trim()) {
      lines.push(REFLECTION_COPY.addedWhy.replace('[title]', title));
    }
    if (old.reminderTime !== goal.reminderTime && goal.reminderTime) {
      lines.push(REFLECTION_COPY.setReminder.replace('[title]', title));
    }
    if ((old.targetEndDate ?? null) !== (goal.targetEndDate ?? null)) {
      lines.push(REFLECTION_COPY.changedDate.replace('[title]', title));
    }
    const daysChanged = JSON.stringify(old.plannedDays) !== JSON.stringify(goal.plannedDays);
    const amountChanged = old.targetAmount !== goal.targetAmount;
    if (isRepeating(goal) && (daysChanged || amountChanged)) {
      lines.push(REFLECTION_COPY.changedHabit.replace('[title]', title));
    }
  }
  for (const goal of before) {
    if (!nextIds.has(goal.id)) {
      lines.push(REFLECTION_COPY.removedStep.replace('[title]', goal.title || 'Untitled'));
    }
  }
  return lines;
}

export function copyGoals(goals: Goal[]): Goal[] {
  return goals.map((goal) => ({
    ...goal,
    plannedDays: goal.plannedDays ? [...goal.plannedDays] : null,
  }));
}

function subtreeOf(goalId: string, nodes: Goal[]): Goal[] {
  const childrenMap = buildChildrenMap(nodes);
  const ids = new Set<string>();
  const walk = (id: string) => {
    if (ids.has(id)) {
      return;
    }
    ids.add(id);
    for (const child of childrenMap.get(id) ?? []) {
      walk(child.id);
    }
  };
  if (!nodes.some((goal) => goal.id === goalId)) {
    return [];
  }
  walk(goalId);
  return nodes.filter((goal) => ids.has(goal.id));
}

function sameDays(left: number[] | null, right: number[] | null): boolean {
  if ((left == null) !== (right == null)) {
    return false;
  }
  const a = [...(left ?? [])].sort((one, two) => one - two);
  const b = [...(right ?? [])].sort((one, two) => one - two);
  return a.length === b.length && a.every((day, index) => day === b[index]);
}

/** Differences from the goal page, in the same lines Adjust already uses. */
export function goalPageChanges(goalId: string, beforeNodes: Goal[], afterNodes: Goal[]): string[] {
  const before = subtreeOf(goalId, beforeNodes);
  const after = subtreeOf(goalId, afterNodes);
  const lines = describeChanges(before, after);
  const previous = new Map(before.map((goal) => [goal.id, goal]));
  let unmatched = false;
  for (const goal of after) {
    const old = previous.get(goal.id);
    if (!old) {
      continue;
    }
    const whyBefore = (old.why ?? '').trim();
    const whyAfter = (goal.why ?? '').trim();
    if (whyBefore !== whyAfter && !(!whyBefore && whyAfter)) {
      unmatched = true;
    }
    if (old.status !== goal.status && !(old.status !== 'done' && goal.status === 'done')) {
      unmatched = true;
    }
    if (old.reminderTime !== goal.reminderTime && !goal.reminderTime) {
      unmatched = true;
    }
    const daysChanged = !sameDays(old.plannedDays, goal.plannedDays);
    const amountChanged = old.targetAmount !== goal.targetAmount;
    if ((isRepeating(old) || isRepeating(goal)) && (daysChanged || amountChanged) && !isRepeating(goal)) {
      unmatched = true;
    }
  }
  if (unmatched) {
    const root = after.find((goal) => goal.id === goalId) ?? before.find((goal) => goal.id === goalId);
    lines.push(REFLECTION_COPY.updatedOnPage.replace('[goal]', root?.title || 'Untitled'));
  }
  return lines;
}

export function repeatingStep(goalId: string, nodes: Goal[]): Goal | null {
  const goal = nodes.find((item) => item.id === goalId);
  if (!goal) {
    return null;
  }
  if (isRepeating(goal)) {
    return goal;
  }
  const childrenMap = buildChildrenMap(nodes);
  const found: Goal[] = [];
  const walk = (id: string) => {
    for (const child of childrenMap.get(id) ?? []) {
      if (isRepeating(child)) {
        found.push(child);
      }
      walk(child.id);
    }
  };
  walk(goal.id);
  return found.find((step) => step.status !== 'done') ?? found[0] ?? null;
}

export function oneTimeSteps(goalId: string, nodes: Goal[]): Goal[] {
  const childrenMap = buildChildrenMap(nodes);
  const leaves: Goal[] = [];
  const walk = (id: string) => {
    for (const child of childrenMap.get(id) ?? []) {
      if (isLeaf(child, childrenMap)) {
        if (!isRepeating(child) && child.status !== 'done') {
          leaves.push(child);
        }
      } else {
        walk(child.id);
      }
    }
  };
  walk(goalId);
  return leaves;
}

export function partnerOutcome(value: PartnerCheckin | null): string | null {
  if (value === 'yes') return REFLECTION_COPY.partnerLineYes;
  if (value === 'not_yet') return REFLECTION_COPY.partnerLineNotYet;
  if (value === 'invited') return REFLECTION_COPY.partnerLineInvited;
  if (value === 'not_now') return REFLECTION_COPY.partnerLineNotNow;
  return null;
}

export function coachOutcome(value: CoachCheckin | null): string | null {
  if (value === 'yes') return REFLECTION_COPY.coachLineYes;
  if (value === 'not_yet') return REFLECTION_COPY.coachLineNotYet;
  if (value === 'requested') return REFLECTION_COPY.coachLineRequested;
  if (value === 'pending') return REFLECTION_COPY.coachLinePending;
  if (value === 'not_now') return REFLECTION_COPY.coachLineNotNow;
  return null;
}

export function answerLabel(answer: string): string {
  return REFLECTION_ANSWERS.find((option) => option.id === answer)?.label ?? answer;
}

export function reflectionAsOf(weekStart: string, weekStartsOn: WeekStart): string {
  const today = todayLocal();
  const current = startOfWeek(today, weekStartsOn);
  return weekStart === current ? today : endOfWeek(weekStart, weekStartsOn);
}

export function weekDonut(
  nodes: Goal[],
  entries: GoalEntry[],
  weekStart: string,
  weekStartsOn: WeekStart,
): { percent: number; message: string; tone: 'positive' | 'encourage' } {
  const asOf = reflectionAsOf(weekStart, weekStartsOn);
  const today = todayLocal();
  const percent = Math.round(
    getWeeklyItems(nodes, entries, parseLocalDate(weekStart), parseLocalDate(asOf), weekStartsOn).partialPct *
      100,
  );
  const message = getWeekProgressMessage(percent, weekStart === startOfWeek(today, weekStartsOn));
  return { percent, message: message.message, tone: message.tone };
}

export type ConnectAssessment = {
  partners: Connection[];
  coaches: Connection[];
  skipPartner: boolean;
  skipCoach: boolean;
  /** The coach question is showing because this week was rough after an earlier "not now". */
  coachBroughtBack: boolean;
  coachRequestPending: boolean;
};

/** Partner and coach skip rules for this reflection. */
export function assessConnect(input: {
  connections: Connection[];
  reviews: WeekReview[];
  weekStart: string;
  weekStartsOn: WeekStart;
  nodes: Goal[];
  entries: GoalEntry[];
  requestCreatedAt: string | null;
}): ConnectAssessment {
  const accepted = input.connections.filter(
    (connection) => connection.status.toLowerCase() === 'accepted' && connection.partnerId,
  );
  const partners = accepted.filter((connection) => connection.role !== 'coach');
  const coaches = accepted.filter((connection) => connection.role === 'coach');
  const byNewest = (left: WeekReview, right: WeekReview) => (left.weekStart < right.weekStart ? 1 : -1);
  const lastTwo = input.reviews
    .filter((review) => review.weekStart !== input.weekStart)
    .sort(byNewest)
    .slice(0, 2);
  const skipPartner = partners.length === 0 && lastTwo.some((review) => review.partnerCheckin === 'not_now');
  const today = todayLocal();
  const currentWeek = startOfWeek(today, input.weekStartsOn);
  const fourStarts = [0, 1, 2, 3].map((step) => addDays(currentWeek, -7 * step));
  const saidNotNow = input.reviews.some(
    (review) => fourStarts.includes(review.weekStart) && review.coachCheckin === 'not_now',
  );
  const asOf = reflectionAsOf(input.weekStart, input.weekStartsOn);
  const donut = Math.round(
    getWeeklyItems(
      input.nodes,
      input.entries,
      parseLocalDate(input.weekStart),
      parseLocalDate(asOf),
      input.weekStartsOn,
    ).partialPct * 100,
  );
  const previous = input.reviews.filter((review) => review.weekStart < input.weekStart).sort(byNewest)[0];
  const bothLow = donut < 50 && previous != null && previous.donePct < 50;
  const coachBroughtBack = saidNotNow && (donut === 0 || bothLow);
  const pending =
    input.requestCreatedAt != null &&
    new Date(input.requestCreatedAt).getTime() >= Date.now() - 30 * 24 * 60 * 60 * 1000;
  return {
    partners,
    coaches,
    skipPartner,
    skipCoach: saidNotNow && !coachBroughtBack,
    coachBroughtBack,
    coachRequestPending: pending,
  };
}
