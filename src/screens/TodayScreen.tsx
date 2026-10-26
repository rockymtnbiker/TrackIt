import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
  type ViewInstance,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { KeyboardSafe } from '../components/KeyboardSafe';
import { showActionSheet } from '../components/showActionSheet';
import { useSettings } from '../context/SettingsContext';
import {
  deleteEntry,
  deleteEntryById,
  getAllGoals,
  getEntries,
  insertEntry,
  setGoalStatus,
  type UpsertedEntry,
} from '../lib/goalTreeApi';
import {
  entriesOnOrBefore,
  isPeriodTargetMetAsOf,
  oneTimeOnDate,
  periodTotalAsOf,
  startedOnOrBefore,
  type OneTimeOnDate,
} from '../lib/asOfDate';
import { goalStartDate } from '../lib/metrics';
import {
  buildChildrenMap,
  isDaily,
  isLeaf,
  completionDates,
  dayFill,
  dayProgress,
  daySessionMark,
  dayTotal,
  isDayComplete,
  isRepeating,
  isTracked,
  latestDayEntry,
  periodTarget,
  rollupTotal,
  timesPerDay,
  weekTargetFor,
  yesNoLogAction,
} from '../lib/goalTree';
import type { WeekStart } from '../lib/settingsApi';
import { endOfWeek, startOfWeek, weekDays, weekdayLabels } from '../lib/week';
import {
  ensureNotificationPermission,
  markEveningPromptAsked,
  NOTIFICATION_DENIED_MESSAGE,
  rebuildReminders,
  shouldOfferEveningPrompt,
} from '../lib/reminders';
import type { TodayStackParamList } from '../navigation/GoalsStackNavigator';
import type { GoalEntry, Goal, GoalStatus } from '../types/goal';
import { parseLocalDate, toLocalDateString, todayLocal } from '../lib/localDate';
import {
  addDays,
  formatDate,
  formatShortDate,
  getWeekday,
  isFutureDate,
  isPastDate,
  WEEKDAY_SHORT_LABELS,
} from '../utils/date';
import { calculateStreak, STREAK_LOOKBACK_DAYS } from '../utils/streak';

const RING_SIZE = 32;
const RING_CENTER = 16;
const RING_RADIUS = 13;
const RING_STROKE = 3;
const SEGMENT_GAP = 3;

type RepeatingRow = {
  id: string;
  title: string;
  tracked: boolean;
  isComplete: boolean;
  isInteractive: boolean;
  met: boolean;
  streak: number;
  periodCount: number;
  periodWord: string;
  progressRatio: number;
};

type ControlAction = 'toggle' | 'status' | 'log';

type StepControl =
  | { type: 'empty'; action: ControlAction }
  | { type: 'complete'; action: ControlAction }
  | {
      type: 'segmented';
      total: number;
      filled: number;
      loggedOnDay: boolean;
      action: 'toggle';
    }
  | { type: 'continuous'; progress: number; action: 'log' };

type StepGroup = {
  id: string;
  label: string | null;
  steps: Goal[];
};

function formatAmount(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return String(Math.round(value * 100) / 100);
}

