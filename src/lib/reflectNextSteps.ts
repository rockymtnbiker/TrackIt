import { JOB_AI_WARNING, JOB_APPLY_STEP, JOB_BRANCHES, JOB_FOLLOWS } from '../constants/maya/jobFlow';
import { REFLECT_FLOW } from '../constants/maya/reflectFlow';
import { createGoal, deleteGoal } from './goalTreeApi';
import { buildChildrenMap } from './goalTree';
import type { Goal } from '../types/goal';

export { JOB_AI_WARNING };

/** True when direct children already have steps of their own, so they are branches. */
export function childrenAreBranches(goalId: string, nodes: Goal[]): boolean {
  const map = buildChildrenMap(nodes);
  const children = map.get(goalId) ?? [];
  return children.some((child) => (map.get(child.id)?.length ?? 0) > 0);
}

export function isCoachedBranch(title: string): boolean {
  const trimmed = title.trim();
  return JOB_BRANCHES.some(
    (branch) => (branch.id === 'resume' || branch.id === 'apply') && branch.title === trimmed,
  );
}

/** Coaching line and suggested steps for the branch he just moved into. */
export function branchCoach(title: string): { coaching: string; steps: string[]; warning: boolean } | null {
  const trimmed = title.trim();
  const resume = JOB_BRANCHES.find((branch) => branch.id === 'resume');
  const apply = JOB_BRANCHES.find((branch) => branch.id === 'apply');
  if (resume && trimmed === resume.title) {
    const follow = JOB_FOLLOWS.b;
    return { coaching: follow.coaching, steps: [...follow.steps], warning: follow.warning };
  }
  if (apply && trimmed === apply.title) {
    const keywords = JOB_FOLLOWS.b.steps.find((step) => step.startsWith("Add the posting's keywords"));
    const cover = JOB_FOLLOWS.e.steps.find((step) => step.startsWith('Tailor my cover letter'));
    if (!keywords || !cover) {
      return null;
    }
    return {
      coaching: REFLECT_FLOW.r3c.applyCoaching,
      steps: [JOB_APPLY_STEP, keywords, cover],
      warning: false,
    };
  }
  return null;
}

async function rollback(created: Goal[]): Promise<void> {
  for (let index = created.length - 1; index >= 0; index -= 1) {
    const goal = created[index];
    if (!goal) {
      continue;
    }
    try {
      await deleteGoal(goal.id);
    } catch {
      // Keep removing the rest so a retry does not leave a half-built list.
    }
  }
}

/** Kept steps under the branch he just activated. The weekly apply step stays repeating. */
export async function saveBranchSteps(
  parentId: string,
  titles: string[],
  today: string,
): Promise<Goal[]> {
  const created: Goal[] = [];
  try {
    for (const title of titles) {
      const repeating = title === JOB_APPLY_STEP;
      created.push(
        await createGoal(
          repeating
            ? {
                title,
                parentId,
                status: 'active',
                actualStartDate: today,
                repeatPeriod: 'week',
                plannedDays: [],
                unit: 'applications',
                targetAmount: 5,
              }
            : { title, parentId, status: 'pending', unit: null },
        ),
      );
    }
    return created;
  } catch (error) {
    await rollback(created);
    throw error;
  }
}

/**
 * Walk-me-through save.
 * Branched goals get a new active branch with pending steps under it.
 * Otherwise the answer is an active step and the rest are pending siblings.
 */
export async function saveWalkSteps(input: {
  goalId: string;
  branched: boolean;
  answer: string;
  steps: string[];
  today: string;
}): Promise<Goal[]> {
  const created: Goal[] = [];
  try {
    if (input.branched) {
      const branch = await createGoal({
        title: input.answer,
        parentId: input.goalId,
        status: 'active',
        actualStartDate: input.today,
        unit: null,
      });
      created.push(branch);
      for (const title of input.steps) {
        created.push(
          await createGoal({
            title,
            parentId: branch.id,
            status: 'pending',
            unit: null,
          }),
        );
      }
      return created;
    }
    created.push(
      await createGoal({
        title: input.answer,
        parentId: input.goalId,
        status: 'active',
        actualStartDate: input.today,
        unit: null,
      }),
    );
    for (const title of input.steps) {
      created.push(
        await createGoal({
          title,
          parentId: input.goalId,
          status: 'pending',
          unit: null,
        }),
      );
    }
    return created;
  } catch (error) {
    await rollback(created);
    throw error;
  }
}
