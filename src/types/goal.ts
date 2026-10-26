export type GoalStatus = 'pending' | 'active' | 'done';

export type RepeatPeriod = 'week' | 'month';

/** One version of a repeating step's target, in effect from effectiveFrom. */
export type GoalTarget = {
  id: string;
  goalId: string;
  userId: string;
  effectiveFrom: string;
  targetAmount: number | null;
  repeatPeriod: RepeatPeriod | null;
  plannedDays: number[] | null;
  timesPerDay: number;
  createdAt: string;
};

export type Goal = {
  id: string;
  userId: string;
  parentId: string | null;
  title: string;
  description: string | null;
  why: string | null;
  category: string | null;
  sortOrder: number;
  status: GoalStatus;
  targetStartDate: string | null;
  targetEndDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  createdDate: string;
  unit: string | null;
  targetAmount: number | null;
  repeatPeriod: RepeatPeriod | null;
  plannedDays: number[] | null;
  /** Stored 1–12. Only Daily yes/no steps use a value above 1. */
  timesPerDay: number;
  /** Local time `HH:MM:SS`, or null when this step has no reminder. */
  reminderTime: string | null;
  /** Starter that prefilled this goal, or null when it was written by hand. */
  starterKey: string | null;
  /** Oldest first. Absent until the goal tree has been loaded. */
  targetHistory?: GoalTarget[];
};

export type GoalEntry = {
  id: string;
  goalId: string;
  entryDate: string;
  value: number | null;
  createdAt: string;
};
