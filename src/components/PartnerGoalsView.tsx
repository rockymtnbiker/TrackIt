import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { STATUS_COLORS } from '../constants';
import { useSettings } from '../context/SettingsContext';
import { periodTotalAsOf } from '../lib/asOfDate';
import {
  getGoalsSharedWithMe,
  getMySharesWith,
  shareGoal,
  unshareGoal,
} from '../lib/communityApi';
import {
  bigDealSummary,
  goalAnalysis,
  type AnalysisTone,
} from '../lib/goalAnalysis';
import { getAllGoals } from '../lib/goalTreeApi';
import {
  buildChildrenMap,
  dayFill,
  daySessionMark,
  goalStartDate,
  isRepeating,
  isTracked,
  rollupTotal,
  weekTargetFor,
} from '../lib/goalTree';
import { todayLocal } from '../lib/localDate';
import type { WeekStart } from '../lib/settingsApi';
import { startOfWeek, weekDays } from '../lib/week';
import type { Goal, GoalEntry } from '../types/goal';
import { toDateString } from '../utils/date';

type Props = {
  partnerId: string | null;
  name: string;
  /** `share` is only the What I share switches. */
  mode?: 'all' | 'share';
  onOpenGoal: (goal: Goal) => void;
};

const TONE_COLOR: Record<AnalysisTone, string> = {
  good: STATUS_COLORS.positive,
  encourage: STATUS_COLORS.encourage,
  warn: '#C2410C',
  neutral: '#1C1C1E',
};

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const row = error as { message?: unknown; code?: unknown; details?: unknown };
    const message = typeof row.message === 'string' ? row.message.trim() : '';
    const code = typeof row.code === 'string' ? row.code.trim() : '';
    const details = typeof row.details === 'string' ? row.details.trim() : '';
    const parts = [message, code ? `(${code})` : '', details].filter(Boolean);
    if (parts.length > 0) {
      return parts.join(' ');
    }
  }
  return 'Sharing was not updated.';
}

function dateKey(date: Date): string {
  return toDateString(date.getFullYear(), date.getMonth(), date.getDate());
}

function barPercent(total: number, target: number | null): number {
  if (target == null || target <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (total / target) * 100));
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
            <View key={day} style={styles.weekDotSlot} accessible={false}>
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

