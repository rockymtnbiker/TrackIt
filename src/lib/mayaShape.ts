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
  /** The time block was declined. No habit step is saved. */
  habitSkipped: boolean;
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

/** Temperature picks the suggested weekly amount. Stretched or stuck also preselects two days. */
function defaultHabit(answers: MayaAnswers): { habitChoice: string | null; days: number[] } {
  const temp = textOf(answers, 'temp');
  const copy = habitCopy(answers);
  const choices = copy.choices;
  const last = choices.length - 1;
  if (last < 0) {
    return { habitChoice: null, days: [] };
  }
  if (copy.kind === 'times') {
    let index = -1;
    if (temp === 'stretched' || temp === 'stuck') {
      index = 0;
    } else if (temp === 'handling') {
      index = Math.floor(last / 2);
    } else if (temp === 'level-up') {
      index = last;
    }
    return { habitChoice: index >= 0 ? (choices[index]?.id ?? null) : null, days: [] };
  }
  if (temp === 'stretched' || temp === 'stuck') {
    return { habitChoice: TIME_PRESET.choiceId, days: [...TIME_PRESET.days] };
  }
  if (temp === 'handling') {
    return { habitChoice: '60', days: [] };
  }
  if (temp === 'level-up') {
    return { habitChoice: '120', days: [] };
  }
  return { habitChoice: null, days: [] };
}

export function createShapeDraft(
  answers: MayaAnswers,
  today = todayLocal(),
  level: MayaLevel = 'occasional',
): ShapeDraft {
  const script = coachingScript(answers);
  const habit = defaultHabit(answers);
  const steps = script.steps.map((text, index) => ({
    id: `step-${index}`,
    text,
    checked: true,
  }));
  return {
    focusKey: focusKey(answers),
    steps:
      steps.length === 0 && !script.skipScreen
        ? [{ id: 'step-own', text: '', checked: true }]
        : steps,
    title: defaultTitle(answers),
    targetDate: datePlusMonths(today, 3),
    habitChoice: habit.habitChoice,
    habitCustom: '',
    days: habit.days,
    helper: null,
    level,
    habitSkipped: false,
  };
}

export function shapeSequence(answers: MayaAnswers, askLevel = true): ShapeStepId[] {
  const steps: ShapeStepId[] = [];
  if (!coachingScript(answers).skipScreen) {
    steps.push('coach');
  }
  steps.push('name', 'habit', 'helper');
  if (askLevel) {
    steps.push('level');
  }
  steps.push('summary');
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
    return habitIsReady(answers, draft);
  }
  if (step === 'helper') {
    return draft.helper != null;
  }
  if (step === 'level') {
    return draft.level === 'lots' || draft.level === 'occasional' || draft.level === 'self';
  }
  return false;
}

function formatCadence(copy: HabitCopy, amount: number): string {
  if (copy.kind === 'times') {
    return `${amount}× a week`;
  }
  if (amount > 0 && amount % 60 === 0) {
    return `${amount / 60} hr/week`;
  }
  return `${amount} min/week`;
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
  return `${copy.name} · ${formatCadence(copy, amount)} · ${days}`;
}

/** Times-per-week habits need at least one planned day per session. Null when the hint should stay hidden. */
export function habitDaysShortfall(answers: MayaAnswers, draft: ShapeDraft): number | null {
  const copy = habitCopy(answers);
  if (copy.kind !== 'times' || draft.habitSkipped) {
    return null;
  }
  const amount = habitAmount(copy, draft);
  if (amount == null || draft.days.length >= amount) {
    return null;
  }
  return amount;
}

export function habitIsReady(answers: MayaAnswers, draft: ShapeDraft): boolean {
  if (draft.habitSkipped) {
    return false;
  }
  const copy = habitCopy(answers);
  const amount = habitAmount(copy, draft);
  if (amount == null || draft.days.length === 0) {
    return false;
  }
  return copy.kind !== 'times' || draft.days.length >= amount;
}

function stepChildren(draft: ShapeDraft): GoalInput[] {
  return keptStepTitles(draft).map((title) => ({
    title,
    status: 'pending' as const,
    unit: null,
  }));
}

function habitChild(answers: MayaAnswers, draft: ShapeDraft, today: string): GoalInput | null {
  if (draft.habitSkipped) {
    return null;
  }
  const copy = habitCopy(answers);
  const amount = habitAmount(copy, draft);
  if (amount == null || draft.days.length === 0) {
    return null;
  }
  if (copy.kind === 'times' && draft.days.length < amount) {
    return null;
  }
  return {
    title: copy.name,
    status: 'active',
    actualStartDate: today,
    repeatPeriod: 'week',
    plannedDays: [...draft.days].sort((a, b) => a - b),
    unit: copy.kind === 'minutes' ? 'minutes' : null,
    targetAmount: amount,
  };
}

export function shapedGoalPlan(
  answers: MayaAnswers,
  draft: ShapeDraft,
  today = todayLocal(),
): { parent: GoalInput; children: GoalInput[] } {
  const parent: GoalInput = {
    title: draft.title.trim(),
    why: whyText(answers),
    category: categoryFor(answers),
    status: 'active',
    actualStartDate: today,
    targetEndDate: draft.targetDate,
    unit: null,
  };
  const children = stepChildren(draft);
  const habit = habitChild(answers, draft, today);
  if (habit) {
    children.push(habit);
  }
  return { parent, children };
}

/** Goal from whatever Maya has so far. Habit is included only when time and days were both chosen. */
export function partialMayaPlan(
  answers: MayaAnswers,
  draft: ShapeDraft | null,
  reached: { coach: boolean; habit: boolean },
  today = todayLocal(),
): { parent: GoalInput; children: GoalInput[] } {
  const parent: GoalInput = {
    title: (draft?.title.trim() || defaultTitle(answers)).trim() || defaultTitle(answers),
    why: whyText(answers),
    category: categoryFor(answers),
    status: 'active',
    actualStartDate: today,
    targetEndDate: draft?.targetDate || datePlusMonths(today, 3),
    unit: null,
  };
  const children: GoalInput[] = [];
  if (reached.coach && draft) {
    children.push(...stepChildren(draft));
  }
  if (reached.habit && draft) {
    const habit = habitChild(answers, draft, today);
    if (habit) {
      children.push(habit);
    }
  }
  return { parent, children };
}

/** Creates the goal and its steps. Deletes them again if a later step fails. */
async function createPlan(plan: { parent: GoalInput; children: GoalInput[] }): Promise<string> {
  if (!plan.parent.title.trim()) {
    throw new Error('Add a title before saving.');
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

export async function saveShapedGoal(answers: MayaAnswers, draft: ShapeDraft): Promise<string> {
  if (!draft.habitSkipped && habitChild(answers, draft, todayLocal()) == null) {
    throw new Error('Add a title and a weekly amount before saving.');
  }
  return createPlan(shapedGoalPlan(answers, draft));
}

export async function savePartialMayaGoal(
  answers: MayaAnswers,
  draft: ShapeDraft | null,
  reached: { coach: boolean; habit: boolean },
): Promise<string> {
  return createPlan(partialMayaPlan(answers, draft, reached));
}
