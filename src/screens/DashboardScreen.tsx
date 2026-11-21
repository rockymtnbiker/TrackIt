import { Ionicons } from '@expo/vector-icons';
import { BadgeGrid } from '../components/BadgeGrid';
import { PageHeader } from '../components/PageHeader';
import { ReflectHubCard, ReflectPill } from '../components/ReflectMayaCard';
import { ReflectMayaBar } from '../components/ReflectMayaBar';
import { GoalSetupChoiceSheet } from '../components/GoalSetupChoiceSheet';
import {
  ReflectWrapCard,
  type ReflectPartner,
  type ReflectWrapStep,
  type ReflectWrapTurn,
} from '../components/ReflectWrapCard';
import { useFocusEffect, type NavigationProp } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewInstance,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSettings } from '../context/SettingsContext';
import { STATUS_COLORS } from '../constants';
import { toneForStatusText, getWeekProgressMessage } from '../lib/statusMessages';
import type { WeekStart } from '../lib/settingsApi';
import {
  endOfWeek,
  lastFullWeek,
  startOfWeek,
  weekDays,
  weekdayLabels,
} from '../lib/week';
import { entriesOnOrBefore, periodTotalAsOf } from '../lib/asOfDate';
import {
  bigDealSummary,
  goalAnalysis,
  goalStreaks,
  type AnalysisTone,
} from '../lib/goalAnalysis';
import {
  buildChildrenMap,
  dayFill,
  daySessionMark,
  goalStartDate,
  isLeaf,
  isRepeating,
  isTracked,
  paceInfo,
  rollupTotal,
  weekTargetFor,
} from '../lib/goalTree';
import {
  getAtRiskItems,
  getWeekStreak,
  getWeeklyItems,
  type AtRiskItem,
  type WeeklyReview,
} from '../lib/weeklyReview';
import { getAllGoals, getEntries } from '../lib/goalTreeApi';
import { REFLECT_FLOW } from '../constants/maya/reflectFlow';
import { REFLECTION_COPY } from '../constants/reflection';
import { useReflectTheme } from '../constants/reflectTheme';
import { useAuth } from '../context/AuthContext';
import { useReflectMaya } from '../context/ReflectMayaContext';
import { useFloatingTabBarHeight } from '../navigation/FloatingTabBar';
import { celebrateBadges } from '../lib/badgeCelebration';
import { checkBadges } from '../lib/badges';
import { getMyConnections } from '../lib/communityApi';
import { WEEKDAY_NAMES } from '../lib/goalDetailText';
import {
  getGoalSetupChoice,
  saveGoalSetupChoice,
  type GoalSetupChoice,
} from '../lib/goalSetupChoice';
import { getDisplayName } from '../lib/profileApi';
import { REFLECT_MAYA } from '../lib/reflection';
import { personName } from '../lib/reflectionFlow';
import { cancelThisWeeksReflectionReminder } from '../lib/reminders';
import { reflectWeekStat } from '../lib/reflectMayaPrompt';
import { getReview, saveReflection, type PartnerCheckin, type WeekReview } from '../lib/reviewApi';
import type { DashboardStackParamList, RootTabParamList } from '../navigation/TabNavigator';
import type { GoalEntry, Goal } from '../types/goal';
import { parseLocalDate, toLocalDateString, todayLocal } from '../lib/localDate';
import {
  addDays,
  formatDateMDY,
  formatShortDate,
  getWeekday,
  toDateString,
  WEEKDAY_SHORT_LABELS,
} from '../utils/date';
import { STREAK_LOOKBACK_DAYS } from '../utils/streak';

type Props = NativeStackScreenProps<DashboardStackParamList, 'DashboardMain'>;

const DONUT_SIZE = 148;
const DONUT_STROKE = 14;

