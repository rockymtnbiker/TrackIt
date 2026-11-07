import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { DatePickerModal } from './DatePickerModal';
import { formFieldStyles } from './FormFields';
import { TimePickerModal } from './TimePickerModal';
import {
  REFLECTION_COPY,
  REFLECTION_STATUS,
  type ReflectionAnswerId,
} from '../constants/reflection';
import { clockFromDate, dateAtClock } from '../lib/clock';
import { WEEKDAY_INITIALS, WEEKDAY_NAMES } from '../lib/goalDetailText';
import {
  createGoal,
  deleteGoal,
  setGoalStatus,
  updateGoal,
  type GoalUpdates,
} from '../lib/goalTreeApi';
import { buildChildrenMap, isLeaf, isRepeating, weekTargetFor } from '../lib/goalTree';
import { periodTotalAsOf } from '../lib/asOfDate';
import { parseLocalDate, todayLocal, toLocalDateString } from '../lib/localDate';
import type { ReminderMode, WeekStart } from '../lib/settingsApi';
import { weekdayOrder } from '../lib/week';
import type { Goal, GoalEntry } from '../types/goal';
import { formatShortDate } from '../utils/date';
import { formatTime } from '../utils/formatTime';

type Props = {
  goalId: string;
  nodes: Goal[];
  entries: GoalEntry[];
  asOf: string;
  weekStartsOn: WeekStart;
  /** Null when this card is opened without a suggested fix. */
  answer: ReflectionAnswerId | null;
  focusAdd?: boolean;
  reminderMode: ReminderMode;
  onChange: (update: (current: Goal[]) => Goal[]) => void;
  onOpenGoal: (goalId: string) => void;
};

