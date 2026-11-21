import type { Goal } from '../types/goal';
import { isDaily } from './goalTree';

export type GoalShape = Pick<Goal, 'unit' | 'targetAmount' | 'repeatPeriod' | 'plannedDays' | 'timesPerDay'>;

export type GoalPeriodKind = 'once' | 'daily' | 'week' | 'month';

export function goalPeriodKind(goal: GoalShape): GoalPeriodKind {
  if (goal.plannedDays == null) {
    return 'once';
  }
  if (goal.repeatPeriod === 'month') {
    return 'month';
  }
  return isDaily(goal) ? 'daily' : 'week';
}

/** Same unit (or both yes/no) and the same period, including both one-time. */
export function sameGoalShape(left: GoalShape, right: GoalShape): boolean {
  if ((left.unit ?? null) !== (right.unit ?? null)) {
    return false;
  }
  return goalPeriodKind(left) === goalPeriodKind(right);
}

function amountText(value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  return Number.isInteger(value) ? String(value) : String(value);
}

function timesWord(count: number): string {
  return count === 1 ? 'time' : 'times';
}

/** One line describing the target a group goal would switch a personal goal to. */
export function groupTargetSummary(goal: GoalShape): string {
  const kind = goalPeriodKind(goal);
  const amount = amountText(goal.targetAmount);
  if (goal.unit) {
    const qty = amount ? `${amount} ${goal.unit}` : goal.unit;
    if (kind === 'daily') {
      return `${qty} a day`;
    }
    if (kind === 'month') {
      return `${qty} a month`;
    }
    if (kind === 'week') {
      return `${qty} a week`;
    }
    return qty;
  }
  if (kind === 'once') {
    return 'One time';
  }
  if (kind === 'daily') {
    const count = goal.timesPerDay > 1 ? goal.timesPerDay : 1;
    return count > 1 ? `${count} ${timesWord(count)} a day` : 'Every day';
  }
  if (kind === 'month') {
    const count = goal.targetAmount != null && goal.targetAmount > 0 ? goal.targetAmount : 0;
    return count > 0 ? `${count} ${timesWord(count)} a month` : 'Monthly';
  }
  const count =
    goal.targetAmount != null && goal.targetAmount > 0
      ? goal.targetAmount
      : (goal.plannedDays?.length ?? 0);
  return count > 0 ? `${count} ${timesWord(count)} a week` : 'Weekly';
}

export function connectCandidates(copy: Goal, goals: Goal[]): Goal[] {
  return goals
    .filter(
      (goal) =>
        goal.id !== copy.id &&
        goal.parentId == null &&
        goal.groupGoalId == null &&
        goal.status !== 'done' &&
        sameGoalShape(goal, copy),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
}
