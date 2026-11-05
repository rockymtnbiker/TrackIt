import {
  lotsDailyLine,
  occasionalDailyLine,
  timeGreeting,
} from '../constants/maya/daily';
import type { Goal, GoalEntry } from '../types/goal';
import { goalAnalysis } from './goalAnalysis';
import { buildChildrenMap, dayCount, isRepeating, targetFor } from './goalTree';
import { parseLocalDate } from './localDate';
import type { MayaLevel, WeekStart } from './settingsApi';
import { weekCompleteStatus } from './statusMessages';
import { endOfWeek, startOfWeek } from './week';

export type MayaDailyLine = {
  goalId: string;
  habitId: string;
  text: string;
};

export function topGoal(stepId: string, nodes: Goal[]): Goal | null {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let current = byId.get(stepId);
  let top: Goal | null = null;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    top = current;
    if (!current.parentId) {
      break;
    }
    current = byId.get(current.parentId);
  }
  return top;
}

function rootsInPlanOrder(nodes: Goal[]): Goal[] {
  return nodes
    .filter((node) => node.parentId == null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
}

function starterHabit(
  goalId: string,
  childrenMap: Map<string | null, Goal[]>,
): Goal | null {
  const repeating = (childrenMap.get(goalId) ?? []).filter((child) => isRepeating(child));
  return repeating[repeating.length - 1] ?? null;
}

function firstOpenStep(
  goalId: string,
  childrenMap: Map<string | null, Goal[]>,
): Goal | null {
  for (const child of childrenMap.get(goalId) ?? []) {
    if (isRepeating(child) || child.status === 'done') {
      continue;
    }
    return child;
  }
  return null;
}

export function habitPlannedOn(habit: Goal, date: string, weekStartsOn: WeekStart): boolean {
  const weekStart = startOfWeek(date, weekStartsOn);
  const days = targetFor(habit, weekStart, endOfWeek(weekStart, weekStartsOn)).plannedDays;
  if (days == null) {
    return true;
  }
  if (days.length === 0) {
    return false;
  }
  return days.includes(parseLocalDate(date).getDay());
}

function habitBehind(
  habit: Goal,
  nodes: Goal[],
  entries: GoalEntry[],
  today: string,
  weekStartsOn: WeekStart,
): boolean {
  return goalAnalysis(habit, nodes, entries, today, weekStartsOn)?.tone === 'encourage';
}

export function mayaDailyLine(input: {
  level: MayaLevel;
  name: string;
  hour: number;
  today: string;
  dismissedOn: string | null;
  weekStartsOn: WeekStart;
  nodes: Goal[];
  entries: GoalEntry[];
  mayaGoalIds: ReadonlySet<string>;
}): MayaDailyLine | null {
  if (input.level === 'self' || input.dismissedOn === input.today) {
    return null;
  }
  const childrenMap = buildChildrenMap(input.nodes);
  const greeting = timeGreeting(input.hour);
  for (const goal of rootsInPlanOrder(input.nodes)) {
    if (!input.mayaGoalIds.has(goal.id)) {
      continue;
    }
    const habit = starterHabit(goal.id, childrenMap);
    if (!habit) {
      continue;
    }
    const loggedToday = dayCount(input.entries, habit.id, input.today) > 0;
    const matches =
      input.level === 'lots'
        ? habitPlannedOn(habit, input.today, input.weekStartsOn) && !loggedToday
        : habitBehind(habit, input.nodes, input.entries, input.today, input.weekStartsOn) &&
          !loggedToday;
    if (!matches) {
      continue;
    }
    const step = firstOpenStep(goal.id, childrenMap);
    const habitName = habit.title.trim() || 'This';
    const text =
      input.level === 'lots'
        ? lotsDailyLine(greeting, input.name, habitName, step?.title.trim() || null)
        : occasionalDailyLine(goal.title, habitName);
    return { goalId: goal.id, habitId: habit.id, text };
  }
  return null;
}

export function weekJustCompleted(
  habit: Goal,
  nodes: Goal[],
  before: GoalEntry[],
  after: GoalEntry[],
  today: string,
  weekStartsOn: WeekStart,
): boolean {
  const message = weekCompleteStatus().message;
  const was = goalAnalysis(habit, nodes, before, today, weekStartsOn)?.headline === message;
  const now = goalAnalysis(habit, nodes, after, today, weekStartsOn)?.headline === message;
  return !was && now;
}

export function subtreeIds(rootId: string, nodes: Goal[]): string[] {
  const childrenMap = buildChildrenMap(nodes);
  const ids: string[] = [];
  const walk = (id: string) => {
    ids.push(id);
    for (const child of childrenMap.get(id) ?? []) {
      walk(child.id);
    }
  };
  walk(rootId);
  return ids;
}

export function otherStepDone(rootId: string, exceptId: string, nodes: Goal[]): boolean {
  const childrenMap = buildChildrenMap(nodes);
  const walk = (id: string): boolean => {
    for (const child of childrenMap.get(id) ?? []) {
      if (child.id !== exceptId && child.status === 'done') {
        return true;
      }
      if (walk(child.id)) {
        return true;
      }
    }
    return false;
  };
  return walk(rootId);
}