export function PartnerGoalsView({
  partnerId,
  name,
  mode = 'all',
  onOpenGoal,
}: Props) {
  const { settings } = useSettings();
  const weekStartsOn = settings.weekStart;
  const [sharedGoals, setSharedGoals] = useState<Goal[]>([]);
  const [sharedEntries, setSharedEntries] = useState<GoalEntry[]>([]);
  const [myGoals, setMyGoals] = useState<Goal[]>([]);
  const [sharedIds, setSharedIds] = useState<Set<string>>(new Set());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [theirError, setTheirError] = useState<string | null>(null);
  const [mineError, setMineError] = useState<string | null>(null);
  const [sharesError, setSharesError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!partnerId) {
      setLoadError('This partner could not be opened.');
      setTheirError(null);
      setMineError(null);
      setSharesError(null);
      setSharedGoals([]);
      setSharedEntries([]);
      setMyGoals([]);
      setSharedIds(new Set());
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setLoadError(null);
    const [sharedResult, mineResult, sharesResult] = await Promise.allSettled([
      getGoalsSharedWithMe(partnerId),
      getAllGoals(),
      getMySharesWith(partnerId),
    ]);

    if (sharedResult.status === 'fulfilled') {
      setSharedGoals(sharedResult.value.goals);
      setSharedEntries(sharedResult.value.entries);
      setTheirError(null);
    } else {
      setTheirError(errorMessage(sharedResult.reason));
    }

    if (mineResult.status === 'fulfilled') {
      setMyGoals(mineResult.value);
      setMineError(null);
    } else {
      setMineError(errorMessage(mineResult.reason));
    }

    if (sharesResult.status === 'fulfilled') {
      setSharedIds(new Set(sharesResult.value.map((share) => share.goalId)));
      setSharesError(null);
    } else {
      setSharesError(errorMessage(sharesResult.reason));
    }

    setLoading(false);
    setRefreshing(false);
  }, [partnerId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const today = todayLocal();
  const theirGoals = useMemo(
    () => sharedGoals.filter((goal) => goal.parentId == null),
    [sharedGoals],
  );
  const childrenMap = useMemo(() => buildChildrenMap(sharedGoals), [sharedGoals]);
  const shareable = useMemo(
    () =>
      myGoals
        .filter((goal) => goal.parentId == null && goal.status !== 'done')
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [myGoals],
  );

  const toggleShare = async (goalId: string, next: boolean) => {
    if (!partnerId || savingIds.has(goalId)) {
      return;
    }
    setSavingIds((current) => new Set(current).add(goalId));
    setSharedIds((current) => {
      const copy = new Set(current);
      if (next) {
        copy.add(goalId);
      } else {
        copy.delete(goalId);
      }
      return copy;
    });
    try {
      if (next) {
        await shareGoal(goalId, partnerId);
      } else {
        await unshareGoal(goalId, partnerId);
      }
    } catch (error) {
      setSharedIds((current) => {
        const copy = new Set(current);
        if (next) {
          copy.delete(goalId);
        } else {
          copy.add(goalId);
        }
        return copy;
      });
      Alert.alert('Could not update sharing', errorMessage(error));
    } finally {
      setSavingIds((current) => {
        const copy = new Set(current);
        copy.delete(goalId);
        return copy;
      });
    }
  };

  if (loading && sharedGoals.length === 0 && myGoals.length === 0) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#007aff" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor="#007aff"
          />
        }
      >
        {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}

        {mode === 'all' ? (
          <>
            <Text style={styles.section}>Their goals</Text>
            <View style={styles.card}>
              {theirError ? <Text style={styles.sectionError}>{theirError}</Text> : null}
              {theirError && theirGoals.length === 0 ? null : theirGoals.length === 0 ? (
                <Text style={styles.empty}>{name} hasn't shared any goals yet.</Text>
              ) : (
                theirGoals.map((goal, index) => {
                  const analysis =
                    goalAnalysis(goal, sharedGoals, sharedEntries, today, weekStartsOn) ??
                    bigDealSummary(goal, sharedGoals, today);
                  const children = childrenMap.get(goal.id) ?? [];
                  const showDots = isRepeating(goal);
                  const showBar = !showDots && (children.length > 0 || isTracked(goal));
                  const weekStart = startOfWeek(today, weekStartsOn);
                  const barTarget = isRepeating(goal)
                    ? weekTargetFor(goal, weekStart, weekStartsOn).target
                    : goal.targetAmount;
                  const barTotal =
                    children.length > 0
                      ? null
                      : isRepeating(goal)
                        ? periodTotalAsOf(goal, sharedEntries, today, weekStartsOn)
                        : (rollupTotal(goal, sharedGoals, sharedEntries) ?? 0);
                  const deal = children.length > 0 ? bigDealSummary(goal, sharedGoals, today) : null;
                  const percent = deal
                    ? deal.total > 0
                      ? (deal.done / deal.total) * 100
                      : 0
                    : barPercent(barTotal ?? 0, barTarget);
                  return (
                    <Pressable
                      key={goal.id}
                      onPress={() => onOpenGoal(goal)}
                      style={({ pressed }) => [
                        styles.goalRow,
                        index > 0 && styles.rowBorder,
                        pressed && styles.pressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${goal.title || 'Untitled'}`}
                    >
                      <View style={styles.goalText}>
                        <Text style={styles.goalTitle} numberOfLines={2}>
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
                      <View style={styles.trailing}>
                        {showDots ? (
                          <WeekDots
                            goal={goal}
                            entries={sharedEntries}
                            asOf={today}
                            weekStartsOn={weekStartsOn}
                          />
                        ) : null}
                        {showBar ? <ThinBar percent={percent} /> : null}
                        <Ionicons name="chevron-forward" size={18} color="#c7c7cc" />
                      </View>
                    </Pressable>
                  );
                })
              )}
            </View>
          </>
        ) : null}

        <Text style={styles.section}>What I share</Text>
        <Text style={styles.helper}>
          Sharing a goal includes all its steps. {name} can see progress but can't change anything.
        </Text>
        <View style={styles.card}>
          {mineError ? <Text style={styles.sectionError}>{mineError}</Text> : null}
          {sharesError ? <Text style={styles.sectionError}>{sharesError}</Text> : null}
          {mineError && shareable.length === 0 ? null : shareable.length === 0 ? (
            <Text style={styles.empty}>No active goals.</Text>
          ) : (
            shareable.map((goal, index) => (
              <View key={goal.id} style={[styles.shareRow, index > 0 && styles.rowBorder]}>
                <Text style={styles.shareTitle} numberOfLines={2}>
                  {goal.title || 'Untitled'}
                </Text>
                <Switch
                  value={sharedIds.has(goal.id)}
                  onValueChange={(next) => {
                    void toggleShare(goal.id, next);
                  }}
                  disabled={savingIds.has(goal.id)}
                  trackColor={{ false: '#e5e5ea', true: '#34c759' }}
                />
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f2f2f7',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f2f2f7',
  },
  section: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: '#6B6B70',
    marginBottom: 8,
    marginLeft: 4,
  },
  helper: {
    fontSize: 13,
    lineHeight: 18,
    color: '#6b6b70',
    marginTop: -4,
    marginBottom: 8,
    marginLeft: 4,
    marginRight: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 24,
    overflow: 'hidden',
  },
  empty: {
    fontSize: 15,
    lineHeight: 21,
    color: '#6b6b70',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  errorText: {
    fontSize: 14,
    color: '#c62828',
    marginBottom: 12,
  },
  sectionError: {
    fontSize: 14,
    lineHeight: 20,
    color: '#c62828',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  goalText: {
    flex: 1,
  },
  goalTitle: {
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
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5ea',
  },
  shareRow: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  shareTitle: {
    flex: 1,
    fontSize: 17,
    color: '#111',
  },
  pressed: {
    opacity: 0.7,
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
  weekDotSessions: {
    marginTop: 1,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '600',
    color: '#248A3D',
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
});