function formatQty(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function mergeGoal(current: Goal[], next: Goal): Goal[] {
  return current.map((item) =>
    item.id === next.id
      ? { ...item, ...next, targetHistory: next.targetHistory ?? item.targetHistory }
      : item,
  );
}

function subtreeIds(id: string, childrenMap: Map<string | null, Goal[]>): string[] {
  const ids = [id];
  for (const child of childrenMap.get(id) ?? []) {
    ids.push(...subtreeIds(child.id, childrenMap));
  }
  return ids;
}

function openLeaves(goalId: string, nodes: Goal[]): Goal[] {
  const childrenMap = buildChildrenMap(nodes);
  const leaves: Goal[] = [];
  const walk = (id: string) => {
    const children = childrenMap.get(id) ?? [];
    if (children.length === 0) {
      return;
    }
    for (const child of children) {
      if (isLeaf(child, childrenMap)) {
        if (child.status !== 'done') {
          leaves.push(child);
        }
      } else {
        walk(child.id);
      }
    }
  };
  walk(goalId);
  return leaves;
}

function habitToEdit(goal: Goal, nodes: Goal[]): Goal | null {
  if (isRepeating(goal)) {
    return goal;
  }
  const childrenMap = buildChildrenMap(nodes);
  const found: Goal[] = [];
  const walk = (id: string) => {
    for (const child of childrenMap.get(id) ?? []) {
      if (isRepeating(child)) {
        found.push(child);
      }
      walk(child.id);
    }
  };
  walk(goal.id);
  return found.find((step) => step.status !== 'done') ?? found[0] ?? null;
}

function stepProgress(step: Goal, entries: GoalEntry[], asOf: string, weekStartsOn: WeekStart): string {
  const parts: string[] = [REFLECTION_STATUS[step.status]];
  if (isRepeating(step)) {
    const { target } = weekTargetFor(step, asOf, weekStartsOn);
    if (target != null && target > 0) {
      const total = periodTotalAsOf(step, entries, asOf, weekStartsOn);
      parts.push(`${formatQty(total)} of ${formatQty(target)}`);
    }
  } else if (step.progressPct != null) {
    parts.push(`${Math.round(step.progressPct)}%`);
  }
  const end = step.targetEndDate?.slice(0, 10);
  if (end) {
    parts.push(formatShortDate(end));
  }
  return parts.join(' · ');
}

export function GoalAdjustCard({
  goalId,
  nodes,
  entries,
  asOf,
  weekStartsOn,
  answer,
  focusAdd = false,
  reminderMode,
  onChange,
  onOpenGoal,
}: Props) {
  const goal = nodes.find((item) => item.id === goalId) ?? null;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [whyDraft, setWhyDraft] = useState('');
  const [stepDraft, setStepDraft] = useState('');
  const [targetDraft, setTargetDraft] = useState('');
  const [dateOpen, setDateOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const habit = goal && answer === 'busy' ? habitToEdit(goal, nodes) : null;
  const habitAmount = habit?.targetAmount ?? null;
  const habitId = habit?.id ?? null;

  useEffect(() => {
    setTargetDraft(habitAmount == null ? '' : String(habitAmount));
  }, [habitId, habitAmount]);

  if (!goal) {
    return <Text style={styles.missing}>{REFLECTION_COPY.goalGone}</Text>;
  }

  const leaves = openLeaves(goal.id, nodes);
  const goalEnd = goal.targetEndDate?.slice(0, 10) ?? null;
  const showAdd = !isRepeating(goal);

  const fail = (error: unknown) => {
    Alert.alert(
      REFLECTION_COPY.couldNotSave,
      error instanceof Error ? error.message : REFLECTION_COPY.couldNotSave,
    );
  };

  const run = (task: () => Promise<void>) => {
    if (saving) {
      return;
    }
    setSaving(true);
    void task()
      .catch(fail)
      .finally(() => setSaving(false));
  };

  const saveGoal = (id: string, updates: GoalUpdates) => {
    run(async () => {
      const updated = await updateGoal(id, updates);
      onChange((current) => mergeGoal(current, updated));
    });
  };

  const saveTitle = (step: Goal) => {
    const next = titleDraft.trim();
    setEditingId(null);
    if (!next || next === step.title) {
      return;
    }
    saveGoal(step.id, { title: next });
  };

  const removeStep = (step: Goal) => {
    Alert.alert(REFLECTION_COPY.removeStep, step.title || 'Untitled', [
      { text: REFLECTION_COPY.cancel, style: 'cancel' },
      {
        text: REFLECTION_COPY.remove,
        style: 'destructive',
        onPress: () => {
          run(async () => {
            await deleteGoal(step.id);
            onChange((current) => {
              const drop = new Set(subtreeIds(step.id, buildChildrenMap(current)));
              return current.filter((item) => !drop.has(item.id));
            });
          });
        },
      },
    ]);
  };

  const markDone = (id: string) => {
    run(async () => {
      const updated = await setGoalStatus(id, 'done', todayLocal());
      onChange((current) => mergeGoal(current, updated));
    });
  };

  const addStep = () => {
    const title = stepDraft.trim();
    if (!title) {
      return;
    }
    run(async () => {
      const created = await createGoal({ title, parentId: goal.id });
      setStepDraft('');
      onChange((current) => [...current, created]);
    });
  };

  const saveWhy = () => {
    const why = whyDraft.trim();
    if (!why) {
      return;
    }
    setWhyDraft('');
    saveGoal(goal.id, { why });
  };

  const saveTarget = () => {
    if (!habit || targetDraft.trim() === '') {
      return;
    }
    const amount = Number(targetDraft);
    if (!Number.isFinite(amount) || amount === habit.targetAmount) {
      return;
    }
    saveGoal(habit.id, { targetAmount: amount });
  };

  const toggleDay = (day: number) => {
    if (!habit) {
      return;
    }
    const current = habit.plannedDays ?? [];
    const next = current.includes(day)
      ? current.filter((item) => item !== day)
      : [...current, day].sort((a, b) => a - b);
    saveGoal(habit.id, { plannedDays: next, repeatPeriod: habit.repeatPeriod ?? 'week' });
  };

  return (
    <View style={styles.card}>
      {answer === 'busy' ? (
        <View style={styles.suggestion}>
          <Text style={styles.suggestionText}>
            {habit
              ? REFLECTION_COPY.busyHabit.replace('[habit]', habit.title || 'Untitled')
              : REFLECTION_COPY.busyStep}
          </Text>
          {habit ? (
            <View style={styles.editor}>
              <Text style={styles.editorLabel}>{REFLECTION_COPY.target}</Text>
              <TextInput
                value={targetDraft}
                onChangeText={setTargetDraft}
                onBlur={saveTarget}
                onSubmitEditing={saveTarget}
                keyboardType="decimal-pad"
                placeholder={habit.unit ?? REFLECTION_COPY.target}
                placeholderTextColor="#8e8e93"
                style={styles.lineInput}
                editable={!saving}
              />
              <Text style={styles.editorLabel}>{REFLECTION_COPY.days}</Text>
              <View style={formFieldStyles.dayPicker}>
                {weekdayOrder(weekStartsOn).map((day) => {
                  const selected = (habit.plannedDays ?? []).includes(day);
                  return (
                    <Pressable
                      key={WEEKDAY_NAMES[day]}
                      onPress={() => toggleDay(day)}
                      disabled={saving}
                      style={({ pressed }) => [
                        formFieldStyles.dayChip,
                        selected && formFieldStyles.dayChipSelected,
                        pressed && styles.pressed,
                      ]}
                      accessibilityRole="button"
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
          ) : null}
        </View>
      ) : null}
      {answer === 'slipped' ? (
        <View style={styles.suggestion}>
          <Text style={styles.suggestionText}>{REFLECTION_COPY.slipped}</Text>
          {reminderMode === 'daily' ? (
            <Text style={styles.note}>{REFLECTION_COPY.dailyCheckin}</Text>
          ) : (
            <Pressable
              onPress={() => setTimeOpen(true)}
              disabled={saving}
              style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={REFLECTION_COPY.setTime}
            >
              <Text style={styles.textButtonLabel}>
                {goal.reminderTime
                  ? formatTime(dateAtClock(goal.reminderTime, 19, 0))
                  : REFLECTION_COPY.setTime}
              </Text>
            </Pressable>
          )}
        </View>
      ) : null}
      {answer === 'feeling' ? (
        <View style={styles.suggestion}>
          <Text style={styles.suggestionText}>{REFLECTION_COPY.whyStarted}</Text>
          {goal.why?.trim() ? (
            <Text style={styles.quote}>{goal.why.trim()}</Text>
          ) : (
            <TextInput
              value={whyDraft}
              onChangeText={setWhyDraft}
              onBlur={saveWhy}
              onSubmitEditing={saveWhy}
              placeholder={REFLECTION_COPY.addWhy}
              placeholderTextColor="#8e8e93"
              style={styles.lineInput}
              editable={!saving}
              returnKeyType="done"
            />
          )}
        </View>
      ) : null}
      {answer === 'start' ? (
        <Text style={styles.suggestionText}>{REFLECTION_COPY.breakStep}</Text>
      ) : null}
      {answer === 'came-up' ? (
        <Text style={styles.suggestionText}>{REFLECTION_COPY.cameUp}</Text>
      ) : null}
      {answer === 'fine' ? (
        <Text style={styles.suggestionText}>{REFLECTION_COPY.wentFine}</Text>
      ) : null}

      <Text style={styles.title}>{goal.title || 'Untitled'}</Text>
      {goal.why?.trim() ? <Text style={styles.why}>{goal.why.trim()}</Text> : null}
      {goalEnd ? (
        <Text style={styles.meta}>
          {REFLECTION_COPY.targetDate} · {formatShortDate(goalEnd)}
        </Text>
      ) : null}

      {leaves.map((step) => {
        const editing = editingId === step.id;
        return (
          <View key={step.id} style={styles.step}>
            <View style={styles.stepTitleRow}>
              {editing ? (
                <TextInput
                  value={titleDraft}
                  onChangeText={setTitleDraft}
                  onBlur={() => saveTitle(step)}
                  onSubmitEditing={() => saveTitle(step)}
                  style={[styles.stepTitle, styles.stepTitleInput]}
                  autoFocus
                  editable={!saving}
                />
              ) : (
                <Pressable
                  onPress={() => {
                    setTitleDraft(step.title);
                    setEditingId(step.id);
                  }}
                  style={styles.stepTitleHit}
                  accessibilityRole="button"
                  accessibilityLabel={step.title || 'Untitled'}
                >
                  <Text style={styles.stepTitle}>{step.title || 'Untitled'}</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => removeStep(step)}
                hitSlop={8}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel={REFLECTION_COPY.remove}
              >
                <Ionicons name="close-circle" size={20} color="#c7c7cc" />
              </Pressable>
            </View>
            <Text style={styles.stepMeta}>{stepProgress(step, entries, asOf, weekStartsOn)}</Text>
            <Pressable
              onPress={() => markDone(step.id)}
              disabled={saving}
              style={({ pressed }) => [pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={REFLECTION_COPY.markStepDone}
            >
              <Text style={styles.textButtonLabel}>{REFLECTION_COPY.markStepDone}</Text>
            </Pressable>
          </View>
        );
      })}

      {showAdd ? (
        <TextInput
          value={stepDraft}
          onChangeText={setStepDraft}
          onSubmitEditing={addStep}
          placeholder={leaves.length === 0 ? REFLECTION_COPY.nextThing : REFLECTION_COPY.addStep}
          placeholderTextColor="#8e8e93"
          style={styles.lineInput}
          editable={!saving}
          autoFocus={focusAdd}
          returnKeyType="done"
        />
      ) : null}

      <Pressable
        onPress={() => markDone(goal.id)}
        disabled={saving || goal.status === 'done'}
        style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={REFLECTION_COPY.markGoalDone}
      >
        <Text style={styles.actionText}>{REFLECTION_COPY.markGoalDone}</Text>
      </Pressable>
      <Pressable
        onPress={() => setDateOpen(true)}
        disabled={saving}
        style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={REFLECTION_COPY.changeDate}
      >
        <Text style={styles.actionText}>{REFLECTION_COPY.changeDate}</Text>
      </Pressable>
      <Pressable
        onPress={() => onOpenGoal(goal.id)}
        style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={REFLECTION_COPY.openGoal}
      >
        <Text style={styles.actionText}>{REFLECTION_COPY.openGoal}</Text>
      </Pressable>

      {dateOpen ? (
        <DatePickerModal
          title={REFLECTION_COPY.changeDate}
          value={goalEnd ? parseLocalDate(goalEnd) : null}
          onCancel={() => setDateOpen(false)}
          onConfirm={(date) => {
            setDateOpen(false);
            saveGoal(goal.id, { targetEndDate: toLocalDateString(date) });
          }}
        />
      ) : null}
      {timeOpen ? (
        <TimePickerModal
          title={REFLECTION_COPY.slipped}
          value={dateAtClock(goal.reminderTime ?? '19:00:00', 19, 0)}
          onCancel={() => setTimeOpen(false)}
          onConfirm={(date) => {
            setTimeOpen(false);
            saveGoal(goal.id, { reminderTime: clockFromDate(date) });
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  missing: {
    fontSize: 15,
    color: '#8e8e93',
  },
  suggestion: {
    gap: 8,
  },
  suggestionText: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    color: '#111',
  },
  note: {
    fontSize: 15,
    lineHeight: 20,
    color: '#6B6B70',
  },
  quote: {
    fontSize: 17,
    lineHeight: 24,
    fontStyle: 'italic',
    color: '#111',
    borderLeftWidth: 3,
    borderLeftColor: '#007aff',
    paddingLeft: 10,
  },
  editor: {
    gap: 8,
  },
  editorLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B6B70',
  },
  title: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    color: '#111',
  },
  why: {
    fontSize: 15,
    lineHeight: 20,
    color: '#6B6B70',
  },
  meta: {
    fontSize: 15,
    color: '#6B6B70',
  },
  step: {
    gap: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5ea',
  },
  stepTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepTitleHit: {
    flex: 1,
  },
  stepTitle: {
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
    color: '#111',
  },
  stepTitleInput: {
    padding: 0,
  },
  stepMeta: {
    fontSize: 13,
    lineHeight: 18,
    color: '#6B6B70',
  },
  lineInput: {
    fontSize: 17,
    lineHeight: 22,
    color: '#111',
    borderWidth: 1,
    borderColor: '#e5e5ea',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
  },
  textButtonLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#007aff',
  },
  textButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
  action: {
    minHeight: 44,
    justifyContent: 'center',
  },
  actionText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#007aff',
  },
  pressed: {
    opacity: 0.55,
  },
});
