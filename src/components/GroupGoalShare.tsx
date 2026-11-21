import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { STATUS_COLORS } from '../constants';
import { useAuth } from '../context/AuthContext';
import { AREA_ICONS } from '../constants/areaIcons';
import { useSettings } from '../context/SettingsContext';
import { periodTotalAsOf } from '../lib/asOfDate';
import {
  getMyConnections,
  getSharesForGoal,
  shareGoal,
  unshareGoal,
} from '../lib/communityApi';
import { bigDealSummary, goalAnalysis, type AnalysisTone } from '../lib/goalAnalysis';
import { getAllGoals, getEntries } from '../lib/goalTreeApi';
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
import {
  groupErrorMessage,
  listGroupGoalShares,
  listGroupsSharingGoal,
  listMyGroups,
  shareGoalWithGroup,
  unshareGoalWithGroup,
  type MyGroup,
} from '../lib/groupsApi';
import { todayLocal } from '../lib/localDate';
import type { WeekStart } from '../lib/settingsApi';
import { startOfWeek, weekDays } from '../lib/week';
import type { Goal, GoalEntry } from '../types/goal';
import { toDateString } from '../utils/date';
import { KeyboardSafe } from './KeyboardSafe';

const TONE_COLOR: Record<AnalysisTone, string> = {
  good: STATUS_COLORS.positive,
  encourage: STATUS_COLORS.encourage,
  warn: '#C2410C',
  neutral: '#1C1C1E',
};

type PartnerRow = { id: string; name: string };

function dateKey(date: Date): string {
  return toDateString(date.getFullYear(), date.getMonth(), date.getDate());
}

function barPercent(total: number, target: number | null): number {
  if (target == null || target <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (total / target) * 100));
}