function localEntry(goalId: string, date: string, value: number | null): GoalEntry {
  return {
    id: `local-${goalId}-${date}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    goalId,
    entryDate: date.slice(0, 10),
    value,
    createdAt: new Date().toISOString(),
  };
}

function withoutEntry(
  entries: GoalEntry[],
  goalId: string,
  date: string,
): GoalEntry[] {
  return entries.filter(
    (entry) => !(entry.goalId === goalId && entry.entryDate === date),
  );
}

function progressRatio(total: number, target: number | null): number {
  if (target == null || target <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, total / target));
}

function topLevelAncestor(
  node: Goal,
  byId: Map<string, Goal>,
): Goal | null {
  let current: Goal | undefined = node;
  let top: Goal | null = null;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    top = current;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return top;
}

/** Parent title only when the parent is not the top-level goal (depth 2+). */
function parentRowTitle(
  node: Goal,
  byId: Map<string, Goal>,
): string | undefined {
  if (node.parentId == null) {
    return undefined;
  }
  const parent = byId.get(node.parentId);
  if (!parent) {
    return undefined;
  }
  const top = topLevelAncestor(node, byId);
  if (!top || parent.id === top.id) {
    return undefined;
  }
  return parent.title;
}

function groupActionableSteps(
  steps: Goal[],
  byId: Map<string, Goal>,
): StepGroup[] {
  const groups: StepGroup[] = [];
  const indexById = new Map<string, number>();

  for (const step of steps) {
    const top = topLevelAncestor(step, byId) ?? step;
    let index = indexById.get(top.id);
    if (index == null) {
      index = groups.length;
      indexById.set(top.id, index);
      groups.push({ id: top.id, label: null, steps: [] });
    }
    groups[index]?.steps.push(step);
  }

  for (const group of groups) {
    const hasDescendant = group.steps.some((step) => step.id !== group.id);
    if (hasDescendant) {
      group.label = byId.get(group.id)?.title ?? null;
    }
  }

  return groups;
}

function buildStepControl(
  step: Goal,
  row: RepeatingRow | undefined,
  nodes: Goal[],
  entries: GoalEntry[],
  oneTimeDone: boolean,
  asOf: string,
  weekStartsOn: WeekStart,
): StepControl {
  if (!row) {
    if (oneTimeDone) {
      return { type: 'complete', action: 'status' };
    }
    if (isTracked(step)) {
      const total = rollupTotal(step, nodes, entries) ?? 0;
      const progress = progressRatio(total, step.targetAmount);
      if (progress >= 1) {
        return { type: 'complete', action: 'log' };
      }
      return { type: 'continuous', progress, action: 'log' };
    }
    return { type: 'empty', action: 'status' };
  }

  const tracked = isTracked(step);
  const month = step.repeatPeriod === 'month';
  const periodAmount = periodTarget(step, asOf, weekStartsOn);
  const amountTarget = periodAmount != null && periodAmount > 7;
  if (tracked || month || amountTarget) {
    const progress = progressRatio(row.periodCount, periodAmount);
    if (progress >= 1 || (tracked && row.met)) {
      return { type: 'complete', action: 'log' };
    }
    return { type: 'continuous', progress, action: 'log' };
  }

  if (dayProgress(step, entries, asOf).needed > 1) {
    const progress = dayProgress(step, entries, asOf);
    return {
      type: 'segmented',
      total: progress.needed,
      filled: Math.min(progress.needed, progress.count),
      loggedOnDay: isDayComplete(step, entries, asOf),
      action: 'toggle',
    };
  }

  const target = periodAmount;
  if (target != null && target > 0 && target <= 7) {
    const total = Math.max(1, Math.round(target));
    const filled = Math.min(total, Math.max(0, Math.round(row.periodCount)));
    if (filled >= total) {
      return { type: 'complete', action: 'toggle' };
    }
    return {
      type: 'segmented',
      total,
      filled,
      loggedOnDay: row.isComplete,
      action: 'toggle',
    };
  }

  if (row.isComplete) {
    return { type: 'complete', action: 'toggle' };
  }
  return { type: 'empty', action: 'toggle' };
}

function isRowDone(
  row: RepeatingRow | undefined,
  oneTimeDone: boolean,
  control: StepControl,
): boolean {
  if (!row) {
    return oneTimeDone;
  }
  if (control.type === 'complete') {
    return true;
  }
  return row.isComplete || row.met;
}

function periodPhrase(step: Goal): string {
  if (step.repeatPeriod === 'month') {
    return 'this month';
  }
  return 'this week';
}

function detailSubtitle(
  step: Goal,
  row: RepeatingRow | undefined,
  entries: GoalEntry[],
  nodes: Goal[],
  done: boolean,
  asOf: string,
  weekStartsOn: WeekStart,
): { text: string; overdue: boolean } | null {
  if (isTracked(step)) {
    const total = row
      ? row.periodCount
      : (rollupTotal(step, nodes, entriesOnOrBefore(entries, asOf)) ?? 0);
    const amountTarget = periodTarget(step, asOf, weekStartsOn);
    const target = amountTarget != null ? formatAmount(amountTarget) : '—';
    const unit = step.unit ?? '';
    const amount = `${formatAmount(total)} / ${target} ${unit}`.trim();
    const period = periodPhrase(step);
    return {
      text: row ? `${amount} ${period}` : amount,
      overdue: false,
    };
  }

  if (row && dayProgress(step, entries, asOf).needed > 1) {
    const progress = dayProgress(step, entries, asOf);
    return {
      text:
        asOf === todayLocal()
          ? `${progress.count} of ${progress.needed} today`
          : `${progress.count} of ${progress.needed}`,
      overdue: false,
    };
  }

  if (row) {
    const target = periodTarget(step, asOf, weekStartsOn);
    const count = formatAmount(row.periodCount);
    const text =
      target != null
        ? `${count} of ${formatAmount(target)} ${row.periodWord}`
        : `${count} ${row.periodWord}`;
    return { text, overdue: false };
  }

  if (step.targetEndDate) {
    const overdue = !done && isPastDate(step.targetEndDate, asOf);
    if (overdue) {
      return {
        text: `Overdue · ${formatShortDate(step.targetEndDate)}`,
        overdue: true,
      };
    }
    return { text: `Due ${formatShortDate(step.targetEndDate)}`, overdue: false };
  }

  return null;
}

/** Repeating steps stay on Today until they are marked done. */
function listedAsRepeating(node: Goal): boolean {
  return (
    (isRepeating(node) || node.repeatPeriod != null) && node.status !== 'done'
  );
}

/** True when a descendant is already the row for this branch on D. */
function workLivesOnDescendant(
  node: Goal,
  asOf: string,
  childrenMap: Map<string | null, Goal[]>,
): boolean {
  const stack = [...(childrenMap.get(node.id) ?? [])];
  const seen = new Set<string>();

  while (stack.length > 0) {
    const child = stack.pop();
    if (!child || seen.has(child.id)) {
      continue;
    }
    seen.add(child.id);
    if (listedAsRepeating(child) && startedOnOrBefore(child, asOf)) {
      return true;
    }
    if (oneTimeOnDate(child, asOf) !== 'hidden') {
      return true;
    }
    for (const grandchild of childrenMap.get(child.id) ?? []) {
      stack.push(grandchild);
    }
  }

  return false;
}

function showsInProgress(
  node: Goal,
  asOf: string,
  childrenMap: Map<string | null, Goal[]>,
): boolean {
  const appearance = oneTimeOnDate(node, asOf);
  if (appearance === 'hidden') {
    return false;
  }
  if (workLivesOnDescendant(node, asOf, childrenMap)) {
    return false;
  }
  return isLeaf(node, childrenMap) || appearance === 'open';
}

/**
 * Steps that already qualify for Today, in the same order as the Plan list:
 * top-level goals by sort order, then each goal's steps depth-first.
 */
function actionableInPlanOrder(
  nodes: Goal[],
  childrenMap: Map<string | null, Goal[]>,
  asOf: string,
): Goal[] {
  const included = new Set(
    nodes
      .filter(
        (node) =>
          (listedAsRepeating(node) && startedOnOrBefore(node, asOf)) ||
          showsInProgress(node, asOf, childrenMap),
      )
      .map((node) => node.id),
  );
  const ordered: Goal[] = [];
  const seen = new Set<string>();

  const walk = (node: Goal) => {
    seen.add(node.id);
    if (included.has(node.id)) {
      ordered.push(node);
    }
    for (const child of childrenMap.get(node.id) ?? []) {
      walk(child);
    }
  };

  for (const root of childrenMap.get(null) ?? []) {
    walk(root);
  }

  const leftovers = nodes
    .filter((node) => included.has(node.id) && !seen.has(node.id))
    .sort(
      (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title),
    );
  return [...ordered, ...leftovers];
}

/** Weeks rendered on each side of the initially focused week. */
const INITIAL_SIDE_WEEKS = 12;
/** Extend the window when the user is this many pages from an edge. */
const EXTEND_THRESHOLD = 4;
/** How many weeks to append/prepend when extending. */
const EXTEND_BATCH = 12;
/** Max weeks kept in the window (trim the far side). */
const MAX_WINDOW_WEEKS = 40;

function buildWeekWindow(centerWeekStart: string, sideWeeks: number): string[] {
  const weeks: string[] = [];
  for (let offset = -sideWeeks; offset <= sideWeeks; offset += 1) {
    weeks.push(addDays(centerWeekStart, offset * 7));
  }
  return weeks;
}

function prependWeeks(weekStarts: string[], count: number): string[] {
  const first = weekStarts[0];
  if (!first) {
    return weekStarts;
  }

  const prepended: string[] = [];
  for (let i = count; i >= 1; i -= 1) {
    prepended.push(addDays(first, -i * 7));
  }
  return [...prepended, ...weekStarts];
}

function appendWeeks(weekStarts: string[], count: number): string[] {
  const last = weekStarts[weekStarts.length - 1];
  if (!last) {
    return weekStarts;
  }

  const appended: string[] = [];
  for (let i = 1; i <= count; i += 1) {
    appended.push(addDays(last, i * 7));
  }
  return [...weekStarts, ...appended];
}

function boundedWeekWindow(
  focusWeekStart: string,
  minWeekStart: string,
  maxWeekStart: string,
  sideWeeks: number,
): { weeks: string[]; index: number } {
  const focus =
    focusWeekStart < minWeekStart
      ? minWeekStart
      : focusWeekStart > maxWeekStart
        ? maxWeekStart
        : focusWeekStart;
  const weeks = buildWeekWindow(focus, sideWeeks).filter(
    (week) => week >= minWeekStart && week <= maxWeekStart,
  );
  const safeWeeks = weeks.length > 0 ? weeks : [focus];
  return { weeks: safeWeeks, index: Math.max(0, safeWeeks.indexOf(focus)) };
}

function trimWeekWindow(
  weekStarts: string[],
  focusedIndex: number,
): { weeks: string[]; index: number } {
  if (weekStarts.length <= MAX_WINDOW_WEEKS) {
    return { weeks: weekStarts, index: focusedIndex };
  }

  const keepRadius = Math.floor(MAX_WINDOW_WEEKS / 2);
  let start = Math.max(0, focusedIndex - keepRadius);
  let end = start + MAX_WINDOW_WEEKS;
  if (end > weekStarts.length) {
    end = weekStarts.length;
    start = Math.max(0, end - MAX_WINDOW_WEEKS);
  }

  return {
    weeks: weekStarts.slice(start, end),
    index: focusedIndex - start,
  };
}

function ContinuousRing({ progress }: { progress: number }) {
  const circumference = 2 * Math.PI * RING_RADIUS;
  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
      <Circle
        cx={RING_CENTER}
        cy={RING_CENTER}
        r={RING_RADIUS}
        stroke="#E3E3E8"
        strokeWidth={RING_STROKE}
        fill="none"
      />
      {clamped > 0 ? (
        <Circle
          cx={RING_CENTER}
          cy={RING_CENTER}
          r={RING_RADIUS}
          stroke="#248A3D"
          strokeWidth={RING_STROKE}
          fill="none"
          strokeDasharray={`${circumference * clamped} ${circumference}`}
          rotation={-90}
          origin={`${RING_CENTER}, ${RING_CENTER}`}
        />
      ) : null}
    </Svg>
  );
}

function segmentArcPath(index: number, count: number): string {
  const gap = SEGMENT_GAP / RING_RADIUS;
  const sweep = (2 * Math.PI - count * gap) / count;
  const start = -Math.PI / 2 + index * (sweep + gap);
  const end = start + sweep;
  const x1 = RING_CENTER + RING_RADIUS * Math.cos(start);
  const y1 = RING_CENTER + RING_RADIUS * Math.sin(start);
  const x2 = RING_CENTER + RING_RADIUS * Math.cos(end);
  const y2 = RING_CENTER + RING_RADIUS * Math.sin(end);
  const large = sweep > Math.PI ? 1 : 0;
  return `M ${x1} ${y1} A ${RING_RADIUS} ${RING_RADIUS} 0 ${large} 1 ${x2} ${y2}`;
}

function SegmentedRing({ total, filled }: { total: number; filled: number }) {
  const count = Math.max(1, Math.round(total));
  const done = Math.max(0, Math.min(count, Math.round(filled)));
  return (
    <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
      {Array.from({ length: count }, (_, index) => (
        <Path
          key={index}
          d={segmentArcPath(index, count)}
          stroke={index < done ? '#248A3D' : '#E3E3E8'}
          strokeWidth={RING_STROKE}
          fill="none"
        />
      ))}
    </Svg>
  );
}

function StepControlGraphic({ control }: { control: StepControl }) {
  if (control.type === 'complete') {
    return (
      <View style={styles.graphic}>
        <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
          <Circle
            cx={RING_CENTER}
            cy={RING_CENTER}
            r={RING_RADIUS + RING_STROKE / 2}
            fill="#248A3D"
          />
        </Svg>
        <View style={styles.graphicOverlay} pointerEvents="none">
          <Ionicons name="checkmark" size={16} color="#FFFFFF" />
        </View>
      </View>
    );
  }

  if (control.type === 'empty') {
    return (
      <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
        <Circle
          cx={RING_CENTER}
          cy={RING_CENTER}
          r={RING_RADIUS}
          stroke="#C7C7CC"
          strokeWidth={2.5}
          fill="none"
        />
      </Svg>
    );
  }

  if (control.type === 'segmented') {
    return (
      <View style={styles.graphic}>
        <SegmentedRing total={control.total} filled={control.filled} />
        {control.loggedOnDay ? (
          <View style={styles.graphicOverlay} pointerEvents="none">
            <Ionicons name="checkmark" size={12} color="#248A3D" />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.graphic}>
      <ContinuousRing progress={control.progress} />
      <View style={styles.graphicOverlay} pointerEvents="none">
        <Ionicons name="add" size={14} color="#0062CC" />
      </View>
    </View>
  );
}

function DetailLine({
  parentTitle,
  detail,
  overdue,
  streak,
  minStreak = 3,
}: {
  parentTitle?: string;
  detail?: string;
  overdue: boolean;
  streak: number;
  minStreak?: number;
}) {
  const showStreak = streak >= minStreak;

  return (
    <>
      {parentTitle ? (
        <Text style={styles.subtitle} numberOfLines={1}>
          {parentTitle}
        </Text>
      ) : null}
      {detail || showStreak ? (
        <Text style={styles.subtitle}>
          {detail ? (
            <Text style={overdue ? styles.subtitleOverdue : undefined}>{detail}</Text>
          ) : null}
          {detail && showStreak ? ' · ' : null}
          {showStreak ? (
            <Text style={styles.streakText}>
              <Ionicons name="flame" size={13} color="#C2410C" />
              {` ${streak}-day streak`}
            </Text>
          ) : null}
        </Text>
      ) : null}
    </>
  );
}

function WeekPage({
  days,
  today,
  selectedDate,
  onSelectDate,
  width,
}: {
  days: { dateString: string; label: string; dayNumber: number }[];
  today: string;
  selectedDate: string;
  onSelectDate: (dateString: string) => void;
  width: number;
}) {
  return (
    <View style={[styles.weekStrip, { width }]}>
      {days.map((day) => {
        const isToday = day.dateString === today;
        const isSelected = day.dateString === selectedDate;

        return (
          <Pressable
            key={day.dateString}
            onPress={() => onSelectDate(day.dateString)}
            style={({ pressed }) => [
              styles.weekDayCell,
              isToday && styles.weekDayCellToday,
              isSelected && !isToday && styles.weekDayCellSelected,
              isSelected && isToday && styles.weekDayCellSelectedToday,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.weekDayAbbrev,
                isToday && styles.weekDayTextToday,
                isSelected && !isToday && styles.weekDayTextSelected,
              ]}
            >
              {day.label}
            </Text>
            <Text
              style={[
                styles.weekDayNumber,
                isToday && styles.weekDayTextToday,
                isSelected && !isToday && styles.weekDayTextSelected,
              ]}
            >
              {day.dayNumber}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function InfiniteWeekPager({
  today,
  selectedDate,
  onSelectDate,
  onVisibleWeekChange,
  listRef,
  weekStarts,
  setWeekStarts,
  pageIndex,
  setPageIndex,
  minWeekStart,
  maxWeekStart,
  pinnedSelectionRef,
  weekStartsOn,
}: {
  today: string;
  selectedDate: string;
  onSelectDate: (dateString: string) => void;
  onVisibleWeekChange: (weekStart: string) => void;
  listRef: React.RefObject<FlatList<string> | null>;
  weekStarts: string[];
  setWeekStarts: React.Dispatch<React.SetStateAction<string[]>>;
  pageIndex: number;
  setPageIndex: React.Dispatch<React.SetStateAction<number>>;
  minWeekStart: string;
  maxWeekStart: string;
  pinnedSelectionRef: { current: string | null };
  weekStartsOn: WeekStart;
}) {
  const [pageWidth, setPageWidth] = useState(0);
  const isAdjustingRef = useRef(false);
  const pageIndexRef = useRef(pageIndex);
  const selectedDateRef = useRef(selectedDate);
  const weekStartsRef = useRef(weekStarts);
  const minWeekRef = useRef(minWeekStart);
  const maxWeekRef = useRef(maxWeekStart);
  pageIndexRef.current = pageIndex;
  selectedDateRef.current = selectedDate;
  weekStartsRef.current = weekStarts;
  minWeekRef.current = minWeekStart;
  maxWeekRef.current = maxWeekStart;

  const scrollToIndexSafe = useCallback(
    (index: number, animated: boolean) => {
      requestAnimationFrame(() => {
        listRef.current?.scrollToIndex({ index, animated });
        requestAnimationFrame(() => {
          isAdjustingRef.current = false;
        });
      });
    },
    [listRef],
  );

  const ensureWindowCapacity = useCallback(
    (index: number) => {
      const current = weekStartsRef.current;
      let next = current;
      let nextIndex = index;
      let needsScrollAdjust = false;

      if (index < EXTEND_THRESHOLD && current[0] > minWeekRef.current) {
        const extended = prependWeeks(next, EXTEND_BATCH).filter(
          (week) => week >= minWeekRef.current,
        );
        const added = extended.length - next.length;
        next = extended;
        nextIndex = index + added;
        needsScrollAdjust = added > 0;
      } else if (
        index > current.length - 1 - EXTEND_THRESHOLD &&
        current[current.length - 1] < maxWeekRef.current
      ) {
        next = appendWeeks(next, EXTEND_BATCH).filter(
          (week) => week <= maxWeekRef.current,
        );
      }

      const trimmed = trimWeekWindow(next, nextIndex);
      if (trimmed.index !== nextIndex) {
        needsScrollAdjust = true;
      }

      const weeksChanged =
        trimmed.weeks.length !== current.length ||
        trimmed.weeks[0] !== current[0] ||
        trimmed.weeks[trimmed.weeks.length - 1] !==
          current[current.length - 1];

      if (!weeksChanged && trimmed.index === index) {
        return;
      }

      if (needsScrollAdjust) {
        isAdjustingRef.current = true;
      }

      weekStartsRef.current = trimmed.weeks;
      pageIndexRef.current = trimmed.index;
      setWeekStarts(trimmed.weeks);
      setPageIndex(trimmed.index);

      if (needsScrollAdjust) {
        scrollToIndexSafe(trimmed.index, false);
      }
    },
    [scrollToIndexSafe, setPageIndex, setWeekStarts],
  );

  const handleWeekSettled = useCallback(
    (index: number) => {
      if (isAdjustingRef.current) {
        return;
      }

      const weekStart = weekStartsRef.current[index];
      if (!weekStart) {
        return;
      }

      const currentSelected = selectedDateRef.current;
      const selectedOffset = Math.max(
        0,
        Math.min(
          6,
          weekDays(currentSelected, weekStartsOn).indexOf(currentSelected),
        ),
      );

      pageIndexRef.current = index;
      setPageIndex(index);
      onVisibleWeekChange(weekStart);
      const pinned = pinnedSelectionRef.current;
      if (pinned && startOfWeek(pinned, weekStartsOn) === weekStart) {
        pinnedSelectionRef.current = null;
        onSelectDate(pinned);
      } else {
        pinnedSelectionRef.current = null;
        onSelectDate(addDays(weekStart, selectedOffset));
      }
      ensureWindowCapacity(index);
    },
    [
      ensureWindowCapacity,
      onSelectDate,
      onVisibleWeekChange,
      pinnedSelectionRef,
      setPageIndex,
      weekStartsOn,
    ],
  );

  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!pageWidth || isAdjustingRef.current) {
        return;
      }

      const index = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
      const clamped = Math.max(
        0,
        Math.min(weekStartsRef.current.length - 1, index),
      );

      if (clamped === pageIndexRef.current) {
        ensureWindowCapacity(clamped);
        return;
      }

      handleWeekSettled(clamped);
    },
    [ensureWindowCapacity, handleWeekSettled, pageWidth],
  );

  const renderItem = useCallback(
    ({ item: weekStart }: ListRenderItemInfo<string>) => (
      <WeekPage
        days={weekDays(weekStart, weekStartsOn).map((dateString, index) => ({
          dateString,
          label: weekdayLabels(weekStartsOn)[index] ?? '',
          dayNumber: parseLocalDate(dateString).getDate(),
        }))}
        today={today}
        selectedDate={selectedDate}
        onSelectDate={onSelectDate}
        width={pageWidth}
      />
    ),
    [onSelectDate, pageWidth, selectedDate, today],
  );

  const getItemLayout = useCallback(
    (_: ArrayLike<string> | null | undefined, index: number) => ({
      length: pageWidth,
      offset: pageWidth * index,
      index,
    }),
    [pageWidth],
  );

  return (
    <View
      style={styles.weekPager}
      onLayout={(event) => {
        const width = event.nativeEvent.layout.width;
        if (width > 0 && width !== pageWidth) {
          setPageWidth(width);
        }
      }}
    >
      {pageWidth > 0 ? (
        <FlatList
          ref={listRef}
          data={weekStarts}
          keyExtractor={(item) => item}
          horizontal
          pagingEnabled
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={pageIndex}
          getItemLayout={getItemLayout}
          renderItem={renderItem}
          onMomentumScrollEnd={onMomentumScrollEnd}
          onScrollToIndexFailed={({ index }) => {
            listRef.current?.scrollToOffset({
              offset: index * pageWidth,
              animated: false,
            });
          }}
          windowSize={5}
          maxToRenderPerBatch={3}
          initialNumToRender={3}
          removeClippedSubviews
        />
      ) : null}
    </View>
  );
}

function controlLabel(
  step: Goal,
  control: StepControl,
  loggedOnDay: boolean,
): string {
  if (timesPerDay(step) > 1 && control.action === 'toggle') {
    return loggedOnDay ? 'Done today. Tap to undo' : 'Log a dose';
  }
  if (control.action === 'toggle' && !isDaily(step) && loggedOnDay) {
    return 'Logged. Tap for options';
  }
  if (control.action === 'log') {
    return 'Log an amount';
  }
  if (control.action === 'status') {
    return `Status ${step.status}. Tap to change.`;
  }
  return loggedOnDay || control.type === 'complete'
    ? 'Mark habit incomplete'
    : 'Mark habit complete';
}

function dateKey(date: Date): string {
  return toLocalDateString(date);
}

function WeekDots({
  goal,
  entries,
  asOf,
  weekStartsOn,
}: {
  goal: Goal;
  entries: GoalEntry[];
  asOf: string;
  weekStartsOn: WeekStart;
}) {
  const days = weekDays(asOf, weekStartsOn);
  const labels = weekdayLabels(weekStartsOn);
  const start = goalStartDate(goal);
  const startWeek = startOfWeek(start, weekStartsOn);
  const available = new Set(
    weekTargetFor(goal, asOf, weekStartsOn).availableDays.map(dateKey),
  );
  const doneNames = days
    .filter((day) => day <= asOf && day >= start && dayFill(goal, entries, day) === 'complete')
    .map((day) => labels[days.indexOf(day)] ?? '');
  const label =
    doneNames.length > 0 ? `Done ${doneNames.join(', ')}` : 'No days done';

  return (
    <View
      accessible
      accessibilityLabel={label}
      pointerEvents="none"
      style={styles.weekDots}
    >
      {days.map((day) => {
        if (startOfWeek(day, weekStartsOn) < startWeek) {
          return <View key={day} style={styles.weekDotSlot} />;
        }
        if (!available.has(day)) {
          return (
            <View
              key={day}
              style={styles.weekDotSlot}
              accessible={false}
              accessibilityState={{ disabled: true }}
            >
              <View style={[styles.weekDot, styles.weekDotDisabled]} />
            </View>
          );
        }
        const selected = day === asOf;
        const after = day > asOf;
        const fill = dayFill(goal, entries, day);
        const sessions = after ? null : daySessionMark(goal, entries, day);
        return (
          <View key={day} style={styles.weekDotSlot}>
            <View style={styles.weekDotBox}>
              {selected ? <View style={styles.weekDotRing} /> : null}
              {after ? (
                <View style={[styles.weekDot, styles.weekDotHollow]} />
              ) : fill === 'complete' ? (
                <View style={[styles.weekDot, styles.weekDotDone]} />
              ) : fill === 'partial' ? (
                <View style={[styles.weekDot, styles.weekDotPartial]}>
                  <View style={styles.weekDotPartialFill} />
                </View>
              ) : (
                <View style={[styles.weekDot, styles.weekDotMissed]} />
              )}
            </View>
            {sessions != null ? (
              <Text style={styles.weekDotSessions}>{`×${sessions}`}</Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function DoRow({
  title,
  parentTitle,
  detail,
  overdue,
  streak,
  minStreak,
  done,
  fresh = false,
  control,
  controlDisabled,
  controlLabelText,
  loggedOnDay,
  trailing,
  onOpen,
  onControl,
}: {
  title: string;
  parentTitle?: string;
  detail?: string;
  overdue: boolean;
  streak: number;
  minStreak?: number;
  done: boolean;
  fresh?: boolean;
  control: StepControl;
  controlDisabled: boolean;
  controlLabelText: string;
  loggedOnDay: boolean;
  trailing?: ReactNode;
  onOpen: () => void;
  onControl: () => void;
}) {
  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [
        styles.doRow,
        fresh && styles.doRowFresh,
        pressed && styles.pressed,
      ]}
    >
      <Pressable
        onPress={onControl}
        disabled={controlDisabled}
        hitSlop={4}
        style={({ pressed }) => [
          styles.controlHit,
          controlDisabled && styles.controlDisabled,
          pressed && !controlDisabled && styles.pressed,
        ]}
        accessibilityRole={control.action === 'toggle' ? 'checkbox' : 'button'}
        accessibilityState={{
          disabled: controlDisabled,
          checked:
            control.action === 'toggle'
              ? loggedOnDay || control.type === 'complete'
              : undefined,
        }}
        accessibilityLabel={controlLabelText}
      >
        <StepControlGraphic control={control} />
      </Pressable>
      <View style={styles.checklistContent}>
        <View style={styles.titleLine}>
          <Text style={[styles.checklistTitle, done && styles.checklistTitleDone]}>
            {title}
          </Text>
          {fresh ? (
            <View style={styles.newPill}>
              <Text style={styles.newPillText}>New</Text>
            </View>
          ) : null}
        </View>
        <DetailLine
          parentTitle={parentTitle}
          detail={detail}
          overdue={overdue}
          streak={streak}
          minStreak={minStreak}
        />
      </View>
      {trailing}
    </Pressable>
  );
}

function getChecklistHeading(selectedDate: string, today: string): string {
  if (selectedDate === today) {
    return 'Today';
  }

  return formatDate(selectedDate);
}

export default function TodayScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<TodayStackParamList>>();
  const route = useRoute<RouteProp<TodayStackParamList, 'TodayMain'>>();
  const focusToday = route.params?.focusToday;
  const freshGoalId = route.params?.freshGoalId;
  const { settings } = useSettings();
  const weekStartsOn = settings.weekStart;
  const today = todayLocal();
  const todayWeekStart = startOfWeek(today, weekStartsOn);

  const [selectedDate, setSelectedDate] = useState(today);
  const [visibleWeekStart, setVisibleWeekStart] = useState(todayWeekStart);
  const [goalsLoaded, setGoalsLoaded] = useState(false);
  const [weekStarts, setWeekStarts] = useState(() =>
    boundedWeekWindow(
      todayWeekStart,
      addDays(todayWeekStart, -INITIAL_SIDE_WEEKS * 7),
      todayWeekStart,
      INITIAL_SIDE_WEEKS,
    ).weeks,
  );
  const [pageIndex, setPageIndex] = useState(INITIAL_SIDE_WEEKS);
  const pinnedSelectionRef = useRef<string | null>(null);
  const selectedDateRef = useRef(selectedDate);
  selectedDateRef.current = selectedDate;
  const listRef = useRef<FlatList<string> | null>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrollHostRef = useRef<ViewInstance>(null);
  const scrollOffset = useRef(0);
  const rowRefs = useRef(new Map<string, ViewInstance>());
  const scrolledFresh = useRef<string | null>(null);
  const handledFresh = useRef<string | null>(null);
  const highlightRef = useRef<string | null>(null);

  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [cardGoalId, setCardGoalId] = useState<string | null>(null);
  const [cardMode, setCardMode] = useState<'prompt' | 'simple' | null>(null);
  const cardGoalRef = useRef<string | null>(null);
  highlightRef.current = highlightId;
  cardGoalRef.current = cardGoalId;

  const [nodes, setNodes] = useState<Goal[]>([]);
  const [entries, setEntries] = useState<GoalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [logStepId, setLogStepId] = useState<string | null>(null);
  const [logAmount, setLogAmount] = useState('');
  const [logError, setLogError] = useState<string | null>(null);
  const pendingTogglesRef = useRef<Set<string>>(new Set());
  const visibleWeekStartRef = useRef(visibleWeekStart);
  const nodesRef = useRef(nodes);
  const entriesRef = useRef(entries);
  const requestedWeekRef = useRef(visibleWeekStart);
  visibleWeekStartRef.current = visibleWeekStart;
  nodesRef.current = nodes;
  entriesRef.current = entries;

  const loadEntryLogs = useCallback(
    async (nodeList: Goal[], weekStart: string) => {
      const ids = nodeList
        .filter((node) => isRepeating(node) || isTracked(node))
        .map((node) => node.id);
      if (ids.length === 0) {
        return [];
      }
      const weekEnd = endOfWeek(weekStart, weekStartsOn);
      const monthStart = `${weekStart.slice(0, 7)}-01`;
      const lookbackStart = addDays(weekStart, -STREAK_LOOKBACK_DAYS);
      return getEntries(
        ids,
        lookbackStart < monthStart ? lookbackStart : monthStart,
        weekEnd,
      );
    },
    [weekStartsOn],
  );

  const loadTodayData = useCallback(
    async (weekStart: string) => {
      setLoadError(null);
      try {
        const nextNodes = await getAllGoals();
        setNodes(nextNodes);
        setGoalsLoaded(true);
        requestedWeekRef.current = weekStart;
        const nextEntries = await loadEntryLogs(nextNodes, weekStart);
        if (requestedWeekRef.current === weekStart) {
          setEntries(nextEntries);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to load today.';
        setLoadError(message);
      } finally {
        setLoading(false);
      }
    },
    [loadEntryLogs],
  );

  useFocusEffect(
    useCallback(() => {
      void loadTodayData(visibleWeekStartRef.current);
    }, [loadTodayData]),
  );

  const handleVisibleWeekChange = useCallback(
    (weekStart: string) => {
      setVisibleWeekStart(weekStart);
      requestedWeekRef.current = weekStart;
      void (async () => {
        try {
          const nextEntries = await loadEntryLogs(nodesRef.current, weekStart);
          if (requestedWeekRef.current === weekStart) {
            setEntries(nextEntries);
          }
        } catch (error) {
          console.warn('Failed to refresh completions for week', error);
        }
      })();
    },
    [loadEntryLogs],
  );

  const visibleDays = useMemo(
    () =>
      weekDays(visibleWeekStart, weekStartsOn).map((dateString, index) => ({
        dateString,
        label: weekdayLabels(weekStartsOn)[index] ?? '',
        dayNumber: parseLocalDate(dateString).getDate(),
      })),
    [visibleWeekStart, weekStartsOn],
  );
  const isViewingCurrentWeek = visibleWeekStart === todayWeekStart;
  const earliestWeekStart = useMemo(() => {
    const fallback = addDays(todayWeekStart, -INITIAL_SIDE_WEEKS * 7);
    if (!goalsLoaded) {
      return fallback;
    }
    if (nodes.length === 0) {
      return todayWeekStart;
    }
    let earliest = today;
    for (const node of nodes) {
      const start = goalStartDate(node);
      if (start < earliest) {
        earliest = start;
      }
    }
    const week = startOfWeek(earliest, weekStartsOn);
    return week > todayWeekStart ? todayWeekStart : week;
  }, [goalsLoaded, nodes, today, todayWeekStart, weekStartsOn]);
  const canGoPrevious = visibleWeekStart > earliestWeekStart;
  const canGoNext = visibleWeekStart < todayWeekStart;

  const showWeek = useCallback(
    (weekStart: string, nextDate: string) => {
      const target =
        weekStart < earliestWeekStart
          ? earliestWeekStart
          : weekStart > todayWeekStart
            ? todayWeekStart
            : weekStart;
      const offset = weekDays(nextDate, weekStartsOn).indexOf(nextDate);
      const date =
        startOfWeek(nextDate, weekStartsOn) === target
          ? nextDate
          : addDays(target, offset < 0 ? 0 : offset);
      pinnedSelectionRef.current = date;
      setSelectedDate(date);
      setVisibleWeekStart(target);
      requestedWeekRef.current = target;

      const existingIndex = weekStarts.indexOf(target);
      if (existingIndex >= 0) {
        setPageIndex(existingIndex);
        requestAnimationFrame(() => {
          listRef.current?.scrollToIndex({ index: existingIndex, animated: true });
        });
      } else {
        const window = boundedWeekWindow(
          target,
          earliestWeekStart,
          todayWeekStart,
          INITIAL_SIDE_WEEKS,
        );
        setWeekStarts(window.weeks);
        setPageIndex(window.index);
        requestAnimationFrame(() => {
          listRef.current?.scrollToIndex({ index: window.index, animated: false });
        });
      }

      void (async () => {
        try {
          const nextEntries = await loadEntryLogs(nodesRef.current, target);
          if (requestedWeekRef.current === target) {
            setEntries(nextEntries);
          }
        } catch (error) {
          console.warn('Failed to refresh completions for week', error);
        }
      })();
    },
    [earliestWeekStart, loadEntryLogs, todayWeekStart, weekStarts, weekStartsOn],
  );

  const showWeekRef = useRef(showWeek);
  showWeekRef.current = showWeek;
  useEffect(() => {
    if (focusToday == null) {
      return;
    }
    const day = todayLocal();
    showWeekRef.current(startOfWeek(day, weekStartsOn), day);
  }, [focusToday, weekStartsOn]);

  useEffect(() => {
    if (!freshGoalId || handledFresh.current === freshGoalId) {
      return;
    }
    handledFresh.current = freshGoalId;
    scrolledFresh.current = null;
    cardGoalRef.current = freshGoalId;
    setHighlightId(freshGoalId);
    setCardGoalId(freshGoalId);
    setCardMode(null);
    navigation.setParams({ freshGoalId: undefined });
    void shouldOfferEveningPrompt().then((offer) => {
      if (handledFresh.current !== freshGoalId || cardGoalRef.current !== freshGoalId) {
        return;
      }
      setCardMode(offer ? 'prompt' : 'simple');
    });
  }, [freshGoalId, navigation]);

  useEffect(() => {
    if (!highlightId) {
      return;
    }
    const timer = setTimeout(() => setHighlightId(null), 5000);
    return () => clearTimeout(timer);
  }, [highlightId]);

  useEffect(() => {
    if (cardMode !== 'simple') {
      return;
    }
    const timer = setTimeout(() => setCardMode(null), 5000);
    return () => clearTimeout(timer);
  }, [cardMode, cardGoalId]);

  const dismissCreatedCard = () => {
    cardGoalRef.current = null;
    setCardGoalId(null);
    setCardMode(null);
  };

  const declineNudge = () => {
    void markEveningPromptAsked();
    dismissCreatedCard();
  };

  const acceptNudge = () => {
    void (async () => {
      await markEveningPromptAsked();
      const granted = await ensureNotificationPermission();
      dismissCreatedCard();
      if (!granted) {
        Alert.alert('Notifications', NOTIFICATION_DENIED_MESSAGE);
        return;
      }
      await rebuildReminders();
    })();
  };

  const scrollFreshRow = (goalId: string) => {
    if (scrolledFresh.current === goalId) {
      return;
    }
    const row = rowRefs.current.get(goalId);
    const scroll = scrollRef.current;
    const host = scrollHostRef.current;
    if (!row || !scroll || !host) {
      return;
    }
    row.measureInWindow((_rowX, rowY) => {
      host.measureInWindow((_scrollX, scrollTop) => {
        if (scrolledFresh.current === goalId) {
          return;
        }
        scrolledFresh.current = goalId;
        scroll.scrollTo({
          y: Math.max(0, scrollOffset.current + (rowY - scrollTop) - 16),
          animated: true,
        });
      });
    });
  };

  const clearHighlightOnTouch = () => {
    if (highlightRef.current) {
      setHighlightId(null);
    }
    return false;
  };

  const appliedWeekStart = useRef(weekStartsOn);
  useEffect(() => {
    if (!goalsLoaded) {
      return;
    }
    const settingChanged = appliedWeekStart.current !== weekStartsOn;
    appliedWeekStart.current = weekStartsOn;
    const anchor = settingChanged
      ? selectedDateRef.current
      : visibleWeekStartRef.current;
    const focus = startOfWeek(anchor, weekStartsOn);
    const window = boundedWeekWindow(
      focus,
      earliestWeekStart,
      todayWeekStart,
      INITIAL_SIDE_WEEKS,
    );
    const nextWeek = window.weeks[window.index] ?? todayWeekStart;
    setWeekStarts(window.weeks);
    setPageIndex(window.index);
    if (nextWeek !== visibleWeekStartRef.current) {
      const selected = selectedDateRef.current;
      const inWeek = weekDays(nextWeek, weekStartsOn).includes(selected);
      const offset = weekDays(selected, weekStartsOn).indexOf(selected);
      const nextDate = inWeek ? selected : addDays(nextWeek, offset < 0 ? 0 : offset);
      pinnedSelectionRef.current = nextDate;
      setSelectedDate(nextDate);
      setVisibleWeekStart(nextWeek);
      requestedWeekRef.current = nextWeek;
      void loadEntryLogs(nodesRef.current, nextWeek)
        .then((nextEntries) => {
          if (requestedWeekRef.current === nextWeek) {
            setEntries(nextEntries);
          }
        })
        .catch((error) => {
          console.warn('Failed to refresh completions for week', error);
        });
    }
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: window.index, animated: false });
    });
  }, [earliestWeekStart, goalsLoaded, loadEntryLogs, todayWeekStart, weekStartsOn]);

  const nodesById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );
  const childrenMap = useMemo(() => buildChildrenMap(nodes), [nodes]);

  const repeatingRows = useMemo(() => {
    const future = isFutureDate(selectedDate, today);
    return nodes
      .filter((node) => listedAsRepeating(node))
      .map((node): RepeatingRow => {
        const tracked = isTracked(node);
        const total = periodTotalAsOf(node, entries, selectedDate, weekStartsOn);
        const period = periodPhrase(node);
        return {
          id: node.id,
          title: node.title,
          tracked,
          isComplete: isDayComplete(node, entries, selectedDate),
          isInteractive: !future,
          met: isPeriodTargetMetAsOf(node, entries, selectedDate, weekStartsOn),
          streak: calculateStreak(
            completionDates(node, entriesOnOrBefore(entries, selectedDate)),
            selectedDate,
            goalStartDate(node),
          ),
          periodCount: total,
          periodWord: period,
          progressRatio: progressRatio(total, periodTarget(node, selectedDate, weekStartsOn)),
        };
      });
  }, [entries, nodes, selectedDate, today, weekStartsOn]);

  const orderedSteps = useMemo(
    () => actionableInPlanOrder(nodes, childrenMap, selectedDate),
    [childrenMap, nodes, selectedDate],
  );
  const stepGroups = useMemo(
    () => groupActionableSteps(orderedSteps, nodesById),
    [nodesById, orderedSteps],
  );
  const repeatingById = useMemo(
    () => new Map(repeatingRows.map((row) => [row.id, row])),
    [repeatingRows],
  );

  const jumpToToday = () => {
    showWeek(todayWeekStart, today);
  };

  const handleOneTime = (step: Goal, appearance: OneTimeOnDate) => {
    if (appearance === 'hidden' || isFutureDate(selectedDate, today)) {
      return;
    }

    const markingDone = appearance === 'open';
    const next: GoalStatus = markingDone ? 'done' : 'active';
    const previous = nodes.find((node) => node.id === step.id) ?? step;

    setNodes((current) =>
      current.map((node) => {
        if (node.id !== step.id) {
          return node;
        }
        if (markingDone) {
          return {
            ...node,
            status: 'done',
            actualEndDate: selectedDate,
          };
        }
        return {
          ...node,
          status: next,
          actualEndDate: null,
        };
      }),
    );

    void setGoalStatus(step.id, next, markingDone ? selectedDate : undefined)
      .then((updated) => {
        setNodes((current) =>
          current.map((node) => (node.id === updated.id ? updated : node)),
        );
      })
      .catch((error) => {
        console.warn('Failed to update step status', error);
        setNodes((current) =>
          current.map((node) => (node.id === step.id ? previous : node)),
        );
      });
  };

  const applySavedGoals = (goals: Goal[]) => {
    if (goals.length === 0) {
      return;
    }
    const byId = new Map(goals.map((goal) => [goal.id, goal]));
    setNodes((current) => current.map((item) => byId.get(item.id) ?? item));
  };

  const openLog = (goalId: string) => {
    if (isFutureDate(selectedDate, today)) {
      return;
    }
    setLogAmount('');
    setLogError(null);
    setLogStepId(goalId);
  };

  const closeLog = () => {
    setLogStepId(null);
    setLogAmount('');
    setLogError(null);
  };

  const applyEntryChange = (
    goalId: string,
    date: string,
    nextEntries: GoalEntry[],
    persist: Promise<UpsertedEntry | void>,
    localId?: string,
  ) => {
    const previous = entriesRef.current;
    const toggleKey = `${goalId}:${date}`;
    if (pendingTogglesRef.current.has(toggleKey)) {
      return;
    }
    setEntries(nextEntries);
    pendingTogglesRef.current.add(toggleKey);
    void persist
      .then((saved) => {
        if (!saved) {
          return;
        }
        applySavedGoals(saved.goals);
        setEntries((current) =>
          current.map((entry) => (entry.id === localId ? saved.entry : entry)),
        );
      })
      .catch((error) => {
        console.warn('Failed to update log', error);
        setEntries(previous);
        Alert.alert(
          'Could not log',
          error instanceof Error ? error.message : 'Could not save this log.',
        );
      })
      .finally(() => {
        pendingTogglesRef.current.delete(toggleKey);
      });
  };

  const insertLog = (goalId: string, date: string, value: number | null) => {
    const local = localEntry(goalId, date, value);
    applyEntryChange(
      goalId,
      date,
      [...entriesRef.current, local],
      insertEntry(goalId, date, value),
      local.id,
    );
  };

  const undoLastLog = (goalId: string, date: string) => {
    const latest = latestDayEntry(entriesRef.current, goalId, date);
    if (!latest) {
      return;
    }
    const next = entriesRef.current.filter((entry) => entry.id !== latest.id);
    const persist = latest.id.startsWith('local-')
      ? Promise.resolve()
      : deleteEntryById(latest.id).then(() => undefined);
    applyEntryChange(goalId, date, next, persist);
  };

  const clearDayLogs = (goalId: string, date: string) => {
    applyEntryChange(
      goalId,
      date,
      withoutEntry(entriesRef.current, goalId, date),
      deleteEntry(goalId, date).then(() => undefined),
    );
  };

  const handleYesNo = (step: Goal) => {
    if (isFutureDate(selectedDate, today) || isTracked(step)) {
      return;
    }
    const action = yesNoLogAction(step, entriesRef.current, selectedDate);
    if (action === 'insert') {
      insertLog(step.id, selectedDate, null);
      return;
    }
    if (action === 'remove-day') {
      clearDayLogs(step.id, selectedDate);
      return;
    }
    if (action === 'full-sheet') {
      showActionSheet('Today', ['Undo one', 'Clear today'], (index) => {
        if (index === 0) {
          undoLastLog(step.id, selectedDate);
        } else if (index === 1) {
          clearDayLogs(step.id, selectedDate);
        }
      });
      return;
    }
    showActionSheet('Today', ['Log another', 'Undo last'], (index) => {
      if (index === 0) {
        insertLog(step.id, selectedDate, null);
      } else if (index === 1) {
        undoLastLog(step.id, selectedDate);
      }
    });
  };

  const handleAddAmount = () => {
    if (!logStepId) {
      return;
    }
    const trimmed = logAmount.trim();
    const amount = Number(trimmed);
    if (!trimmed || !Number.isFinite(amount) || amount <= 0) {
      setLogError('Enter a number greater than zero.');
      return;
    }
    const goalId = logStepId;
    closeLog();
    insertLog(goalId, selectedDate, amount);
  };

  const handleUndoLastAmount = () => {
    if (!logStepId) {
      return;
    }
    undoLastLog(logStepId, selectedDate);
  };

  const handleClearDay = () => {
    if (!logStepId) {
      return;
    }
    const goalId = logStepId;
    Alert.alert(
      'Clear this day?',
      'This removes the amount logged for this day.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            closeLog();
            clearDayLogs(goalId, selectedDate);
          },
        },
      ],
    );
  };

  const logStep = logStepId
    ? nodes.find((node) => node.id === logStepId) ?? null
    : null;

  if (loading && nodes.length === 0) {
    return (
      <SafeAreaView style={styles.loadingState} edges={['top']}>
        <ActivityIndicator color="#007aff" />
      </SafeAreaView>
    );
  }

  if (loadError && nodes.length === 0) {
    return (
      <SafeAreaView style={styles.loadingState} edges={['top']}>
        <Text style={styles.errorText}>{loadError}</Text>
        <Pressable
          onPress={() => void loadTodayData(visibleWeekStart)}
          style={({ pressed }) => [
            styles.retryButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={styles.container}
      edges={['top']}
      onStartShouldSetResponderCapture={clearHighlightOnTouch}
    >
    <View ref={scrollHostRef} style={styles.container}>
    <ScrollView
      ref={scrollRef}
      onScroll={(event) => {
        scrollOffset.current = event.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={16}
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        cardMode ? styles.contentWithCard : null,
      ]}
    >
      <View style={styles.headerBlock}>
      <View style={styles.weekHeader}>
        <View style={styles.weekRange}>
          <Pressable
            onPress={() =>
              showWeek(
                addDays(visibleWeekStart, -7),
                addDays(selectedDate, -7),
              )
            }
            disabled={!canGoPrevious}
            accessibilityRole="button"
            accessibilityLabel="Previous week"
            accessibilityState={{ disabled: !canGoPrevious }}
            style={({ pressed }) => [
              styles.weekNavButton,
              pressed && canGoPrevious && styles.pressed,
            ]}
          >
            <Ionicons
              name="chevron-back"
              size={22}
              color={canGoPrevious ? '#1C1C1E' : '#C7C7CC'}
            />
          </Pressable>
          <Text style={styles.weekLabel} numberOfLines={1}>
            {formatDate(visibleDays[0]?.dateString ?? visibleWeekStart)} –{' '}
            {formatDate(visibleDays[6]?.dateString ?? visibleWeekStart)}
          </Text>
          <Pressable
            onPress={() =>
              showWeek(addDays(visibleWeekStart, 7), addDays(selectedDate, 7))
            }
            disabled={!canGoNext}
            accessibilityRole="button"
            accessibilityLabel="Next week"
            accessibilityState={{ disabled: !canGoNext }}
            style={({ pressed }) => [
              styles.weekNavButton,
              pressed && canGoNext && styles.pressed,
            ]}
          >
            <Ionicons
              name="chevron-forward"
              size={22}
              color={canGoNext ? '#1C1C1E' : '#C7C7CC'}
            />
          </Pressable>
        </View>
        {!isViewingCurrentWeek ? (
          <Pressable
            onPress={jumpToToday}
            style={({ pressed }) => [
              styles.todayButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.todayButtonText}>Today</Text>
          </Pressable>
        ) : null}
      </View>

      <InfiniteWeekPager
        today={today}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        onVisibleWeekChange={handleVisibleWeekChange}
        listRef={listRef}
        weekStarts={weekStarts}
        setWeekStarts={setWeekStarts}
        pageIndex={pageIndex}
        setPageIndex={setPageIndex}
        minWeekStart={earliestWeekStart}
        maxWeekStart={todayWeekStart}
        pinnedSelectionRef={pinnedSelectionRef}
        weekStartsOn={weekStartsOn}
      />

      <View style={styles.headingRow}>
        <Text style={styles.screenTitle}>
          {selectedDate === today
            ? 'Today'
            : `${WEEKDAY_SHORT_LABELS[getWeekday(selectedDate)]}, ${formatShortDate(selectedDate)}`}
        </Text>
        {selectedDate !== today ? (
          <Pressable
            onPress={jumpToToday}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Back to today"
          >
            <Text style={styles.backToToday}>Back to today</Text>
          </Pressable>
        ) : null}
      </View>
      </View>

      {orderedSteps.length > 0 ? (
        stepGroups.map((group, groupIndex) => (
          <View
            key={group.id}
            style={
              groupIndex > 0
                ? group.label
                  ? styles.groupSpacedLabeled
                  : styles.groupSpaced
                : undefined
            }
          >
            {group.label ? (
              <Text style={styles.groupLabel}>{group.label}</Text>
            ) : null}
            <View style={styles.checklistCard}>
              {group.steps.map((step, rowIndex) => {
                const row = repeatingById.get(step.id);
                const futureDay = isFutureDate(selectedDate, today);
                const appearance = oneTimeOnDate(step, selectedDate);
                const oneTimeDone = appearance === 'done';
                const control = buildStepControl(
                  step,
                  row,
                  nodes,
                  entriesOnOrBefore(entries, selectedDate),
                  oneTimeDone,
                  selectedDate,
                  weekStartsOn,
                );
                const done = isRowDone(row, oneTimeDone, control);
                const detail = detailSubtitle(
                  step,
                  row,
                  entries,
                  nodes,
                  done,
                  selectedDate,
                  weekStartsOn,
                );
                const streak = row?.streak ?? 0;
                const loggedOnDay = row?.isComplete ?? false;
                const onControl = () => {
                  if (futureDay) {
                    return;
                  }
                  const createdRow = step.id === cardGoalId;
                  if (control.action === 'log') {
                    openLog(step.id);
                    if (createdRow) {
                      dismissCreatedCard();
                    }
                    return;
                  }
                  if (!row) {
                    handleOneTime(step, appearance);
                    if (createdRow) {
                      dismissCreatedCard();
                    }
                    return;
                  }
                  if (control.action === 'toggle') {
                    handleYesNo(step);
                    if (createdRow) {
                      dismissCreatedCard();
                    }
                  }
                };

                return (
                  <View
                    key={step.id}
                    ref={(node) => {
                      if (node) {
                        rowRefs.current.set(step.id, node);
                      } else {
                        rowRefs.current.delete(step.id);
                      }
                    }}
                    onLayout={
                      highlightId === step.id
                        ? () => scrollFreshRow(step.id)
                        : undefined
                    }
                  >
                    {rowIndex > 0 ? <View style={styles.hairline} /> : null}
                    <DoRow
                      title={step.title}
                      parentTitle={parentRowTitle(step, nodesById)}
                      detail={detail?.text}
                      overdue={detail?.overdue ?? false}
                      streak={streak}
                      done={done}
                      control={control}
                      controlDisabled={futureDay}
                      controlLabelText={controlLabel(step, control, loggedOnDay)}
                      loggedOnDay={loggedOnDay}
                      fresh={highlightId === step.id}
                      trailing={
                        row ? (
                          <WeekDots
                            goal={step}
                            entries={entries}
                            asOf={selectedDate}
                            weekStartsOn={weekStartsOn}
                          />
                        ) : undefined
                      }
                      onOpen={() =>
                        navigation.navigate('Goal', { goalId: step.id })
                      }
                      onControl={onControl}
                    />
                  </View>
                );
              })}
            </View>
          </View>
        ))
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            {selectedDate === today
              ? 'No daily habits or key activities due today. Add some on the Goals tab.'
              : 'Nothing scheduled for this day.'}
          </Text>
        </View>
      )}
    </ScrollView>
      {cardMode ? (
        <View style={styles.createdCard}>
          <View style={styles.createdCardHeader}>
            <Text style={styles.createdCardTitle}>
              Goal created. Tap the ring to log it.
            </Text>
            {cardMode === 'simple' ? (
              <Pressable
                onPress={dismissCreatedCard}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={20} color="#666" />
              </Pressable>
            ) : null}
          </View>
          {cardMode === 'prompt' ? (
            <>
              <Text style={styles.createdCardBody}>
                Want a nudge at 7 PM if something's left for the day?
              </Text>
              <View style={styles.createdCardActions}>
                <Pressable
                  onPress={declineNudge}
                  style={({ pressed }) => [
                    styles.createdCardSecondary,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                >
                  <Text style={styles.createdCardSecondaryText}>Not now</Text>
                </Pressable>
                <Pressable
                  onPress={acceptNudge}
                  style={({ pressed }) => [
                    styles.createdCardPrimary,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                >
                  <Text style={styles.createdCardPrimaryText}>Yes, remind me</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </View>
      ) : null}
    </View>

      <Modal
        visible={logStep != null}
        animationType="fade"
        transparent
        onRequestClose={closeLog}
      >
        <KeyboardSafe style={styles.modalOverlay} keyboardVerticalOffset={0}>
          <Pressable style={styles.modalBackdrop} onPress={closeLog}>
            <Pressable style={styles.logCard} onPress={() => {}}>
              <Text style={styles.logTitle}>
                {logStep?.title || 'Log amount'}
              </Text>
              <Text style={styles.logDate}>
                {getChecklistHeading(selectedDate, today)}
                {': '}
                {formatAmount(
                  logStep ? dayTotal(entries, logStep.id, selectedDate) : 0,
                )}{' '}
                {logStep?.unit ?? ''}
              </Text>
              <View style={styles.logInputRow}>
                <TextInput
                  style={styles.logInput}
                  value={logAmount}
                  onChangeText={(value) => {
                    setLogAmount(value);
                    setLogError(null);
                  }}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={handleAddAmount}
                  autoFocus
                />
                <Text style={styles.logUnit}>{logStep?.unit ?? ''}</Text>
                <Pressable
                  onPress={handleAddAmount}
                  style={({ pressed }) => [
                    styles.logAddAction,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.logAddActionText}>Add</Text>
                </Pressable>
              </View>
              {logError ? (
                <Text style={styles.logError}>{logError}</Text>
              ) : null}
              <Pressable
                onPress={handleUndoLastAmount}
                style={({ pressed }) => [
                  styles.logClearButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.logClearText}>Undo last</Text>
              </Pressable>
              <Pressable
                onPress={handleClearDay}
                style={({ pressed }) => [
                  styles.logClearButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.logClearText}>Clear</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </KeyboardSafe>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f4f6',
  },
  content: {
    paddingTop: 12,
    paddingBottom: 24,
  },
  contentWithCard: {
    paddingBottom: 150,
  },
  doRowFresh: {
    borderWidth: 2,
    borderColor: '#007aff',
    borderRadius: 10,
    marginHorizontal: 6,
    marginVertical: 4,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  newPill: {
    backgroundColor: '#007aff',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  newPillText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  createdCard: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 8,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  createdCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  createdCardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
  },
  createdCardBody: {
    fontSize: 15,
    color: '#333',
    lineHeight: 20,
  },
  createdCardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  createdCardSecondary: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  createdCardSecondaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#555',
  },
  createdCardPrimary: {
    backgroundColor: '#007aff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  createdCardPrimaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  headerBlock: {
    paddingHorizontal: 12,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#f4f4f6',
    padding: 24,
  },
  errorText: {
    fontSize: 15,
    color: '#c62828',
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#007aff',
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    minHeight: 44,
  },
  weekRange: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  weekNavButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekLabel: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
  },
  todayButton: {
    backgroundColor: '#e8f1ff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  todayButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#007aff',
  },
  weekPager: {
    marginBottom: 14,
    minHeight: 64,
  },
  weekStrip: {
    flexDirection: 'row',
    gap: 4,
  },
  weekDayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#fff',
    minHeight: 44,
    justifyContent: 'center',
  },
  weekDayCellToday: {
    backgroundColor: '#007aff',
  },
  weekDayCellSelected: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#007aff',
  },
  weekDayCellSelectedToday: {
    backgroundColor: '#007aff',
    borderWidth: 2,
    borderColor: '#0051a8',
  },
  weekDayAbbrev: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    marginBottom: 2,
  },
  weekDayNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  weekDayTextToday: {
    color: '#fff',
  },
  weekDayTextSelected: {
    color: '#007aff',
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    flexShrink: 1,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  backToToday: {
    fontSize: 13,
    fontWeight: '600',
    color: '#007aff',
  },
  groupSpaced: {
    marginTop: 12,
  },
  groupSpacedLabeled: {
    marginTop: 20,
  },
  groupLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#6B6B70',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  checklistCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginHorizontal: 16,
    overflow: 'hidden',
  },
  hairline: {
    height: 1,
    backgroundColor: '#ECECEF',
  },
  doRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingVertical: 10,
    paddingLeft: 8,
    paddingRight: 16,
    gap: 10,
  },
  controlHit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlDisabled: {
    opacity: 0.4,
  },
  weekDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexShrink: 0,
  },
  weekDotSlot: {
    width: 16,
    alignItems: 'center',
  },
  weekDotBox: {
    width: 8,
    height: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDotSessions: {
    marginTop: 1,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '600',
    color: '#248A3D',
  },
  weekDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  weekDotDone: {
    backgroundColor: '#248A3D',
  },
  weekDotPartial: {
    backgroundColor: '#D1D1D6',
    overflow: 'hidden',
  },
  weekDotPartialFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '50%',
    backgroundColor: '#248A3D',
  },
  weekDotMissed: {
    backgroundColor: '#D1D1D6',
  },
  weekDotDisabled: {
    backgroundColor: '#E5E5EA',
  },
  weekDotHollow: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#D1D1D6',
  },
  weekDotRing: {
    position: 'absolute',
    top: -3.5,
    right: -3.5,
    bottom: -3.5,
    left: -3.5,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#1C1C1E',
  },
  graphic: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  graphicOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checklistContent: {
    flex: 1,
    gap: 2,
  },
  checklistTitle: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '500',
    color: '#1C1C1E',
  },
  checklistTitleDone: {
    color: '#6B6B70',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B6B70',
  },
  subtitleOverdue: {
    color: '#C2410C',
    fontWeight: '500',
  },
  streakText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#C2410C',
  },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginHorizontal: 16,
    padding: 16,
  },
  emptyText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  pressed: {
    opacity: 0.7,
  },
  modalOverlay: {
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  logCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  logTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
  },
  logDate: {
    fontSize: 15,
    color: '#555',
  },
  logInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 17,
    minHeight: 44,
  },
  logUnit: {
    fontSize: 15,
    color: '#555',
  },
  logAddAction: {
    backgroundColor: '#007aff',
    borderRadius: 8,
    paddingHorizontal: 14,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logAddActionText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  logError: {
    fontSize: 13,
    color: '#c62828',
  },
  logClearButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
  logClearText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#c62828',
  },
});