function WeeklyProgressCard({
  review,
  isCurrentWeek,
  onSeeHelp,
}: {
  review: WeeklyReview;
  isCurrentWeek: boolean;
  onSeeHelp: () => void;
}) {
  const progressPercent = Math.round(review.partialPct * 100);
  const message = getWeekProgressMessage(progressPercent, isCurrentWeek);
  const showHelp = progressPercent === 0 && !isCurrentWeek;
  const radius = (DONUT_SIZE - DONUT_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = DONUT_SIZE / 2;
  const progress = progressPercent / 100;

  return (
    <View style={styles.weeklyCard}>
      <Text style={styles.weeklyCardTitle}>Weekly Progress</Text>
      {review.totalCount === 0 ? (
        <Text style={styles.weeklyEmpty}>Nothing scheduled this week.</Text>
      ) : (
        <>
          <View style={styles.donutWrap}>
            <Svg width={DONUT_SIZE} height={DONUT_SIZE}>
              <Circle
                cx={center}
                cy={center}
                r={radius}
                stroke="#e5e5ea"
                strokeWidth={DONUT_STROKE}
                fill="none"
              />
              {progressPercent > 0 ? (
                <Circle
                  cx={center}
                  cy={center}
                  r={radius}
                  stroke="#007aff"
                  strokeWidth={DONUT_STROKE}
                  fill="none"
                  strokeDasharray={`${circumference} ${circumference}`}
                  strokeDashoffset={circumference * (1 - progress)}
                  strokeLinecap="round"
                  rotation={-90}
                  origin={`${center}, ${center}`}
                />
              ) : null}
            </Svg>
            <Text style={styles.donutValue}>{progressPercent}%</Text>
          </View>
          <View style={styles.progressBelow}>
            <Text style={[styles.progressPhraseText, { color: STATUS_COLORS[message.tone] }]}>
              {message.message}
            </Text>
            {showHelp ? (
              <Pressable
                onPress={onSeeHelp}
                accessibilityRole="button"
                accessibilityLabel="See what can help"
                hitSlop={6}
                style={styles.progressHelpHit}
              >
                <Text style={styles.progressHelp}>See what can help →</Text>
              </Pressable>
            ) : null}
            <View style={styles.progressCounts}>
              <View style={styles.progressCountGroup}>
                <Text style={styles.progressCount}>
                  {review.doneCount} of {review.totalCount} Done
                </Text>
                {review.inProgressCount > 0 ? (
                  <Text style={styles.progressCount}>{'  ·  '}</Text>
                ) : null}
              </View>
              {review.inProgressCount > 0 ? (
                <Text style={styles.progressCount}>
                  {review.inProgressCount} of {review.totalCount} In progress
                </Text>
              ) : null}
            </View>
          </View>
        </>
      )}
    </View>
  );
}

function formatWeekDelta(delta: number): { text: string; color: string } {
  const points = Math.round(delta * 100);
  if (points > 0) {
    return { text: `↑ +${points}%`, color: '#248a3d' };
  }
  if (points < 0) {
    return { text: `−${Math.abs(points)}%`, color: '#6B6B70' };
  }
  return { text: '0%', color: '#6B6B70' };
}

function WeekTiles({
  onPaceCount,
  deadlineCount,
  weekDelta,
  weekStreak,
}: {
  onPaceCount: number;
  deadlineCount: number;
  weekDelta: number;
  weekStreak: number;
}) {
  const delta = formatWeekDelta(weekDelta);
  return (
    <View style={styles.tileRow}>
      <View style={styles.tile}>
        <Text style={styles.tileValue}>
          {deadlineCount === 0 ? '—' : `${onPaceCount}/${deadlineCount}`}
        </Text>
        <Text style={styles.tileLabel}>
          {deadlineCount === 0 ? 'no deadline goals' : 'goals on pace'}
        </Text>
      </View>
      <View style={styles.tile}>
        <Text style={[styles.tileValue, { color: delta.color }]}>{delta.text}</Text>
        <Text style={styles.tileLabel}>vs. this point last week</Text>
      </View>
      <View style={styles.tile}>
        <Text style={styles.tileValue}>{weekStreak}</Text>
        <Text style={styles.tileLabel}>week streak · 80%+ done</Text>
      </View>
    </View>
  );
}

const TONE_COLOR: Record<AnalysisTone, string> = {
  good: STATUS_COLORS.positive,
  encourage: STATUS_COLORS.encourage,
  warn: '#C2410C',
  neutral: '#1C1C1E',
};

const WIN_LIMIT = 5;

function DaysActiveCard({
  weekStart,
  today,
  activeDates,
  weekStartsOn,
}: {
  weekStart: string;
  today: string;
  activeDates: ReadonlySet<string>;
  weekStartsOn: WeekStart;
}) {
  const days = weekdayLabels(weekStartsOn).map((label, index) => {
    const letter = label.slice(0, 1);
    const date = addDays(weekStart, index);
    const future = date > today;
    return {
      letter,
      date,
      future,
      isToday: date === today,
      filled: !future && activeDates.has(date),
    };
  });
  const elapsed = days.filter((day) => !day.future);
  const activeCount = elapsed.filter((day) => day.filled).length;

  return (
    <View style={styles.weeklyCard}>
      <Text style={styles.weeklyCardTitle}>
        Days active: {activeCount} of {elapsed.length} so far
      </Text>
      <View style={styles.dayRow}>
        {days.map((day) => (
          <View
            key={day.date}
            style={[styles.daySlot, day.isToday && styles.daySlotToday, day.future && styles.daySlotFuture]}
          >
            <View style={[styles.dayCircle, day.filled ? styles.dayCircleFilled : styles.dayCircleEmpty]}>
              <Text style={[styles.dayLetter, day.filled && styles.dayLetterFilled]}>{day.letter}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function ReflectedCheck() {
  return <Ionicons name="checkmark" size={18} color="#248A3D" />;
}

function NeedsAttentionCard({
  items,
  nodes,
  onPress,
  plainDetailColor,
  reflectedIds,
}: {
  items: AtRiskItem[];
  nodes: Goal[];
  onPress: (goalId: string) => void;
  plainDetailColor?: string;
  reflectedIds?: ReadonlySet<string>;
}) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return (
    <View style={styles.weeklyCard}>
      <Text style={styles.weeklyCardTitle}>Needs attention</Text>
      {items.length === 0 ? (
        <Text style={styles.weeklyEmpty}>Everything's on track.</Text>
      ) : (
        items.map((item, index) => {
          const goal = byId.get(item.goalId);
          const why = goal ? topLevelGoal(goal, byId).why?.trim() ?? '' : '';
          const tone = toneForStatusText(item.detail);
          return (
            <Pressable
              key={item.goalId}
              onPress={() => onPress(item.goalId)}
              style={({ pressed }) => [
                styles.attentionRow,
                index > 0 && styles.attentionRowBorder,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.title}`}
            >
              {reflectedIds?.has(item.goalId) ? <ReflectedCheck /> : null}
              <View style={styles.attentionText}>
                {item.parentTitle ? (
                  <Text style={styles.attentionParent}>{item.parentTitle}</Text>
                ) : null}
                <Text style={styles.attentionTitle}>{item.title}</Text>
                {why ? (
                  <Text style={styles.whyLine} numberOfLines={1}>
                    {why}
                  </Text>
                ) : null}
              </View>
              <Text
                style={[
                  styles.attentionDetail,
                  tone
                    ? { color: STATUS_COLORS[tone] }
                    : attentionWarn(item.detail)
                      ? styles.attentionWarn
                      : plainDetailColor
                        ? { color: plainDetailColor }
                        : undefined,
                ]}
              >
                {item.detail}
              </Text>
              <Ionicons name="chevron-forward" size={18} color="#c7c7cc" />
            </Pressable>
          );
        })
      )}
    </View>
  );
}

function formatQty(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function barPercent(total: number, target: number | null): number {
  if (target == null || target <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (total / target) * 100));
}

function monthEnd(date: string): string {
  const parsed = parseLocalDate(date);
  const lastDay = new Date(parsed.getFullYear(), parsed.getMonth() + 1, 0).getDate();
  return toDateString(parsed.getFullYear(), parsed.getMonth(), lastDay);
}

function subtreeIds(rootId: string, nodes: Goal[]): string[] {
  const childrenMap = buildChildrenMap(nodes);
  const ids: string[] = [];
  const seen = new Set<string>();
  const stack = [rootId];

  while (stack.length > 0) {
    const id = stack.pop();
    if (id == null || seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
    for (const child of childrenMap.get(id) ?? []) {
      stack.push(child.id);
    }
  }

  return ids;
}

function topLevelGoal(goal: Goal, byId: Map<string, Goal>): Goal {
  let current = goal;
  const seen = new Set<string>();
  while (current.parentId && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = byId.get(current.parentId);
    if (!parent) {
      break;
    }
    current = parent;
  }
  return current;
}

function planOrder(nodes: Goal[], childrenMap: Map<string | null, Goal[]>): Goal[] {
  const ordered: Goal[] = [];
  const walk = (node: Goal) => {
    ordered.push(node);
    for (const child of childrenMap.get(node.id) ?? []) {
      walk(child);
    }
  };
  for (const root of childrenMap.get(null) ?? []) {
    walk(root);
  }
  const seen = new Set(ordered.map((node) => node.id));
  for (const node of nodes) {
    if (!seen.has(node.id)) {
      ordered.push(node);
    }
  }
  return ordered;
}

function mergeEntries(groups: GoalEntry[][]): GoalEntry[] {
  const byId = new Map<string, GoalEntry>();
  for (const group of groups) {
    for (const entry of group) {
      byId.set(entry.id, { ...entry, entryDate: entry.entryDate.slice(0, 10) });
    }
  }
  return [...byId.values()];
}

type WinRow = {
  key: string;
  goalId: string;
  title: string;
  parentTitle: string | null;
  kind: 'done' | 'met' | 'streak';
  detail: string;
};

function winsThisWeek(
  nodes: Goal[],
  entries: GoalEntry[],
  today: string,
  weekStart: string,
  weekStartsOn: WeekStart,
): WinRow[] {
  const childrenMap = buildChildrenMap(nodes);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const weekEnd = endOfWeek(weekStart, weekStartsOn);
  const wins: WinRow[] = [];

  const parentTitle = (goal: Goal): string | null => {
    if (goal.parentId == null) {
      return null;
    }
    return byId.get(goal.parentId)?.title ?? null;
  };

  for (const goal of planOrder(nodes, childrenMap)) {
    if (isRepeating(goal)) {
      continue;
    }
    const completed = goal.actualEndDate?.slice(0, 10) || null;
    if (completed == null || completed < weekStart || completed > weekEnd || completed > today) {
      continue;
    }
    wins.push({
      key: `done:${goal.id}`,
      goalId: goal.id,
      title: goal.title || 'Untitled',
      parentTitle: parentTitle(goal),
      kind: 'done',
      detail: `Done ${WEEKDAY_SHORT_LABELS[getWeekday(completed)]}`,
    });
  }

  for (const goal of planOrder(nodes, childrenMap)) {
    if (!isRepeating(goal)) {
      continue;
    }
    const { target } = weekTargetFor(goal, weekStart, weekStartsOn);
    if (target == null || target <= 0) {
      continue;
    }
    const total = periodTotalAsOf(goal, entries, today, weekStartsOn);
    if (total < target) {
      continue;
    }
    wins.push({
      key: `met:${goal.id}`,
      goalId: goal.id,
      title: goal.title || 'Untitled',
      parentTitle: parentTitle(goal),
      kind: 'met',
      detail: `${formatQty(total)} of ${formatQty(target)} this week`,
    });
  }

  for (const goal of planOrder(nodes, childrenMap)) {
    if (!isRepeating(goal)) {
      continue;
    }
    const streak = goalStreaks(goal, entries, today, weekStartsOn);
    if (streak == null || streak.current < 3) {
      continue;
    }
    wins.push({
      key: `streak:${goal.id}`,
      goalId: goal.id,
      title: goal.title || 'Untitled',
      parentTitle: parentTitle(goal),
      kind: 'streak',
      detail: `${streak.current}-${streak.unit} streak`,
    });
  }

  return wins;
}

function FlameMark() {
  return (
    <Svg width={14} height={16} viewBox="0 0 14 16">
      <Path
        d="M7 0.6c.3 2.5-1.4 3.7-2.5 5C3.2 7 2.2 8.4 2.2 10.2 2.2 13 4.3 15.2 7 15.2s4.8-2.2 4.8-5c0-2-.9-3.4-1.8-4.6C9 4.3 7.8 3 7 .6z"
        fill="#C2410C"
      />
    </Svg>
  );
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
  const start = goalStartDate(goal);
  const startWeek = startOfWeek(start, weekStartsOn);
  const available = new Set(
    weekTargetFor(goal, asOf, weekStartsOn).availableDays.map(dateKey),
  );
  return (
    <View style={styles.weekDots} pointerEvents="none">
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
        const sessions = after || day < start ? null : daySessionMark(goal, entries, day);
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

function ThinBar({ percent }: { percent: number }) {
  return (
    <View style={styles.thinTrack}>
      <View style={[styles.thinFill, { width: `${Math.max(0, Math.min(100, percent))}%` }]} />
    </View>
  );
}

function attentionWarn(detail: string): boolean {
  return (
    detail === 'overdue' ||
    detail === "can't finish this week" ||
    detail.startsWith('Missed')
  );
}

const REFLECTED_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const REFLECTED_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function reflectedOnLine(completedAt: string): string {
  const stamp = completedAt.length > 10 ? new Date(completedAt) : parseLocalDate(completedAt.slice(0, 10));
  if (Number.isNaN(stamp.getTime())) {
    return REFLECTION_COPY.reflectedOn;
  }
  const day = REFLECTED_WEEKDAYS[stamp.getDay()] ?? '';
  const month = REFLECTED_MONTHS[stamp.getMonth()] ?? '';
  return `${REFLECTION_COPY.reflectedOn} ${day}, ${month} ${stamp.getDate()}.`;
}

function reviewWeekTitle(viewed: string, current: string): string {
  if (viewed === current) {
    return 'This week';
  }
  if (viewed === addDays(current, -7)) {
    return 'Last week';
  }
  return `Week of ${formatShortDate(viewed)}`;
}

function missedThisWeek(
  review: WeeklyReview,
  nodes: Goal[],
  entries: GoalEntry[],
  asOf: string,
  weekStart: string,
  weekStartsOn: WeekStart,
): AtRiskItem[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const missed: AtRiskItem[] = [];
  for (const item of review.items) {
    if (item.isDone) {
      continue;
    }
    const goal = byId.get(item.goalId);
    if (goal == null) {
      continue;
    }
    let detail = '';
    if (isRepeating(goal)) {
      const { target } = weekTargetFor(goal, weekStart, weekStartsOn);
      if (target != null && target > 0) {
        const total = periodTotalAsOf(goal, entries, asOf, weekStartsOn);
        detail = `${formatQty(total)} of ${formatQty(target)}`;
      }
    }
    missed.push({
      goalId: item.goalId,
      title: item.title,
      parentTitle: item.parentTitle,
      detail,
    });
  }
  return missed;
}

function ReflectChoices({ onMaya, onOwn }: { onMaya: () => void; onOwn: () => void }) {
  return (
    <View style={styles.reflectChoices}>
      <Pressable
        onPress={onMaya}
        style={({ pressed }) => [styles.reflectChoice, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={REFLECTION_COPY.withMaya}
      >
        <Text style={styles.reflectChoiceText}>{REFLECTION_COPY.withMaya}</Text>
      </Pressable>
      <Pressable
        onPress={onOwn}
        style={({ pressed }) => [styles.reflectChoice, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={REFLECTION_COPY.onMyOwn}
      >
        <Text style={styles.reflectChoiceText}>{REFLECTION_COPY.onMyOwn}</Text>
      </Pressable>
    </View>
  );
}

type ReflectWrap = {
  step: ReflectWrapStep;
  turns: ReflectWrapTurn[];
  partnerCheckin: PartnerCheckin | null;
  /** Null while the partner list is still loading. */
  partners: ReflectPartner[] | null;
  closing: string;
};

function nextWrapStep(current: ReflectWrap): ReflectWrapStep {
  if (current.step === 'partner') {
    return 'new';
  }
  return 'closing';
}

function closingLine(name: string, day: string, self: boolean): string {
  const template = self ? REFLECT_FLOW.wrap.closingSelf : REFLECT_FLOW.wrap.closing;
  const withDay = template.replace('[reflection day name]', day);
  const trimmed = name.trim();
  return trimmed ? withDay.replace('[name]', trimmed) : withDay.replace(', [name]', '');
}

export default function DashboardScreen({ navigation }: Props) {
  const tabBarHeight = useFloatingTabBarHeight();
  const reflect = useReflectMaya();
  const reflectColors = useReflectTheme();
  const { user } = useAuth();
  const { settings } = useSettings();
  const weekStartsOn = settings.weekStart;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nodes, setNodes] = useState<Goal[]>([]);
  const [entries, setEntries] = useState<GoalEntry[]>([]);
  const [reviewEntries, setReviewEntries] = useState<GoalEntry[]>([]);
  const [activityEntries, setActivityEntries] = useState<GoalEntry[]>([]);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [wrap, setWrap] = useState<ReflectWrap | null>(null);
  const [wrapSaving, setWrapSaving] = useState(false);
  const [reflectBarHeight, setReflectBarHeight] = useState(69);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupChoice, setSetupChoice] = useState<GoalSetupChoice | null>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const wrapLock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);
  const [viewedWeek, setViewedWeek] = useState(() => lastFullWeek(todayLocal(), weekStartsOn));
  const [reviews, setReviews] = useState<Record<string, WeekReview | null>>({});
  const userPaged = useRef(false);
  const openingKey = useRef<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoadError(null);
    try {
      const today = todayLocal();
      const nextNodes = await getAllGoals();
      const topLevel = nextNodes.filter((node) => node.parentId == null);
      const active = topLevel.filter((node) => node.status !== 'done');

      const cumulativeIds = new Set<string>();
      const repeatingIds: string[] = [];
      for (const node of active) {
        if (isRepeating(node)) {
          repeatingIds.push(node.id);
        } else if (isTracked(node)) {
          for (const id of subtreeIds(node.id, nextNodes)) {
            cumulativeIds.add(id);
          }
        }
      }

      const weekStart = startOfWeek(today, weekStartsOn);
      const weekEnd = endOfWeek(today, weekStartsOn);
      const periodEnd = weekEnd > monthEnd(today) ? weekEnd : monthEnd(today);
      const from = addDays(today, -STREAK_LOOKBACK_DAYS);
      let earliestDay = today;
      for (const node of nextNodes) {
        const start = goalStartDate(node);
        if (start < earliestDay) {
          earliestDay = start;
        }
      }
      const historyStart = startOfWeek(earliestDay, weekStartsOn);
      const reviewFromCandidate = addDays(weekStart, -52 * 7);
      const reviewFrom =
        historyStart < reviewFromCandidate ? historyStart : reviewFromCandidate;
      const reviewChildren = buildChildrenMap(nextNodes);
      const reviewIds = nextNodes
        .filter(
          (node) =>
            isLeaf(node, reviewChildren) &&
            isRepeating(node) &&
            node.repeatPeriod === 'week',
        )
        .map((node) => node.id);
      const [cumulativeEntries, repeatingEntries, nextReviewEntries, nextActivityEntries] =
        await Promise.all([
          cumulativeIds.size > 0 ? getEntries([...cumulativeIds]) : Promise.resolve([]),
          repeatingIds.length > 0
            ? getEntries(repeatingIds, from, periodEnd)
            : Promise.resolve([]),
          reviewIds.length > 0
            ? getEntries(reviewIds, reviewFrom, weekEnd)
            : Promise.resolve([]),
          nextNodes.length > 0
            ? getEntries(
                nextNodes.map((node) => node.id),
                historyStart,
                weekEnd,
              )
            : Promise.resolve([]),
        ]);

      setNodes(nextNodes);
      setEntries([...cumulativeEntries, ...repeatingEntries]);
      setReviewEntries(nextReviewEntries);
      setActivityEntries(nextActivityEntries);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load dashboard.';
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, [weekStartsOn]);

  useFocusEffect(
    useCallback(() => {
      void loadDashboard();
    }, [loadDashboard]),
  );

  const today = todayLocal();
  const currentWeek = startOfWeek(today, weekStartsOn);
  const lastWeek = addDays(currentWeek, -7);
  const earliestWeek = useMemo(() => {
    let earliest = lastWeek;
    for (const node of nodes) {
      const start = goalStartDate(node);
      if (start < earliest) {
        earliest = start;
      }
    }
    const week = startOfWeek(earliest, weekStartsOn);
    return week > currentWeek ? currentWeek : week;
  }, [nodes, lastWeek, currentWeek, weekStartsOn]);
  const reflecting = reflect?.session?.active === true;
  const browsedWeek =
    viewedWeek < earliestWeek ? earliestWeek : viewedWeek > currentWeek ? currentWeek : viewedWeek;
  const weekStart = reflecting && reflect?.session ? reflect.session.weekStart : browsedWeek;
  const reflectedIds = useMemo(
    () => new Set(reflecting && reflect?.session ? reflect.session.reflected : []),
    [reflect, reflecting],
  );
  const asOf = weekStart === currentWeek ? today : endOfWeek(weekStart, weekStartsOn);
  const canGoPrevious = weekStart > earliestWeek;
  const canGoNext = weekStart < currentWeek;
  const weekRange = `${formatShortDate(weekStart)} – ${formatShortDate(endOfWeek(weekStart, weekStartsOn))}`;
  const viewedReview = reviews[weekStart];
  const reviewKnown = viewedReview !== undefined;

  const rememberReview = useCallback((week: string, review: WeekReview | null) => {
    setReviews((current) => (current[week] === review ? current : { ...current, [week]: review }));
  }, []);

  useEffect(() => {
    if (reflecting) {
      return;
    }
    const key = `${weekStartsOn}:${currentWeek}`;
    if (openingKey.current === key) {
      return;
    }
    let cancelled = false;
    void getReview(lastWeek)
      .then((review) => {
        if (cancelled) {
          return;
        }
        openingKey.current = key;
        rememberReview(lastWeek, review);
        if (!userPaged.current) {
          setViewedWeek(review ? currentWeek : lastWeek);
        }
      })
      .catch((error) => {
        console.warn('Failed to load weekly reflection', error);
        if (cancelled) {
          return;
        }
        openingKey.current = key;
        rememberReview(lastWeek, null);
        if (!userPaged.current) {
          setViewedWeek(lastWeek);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentWeek, lastWeek, reflecting, rememberReview, weekStartsOn]);

  useEffect(() => {
    if (reviews[weekStart] !== undefined) {
      return;
    }
    let cancelled = false;
    void getReview(weekStart)
      .then((review) => {
        if (!cancelled) {
          rememberReview(weekStart, review);
        }
      })
      .catch((error) => {
        console.warn('Failed to load weekly reflection', error);
        if (!cancelled) {
          rememberReview(weekStart, null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [rememberReview, reviews, weekStart]);

  const appliedWeekStart = useRef(weekStartsOn);
  useEffect(() => {
    if (!reflecting) {
      reflect?.noteWeek(weekStart);
    }
  }, [reflect, reflecting, weekStart]);

  const reflectionStartedAt = reflect?.session?.startedAt;
  useEffect(() => {
    setWrap(null);
  }, [reflecting, reflectionStartedAt]);

  useEffect(() => {
    if (!wrap) {
      return;
    }
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [wrap]);

  useEffect(() => {
    if (reflecting) {
      return;
    }
    if (appliedWeekStart.current !== weekStartsOn) {
      appliedWeekStart.current = weekStartsOn;
      userPaged.current = false;
      openingKey.current = null;
      return;
    }
    if (loading) {
      return;
    }
    setViewedWeek((current) => {
      const aligned = startOfWeek(current, weekStartsOn);
      if (aligned < earliestWeek) {
        return earliestWeek;
      }
      if (aligned > currentWeek) {
        return currentWeek;
      }
      return aligned;
    });
  }, [loading, earliestWeek, currentWeek, weekStartsOn, reflecting]);

  const displayEntries = useMemo(
    () => mergeEntries([entries, reviewEntries, activityEntries]),
    [entries, reviewEntries, activityEntries],
  );
  const asOfEntries = useMemo(
    () => entriesOnOrBefore(displayEntries, asOf),
    [displayEntries, asOf],
  );
  const review = useMemo(() => {
    const repeatingIds = new Set(
      nodes.filter((node) => isRepeating(node)).map((node) => node.id),
    );
    const oneTimeEntries = activityEntries.filter((entry) => !repeatingIds.has(entry.goalId));
    return getWeeklyItems(
      nodes,
      mergeEntries([reviewEntries, oneTimeEntries]),
      parseLocalDate(weekStart),
      parseLocalDate(asOf),
      weekStartsOn,
    );
  }, [nodes, reviewEntries, activityEntries, weekStart, asOf, weekStartsOn]);
  const childrenMap = useMemo(() => buildChildrenMap(nodes), [nodes]);
  const activeGoals = useMemo(
    () =>
      nodes
        .filter((node) => node.parentId == null && node.status !== 'done')
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [nodes],
  );
  const deadlineGoals = useMemo(
    () =>
      activeGoals.filter(
        (goal) => goal.targetAmount != null && goal.targetEndDate,
      ),
    [activeGoals],
  );
  const onPaceCount = useMemo(
    () =>
      deadlineGoals.filter((goal) => {
        const total = rollupTotal(goal, nodes, asOfEntries) ?? 0;
        const pace = paceInfo(goal, total, asOf);
        return pace != null && pace.pctDone >= pace.pctExpected;
      }).length,
    [deadlineGoals, nodes, asOfEntries, asOf],
  );
  const weekDelta = useMemo(() => {
    const viewedAsOf = parseLocalDate(asOf);
    const priorAsOf = parseLocalDate(addDays(asOf, -7));
    const thisWeek = getWeeklyItems(
      nodes,
      reviewEntries,
      parseLocalDate(weekStart),
      viewedAsOf,
      weekStartsOn,
    );
    const lastWeek = getWeeklyItems(
      nodes,
      reviewEntries,
      parseLocalDate(addDays(weekStart, -7)),
      priorAsOf,
      weekStartsOn,
    );
    return thisWeek.donePct - lastWeek.donePct;
  }, [nodes, reviewEntries, weekStart, asOf, weekStartsOn]);
  const weekStreak = useMemo(
    () => getWeekStreak(nodes, reviewEntries, parseLocalDate(asOf), weekStartsOn),
    [nodes, reviewEntries, asOf, weekStartsOn],
  );
  const activeDates = useMemo(() => {
    const dates = new Set<string>();
    const weekEnd = endOfWeek(weekStart, weekStartsOn);
    for (const entry of activityEntries) {
      const date = entry.entryDate.slice(0, 10);
      if (date >= weekStart && date <= asOf && date <= weekEnd) {
        dates.add(date);
      }
    }
    for (const goal of nodes) {
      if (isRepeating(goal) || goal.actualEndDate == null) {
        continue;
      }
      const completed = goal.actualEndDate.slice(0, 10);
      if (completed >= weekStart && completed <= asOf && completed <= weekEnd) {
        dates.add(completed);
      }
    }
    return dates;
  }, [activityEntries, nodes, weekStart, asOf, weekStartsOn]);
  const atRiskItems = useMemo(
    () =>
      weekStart === currentWeek
        ? getAtRiskItems(nodes, reviewEntries, parseLocalDate(today), weekStartsOn)
        : missedThisWeek(review, nodes, displayEntries, asOf, weekStart, weekStartsOn),
    [weekStart, currentWeek, nodes, reviewEntries, today, review, displayEntries, asOf, weekStartsOn],
  );
  const weekWins = useMemo(
    () => winsThisWeek(nodes, displayEntries, asOf, weekStart, weekStartsOn),
    [nodes, displayEntries, asOf, weekStart, weekStartsOn],
  );
  const doneGoals = useMemo(
    () =>
      nodes
        .filter((node) => node.parentId == null && node.status === 'done')
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [nodes],
  );

  const openGoal = (goalId: string) => {
    navigation.navigate('Goal', reflecting ? { goalId, reflect: true } : { goalId });
  };

  const recordWrap = (
    turn: ReflectWrapTurn,
    patch: Partial<Pick<ReflectWrap, 'partnerCheckin' | 'step'>>,
  ) => {
    setWrap((current) => {
      if (!current || current.step === 'closing') {
        return current;
      }
      return {
        ...current,
        ...patch,
        turns: [...current.turns, turn],
        step: patch.step ?? nextWrapStep(current),
      };
    });
  };

  const beginWrap = async () => {
    const session = reflect?.session;
    if (wrapLock.current || !session?.active || wrap || wrapSaving) {
      return;
    }
    wrapLock.current = true;
    setWrap({
      step: 'partner',
      turns: [],
      partnerCheckin: null,
      partners: null,
      closing: '',
    });
    let partners: ReflectPartner[] = [];
    try {
      const connections = await getMyConnections();
      partners = connections
        .filter(
          (connection) =>
            connection.status.toLowerCase() === 'accepted' &&
            connection.partnerId != null &&
            connection.role !== 'coach',
        )
        .map((connection) => ({
          id: connection.id,
          partnerId: connection.partnerId ?? '',
          name: personName(connection),
        }))
        .filter((partner) => partner.partnerId.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.warn('Failed to load partners', error);
    } finally {
      wrapLock.current = false;
    }
    if (!mounted.current) {
      return;
    }
    setWrap((current) => (current && current.partners == null ? { ...current, partners } : current));
  };

  const finishDone = async (prompt: string) => {
    const session = reflect?.session;
    if (!session?.active || wrapSaving || wrap?.step !== 'new') {
      return;
    }
    setWrapSaving(true);
    try {
      const saved = await saveReflection({
        weekStart: session.weekStart,
        donePct: donutPercent,
        goalCheckins: session.reflected.map((goalId) => {
          const goal = nodes.find((item) => item.id === goalId);
          const answers = session.exchanges[goalId]?.answers;
          const stat = goal
            ? reflectWeekStat(goal, displayEntries, session.weekStart, weekStartsOn, todayLocal())
            : null;
          return {
            goal_id: goalId,
            week_pct: stat ? stat.percent : null,
            target_changed: session.targets[goalId]?.changed === true,
            r3c: answers?.r3c ?? null,
          };
        }),
        partnerCheckin: wrap?.partnerCheckin ?? null,
        coachCheckin: session.coachRequested ? 'requested' : null,
        maya: session.maya,
        coachLineShown: session.maya && session.coachLineShown ? session.weekStart : null,
      });
      try {
        const keys = await checkBadges();
        celebrateBadges(keys);
      } catch (error) {
        console.warn('Could not check badges', error);
      }
      const todayNow = todayLocal();
      const current = startOfWeek(todayNow, weekStartsOn);
      if (session.weekStart === current || session.weekStart === addDays(current, -7)) {
        await cancelThisWeeksReflectionReminder();
      }
      if (!mounted.current) {
        return;
      }
      rememberReview(session.weekStart, saved);
      const closing = session.maya
        ? closingLine(
            await getDisplayName().catch(() => ''),
            WEEKDAY_NAMES[settings.reflectionDay],
            settings.mayaLevel === 'self',
          )
        : REFLECT_FLOW.own.done;
      if (!mounted.current) {
        return;
      }
      setWrap((currentWrap) =>
        currentWrap
          ? {
              ...currentWrap,
              step: 'closing',
              closing,
              turns: [...currentWrap.turns, { prompt, you: REFLECT_FLOW.wrap.done }],
            }
          : currentWrap,
      );
    } catch (error) {
      Alert.alert(
        REFLECTION_COPY.couldNotFinish,
        error instanceof Error ? error.message : REFLECTION_COPY.couldNotFinish,
      );
    } finally {
      if (mounted.current) {
        setWrapSaving(false);
      }
    }
  };

  const openAddGoal = () => {
    if (user?.id) {
      void getGoalSetupChoice(user.id).then(setSetupChoice);
    }
    setSetupOpen(true);
  };

  const pickSetup = (choice: GoalSetupChoice) => {
    setSetupChoice(choice);
    setSetupOpen(false);
    if (user?.id) {
      void saveGoalSetupChoice(user.id, choice);
    }
    navigation.navigate(choice === 'maya' ? 'Maya' : 'GoalSetup');
  };
  const weekLocked = reflecting;
  const donutPercent = Math.round(review.partialPct * 100);

  const openReflectHelp = () => navigation.navigate('Learn', { tab: 'reflect' });
  const screenHeader = reflecting ? (
    <ReflectingHeader onHelp={openReflectHelp} />
  ) : (
    <PageHeader
      title="Reflect"
      subtitle="Look back on your week and plan the next"
      help={openReflectHelp}
    />
  );

  if (loading && nodes.length === 0) {
    return (
      <View style={styles.safeArea}>
        {screenHeader}
        <View style={styles.loadingState}>
          <ActivityIndicator color="#007aff" />
        </View>
      </View>
    );
  }

  if (loadError && nodes.length === 0) {
    return (
      <View style={styles.safeArea}>
        {screenHeader}
        <View style={styles.loadingState}>
          <Text style={styles.errorText}>{loadError}</Text>
          <Pressable
            onPress={() => void loadDashboard()}
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const showReflectBar = reflecting && (!wrap || wrap.step === 'closing');

  return (
    <View style={[styles.safeArea, reflecting && { backgroundColor: reflectColors.pageTint }]}>
      {screenHeader}
      {reflecting && wrap ? (
        <ReflectWrapCard
          step={wrap.step}
          turns={wrap.turns}
          partners={wrap.partners}
          closing={wrap.closing}
          saving={wrapSaving}
          onSendNote={(partner, prompt) => {
            navigation.navigate('Chat', {
              connectionId: partner.id,
              otherId: partner.partnerId,
              otherName: partner.name,
              role: 'partner',
              fromReflection: true,
            });
            recordWrap({ prompt, you: REFLECT_FLOW.wrap.send }, { partnerCheckin: 'yes' });
          }}
          onSkip={(prompt) =>
            recordWrap({ prompt, you: REFLECT_FLOW.wrap.skip }, { partnerCheckin: 'not_yet' })
          }
          onInvite={(prompt) =>
            recordWrap({ prompt, you: REFLECT_FLOW.wrap.invite }, { partnerCheckin: 'invited' })
          }
          onPartnerNotNow={(prompt) =>
            recordWrap({ prompt, you: REFLECT_FLOW.wrap.notNow }, { partnerCheckin: 'not_now' })
          }
          onAddGoal={openAddGoal}
          onDone={(prompt) => void finishDone(prompt)}
          plain={reflect?.session?.maya === false}
        />
      ) : null}
      <ScrollView
        ref={scrollRef}
        style={[styles.container, reflecting && { backgroundColor: reflectColors.pageTint }]}
        contentContainerStyle={[
          styles.content,
          reflecting && styles.reflectContent,
          {
            paddingBottom: showReflectBar ? reflectBarHeight + tabBarHeight : 24 + tabBarHeight,
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              const review = getReview(weekStart)
                .then((reviewRow) => {
                  rememberReview(weekStart, reviewRow);
                })
                .catch((error) => {
                  console.warn('Failed to load weekly reflection', error);
                  rememberReview(weekStart, null);
                });
              void Promise.all([loadDashboard(), review]).finally(() => setRefreshing(false));
            }}
            tintColor="#007aff"
          />
        }
      >
        {reflecting && !wrap ? (
          <ReflectHubCard
            percent={donutPercent}
            maya={reflect?.session?.maya !== false}
            weekStart={reflect?.session?.weekStart}
          />
        ) : null}
            <View style={styles.weekHeader}>
              <View style={styles.weekTitleRow}>
                <Text style={styles.weekTitle}>{reviewWeekTitle(weekStart, currentWeek)}</Text>
                {reviewKnown && viewedReview ? (
                  <View style={[styles.statusChip, styles.statusChipDone]}>
                    <Text style={styles.statusChipDoneText}>{REFLECTION_COPY.reflectedChip}</Text>
                  </View>
                ) : reviewKnown && !reflecting && weekStart < currentWeek ? (
                  <View style={[styles.statusChip, styles.statusChipOpen]}>
                    <Text style={styles.statusChipOpenText}>{REFLECTION_COPY.notReflected}</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.weekNavRow}>
                <Pressable
                  onPress={() => {
                    userPaged.current = true;
                    setViewedWeek(addDays(weekStart, -7));
                  }}
                  disabled={weekLocked || !canGoPrevious}
                  accessibilityRole="button"
                  accessibilityLabel="Previous week"
                  accessibilityState={{ disabled: weekLocked || !canGoPrevious }}
                  style={({ pressed }) => [
                    styles.weekNavButton,
                    pressed && !weekLocked && canGoPrevious && styles.pressed,
                  ]}
                >
                  <Ionicons
                    name="chevron-back"
                    size={22}
                    color={!weekLocked && canGoPrevious ? '#1C1C1E' : '#C7C7CC'}
                  />
                </Pressable>
                <Text style={styles.weekRange}>{weekRange}</Text>
                <Pressable
                  onPress={() => {
                    userPaged.current = true;
                    setViewedWeek(addDays(weekStart, 7));
                  }}
                  disabled={weekLocked || !canGoNext}
                  accessibilityRole="button"
                  accessibilityLabel="Next week"
                  accessibilityState={{ disabled: weekLocked || !canGoNext }}
                  style={({ pressed }) => [
                    styles.weekNavButton,
                    pressed && !weekLocked && canGoNext && styles.pressed,
                  ]}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={22}
                    color={!weekLocked && canGoNext ? '#1C1C1E' : '#C7C7CC'}
                  />
                </Pressable>
              </View>
            </View>
            {!reflecting && reviewKnown && viewedReview ? (
              <Text style={styles.reflectedOn}>{reflectedOnLine(viewedReview.completedAt)}</Text>
            ) : null}
            {!reflecting && reviewKnown && !viewedReview && weekStart === lastWeek ? (
              <ReflectChoices
                onMaya={() => reflect?.begin(weekStart, true)}
                onOwn={() => reflect?.begin(weekStart, false)}
              />
            ) : null}
            {!reflecting && reviewKnown && !viewedReview && weekStart === currentWeek ? (
              <View style={styles.reflectEarly}>
                <Text style={styles.earlyLine}>{REFLECTION_COPY.early}</Text>
                <ReflectChoices
                  onMaya={() => reflect?.begin(weekStart, true)}
                  onOwn={() => reflect?.begin(weekStart, false)}
                />
              </View>
            ) : null}
            <View>
              {/* weekly metric cards go here */}
              <WeeklyProgressCard
                review={review}
                isCurrentWeek={weekStart === currentWeek}
                onSeeHelp={() =>
                  navigation.getParent<NavigationProp<RootTabParamList>>()?.navigate('Community')
                }
              />
            </View>
            <WeekTiles
              onPaceCount={onPaceCount}
              deadlineCount={deadlineGoals.length}
              weekDelta={weekDelta}
              weekStreak={weekStreak}
            />
            <DaysActiveCard
              weekStart={weekStart}
              today={today}
              activeDates={activeDates}
              weekStartsOn={weekStartsOn}
            />
            <View style={styles.weeklyCard}>
              <Text style={styles.weeklyCardTitle}>Wins this week</Text>
              {weekWins.length === 0 ? (
                <Text style={styles.weeklyEmpty}>
                  Wins will show up here as you check things off.
                </Text>
              ) : (
                <>
                  {weekWins.slice(0, WIN_LIMIT).map((win, index) => (
                    <Pressable
                      key={win.key}
                      onPress={() => openGoal(win.goalId)}
                      style={({ pressed }) => [
                        styles.winRow,
                        index > 0 && styles.attentionRowBorder,
                        pressed && styles.pressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${win.title}`}
                    >
                      {reflectedIds.has(win.goalId) ? <ReflectedCheck /> : null}
                      <View style={styles.attentionText}>
                        {win.parentTitle ? (
                          <Text style={styles.attentionParent}>{win.parentTitle}</Text>
                        ) : null}
                        <View style={styles.winTitleRow}>
                          {win.kind === 'streak' ? (
                            <FlameMark />
                          ) : (
                            <Ionicons name="checkmark" size={16} color="#248A3D" />
                          )}
                          <Text style={styles.winTitle} numberOfLines={1}>
                            {win.title}
                          </Text>
                        </View>
                        <Text style={styles.winDetail}>{win.detail}</Text>
                      </View>
                    </Pressable>
                  ))}
                  {weekWins.length > WIN_LIMIT ? (
                    <Text style={styles.moreWins}>+{weekWins.length - WIN_LIMIT} more</Text>
                  ) : null}
                </>
              )}
            </View>
            <NeedsAttentionCard
              items={atRiskItems}
              nodes={nodes}
              onPress={openGoal}
              plainDetailColor={weekStart === currentWeek ? undefined : '#6B6B70'}
              reflectedIds={reflectedIds}
            />
            <View style={styles.sectionCard}>
              <Text style={styles.cardHeader}>All goals</Text>
              {activeGoals.length > 0 ? (
                activeGoals.map((goal, index) => {
                  const analysis =
                    goalAnalysis(goal, nodes, displayEntries, asOf, weekStartsOn) ??
                    bigDealSummary(goal, nodes, asOf);
                  const children = childrenMap.get(goal.id) ?? [];
                  const showDots = isRepeating(goal);
                  const showBar = !showDots && (children.length > 0 || isTracked(goal));
                  const barTarget = isRepeating(goal)
                    ? weekTargetFor(goal, weekStart, weekStartsOn).target
                    : goal.targetAmount;
                  const barTotal = children.length > 0
                    ? null
                    : isRepeating(goal)
                      ? periodTotalAsOf(goal, displayEntries, asOf, weekStartsOn)
                      : (rollupTotal(goal, nodes, asOfEntries) ?? 0);
                  const deal = children.length > 0 ? bigDealSummary(goal, nodes, asOf) : null;
                  const percent = deal
                    ? deal.total > 0
                      ? (deal.done / deal.total) * 100
                      : 0
                    : barPercent(barTotal ?? 0, barTarget);
                  return (
                    <Pressable
                      key={goal.id}
                      onPress={() => openGoal(goal.id)}
                      style={({ pressed }) => [
                        styles.allGoalRow,
                        index > 0 && styles.attentionRowBorder,
                        pressed && styles.pressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${goal.title}`}
                    >
                      {reflectedIds.has(goal.id) ? <ReflectedCheck /> : null}
                      <View style={styles.attentionText}>
                        <Text style={styles.allGoalTitle} numberOfLines={2}>
                          {goal.title || 'Untitled'}
                        </Text>
                        {analysis ? (
                          <Text style={styles.analysisLine} numberOfLines={1}>
                            <Text style={{ color: TONE_COLOR[analysis.tone] }}>
                              {analysis.headline}
                            </Text>
                            {analysis.detail ? (
                              <Text style={styles.analysisDetail}>{` ${analysis.detail}`}</Text>
                            ) : null}
                          </Text>
                        ) : null}
                      </View>
                      <View style={styles.allGoalTrailing}>
                        {showDots ? (
                          <WeekDots
                            goal={goal}
                            entries={asOfEntries}
                            asOf={asOf}
                            weekStartsOn={weekStartsOn}
                          />
                        ) : null}
                        {showBar ? <ThinBar percent={percent} /> : null}
                        <Ionicons name="chevron-forward" size={18} color="#c7c7cc" />
                      </View>
                    </Pressable>
                  );
                })
              ) : (
                <Text style={styles.emptyText}>No active goals.</Text>
              )}
            </View>

            <Pressable
              onPress={() => setCompletedOpen((open) => !open)}
              style={({ pressed }) => [styles.completedHeader, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityState={{ expanded: completedOpen }}
              accessibilityLabel={`Completed, ${doneGoals.length}`}
            >
              <Text style={[styles.sectionTitle, styles.completedTitle]}>
                Completed ({doneGoals.length})
              </Text>
              <Ionicons
                name={completedOpen ? 'chevron-down' : 'chevron-forward'}
                size={16}
                color="#888"
              />
            </Pressable>
            {completedOpen ? (
              <View style={styles.sectionCard}>
                {doneGoals.length > 0 ? (
                  doneGoals.map((goal, index) => (
                    <Pressable
                      key={goal.id}
                      onPress={() => openGoal(goal.id)}
                      style={({ pressed }) => [
                        styles.completedRow,
                        index < doneGoals.length - 1 && styles.rowBorder,
                        pressed && styles.pressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${goal.title}`}
                    >
                      <Text style={[styles.goalTitle, styles.doneTitle]}>{goal.title}</Text>
                      <Text style={styles.completedDate}>
                        {goal.actualEndDate ? formatDateMDY(goal.actualEndDate) : '—'}
                      </Text>
                    </Pressable>
                  ))
                ) : (
                  <Text style={styles.emptyText}>No completed goals.</Text>
                )}
              </View>
            ) : null}
            <BadgeGrid />
            {reflecting ? null : (
              <Pressable
                onPress={() =>
                  navigation.getParent<NavigationProp<RootTabParamList>>()?.navigate('Goals')
                }
                style={({ pressed }) => [styles.planButton, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Plan next week"
              >
                <Text style={styles.planButtonText}>Plan next week</Text>
              </Pressable>
            )}
      </ScrollView>
      {showReflectBar ? (
        <View
          collapsable={false}
          style={[styles.reflectBarDock, { bottom: tabBarHeight }]}
          onLayout={(event) => {
            const height = Math.round(event.nativeEvent.layout.height);
            setReflectBarHeight((current) => (current === height ? current : height));
          }}
        >
          {wrap?.step === 'closing' ? (
            <ReflectMayaBar
              inset={0}
              label={REFLECT_FLOW.wrap.close}
              onPress={() => reflect?.end()}
            />
          ) : (
            <ReflectMayaBar
              inset={0}
              label={REFLECT_MAYA.finish}
              onPress={() => void beginWrap()}
            />
          )}
        </View>
      ) : null}
      <GoalSetupChoiceSheet
        visible={setupOpen}
        selected={setupChoice}
        onMaya={() => pickSetup('maya')}
        onOwn={() => pickSetup('own')}
        onCancel={() => setSetupOpen(false)}
      />
    </View>
  );
}

function ReflectingHeader({ onHelp }: { onHelp: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.reflectingHeader, { paddingTop: insets.top }]}>
      <View style={styles.reflectingRow}>
        <ReflectPill nav />
        <Pressable
          onPress={onHelp}
          accessibilityRole="button"
          accessibilityLabel="Learn"
          hitSlop={10}
          style={styles.reflectingHelp}
        >
          <Ionicons name="help-circle-outline" size={20} color="#8e8e93" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f2f2f7',
  },
  reflectBarDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 5,
    elevation: 8,
  },
  reflectingHeader: {
    backgroundColor: 'transparent',
  },
  reflectingRow: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reflectingHelp: {
    position: 'absolute',
    right: 8,
    top: 0,
    bottom: 0,
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 12,
    paddingBottom: 24,
  },
  reflectContent: {
    paddingTop: 0,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
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
    marginBottom: 12,
  },
  weekTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  weekTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
  },
  statusChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusChipDone: {
    backgroundColor: '#E5F6EA',
  },
  statusChipDoneText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#248A3D',
  },
  statusChipOpen: {
    backgroundColor: '#EFEFF4',
  },
  statusChipOpenText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
  },
  reflectedOn: {
    marginTop: -4,
    marginBottom: 12,
    fontSize: 15,
    lineHeight: 20,
    color: '#1C1C1E',
  },
  reflectEarly: {
    marginBottom: 0,
  },
  earlyLine: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  reflectChoices: {
    gap: 8,
    marginBottom: 12,
  },
  reflectChoice: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e5ea',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  reflectChoiceText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111',
    textAlign: 'center',
  },
  weekNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  weekNavButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekRange: {
    flex: 1,
    fontSize: 15,
    color: '#8e8e93',
    textAlign: 'center',
  },
  planButton: {
    backgroundColor: '#007aff',
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  planButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  weeklyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  weeklyCardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
    marginBottom: 12,
  },
  weeklyEmpty: {
    fontSize: 15,
    color: '#666',
    paddingBottom: 4,
  },
  donutWrap: {
    width: DONUT_SIZE,
    height: DONUT_SIZE,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutValue: {
    position: 'absolute',
    fontSize: 32,
    fontWeight: '700',
    color: '#111',
  },
  progressBelow: {
    alignItems: 'center',
    marginTop: 8,
  },
  progressPhraseText: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  progressHelpHit: {
    marginTop: 2,
  },
  progressHelp: {
    fontSize: 13,
    fontWeight: '500',
    color: '#007aff',
    textAlign: 'center',
  },
  progressCounts: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    maxWidth: '100%',
  },
  progressCountGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressCount: {
    fontSize: 15,
    fontWeight: '400',
    color: '#6B6B70',
    textAlign: 'center',
  },
  tileRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  tile: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  tileValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
    textAlign: 'center',
  },
  tileLabel: {
    fontSize: 12,
    lineHeight: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
  },
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  daySlot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  daySlotToday: {
    borderColor: '#007aff',
  },
  daySlotFuture: {
    opacity: 0.35,
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleFilled: {
    backgroundColor: '#007aff',
  },
  dayCircleEmpty: {
    backgroundColor: '#f2f2f7',
  },
  dayLetter: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111',
  },
  dayLetterFilled: {
    color: '#fff',
  },
  attentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  attentionRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5ea',
  },
  attentionText: {
    flex: 1,
  },
  attentionParent: {
    fontSize: 12,
    color: '#8e8e93',
    marginBottom: 2,
  },
  attentionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  attentionDetail: {
    flexShrink: 1,
    maxWidth: '46%',
    fontSize: 13,
    lineHeight: 18,
    color: '#666',
    textAlign: 'right',
  },
  attentionWarn: {
    color: '#C2410C',
  },
  whyLine: {
    fontSize: 13,
    fontStyle: 'italic',
    color: '#8e8e93',
    marginTop: 2,
  },
  winRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  winTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  winTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  winDetail: {
    fontSize: 14,
    color: '#6B6B70',
    marginTop: 2,
    marginLeft: 22,
  },
  moreWins: {
    fontSize: 14,
    color: '#8e8e93',
    paddingTop: 8,
  },
  cardHeader: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 4,
  },
  allGoalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  allGoalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111',
  },
  analysisLine: {
    fontSize: 13,
    marginTop: 2,
  },
  analysisDetail: {
    color: '#6B6B70',
  },
  allGoalTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  thinTrack: {
    width: 60,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E5EA',
    overflow: 'hidden',
  },
  thinFill: {
    height: 4,
    backgroundColor: '#248A3D',
  },
  weekDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
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
  pressed: {
    opacity: 0.7,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  completedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  completedTitle: {
    flex: 1,
    marginBottom: 0,
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  goalRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5ea',
  },
  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  goalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
    marginRight: 12,
  },
  doneTitle: {
    color: '#888',
    textDecorationLine: 'line-through',
    fontWeight: '600',
  },
  progressTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#e5e5ea',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007aff',
    borderRadius: 5,
  },
  progressRowLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 6,
  },
  paceLine: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
  },
  paceAhead: {
    color: '#248a3d',
  },
  paceBehind: {
    color: '#b8860b',
  },
  statusLabel: {
    fontSize: 13,
    color: '#888',
    textTransform: 'capitalize',
  },
  streakMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  streakCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ff6b00',
  },
  completedRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  completedDate: {
    fontSize: 14,
    color: '#888',
  },
  emptyText: {
    padding: 14,
    fontSize: 14,
    color: '#aaa',
  },
});