function treeFromRoots(all: Goal[], rootIds: Set<string>): Goal[] {
  const roots = all.filter((goal) => goal.parentId == null && rootIds.has(goal.id));
  const children = buildChildrenMap(all);
  const included = new Set<string>();
  const stack = roots.map((goal) => goal.id);
  while (stack.length > 0) {
    const id = stack.pop();
    if (id == null || included.has(id)) {
      continue;
    }
    included.add(id);
    for (const child of children.get(id) ?? []) {
      stack.push(child.id);
    }
  }
  return all.filter((goal) => included.has(goal.id));
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
  const available = new Set(weekTargetFor(goal, asOf, weekStartsOn).availableDays.map(dateKey));
  return (
    <View style={styles.weekDots} pointerEvents="none">
      {days.map((day) => {
        if (startOfWeek(day, weekStartsOn) < startWeek) {
          return <View key={day} style={styles.weekDotSlot} />;
        }
        if (!available.has(day)) {
          return (
            <View key={day} style={styles.weekDotSlot}>
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
            {sessions != null ? <Text style={styles.weekDotSessions}>{`×${sessions}`}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

export function SharedGoalRow({
  goal,
  goals,
  entries,
  onPress,
}: {
  goal: Goal;
  goals: Goal[];
  entries: GoalEntry[];
  onPress: () => void;
}) {
  const { settings } = useSettings();
  const weekStartsOn = settings.weekStart;
  const today = todayLocal();
  const children = buildChildrenMap(goals).get(goal.id) ?? [];
  const analysis =
    goalAnalysis(goal, goals, entries, today, weekStartsOn) ?? bigDealSummary(goal, goals, today);
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
        ? periodTotalAsOf(goal, entries, today, weekStartsOn)
        : (rollupTotal(goal, goals, entries) ?? 0);
  const deal = children.length > 0 ? bigDealSummary(goal, goals, today) : null;
  const percent = deal
    ? deal.total > 0
      ? (deal.done / deal.total) * 100
      : 0
    : barPercent(barTotal ?? 0, barTarget);
  const icon = goal.category ? AREA_ICONS[goal.category] : undefined;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.goalRow, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${goal.title || 'Untitled'}`}
    >
      <View style={styles.goalText}>
        <View style={styles.titleLine}>
          {icon ? <MaterialCommunityIcons name={icon} size={18} color="#8e8e93" /> : null}
          <Text style={styles.goalTitle} numberOfLines={2}>
            {goal.title || 'Untitled'}
          </Text>
        </View>
        {analysis ? (
          <Text style={styles.analysisLine} numberOfLines={1}>
            <Text style={{ color: TONE_COLOR[analysis.tone] }}>{analysis.headline}</Text>
            {analysis.detail ? <Text style={styles.analysisDetail}>{` ${analysis.detail}`}</Text> : null}
          </Text>
        ) : null}
      </View>
      <View style={styles.trailing}>
        {showDots ? (
          <WeekDots goal={goal} entries={entries} asOf={today} weekStartsOn={weekStartsOn} />
        ) : null}
        {showBar ? (
          <View style={styles.thinTrack}>
            <View style={[styles.thinFill, { width: `${Math.max(0, Math.min(100, percent))}%` }]} />
          </View>
        ) : null}
        <Ionicons name="chevron-forward" size={18} color="#c7c7cc" />
      </View>
    </Pressable>
  );
}

export function MemberSharedGoals({
  groupId,
  ownerId,
  onOpen,
}: {
  groupId: string;
  ownerId: string;
  onOpen: (goal: Goal) => void;
}) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [entries, setEntries] = useState<GoalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const shares = await listGroupGoalShares(groupId);
      const rootIds = new Set(
        shares.filter((share) => share.ownerId === ownerId).map((share) => share.goalId),
      );
      if (rootIds.size === 0) {
        setGoals([]);
        setEntries([]);
        setLoading(false);
        return;
      }
      const all = await getAllGoals(ownerId);
      const tree = treeFromRoots(all, rootIds);
      const nextEntries = tree.length > 0 ? await getEntries(tree.map((goal) => goal.id), undefined, undefined, ownerId) : [];
      setGoals(tree);
      setEntries(nextEntries);
    } catch (cause) {
      setError(groupErrorMessage(cause, 'Could not load shared goals.'));
    } finally {
      setLoading(false);
    }
  }, [groupId, ownerId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const roots = useMemo(
    () => goals.filter((goal) => goal.parentId == null),
    [goals],
  );

  if (loading) {
    return <ActivityIndicator color="#007aff" style={styles.inlineLoading} />;
  }
  if (error) {
    return <Text style={styles.error}>{error}</Text>;
  }
  return (
    <View>
      {roots.map((goal) => (
        <SharedGoalRow
          key={goal.id}
          goal={goal}
          goals={goals}
          entries={entries}
          onPress={() => onOpen(goal)}
        />
      ))}
    </View>
  );
}

export function ShareWithSection({ goalId }: { goalId: string }) {
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [groups, setGroups] = useState<MyGroup[]>([]);
  const [partnerIds, setPartnerIds] = useState<Set<string>>(new Set());
  const [groupIds, setGroupIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const [connections, myGroups, partnerShares, sharedGroups] = await Promise.all([
      getMyConnections().catch(() => []),
      listMyGroups().catch(() => []),
      getSharesForGoal(goalId).catch(() => []),
      listGroupsSharingGoal(goalId).catch(() => []),
    ]);
    const people = connections
      .filter(
        (connection) =>
          connection.status.toLowerCase() === 'accepted' &&
          connection.role !== 'coach' &&
          connection.partnerId != null,
      )
      .map((connection) => ({
        id: connection.partnerId ?? '',
        name: connection.displayName?.trim() || connection.email?.trim() || 'Accountability partner',
      }))
      .filter((person) => person.id.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
    setPartners(people);
    setGroups(myGroups);
    setPartnerIds(new Set(partnerShares.map((share) => share.viewerId)));
    setGroupIds(new Set(sharedGroups));
  }, [goalId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const toggle = async (key: string, next: boolean, run: () => Promise<void>, revert: () => void) => {
    if (saving.has(key)) {
      return;
    }
    setSaving((current) => new Set(current).add(key));
    try {
      await run();
    } catch (cause) {
      revert();
      Alert.alert('Could not update sharing', groupErrorMessage(cause, 'Sharing was not updated.'));
    } finally {
      setSaving((current) => {
        const copy = new Set(current);
        copy.delete(key);
        return copy;
      });
    }
  };

  if (partners.length === 0 && groups.length === 0) {
    return null;
  }

  return (
    <View style={styles.sectionWrap}>
      <Text style={styles.section}>Share with</Text>
      <View style={styles.card}>
        {partners.map((partner, index) => (
          <View key={partner.id} style={[styles.shareRow, index > 0 && styles.rowBorder]}>
            <Text style={styles.shareTitle} numberOfLines={1}>
              {partner.name}
            </Text>
            <Switch
              value={partnerIds.has(partner.id)}
              disabled={saving.has(`partner:${partner.id}`)}
              onValueChange={(next) => {
                setPartnerIds((current) => {
                  const copy = new Set(current);
                  if (next) {
                    copy.add(partner.id);
                  } else {
                    copy.delete(partner.id);
                  }
                  return copy;
                });
                void toggle(
                  `partner:${partner.id}`,
                  next,
                  () => (next ? shareGoal(goalId, partner.id) : unshareGoal(goalId, partner.id)).then(() => undefined),
                  () => {
                    setPartnerIds((current) => {
                      const copy = new Set(current);
                      if (next) {
                        copy.delete(partner.id);
                      } else {
                        copy.add(partner.id);
                      }
                      return copy;
                    });
                  },
                );
              }}
              trackColor={{ false: '#e5e5ea', true: '#34c759' }}
            />
          </View>
        ))}
        {groups.map((group, index) => (
          <View
            key={group.id}
            style={[styles.shareRow, (index > 0 || partners.length > 0) && styles.rowBorder]}
          >
            <Text style={styles.groupIcon}>👥</Text>
            <Text style={styles.shareTitle} numberOfLines={1}>
              {group.name}
            </Text>
            <Switch
              value={groupIds.has(group.id)}
              disabled={saving.has(`group:${group.id}`)}
              onValueChange={(next) => {
                setGroupIds((current) => {
                  const copy = new Set(current);
                  if (next) {
                    copy.add(group.id);
                  } else {
                    copy.delete(group.id);
                  }
                  return copy;
                });
                void toggle(
                  `group:${group.id}`,
                  next,
                  () =>
                    next
                      ? shareGoalWithGroup(goalId, group.id)
                      : unshareGoalWithGroup(goalId, group.id),
                  () => {
                    setGroupIds((current) => {
                      const copy = new Set(current);
                      if (next) {
                        copy.delete(group.id);
                      } else {
                        copy.add(group.id);
                      }
                      return copy;
                    });
                  },
                );
              }}
              trackColor={{ false: '#e5e5ea', true: '#34c759' }}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

export function ChooseGoalsSheet({
  groupId,
  visible,
  onClose,
}: {
  groupId: string;
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [shared, setShared] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!visible) {
      return;
    }
    setLoading(true);
    try {
      const [mine, shares] = await Promise.all([getAllGoals(), listGroupGoalShares(groupId)]);
      setGoals(
        mine
          .filter((goal) => goal.parentId == null && goal.status !== 'done')
          .sort((a, b) => a.sortOrder - b.sortOrder),
      );
      setShared(
        new Set(
          shares.filter((share) => share.ownerId === user?.id).map((share) => share.goalId),
        ),
      );
    } catch (cause) {
      Alert.alert('Could not load goals', groupErrorMessage(cause, 'Could not load goals.'));
    } finally {
      setLoading(false);
    }
  }, [groupId, user?.id, visible]);

  useEffect(() => {
    if (visible) {
      void load();
    }
  }, [load, visible]);

  const toggle = async (goalId: string, next: boolean) => {
    if (saving.has(goalId)) {
      return;
    }
    setSaving((current) => new Set(current).add(goalId));
    setShared((current) => {
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
        await shareGoalWithGroup(goalId, groupId);
      } else {
        await unshareGoalWithGroup(goalId, groupId);
      }
    } catch (cause) {
      setShared((current) => {
        const copy = new Set(current);
        if (next) {
          copy.delete(goalId);
        } else {
          copy.add(goalId);
        }
        return copy;
      });
      Alert.alert('Could not update sharing', groupErrorMessage(cause, 'Sharing was not updated.'));
    } finally {
      setSaving((current) => {
        const copy = new Set(current);
        copy.delete(goalId);
        return copy;
      });
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardSafe style={styles.overlay} keyboardVerticalOffset={0}>
        <Pressable style={styles.dismiss} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.sheetTitle}>Choose goals to share</Text>
          {loading ? (
            <ActivityIndicator color="#007aff" />
          ) : goals.length === 0 ? (
            <Text style={styles.empty}>No active goals.</Text>
          ) : (
            goals.map((goal, index) => (
              <View key={goal.id} style={[styles.shareRow, index > 0 && styles.rowBorder]}>
                <Text style={styles.shareTitle} numberOfLines={2}>
                  {goal.title || 'Untitled'}
                </Text>
                <Switch
                  value={shared.has(goal.id)}
                  disabled={saving.has(goal.id)}
                  onValueChange={(next) => void toggle(goal.id, next)}
                  trackColor={{ false: '#e5e5ea', true: '#34c759' }}
                />
              </View>
            ))
          )}
        </View>
      </KeyboardSafe>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sectionWrap: {
    marginTop: 16,
    marginHorizontal: 12,
  },
  section: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: '#6B6B70',
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
  },
  shareRow: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shareTitle: {
    flex: 1,
    fontSize: 17,
    color: '#111',
  },
  groupIcon: {
    fontSize: 16,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5ea',
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f7f7f8',
  },
  goalText: {
    flex: 1,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  goalTitle: {
    flex: 1,
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
  thinTrack: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e5e5ea',
    overflow: 'hidden',
  },
  thinFill: {
    height: 4,
    backgroundColor: '#34c759',
  },
  weekDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  weekDotSlot: {
    width: 10,
    alignItems: 'center',
  },
  weekDotBox: {
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  weekDotDone: {
    backgroundColor: '#34c759',
  },
  weekDotMissed: {
    backgroundColor: '#e5e5ea',
  },
  weekDotHollow: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#c7c7cc',
  },
  weekDotDisabled: {
    backgroundColor: '#f2f2f7',
  },
  weekDotPartial: {
    backgroundColor: '#e5e5ea',
    overflow: 'hidden',
  },
  weekDotPartialFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '50%',
    backgroundColor: '#34c759',
  },
  weekDotRing: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#111',
  },
  weekDotSessions: {
    fontSize: 8,
    color: '#6B6B70',
  },
  inlineLoading: {
    marginVertical: 12,
  },
  error: {
    fontSize: 14,
    color: '#c62828',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  dismiss: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 16,
    maxHeight: '80%',
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  empty: {
    fontSize: 15,
    lineHeight: 21,
    color: '#6b6b70',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  pressed: {
    opacity: 0.7,
  },
});
