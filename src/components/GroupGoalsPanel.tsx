import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UNIT_OPTIONS } from '../constants';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { formatAmount, WEEKDAY_INITIALS, WEEKDAY_NAMES } from '../lib/goalDetailText';
import { isDaily } from '../lib/goalTree';
import {
  addGroupGoalToMyGoals,
  archiveGroupGoal,
  createGroupGoal,
  getGroupProgress,
  groupErrorMessage,
  listGroupGoals,
  listMyLinkedGroupGoalIds,
  updateGroupGoal,
  type GroupGoalInput,
  type GroupGoalProgress,
  type GroupGoalTemplate,
  type GroupProgressMember,
  type GroupWeekProgress,
} from '../lib/groupsApi';
import { todayLocal } from '../lib/localDate';
import type { WeekStart } from '../lib/settingsApi';
import { startOfWeek } from '../lib/week';
import { useFloatingTabBarHeight } from '../navigation/FloatingTabBar';
import { addDays } from '../utils/date';
import { weekdayOrder } from '../lib/week';
import { FormDateRow, FormFieldRow, FormSelectRow, formFieldStyles } from './FormFields';
import { KeyboardSafe } from './KeyboardSafe';
import { TimesStepper } from './TimesStepper';

const CUSTOM_UNIT = '__custom__';
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const UNIT_CHOICES = [
  ...UNIT_OPTIONS.map((unit) => ({ value: unit, label: unit })),
  { value: CUSTOM_UNIT, label: 'Custom…' },
];

type Period = 'daily' | 'week' | 'month';

type Draft = {
  title: string;
  why: string;
  trackOn: boolean;
  unitChoice: string;
  customUnit: string;
  target: string;
  repeatOn: boolean;
  period: Period;
  plannedDays: number[];
  times: number;
  targetEnd: string;
};

const EMPTY_DRAFT: Draft = {
  title: '',
  why: '',
  trackOn: false,
  unitChoice: '',
  customUnit: '',
  target: '',
  repeatOn: true,
  period: 'week',
  plannedDays: [],
  times: 1,
  targetEnd: '',
};

function isPresetUnit(unit: string): boolean {
  return (UNIT_OPTIONS as readonly string[]).includes(unit);
}

function parseAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const amount = Number(trimmed);
  return Number.isFinite(amount) ? amount : null;
}

function clampTimes(period: Period, value: number): number {
  const max = period === 'daily' ? 12 : period === 'month' ? 60 : 21;
  return Math.min(max, Math.max(1, Math.round(value) || 1));
}

function draftFromGoal(goal: GroupGoalTemplate): Draft {
  const daily = isDaily({
    repeatPeriod: goal.repeatPeriod,
    plannedDays: goal.plannedDays,
    unit: goal.unit,
    targetAmount: goal.targetAmount,
  });
  const period: Period =
    goal.plannedDays == null ? 'week' : daily ? 'daily' : goal.repeatPeriod === 'month' ? 'month' : 'week';
  const preset = goal.unit != null && isPresetUnit(goal.unit);
  const times =
    period === 'daily'
      ? goal.timesPerDay
      : goal.unit == null && goal.targetAmount != null && goal.targetAmount > 0
        ? goal.targetAmount
        : 1;
  return {
    title: goal.title,
    why: goal.why ?? '',
    trackOn: goal.unit != null,
    unitChoice: goal.unit == null ? '' : preset ? goal.unit : CUSTOM_UNIT,
    customUnit: goal.unit != null && !preset ? goal.unit : '',
    target: goal.unit != null && goal.targetAmount != null ? String(goal.targetAmount) : '',
    repeatOn: goal.plannedDays != null,
    period,
    plannedDays: goal.plannedDays ?? [],
    times,
    targetEnd: goal.targetEndDate ?? '',
  };
}

