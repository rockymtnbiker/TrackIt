import { MAYA_DISCOVER } from '../constants/maya/discover';
import {
  EAT_HABIT,
  EAT_SCRIPTS,
  GOAL_TITLES,
  JOB_HABIT,
  JOB_SCRIPTS,
  OTHER_HABIT,
  SLEEP_HABIT,
  SLEEP_SCRIPTS,
  TIME_PRESET,
  WEIGHT_SCRIPT,
  WORKOUT_HABIT,
  WORKOUT_SCRIPTS,
  openScript,
  type CoachingScript,
  type HabitCopy,
} from '../constants/maya/shape';
import type { MayaAnswers } from './mayaFlow';
import { focusedArea } from './mayaFlow';
import { createGoal, deleteGoal, type GoalInput } from './goalTreeApi';
import { formatPlannedDays } from './goalDetailText';
import { parseLocalDate, todayLocal, toLocalDateString } from './localDate';
import type { MayaLevel, WeekStart } from './settingsApi';

export type ShapeStepId = 'coach' | 'name' | 'habit' | 'helper' | 'level' | 'summary';

export type StepDraft = {
  id: string;
  text: string;
  checked: boolean;
};

export type ShapeDraft = {
  focusKey: string;
  steps: StepDraft[];
  title: string;
  /** YYYY-MM-DD */
  targetDate: string;
  habitChoice: string | null;
  habitCustom: string;
  days: number[];
  /** Kept for the next slice. Not written to the database. */
  helper: string | null;
  level: MayaLevel;
};

const AREA_CATEGORY: Record<string, string> = {
  classes: 'school',
  job: 'career',
  money: 'money',
  health: 'health',
  dating: 'relationships',
  friends: 'relationships',
  faith: 'spiritual',
  other: 'other',
};

function textOf(answers: MayaAnswers, id: string): string {
  const value = answers[id];
  return typeof value === 'string' ? value : '';
}

export function whyText(answers: MayaAnswers): string {
  return textOf(answers, MAYA_DISCOVER.betterId).trim();
}

export function coachingScript(answers: MayaAnswers): CoachingScript {
  const areaId = focusedArea(MAYA_DISCOVER, answers).id;
  if (areaId === 'job') {
    return JOB_SCRIPTS[textOf(answers, 'jobHard')] ?? openScript();
  }
  if (areaId !== 'health') {
    return openScript();
  }
  const health = textOf(answers, 'healthArea');
  if (health === 'workout') {
    return WORKOUT_SCRIPTS[textOf(answers, 'workoutHard')] ?? openScript();
  }
  if (health === 'eat') {
    return EAT_SCRIPTS[textOf(answers, 'eatHard')] ?? openScript();
  }
  if (health === 'sleep') {
    return SLEEP_SCRIPTS[textOf(answers, 'sleepHard')] ?? openScript();
  }
  if (health === 'weight') {
    return WEIGHT_SCRIPT;
  }
  return openScript();
}

export function habitCopy(answers: MayaAnswers): HabitCopy {
  const areaId = focusedArea(MAYA_DISCOVER, answers).id;
  if (areaId === 'job') {
    return JOB_HABIT;
  }
  if (areaId !== 'health') {
    return OTHER_HABIT;
  }
  const health = textOf(answers, 'healthArea');
  if (health === 'eat') {
    return EAT_HABIT;
  }
  if (health === 'sleep') {
    return SLEEP_HABIT;
  }
  return WORKOUT_HABIT;
}

export function defaultTitle(answers: MayaAnswers): string {
  const area = focusedArea(MAYA_DISCOVER, answers);
  if (area.id === 'job') {
    return GOAL_TITLES.job;
  }
  if (area.id === 'health') {
    const health = textOf(answers, 'healthArea');
    if (health === 'workout') {
      return GOAL_TITLES.workout;
    }
    if (health === 'eat') {
      return GOAL_TITLES.eat;
    }
    if (health === 'sleep') {
      return GOAL_TITLES.sleep;
    }
    if (health === 'weight') {
      const goal = textOf(answers, 'weightGoal');
      if (goal === 'gain') {
        return GOAL_TITLES.gain;
      }
      if (goal === 'muscle') {
        return GOAL_TITLES.muscle;
      }
      return GOAL_TITLES.lose;
    }
  }
  return area.label || 'My goal';
}

export function categoryFor(answers: MayaAnswers): string {
  const areaId = focusedArea(MAYA_DISCOVER, answers).id;
  if (!areaId) {
    return 'other';
  }
  return AREA_CATEGORY[areaId] ?? 'other';
}

export function focusKey(answers: MayaAnswers): string {
  const areaId = focusedArea(MAYA_DISCOVER, answers).id ?? '';
  return [
    areaId,
    textOf(answers, 'healthArea'),
    textOf(answers, 'jobHard'),
    textOf(answers, 'workoutHard'),
    textOf(answers, 'eatHard'),
    textOf(answers, 'sleepHard'),
    textOf(answers, 'weightGoal'),
  ].join('|');
}

export function datePlusMonths(iso: string, months: number): string {
  const date = parseLocalDate(iso);
  const day = date.getDate();
  const shifted = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const last = new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate();
  shifted.setDate(Math.min(day, last));
  return toLocalDateString(shifted);
}

