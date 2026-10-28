import { buildChildrenMap, isLeaf, isRepeating } from './goalTree';
import type { WeekStart } from './settingsApi';
import type { Goal } from '../types/goal';
import { endOfWeek, startOfWeek } from './week';

export type PlanSummaryCounts = {
  active: number;
  bigDeals: number;
  dueThisWeek: number;
};

export function planSummaryCounts(
  nodes: Goal[],
  weekStartsOn: WeekStart,
  today: string,
): PlanSummaryCounts {
  const childrenMap = buildChildrenMap(nodes);
  const weekStart = startOfWeek(today, weekStartsOn);
  const weekEnd = endOfWeek(today, weekStartsOn);

  let active = 0;
  let bigDeals = 0;
  let dueThisWeek = 0;

  for (const node of nodes) {
    if (node.parentId == null && node.status === 'active') {
      active += 1;
    }
    if (node.parentId == null && (childrenMap.get(node.id)?.length ?? 0) > 0) {
      bigDeals += 1;
    }

    const deadline = node.targetEndDate?.slice(0, 10);
    if (
      !isRepeating(node) &&
      isLeaf(node, childrenMap) &&
      node.status !== 'done' &&
      deadline != null &&
      deadline >= weekStart &&
      deadline <= weekEnd
    ) {
      dueThisWeek += 1;
    }
  }

  return { active, bigDeals, dueThisWeek };
}

/** Null when every count is zero, so the strip can hide. */
export function planSummaryLine(
  nodes: Goal[],
  weekStartsOn: WeekStart,
  today: string,
): string | null {
  const { active, bigDeals, dueThisWeek } = planSummaryCounts(
    nodes,
    weekStartsOn,
    today,
  );
  const parts: string[] = [];
  if (active > 0) {
    parts.push(`${active} active`);
  }
  if (bigDeals > 0) {
    parts.push(`${bigDeals} ${bigDeals === 1 ? 'Big Deal' : 'Big Deals'}`);
  }
  if (dueThisWeek > 0) {
    parts.push(`${dueThisWeek} due this week`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}