function inputFromDraft(draft: Draft): GroupGoalInput | string {
  const title = draft.title.trim();
  if (!title) {
    return 'Enter a title.';
  }
  const unit = !draft.trackOn
    ? null
    : draft.unitChoice === CUSTOM_UNIT
      ? draft.customUnit.trim() || null
      : draft.unitChoice.trim() || null;
  if (draft.trackOn && !unit) {
    return 'Choose a unit.';
  }
  const parsed = parseAmount(draft.target);
  if (draft.trackOn && parsed == null) {
    return 'Enter a target.';
  }
  const times = clampTimes(draft.period, draft.times);
  const daily = draft.repeatOn && draft.period === 'daily';
  return {
    title,
    why: draft.why.trim() || null,
    unit,
    targetAmount: draft.trackOn ? parsed : draft.repeatOn && !daily ? times : null,
    repeatPeriod: !draft.repeatOn ? null : draft.period === 'month' ? 'month' : 'week',
    plannedDays: !draft.repeatOn ? null : daily ? [...ALL_DAYS] : [...draft.plannedDays].sort((a, b) => a - b),
    timesPerDay: daily && !draft.trackOn ? Math.min(12, times) : 1,
    targetEndDate: draft.targetEnd.trim() || null,
  };
}

const DONUT_SIZE = 112;
const DONUT_STROKE = 12;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function weekStarts(weekStart: WeekStart): string[] {
  const current = startOfWeek(todayLocal(), weekStart);
  return Array.from({ length: 6 }, (_, index) => addDays(current, (index - 5) * 7));
}

function weekBarLabel(start: string, current: string): string {
  if (start === current) {
    return 'This week';
  }
  const [year, month, day] = start.split('-').map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  return `${MONTHS[date.getMonth()] ?? ''} ${date.getDate()}`;
}

function memberLabel(member: GroupProgressMember, me: string | undefined): string {
  if (me && member.userId === me) {
    return 'You';
  }
  return member.displayName;
}

function sortMembers(members: GroupProgressMember[], me: string | undefined): GroupProgressMember[] {
  return [...members].sort((a, b) => {
    if (me && a.userId === me) {
      return -1;
    }
    if (me && b.userId === me) {
      return 1;
    }
    return a.displayName.localeCompare(b.displayName);
  });
}

function scoreText(member: GroupProgressMember): string {
  const target = member.target == null ? '0' : formatAmount(member.target);
  return `${formatAmount(member.progress)} / ${target}`;
}

function GroupDonut({ pct }: { pct: number }) {
  const radius = (DONUT_SIZE - DONUT_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = DONUT_SIZE / 2;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
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
        {clamped > 0 ? (
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke="#007aff"
            strokeWidth={DONUT_STROKE}
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - clamped / 100)}
            strokeLinecap="round"
            rotation={-90}
            origin={`${center}, ${center}`}
          />
        ) : null}
      </Svg>
      <Text style={styles.donutValue}>{clamped}%</Text>
    </View>
  );
}

