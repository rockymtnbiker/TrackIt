import { MAYA_DAILY, lotsToast, nudgeLine } from '../constants/maya/daily';
import type { Goal, GoalEntry } from '../types/goal';
import { getMyConnections, getMySharesWith } from './communityApi';
import { getEntries } from './goalTreeApi';
import {
  otherStepDone,
  subtreeIds,
  topGoal,
  weekJustCompleted,
} from './mayaDaily';
import { buildChildrenMap, isRepeating } from './goalTree';
import {
  getMayaHelper,
  listMayaGoalIds,
  mayaNudgeWasShown,
} from './mayaHelper';
import type { MayaLevel, WeekStart } from './settingsApi';

export type MayaReaction = {
  toast: string | null;
  nudgeText: string | null;
  goalId: string | null;
};

async function sharedWithAcceptedPartner(goalId: string): Promise<boolean> {
  const connections = await getMyConnections();
  const accepted = connections.filter(
    (connection) => connection.status.toLowerCase() === 'accepted' && connection.partnerId,
  );
  for (const connection of accepted) {
    const partnerId = connection.partnerId;
    if (!partnerId) {
      continue;
    }
    const shares = await getMySharesWith(partnerId);
    if (shares.some((share) => share.goalId === goalId)) {
      return true;
    }
  }
  return false;
}

function habitOf(goalId: string, nodes: Goal[]): Goal | null {
  const children = buildChildrenMap(nodes).get(goalId) ?? [];
  const repeating = children.filter((child) => isRepeating(child));
  return repeating[repeating.length - 1] ?? null;
}

/** Toast and partner nudge for one successful log or done on a Maya goal. */
export async function planMayaReaction(input: {
  userId: string;
  stepId: string;
  kind: 'log' | 'done';
  nodes: Goal[];
  before: GoalEntry[];
  after: GoalEntry[];
  today: string;
  weekStartsOn: WeekStart;
  level: MayaLevel;
  lotsIndex: number;
}): Promise<MayaReaction> {
  const none: MayaReaction = { toast: null, nudgeText: null, goalId: null };
  const top = topGoal(input.stepId, input.nodes);
  if (!top) {
    return none;
  }
  const mayaIds = await listMayaGoalIds(input.userId);
  if (!mayaIds.includes(top.id)) {
    return none;
  }

  const ids = subtreeIds(top.id, input.nodes);
  const history = await getEntries(ids);
  const isFirstLog = input.kind === 'log' && history.length <= 1;
  const isFirstDone =
    input.kind === 'done' &&
    history.length === 0 &&
    !otherStepDone(top.id, input.stepId, input.nodes);
  const isFirst = isFirstLog || isFirstDone;

  const habit = habitOf(top.id, input.nodes);
  const weekDone =
    input.kind === 'log' &&
    habit != null &&
    input.stepId === habit.id &&
    weekJustCompleted(
      habit,
      input.nodes,
      input.before,
      input.after,
      input.today,
      input.weekStartsOn,
    );

  let toast: string | null = null;
  if (input.level === 'lots') {
    toast = lotsToast(input.lotsIndex);
  } else if (input.level === 'occasional') {
    if (weekDone) {
      toast = MAYA_DAILY.weekComplete;
    } else if (isFirst) {
      toast = MAYA_DAILY.firstLog;
    }
  }

  let nudgeText: string | null = null;
  if (isFirstLog && !(await mayaNudgeWasShown(input.userId, top.id))) {
    const shared = await sharedWithAcceptedPartner(top.id);
    if (!shared) {
      const helper = await getMayaHelper(input.userId, top.id);
      nudgeText = nudgeLine(helper);
    }
  }

  return { toast, nudgeText, goalId: top.id };
}
