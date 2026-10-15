import type { Goal, GoalStatus, RepeatPeriod } from '../types/goal';
import { formatDateMDY } from '../utils/date';
import { isDaily, timesPerDay } from './goalTree';
import type { WeekStart } from './settingsApi';
import { weekdayOrder } from './week';

export const DETAIL_LABELS = {
  title: 'Title',
  why: 'Why it matters',
  timeline: 'Timeline',
  track: 'Track an amount',
  repeat: 'Repeat',
  notes: 'Notes',
  status: 'Status',
  started: 'Started',
  actualEnd: 'Actual end',
  targetStart: 'Target start',
  targetEnd: 'Target end',
  unit: 'Unit',
  customUnit: 'Custom unit',
  period: 'Period',
  days: 'Days',
  off: 'Off',
} as const;

export const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export const PERIOD_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
] as const;

const EMPTY = '—';

export function periodWord(period: RepeatPeriod | null): string {
  return period === 'month' ? 'month' : 'week';
}

export function formatStatus(status: GoalStatus): string {
  if (status === 'pending') {
    return 'Pending';
  }
  if (status === 'done') {
    return 'Done';
  }
  return 'Active';
}

export function formatDetailDate(value: string | null | undefined): string {
  const day = value?.slice(0, 10) ?? '';
  return day ? formatDateMDY(day) : EMPTY;
}

export function formatAmount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return EMPTY;
  }
  return Number.isInteger(value) ? String(value) : String(value);
}

/** Target field label. Tracked goals use a total or a per-period target. */
export function targetAmountLabel(
  tracked: boolean,
  repeatOn: boolean,
  period: RepeatPeriod | null,
): string {
  if (!tracked) {
    return `Times per ${periodWord(period)}`;
  }
  return repeatOn ? `Target per ${periodWord(period)}` : 'Total target';
}

export type PeriodChoice = 'daily' | 'week' | 'month';

export function repeatPeriodChoice(
  goal: Pick<Goal, 'repeatPeriod' | 'plannedDays' | 'unit' | 'targetAmount'>,
): PeriodChoice | null {
  if (goal.plannedDays == null) {
    return null;
  }
  if (goal.repeatPeriod === 'month') {
    return 'month';
  }
  return isDaily(goal) ? 'daily' : 'week';
}

export function repeatPeriodLabel(choice: PeriodChoice | null): string {
  if (choice == null) {
    return DETAIL_LABELS.off;
  }
  return PERIOD_OPTIONS.find((option) => option.value === choice)?.label ?? DETAIL_LABELS.off;
}

export function formatPlannedDays(
  days: number[] | null | undefined,
  weekStartsOn: WeekStart,
): string {
  if (days == null || days.length === 0) {
    return EMPTY;
  }
  const order = weekdayOrder(weekStartsOn);
  return [...days]
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .map((day) => WEEKDAY_SHORT[day] ?? String(day))
    .join(', ');
}

export type DetailRow = {
  label: string;
  value: string;
};

export type DetailSection = {
  id: 'title' | 'timeline' | 'track' | 'repeat' | 'notes';
  title: string | null;
  rows: DetailRow[];
};

/** Read-only lines for the Goal page detail cards. Same labels as the edit form. */
function timesPhrase(count: number, unit: 'day' | 'week' | 'month'): string {
  const word = count === 1 ? 'time' : 'times';
  return `${count} ${word} a ${unit}`;
}

function repeatSummary(goal: Goal, choice: PeriodChoice | null): string {
  const label = repeatPeriodLabel(choice);
  if (goal.unit != null || choice == null) {
    return label;
  }
  if (choice === 'daily') {
    const count = timesPerDay(goal);
    return count > 1 ? `Daily · ${timesPhrase(count, 'day')}` : label;
  }
  if (choice === 'week') {
    const stored = goal.targetAmount != null && goal.targetAmount > 0 ? goal.targetAmount : null;
    const count = stored ?? (goal.plannedDays?.length ?? 0);
    return count > 0 ? `Weekly · ${timesPhrase(count, 'week')}` : label;
  }
  const count = goal.targetAmount != null && goal.targetAmount > 0 ? goal.targetAmount : 0;
  return count > 0 ? `Monthly · ${timesPhrase(count, 'month')}` : label;
}

export function goalDetailSections(goal: Goal, weekStartsOn: WeekStart): DetailSection[] {
  const repeating = goal.plannedDays != null;
  const tracked = goal.unit != null;
  const period = goal.repeatPeriod;
  const choice = repeatPeriodChoice(goal);

  const titleRows: DetailRow[] = [
    { label: DETAIL_LABELS.title, value: goal.title.trim() || EMPTY },
  ];
  if (goal.parentId == null) {
    titleRows.push({
      label: DETAIL_LABELS.why,
      value: goal.why?.trim() || EMPTY,
    });
  }

  const trackRows: DetailRow[] = tracked
    ? [
        { label: DETAIL_LABELS.unit, value: goal.unit?.trim() || EMPTY },
        {
          label: targetAmountLabel(true, repeating, period),
          value: formatAmount(goal.targetAmount),
        },
      ]
    : [{ label: DETAIL_LABELS.track, value: DETAIL_LABELS.off }];

  const repeatRows: DetailRow[] = repeating
    ? [
        { label: DETAIL_LABELS.period, value: repeatSummary(goal, choice) },
        { label: DETAIL_LABELS.days, value: formatPlannedDays(goal.plannedDays, weekStartsOn) },
      ]
    : [{ label: DETAIL_LABELS.repeat, value: DETAIL_LABELS.off }];

  return [
    { id: 'title', title: null, rows: titleRows },
    {
      id: 'timeline',
      title: DETAIL_LABELS.timeline,
      rows: [
        { label: DETAIL_LABELS.status, value: formatStatus(goal.status) },
        { label: DETAIL_LABELS.started, value: formatDetailDate(goal.actualStartDate) },
        { label: DETAIL_LABELS.actualEnd, value: formatDetailDate(goal.actualEndDate) },
        { label: DETAIL_LABELS.targetStart, value: formatDetailDate(goal.targetStartDate) },
        { label: DETAIL_LABELS.targetEnd, value: formatDetailDate(goal.targetEndDate) },
      ],
    },
    { id: 'track', title: DETAIL_LABELS.track, rows: trackRows },
    { id: 'repeat', title: DETAIL_LABELS.repeat, rows: repeatRows },
    {
      id: 'notes',
      title: DETAIL_LABELS.notes,
      rows: [{ label: DETAIL_LABELS.notes, value: goal.description?.trim() || EMPTY }],
    },
  ];
}