export function GroupGoalsPanel({
  groupId,
  groupName,
  admin,
  showMemberProgress,
  blockedIds = [],
}: {
  groupId: string;
  groupName: string;
  admin: boolean;
  showMemberProgress: boolean;
  blockedIds?: string[];
}) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useFloatingTabBarHeight();
  const { user } = useAuth();
  const { settings } = useSettings();
  const [goals, setGoals] = useState<GroupGoalTemplate[]>([]);
  const [tracked, setTracked] = useState<Set<string>>(new Set());
  const [weeks, setWeeks] = useState<GroupWeekProgress[]>([]);
  const [weekLabels, setWeekLabels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<GroupGoalTemplate | null | undefined>(undefined);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [openGoalId, setOpenGoalId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextGoals, linked] = await Promise.all([
        listGroupGoals(groupId),
        listMyLinkedGroupGoalIds(),
      ]);
      setGoals(nextGoals);
      setTracked(linked);
      const starts = weekStarts(settings.weekStart);
      const current = starts[starts.length - 1] ?? starts[0];
      const progress = await Promise.all(starts.map((start) => getGroupProgress(groupId, start)));
      setWeeks(progress);
      setWeekLabels(starts.map((start) => weekBarLabel(start, current ?? start)));
    } catch (cause) {
      setError(groupErrorMessage(cause, 'Could not load group goals.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [groupId, settings.weekStart]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load, showMemberProgress]),
  );

  const openNew = () => {
    setDraft(EMPTY_DRAFT);
    setEditing(null);
  };

  const openExisting = (goal: GroupGoalTemplate) => {
    setDraft(draftFromGoal(goal));
    setEditing(goal);
  };

  const close = () => {
    if (saving) {
      return;
    }
    setEditing(undefined);
  };

  const save = async () => {
    const input = inputFromDraft(draft);
    if (typeof input === 'string') {
      Alert.alert(input);
      return;
    }
    const run = async () => {
      setSaving(true);
      try {
        if (editing) {
          await updateGroupGoal(editing.id, input);
        } else {
          await createGroupGoal(groupId, input);
        }
        setEditing(undefined);
        await load();
      } catch (cause) {
        Alert.alert('Could not save', groupErrorMessage(cause, 'The group goal was not saved.'));
      } finally {
        setSaving(false);
      }
    };
    if (editing) {
      Alert.alert(`This changes it for everyone in ${groupName}.`, undefined, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save for everyone', onPress: () => void run() },
      ]);
      return;
    }
    await run();
  };

  const remove = () => {
    if (!editing) {
      return;
    }
    const goalId = editing.id;
    Alert.alert('Everyone keeps it as a personal goal, with their history.', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setSaving(true);
            try {
              await archiveGroupGoal(goalId);
              setEditing(undefined);
              await load();
            } catch (cause) {
              Alert.alert('Could not remove', groupErrorMessage(cause, 'The group goal was not removed.'));
            } finally {
              setSaving(false);
            }
          })();
        },
      },
    ]);
  };

  const toggleDay = (day: number) => {
    setDraft((current) => {
      const next = current.plannedDays.includes(day)
        ? current.plannedDays.filter((entry) => entry !== day)
        : [...current.plannedDays, day].sort((a, b) => a - b);
      const daily =
        !current.trackOn &&
        current.period !== 'month' &&
        ALL_DAYS.every((value) => next.includes(value));
      return {
        ...current,
        plannedDays: daily ? [...ALL_DAYS] : next,
        period: daily ? 'daily' : current.period === 'daily' ? 'week' : current.period,
      };
    });
  };

  const current = weeks[weeks.length - 1] ?? null;
  const membersOn = current?.showMemberProgress === true;
  const progressByGoal = new Map<string, GroupGoalProgress>(
    (current?.goals ?? []).map((goal) => [goal.groupGoalId, goal]),
  );

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + tabBarHeight + 24 }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
        />
      }
    >
      <Text style={styles.section}>This week</Text>
      <View style={styles.card}>
        <View style={styles.weekCard}>
          {loading && !current ? (
            <ActivityIndicator color="#007aff" />
          ) : (
            <GroupDonut pct={current?.overallPct ?? 0} />
          )}
          <Text style={styles.activeLine}>
            {`${current?.activeMembers ?? 0} members active this week`}
          </Text>
        </View>
      </View>

      <Text style={styles.section}>Group goals</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.card}>
        {goals.map((goal, index) => {
          const stats = progressByGoal.get(goal.id);
          const collective = stats?.collectivePct ?? 0;
          const tracking = stats?.tracking ?? 0;
          const hit = stats?.hit ?? 0;
          const expanded = membersOn && openGoalId === goal.id;
          const members = stats?.members ? sortMembers(stats.members, user?.id) : [];
          return (
          <View key={goal.id}>
          <Pressable
            disabled={!admin && !membersOn}
            onPress={() => {
              if (membersOn) {
                setOpenGoalId((currentId) => (currentId === goal.id ? null : goal.id));
                return;
              }
              openExisting(goal);
            }}
            style={({ pressed }) => [
              styles.goalRow,
              index > 0 && styles.rowBorder,
              pressed && (admin || membersOn) && styles.pressed,
            ]}
            accessibilityRole={admin || membersOn ? 'button' : 'text'}
            accessibilityState={membersOn ? { expanded } : undefined}
            accessibilityLabel={goal.title}
          >
            <Text style={styles.goalTitle}>{goal.title}</Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.max(0, Math.min(100, collective))}%` }]} />
            </View>
            <Text style={styles.goalMeta}>{`${hit} of ${tracking} hit their target`}</Text>
          </Pressable>
          {admin && membersOn ? (
            <Pressable
              onPress={() => openExisting(goal)}
              style={({ pressed }) => [styles.addMine, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Edit"
            >
              <Text style={styles.addMineText}>Edit</Text>
            </Pressable>
          ) : null}
          {expanded ? (
            <View style={styles.members}>
              {members
                .filter((member) => !blockedIds.includes(member.userId))
                .map((member) => (
                <View key={member.userId} style={styles.memberRow}>
                  <Text style={styles.memberName}>{memberLabel(member, user?.id)}</Text>
                  <Text style={styles.memberScore}>
                    {`${scoreText(member)}  ${member.pct}%`}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          {!tracked.has(goal.id) ? (
            <Pressable
              onPress={() => {
                void (async () => {
                  try {
                    await addGroupGoalToMyGoals(goal.id);
                    await load();
                  } catch (cause) {
                    Alert.alert(
                      'Could not add',
                      groupErrorMessage(cause, 'The group goal was not added.'),
                    );
                  }
                })();
              }}
              style={({ pressed }) => [styles.addMine, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Add to my goals"
            >
              <Text style={styles.addMineText}>Add to my goals</Text>
            </Pressable>
          ) : null}
          </View>
          );
        })}
        {admin ? (
          <Pressable
            onPress={openNew}
            style={({ pressed }) => [styles.addRow, goals.length > 0 && styles.rowBorder, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Add group goal"
          >
            <Text style={styles.addText}>+ Add group goal</Text>
          </Pressable>
        ) : null}
      </View>
      {membersOn ? null : <Text style={styles.note}>Only group totals are shown.</Text>}

      <Text style={styles.section}>Last 6 weeks</Text>
      <View style={styles.card}>
        <View style={styles.bars}>
          {weeks.map((week, index) => (
            <View key={weekLabels[index] ?? String(index)} style={styles.barCol}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { height: `${Math.max(0, Math.min(100, week.overallPct))}%` },
                  ]}
                />
              </View>
              <Text style={styles.barLabel}>{weekLabels[index] ?? ''}</Text>
            </View>
          ))}
        </View>
      </View>

      <Modal visible={editing !== undefined} transparent animationType="slide" onRequestClose={close}>
        <KeyboardSafe style={styles.overlay} keyboardVerticalOffset={0}>
          <Pressable style={styles.dismiss} onPress={close} accessibilityLabel="Close" />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>Title</Text>
              <TextInput
                value={draft.title}
                onChangeText={(title) => setDraft((current) => ({ ...current, title }))}
                style={styles.input}
                placeholder="Untitled"
              />
              <Text style={styles.fieldLabel}>Why it matters (optional)</Text>
              <TextInput
                value={draft.why}
                onChangeText={(why) => setDraft((current) => ({ ...current, why }))}
                style={[styles.input, styles.multiline]}
                placeholder="Optional"
                multiline
              />
              <View style={styles.switchRow}>
                <Text style={styles.fieldLabel}>Track an amount</Text>
                <Switch
                  value={draft.trackOn}
                  onValueChange={(trackOn) => setDraft((current) => ({ ...current, trackOn }))}
                  accessibilityLabel="Track an amount"
                />
              </View>
              {draft.trackOn ? (
                <View style={styles.block}>
                  <FormSelectRow
                    label="Unit"
                    value={draft.unitChoice}
                    placeholder="Choose"
                    options={UNIT_CHOICES}
                    onChange={(unitChoice) => setDraft((current) => ({ ...current, unitChoice }))}
                  />
                  {draft.unitChoice === CUSTOM_UNIT ? (
                    <FormFieldRow label="Custom unit">
                      <TextInput
                        value={draft.customUnit}
                        onChangeText={(customUnit) => setDraft((current) => ({ ...current, customUnit }))}
                        placeholder="e.g. laps"
                        style={styles.inline}
                      />
                    </FormFieldRow>
                  ) : null}
                  <FormFieldRow label="Target">
                    <TextInput
                      value={draft.target}
                      onChangeText={(target) => setDraft((current) => ({ ...current, target }))}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      style={styles.inline}
                    />
                  </FormFieldRow>
                </View>
              ) : null}
              <View style={styles.switchRow}>
                <Text style={styles.fieldLabel}>Repeat</Text>
                <Switch
                  value={draft.repeatOn}
                  onValueChange={(repeatOn) => setDraft((current) => ({ ...current, repeatOn }))}
                  accessibilityLabel="Repeat"
                />
              </View>
              {draft.repeatOn ? (
                <View style={styles.block}>
                  <FormSelectRow
                    label="Period"
                    value={draft.period}
                    placeholder="Weekly"
                    options={[
                      { value: 'daily', label: 'Daily' },
                      { value: 'week', label: 'Weekly' },
                      { value: 'month', label: 'Monthly' },
                    ]}
                    onChange={(value) => {
                      const period = value as Period;
                      setDraft((current) => ({
                        ...current,
                        period,
                        plannedDays: period === 'daily' ? [...ALL_DAYS] : current.plannedDays,
                        times: clampTimes(period, current.times),
                      }));
                    }}
                  />
                  <View style={formFieldStyles.formStackedBlock}>
                    <Text style={formFieldStyles.formFieldLabel}>Days</Text>
                    <View style={formFieldStyles.dayPicker}>
                      {weekdayOrder(settings.weekStart).map((day) => {
                        const selected = draft.period === 'daily' || draft.plannedDays.includes(day);
                        return (
                          <Pressable
                            key={WEEKDAY_NAMES[day]}
                            onPress={() => toggleDay(day)}
                            style={({ pressed }) => [
                              formFieldStyles.dayChip,
                              selected && formFieldStyles.dayChipSelected,
                              pressed && styles.pressed,
                            ]}
                            accessibilityLabel={WEEKDAY_NAMES[day]}
                            accessibilityState={{ selected }}
                          >
                            <Text
                              style={[
                                formFieldStyles.dayChipText,
                                selected && formFieldStyles.dayChipTextSelected,
                              ]}
                            >
                              {WEEKDAY_INITIALS[day]}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                  {!draft.trackOn ? (
                    <TimesStepper
                      label={
                        draft.period === 'daily'
                          ? 'Times per day'
                          : draft.period === 'month'
                            ? 'Times per month'
                            : 'Times per week'
                      }
                      value={draft.times}
                      min={1}
                      max={draft.period === 'daily' ? 12 : draft.period === 'month' ? 60 : 21}
                      onChange={(times) => setDraft((current) => ({ ...current, times }))}
                    />
                  ) : null}
                </View>
              ) : null}
              <FormDateRow
                label="Target date (optional)"
                labelWidth={150}
                value={draft.targetEnd}
                onChange={(targetEnd) => setDraft((current) => ({ ...current, targetEnd }))}
              />
              <Pressable
                onPress={() => void save()}
                disabled={saving}
                style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={editing ? 'Save' : 'Create'}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryText}>{editing ? 'Save' : 'Create'}</Text>
                )}
              </Pressable>
              {editing ? (
                <Pressable
                  onPress={remove}
                  disabled={saving}
                  style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Remove group goal"
                >
                  <Text style={styles.removeText}>Remove group goal</Text>
                </Pressable>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardSafe>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingTop: 8,
  },
  weekCard: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  donutWrap: {
    width: DONUT_SIZE,
    height: DONUT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutValue: {
    position: 'absolute',
    fontSize: 28,
    fontWeight: '700',
    color: '#111',
  },
  activeLine: {
    marginTop: 8,
    fontSize: 15,
    color: '#111',
    textAlign: 'center',
  },
  track: {
    marginTop: 8,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e5e5ea',
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#007aff',
  },
  members: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 6,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  memberName: {
    flex: 1,
    fontSize: 15,
    color: '#111',
  },
  memberScore: {
    fontSize: 15,
    color: '#6B6B70',
  },
  note: {
    marginTop: 8,
    marginHorizontal: 16,
    fontSize: 13,
    color: '#8e8e93',
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
  },
  barTrack: {
    width: '70%',
    height: 72,
    justifyContent: 'flex-end',
    backgroundColor: '#f2f2f7',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    backgroundColor: '#007aff',
  },
  barLabel: {
    marginTop: 6,
    fontSize: 11,
    color: '#6B6B70',
    textAlign: 'center',
  },
  section: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: '#6B6B70',
    marginTop: 16,
    marginBottom: 8,
    marginHorizontal: 16,
  },
  card: {
    backgroundColor: '#fff',
  },
  goalRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  goalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111',
  },
  goalMeta: {
    fontSize: 13,
    color: '#6B6B70',
    marginTop: 2,
  },
  addMine: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  addMineText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#007aff',
  },
  addRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  addText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#007aff',
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5ea',
  },
  error: {
    color: '#c62828',
    paddingHorizontal: 16,
    marginBottom: 8,
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
    maxHeight: '88%',
    paddingTop: 16,
  },
  fieldLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111',
    marginHorizontal: 16,
    marginTop: 12,
  },
  input: {
    marginHorizontal: 16,
    marginTop: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#c7c7cc',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 17,
    color: '#111',
  },
  multiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  switchRow: {
    marginTop: 8,
    paddingRight: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  block: {
    marginTop: 8,
    gap: 8,
  },
  inline: {
    flex: 1,
    fontSize: 17,
    color: '#111',
    paddingVertical: 4,
  },
  primary: {
    marginHorizontal: 16,
    marginTop: 20,
    backgroundColor: '#007aff',
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  remove: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: {
    color: '#c62828',
    fontSize: 17,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