export function createShapeDraft(answers: MayaAnswers, today = todayLocal()): ShapeDraft {
  const script = coachingScript(answers);
  const preset =
    focusedArea(MAYA_DISCOVER, answers).id === 'job' && textOf(answers, 'jobHard') === 'time';
  return {
    focusKey: focusKey(answers),
    steps: script.steps.map((text, index) => ({
      id: `step-${index}`,
      text,
      checked: true,
    })),
    title: defaultTitle(answers),
    targetDate: datePlusMonths(today, 3),
    habitChoice: preset ? TIME_PRESET.choiceId : null,
    habitCustom: '',
    days: preset ? [...TIME_PRESET.days] : [],
    helper: null,
    level: 'occasional',
  };
}

export function shapeSequence(answers: MayaAnswers): ShapeStepId[] {
  const steps: ShapeStepId[] = [];
  if (!coachingScript(answers).skipScreen) {
    steps.push('coach');
  }
  steps.push('name', 'habit', 'helper', 'level', 'summary');
  return steps;
}

export function startShapeHistory(answers: MayaAnswers): ShapeStepId[] {
  const first = shapeSequence(answers)[0];
  return first ? [first] : ['name'];
}

export function forwardShape(history: readonly ShapeStepId[], answers: MayaAnswers): ShapeStepId[] {
  const sequence = shapeSequence(answers);
  const current = history[history.length - 1];
  const index = current ? sequence.indexOf(current) : -1;
  const next = sequence[index + 1];
  if (!next) {
    return [...history];
  }
  return [...history, next];
}

/** "Change something" returns to coaching, or the first screen when coaching is skipped. */
export function historyToStart(history: readonly ShapeStepId[], answers: MayaAnswers): ShapeStepId[] {
  const first = shapeSequence(answers)[0] ?? 'name';
  const index = history.indexOf(first);
  if (index === -1) {
    return [first];
  }
  return history.slice(0, index + 1);
}

export function habitAmount(copy: HabitCopy, draft: ShapeDraft): number | null {
  if (copy.allowMore && draft.habitChoice === 'more') {
    const parsed = Number.parseInt(draft.habitCustom.trim(), 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return null;
    }
    return parsed;
  }
  return copy.choices.find((choice) => choice.id === draft.habitChoice)?.amount ?? null;
}

export function keptStepTitles(draft: ShapeDraft): string[] {
  return draft.steps
    .filter((step) => step.checked && step.text.trim().length > 0)
    .map((step) => step.text.trim());
}

export function canAdvanceShape(step: ShapeStepId, draft: ShapeDraft, answers: MayaAnswers): boolean {
  if (step === 'coach') {
    return true;
  }
  if (step === 'name') {
    return draft.title.trim().length > 0;
  }
  if (step === 'habit') {
    return habitAmount(habitCopy(answers), draft) != null && draft.days.length > 0;
  }
  if (step === 'helper') {
    return draft.helper != null;
  }
  if (step === 'level') {
    return draft.level === 'lots' || draft.level === 'occasional' || draft.level === 'self';
  }
  return false;
}

export function habitSummaryLine(
  answers: MayaAnswers,
  draft: ShapeDraft,
  weekStart: WeekStart,
): string {
  const copy = habitCopy(answers);
  const amount = habitAmount(copy, draft);
  const days = formatPlannedDays(draft.days, weekStart);
  if (amount == null) {
    return copy.name;
  }
  if (copy.kind === 'minutes') {
    return `${copy.name} · ${amount} min a week · ${days}`;
  }
  const word = amount === 1 ? 'time' : 'times';
  return `${copy.name} · ${amount} ${word} a week · ${days}`;
}

export function shapedGoalPlan(
  answers: MayaAnswers,
  draft: ShapeDraft,
  today = todayLocal(),
): { parent: GoalInput; children: GoalInput[] } {
  const copy = habitCopy(answers);
  const amount = habitAmount(copy, draft);
  const parent: GoalInput = {
    title: draft.title.trim(),
    why: whyText(answers),
    category: categoryFor(answers),
    status: 'active',
    actualStartDate: today,
    targetEndDate: draft.targetDate,
    unit: null,
  };
  const children: GoalInput[] = keptStepTitles(draft).map((title) => ({
    title,
    status: 'pending',
    unit: null,
  }));
  children.push({
    title: copy.name,
    status: 'active',
    actualStartDate: today,
    repeatPeriod: 'week',
    plannedDays: [...draft.days].sort((a, b) => a - b),
    unit: copy.kind === 'minutes' ? 'minutes' : null,
    targetAmount: amount,
  });
  return { parent, children };
}

/** Creates the goal and its steps. Deletes them again if a later step fails. */
export async function saveShapedGoal(answers: MayaAnswers, draft: ShapeDraft): Promise<string> {
  const plan = shapedGoalPlan(answers, draft);
  const habit = plan.children[plan.children.length - 1];
  if (!plan.parent.title || habit?.targetAmount == null || habit.repeatPeriod == null) {
    throw new Error('Add a title and a weekly amount before saving.');
  }
  const created: string[] = [];
  try {
    const parent = await createGoal(plan.parent);
    created.push(parent.id);
    for (const child of plan.children) {
      const saved = await createGoal({ ...child, parentId: parent.id });
      created.push(saved.id);
    }
    return parent.id;
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
