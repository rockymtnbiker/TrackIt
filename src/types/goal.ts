export type GoalStatus = 'pending' | 'active' | 'done';

export type RepeatPeriod = 'week' | 'month';

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
};

export type GoalEntry = {
  id: string;
  goalId: string;
  entryDate: string;
  value: number | null;
  createdAt: string;
};
