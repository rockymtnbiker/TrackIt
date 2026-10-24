import { Ionicons } from '@expo/vector-icons';
import {
  Children,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { DatePickerModal } from './DatePickerModal';
import { TimePickerModal } from './TimePickerModal';
import {
  FormDateRow,
  FormFieldRow,
  FormInlineInput,
  FormSelectRow,
  formFieldStyles,
} from './FormFields';
import { PendingStatusCircle } from './PendingStatusCircle';
import { useSettings } from '../context/SettingsContext';
import { confirmDeleteGoal, descendantIds } from '../lib/goalDeleteConfirm';
import {
  DETAIL_LABELS,
  PERIOD_OPTIONS,
  WEEKDAY_INITIALS,
  WEEKDAY_NAMES,
  formatStatus,
  repeatPeriodChoice,
  targetAmountLabel,
} from '../lib/goalDetailText';
import { deleteGoal, setGoalStatus, updateGoal } from '../lib/goalTreeApi';
import { TimesStepper } from './TimesStepper';
import { buildChildrenMap, isDaily, storedTimesPerDay } from '../lib/goalTree';
import { weekdayOrder } from '../lib/week';
import { UNIT_OPTIONS } from '../constants';
import type { Goal, GoalStatus, RepeatPeriod } from '../types/goal';
import { nextGoalStatus } from '../types';
import { parseLocalDate, toLocalDateString, todayLocal } from '../lib/localDate';
import { formatTime } from '../utils/formatTime';
import { clockFromDate, dateAtClock, normalizeClock } from '../lib/clock';
import {
  DEFAULT_REMINDER,
  ensureNotificationPermission,
  NOTIFICATION_DENIED_MESSAGE,
} from '../lib/reminders';

const CUSTOM_UNIT = '__custom__';
const ALL_PLANNED_DAYS = [0, 1, 2, 3, 4, 5, 6];

const UNIT_CHOICES = [
  ...UNIT_OPTIONS.map((unit) => ({ value: unit, label: unit })),
  { value: CUSTOM_UNIT, label: 'Custom…' },
];

type Draft = {
  title: string;
  description: string;
  why: string;
  trackOn: boolean;
  unitChoice: string;
  customUnit: string;
  target: string;
  repeatOn: boolean;
  repeatPeriod: RepeatPeriod;
  plannedDays: number[];
  timesPerDay: number;
  repeatCount: number;
  status: GoalStatus;
  actualStartDate: string;
  actualEndDate: string;
  targetStartDate: string;
  targetEndDate: string;
  remindOn: boolean;
  reminderTime: string;
};

export type GoalEditFormHandle = {
  save: () => Promise<Goal>;
  isDirty: () => boolean;
};

type Props = {
  goal: Goal;
  nodes: Goal[];
  title: string;
  onDeleted: () => void;
};

function isPresetUnit(unit: string): boolean {
  return (UNIT_OPTIONS as readonly string[]).includes(unit);
}

function cappedToToday(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const today = todayLocal();
  return trimmed > today ? today : trimmed;
}

function parseAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const amount = Number(trimmed);
  return Number.isFinite(amount) ? amount : null;
}

function draftFromGoal(goal: Goal): Draft {
  const preset = goal.unit != null && isPresetUnit(goal.unit);
  return {
    title: goal.title,
    description: goal.description ?? '',
    why: goal.why ?? '',
    trackOn: goal.unit != null,
    unitChoice: goal.unit == null ? '' : preset ? goal.unit : CUSTOM_UNIT,
    customUnit: goal.unit != null && !preset ? goal.unit : '',
    target: goal.targetAmount != null ? String(goal.targetAmount) : '',
    repeatOn: goal.plannedDays != null,
    repeatPeriod: goal.repeatPeriod ?? 'week',
    plannedDays: goal.plannedDays ?? [],
    timesPerDay: storedTimesPerDay(goal.timesPerDay),
    repeatCount: initialRepeatCount(goal),
    status: goal.status,
    actualStartDate: goal.actualStartDate ?? '',
    actualEndDate: goal.actualEndDate ?? '',
    targetStartDate: goal.targetStartDate ?? '',
    targetEndDate: goal.targetEndDate ?? '',
    remindOn: goal.reminderTime != null,
    reminderTime: goal.reminderTime ?? DEFAULT_REMINDER,
  };
}

function snapshot(draft: Draft): string {
  return JSON.stringify({
    ...draft,
    title: draft.title.trim(),
    description: draft.description.trim(),
    why: draft.why.trim(),
    customUnit: draft.customUnit.trim(),
    target: draft.target.trim(),
    plannedDays: [...draft.plannedDays].sort((a, b) => a - b),
    actualStartDate: draft.actualStartDate.trim(),
    actualEndDate: draft.actualEndDate.trim(),
    targetStartDate: draft.targetStartDate.trim(),
    targetEndDate: draft.targetEndDate.trim(),
  });
}

function repeatMax(choice: 'daily' | 'week' | 'month'): number {
  if (choice === 'daily') {
    return 12;
  }
  if (choice === 'month') {
    return 60;
  }
  return 21;
}

function clampRepeat(choice: 'daily' | 'week' | 'month', value: number): number {
  const rounded = Math.round(value);
  if (!Number.isFinite(rounded) || rounded < 1) {
    return 1;
  }
  return Math.min(repeatMax(choice), rounded);
}

function initialRepeatCount(goal: Goal): number {
  if (goal.unit == null && isDaily(goal)) {
    return storedTimesPerDay(goal.timesPerDay);
  }
  if (goal.repeatPeriod === 'month') {
    if (goal.targetAmount != null && goal.targetAmount > 0) {
      return clampRepeat('month', goal.targetAmount);
    }
    return 1;
  }
  if (goal.targetAmount != null && goal.targetAmount > 0) {
    return clampRepeat('week', goal.targetAmount);
  }
  const planned = goal.plannedDays?.length ?? 0;
  return planned > 0 ? clampRepeat('week', planned) : 1;
}

function doseDailyFromDraft(draft: Draft): boolean {
  if (draft.trackOn || !draft.repeatOn) {
    return false;
  }
  return isDaily({
    repeatPeriod: draft.repeatPeriod,
    plannedDays: draft.plannedDays,
    unit: null,
    targetAmount: parseAmount(draft.target),
  });
}

function resolvedUnit(draft: Draft): string | null {
  if (!draft.trackOn) {
    return null;
  }
  if (draft.unitChoice === CUSTOM_UNIT) {
    return draft.customUnit.trim() || null;
  }
  return draft.unitChoice.trim() || null;
}

function DetailCard({
  title,
  guide,
  headerRight,
  children,
}: {
  title?: string;
  guide?: string;
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={styles.detailCard}>
      {title ? (
        <View style={styles.cardIntro}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardHeader}>{title}</Text>
            {headerRight}
          </View>
          {guide ? <Text style={styles.cardGuide}>{guide}</Text> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

function TimelineRows({ children }: { children: ReactNode }) {
  const rows = Children.toArray(children);
  return (
    <View>
      {rows.map((row, index) => (
        <View
          key={index}
          style={index < rows.length - 1 ? styles.hairlineRow : undefined}
        >
          {row}
        </View>
      ))}
    </View>
  );
}

function StatusCircle({
  status,
  onPress,
}: {
  status: GoalStatus;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.statusHit, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Status ${status}. Tap to change.`}
    >
      {status === 'pending' ? (
        <PendingStatusCircle size={22} color="#b0b0b5" />
      ) : (
        <Ionicons
          name={status === 'done' ? 'radio-button-on' : 'radio-button-off'}
          size={24}
          color={status === 'done' ? '#34c759' : '#c7c7cc'}
        />
      )}
    </Pressable>
  );
}

const GoalEditForm = forwardRef<GoalEditFormHandle, Props>(function GoalEditForm(
  { goal, nodes, title, onDeleted },
  ref,
) {
  const { settings } = useSettings();
  const baselineRef = useRef(draftFromGoal(goal));
  const [draft, setDraft] = useState<Draft>(baselineRef.current);
  const [whyOpen, setWhyOpen] = useState(false);
  const [donePrompt, setDonePrompt] = useState<{
    initialDate: string;
    minimumDate: string | null;
  } | null>(null);
  const [reminderPicker, setReminderPicker] = useState(false);
  const draftRef = useRef(draft);
  const goalRef = useRef(goal);
  const nodesRef = useRef(nodes);
  draftRef.current = draft;
  goalRef.current = goal;
  nodesRef.current = nodes;

  const patch = (next: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...next }));
  };

  useEffect(() => {
    draftRef.current = { ...draftRef.current, title };
    setDraft((current) => (current.title === title ? current : { ...current, title }));
  }, [title]);

  const saveDraft = async (current: Draft): Promise<Goal> => {
    const source = goalRef.current;
    const trimmedTitle = current.title.trim();
    if (!trimmedTitle) {
      throw new Error('Enter a title.');
    }

    const unit = resolvedUnit(current);
    const dailyYesNo = doseDailyFromDraft(current);
    const yesNo = current.repeatOn && !current.trackOn;
    const repeatChoice = current.repeatPeriod === 'month' ? 'month' : 'week';
    const repeatCount = clampRepeat(
      dailyYesNo ? 'daily' : repeatChoice,
      current.repeatCount,
    );
    const amount = !current.repeatOn && !current.trackOn
      ? null
      : current.trackOn
        ? parseAmount(current.target)
        : dailyYesNo
          ? null
          : repeatCount;
    const today = todayLocal();
    const payload = {
      title: trimmedTitle,
      description: current.description.trim() || null,
      why: source.parentId == null ? current.why.trim() || null : undefined,
      unit,
      targetAmount: amount,
      repeatPeriod: current.repeatOn ? current.repeatPeriod : null,
      plannedDays: current.repeatOn ? current.plannedDays : null,
      timesPerDay: yesNo && dailyYesNo ? repeatCount : 1,
      ...(current.actualStartDate.trim()
        ? {
            actualStartDate:
              current.actualStartDate.trim() > today
                ? today
                : current.actualStartDate.trim(),
          }
        : {}),
      targetStartDate: current.targetStartDate.trim() || null,
      targetEndDate: current.targetEndDate.trim() || null,
      actualEndDate: cappedToToday(current.actualEndDate),
      reminderTime:
        current.remindOn && (buildChildrenMap(nodes).get(source.id)?.length ?? 0) === 0
          ? normalizeClock(current.reminderTime) ?? DEFAULT_REMINDER
          : null,
    };

    const statusChanged = current.status !== source.status;
    const endChanged =
      (cappedToToday(current.actualEndDate) ?? null) !==
      (source.actualEndDate?.slice(0, 10) ?? null);
    if (statusChanged || (current.status === 'done' && endChanged)) {
      await setGoalStatus(
        source.id,
        current.status,
        current.status === 'done'
          ? (cappedToToday(current.actualEndDate) ?? today)
          : undefined,
      );
    }

    return updateGoal(source.id, payload);
  };

  useImperativeHandle(ref, () => ({
    isDirty: () => snapshot(draftRef.current) !== snapshot(baselineRef.current),
    save: () => saveDraft(draftRef.current),
  }));

  const hasChildren = (buildChildrenMap(nodes).get(goal.id)?.length ?? 0) > 0;
  const showReminder = !hasChildren;
  const setReminder = (on: boolean) => {
    void (async () => {
      if (!on) {
        patch({ remindOn: false });
        return;
      }
      const granted = await ensureNotificationPermission();
      if (!granted) {
        Alert.alert('Notifications', NOTIFICATION_DENIED_MESSAGE);
      }
      patch({
        remindOn: true,
        reminderTime: draft.reminderTime || DEFAULT_REMINDER,
      });
    })();
  };
  const reminderRows = showReminder ? (
    <>
      <FormFieldRow label="Remind me" labelWidth={118}>
        <Switch value={draft.remindOn} onValueChange={setReminder} />
      </FormFieldRow>
      {draft.remindOn ? (
        <FormFieldRow label="Time" labelWidth={118}>
          <Pressable
            onPress={() => setReminderPicker(true)}
            accessibilityRole="button"
            accessibilityLabel="Reminder time"
          >
            <Text style={styles.statusWord}>
              {formatTime(dateAtClock(draft.reminderTime, 8, 0))}
            </Text>
          </Pressable>
        </FormFieldRow>
      ) : null}
    </>
  ) : null;
  const displayUnit = resolvedUnit(draft);
  const today = todayLocal();
  const periodChoice =
    repeatPeriodChoice({
      repeatPeriod: draft.repeatOn ? draft.repeatPeriod : null,
      plannedDays: draft.repeatOn ? draft.plannedDays : null,
      unit: draft.trackOn ? displayUnit : null,
      targetAmount: parseAmount(draft.target),
    }) ?? 'week';

  const amountField = (label: string) => (
    <FormFieldRow label={label} labelWidth={150}>
      <FormInlineInput
        value={draft.target}
        onChangeText={(target) => patch({ target })}
        placeholder="Optional"
        keyboardType="numeric"
      />
    </FormFieldRow>
  );

  const cycleStatus = () => {
    const next = nextGoalStatus(draft.status);
    if (next === 'done') {
      setDonePrompt({
        initialDate: draft.actualEndDate.trim() || today,
        minimumDate: draft.actualStartDate.trim() || null,
      });
      return;
    }
    patch({ status: next, actualEndDate: '' });
  };

  const confirmDoneDate = (isoDate: string) => {
    setDonePrompt(null);
    const date = cappedToToday(isoDate) ?? today;
    patch({ status: 'done', actualEndDate: date });
  };

  const cancelDoneDate = () => {
    setDonePrompt(null);
  };

  const togglePlannedDay = (day: number) => {
    const next = draft.plannedDays.includes(day)
      ? draft.plannedDays.filter((entry) => entry !== day)
      : [...draft.plannedDays, day].sort((a, b) => a - b);
    const becomingDaily =
      !draft.trackOn &&
      draft.repeatPeriod !== 'month' &&
      ALL_PLANNED_DAYS.every((value) => next.includes(value));
    const leavingDaily = doseDailyFromDraft(draft) && !becomingDaily;
    const repeatCount = becomingDaily
      ? clampRepeat('daily', draft.repeatCount)
      : leavingDaily
        ? clampRepeat('week', draft.repeatCount)
        : draft.repeatCount;
    patch({
      plannedDays: next,
      repeatCount,
      timesPerDay: becomingDaily ? repeatCount : leavingDaily ? 1 : draft.timesPerDay,
      target: becomingDaily && !draft.trackOn ? '' : draft.target,
    });
  };

  return (
    <>
      <View style={styles.detailCards}>
        {goal.parentId == null ? (
          <View style={styles.whyCard}>
            <Text style={styles.whySectionLabel}>{DETAIL_LABELS.why}</Text>
            {whyOpen || draft.why.length > 0 ? (
              <TextInput
                autoFocus={whyOpen}
                value={draft.why}
                onChangeText={(why) => patch({ why })}
                placeholder="What will this change for you?"
                placeholderTextColor="#8e8e93"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                onBlur={() => {
                  if (!draft.why.trim()) {
                    setWhyOpen(false);
                  }
                }}
                style={formFieldStyles.formMultilineInput}
              />
            ) : (
              <Pressable
                onPress={() => setWhyOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Add your why"
                style={styles.whyAddHit}
              >
                <Text style={styles.whyAdd}>+ Add your why</Text>
              </Pressable>
            )}
          </View>
        ) : null}

        <DetailCard title={DETAIL_LABELS.timeline} guide="When does this happen?">
          <TimelineRows>
            <FormFieldRow label={DETAIL_LABELS.status}>
              <View style={styles.statusRow}>
                <StatusCircle status={draft.status} onPress={cycleStatus} />
                <Text style={styles.statusWord}>{formatStatus(draft.status)}</Text>
              </View>
            </FormFieldRow>
            <FormDateRow
              label={DETAIL_LABELS.started}
              labelWidth={118}
              value={draft.actualStartDate}
              maximumDate={parseLocalDate(
                draft.actualEndDate.trim() && draft.actualEndDate.trim() < today
                  ? draft.actualEndDate.trim()
                  : today,
              )}
              onChange={(actualStartDate) => patch({ actualStartDate })}
            />
            {draft.status === 'done' ? (
              <FormDateRow
                label={DETAIL_LABELS.actualEnd}
                labelWidth={118}
                value={draft.actualEndDate}
                minimumDate={
                  draft.actualStartDate.trim()
                    ? parseLocalDate(draft.actualStartDate.trim())
                    : undefined
                }
                maximumDate={parseLocalDate(today)}
                onChange={(actualEndDate) => patch({ actualEndDate })}
              />
            ) : (
              <FormFieldRow label={DETAIL_LABELS.actualEnd} labelWidth={118}>
                <View>
                  <Text style={styles.lockedDate}>—</Text>
                  <Text style={styles.lockedDateCaption}>Set when marked done</Text>
                </View>
              </FormFieldRow>
            )}
            <FormDateRow
              label={DETAIL_LABELS.targetStart}
              labelWidth={118}
              value={draft.targetStartDate}
              onChange={(targetStartDate) => patch({ targetStartDate })}
            />
            <FormDateRow
              label={DETAIL_LABELS.targetEnd}
              labelWidth={118}
              value={draft.targetEndDate}
              onChange={(targetEndDate) => patch({ targetEndDate })}
            />
            {!draft.repeatOn ? reminderRows : null}
          </TimelineRows>
        </DetailCard>

        <DetailCard
          title={DETAIL_LABELS.track}
          guide="Want to measure progress? Count minutes, miles, pages and more toward a target."
          headerRight={
            <Switch
              value={draft.trackOn}
              onValueChange={(on) => {
                patch({
                  trackOn: on,
                  target: !on && !draft.repeatOn ? '' : draft.target,
                });
              }}
            />
          }
        >
          {draft.trackOn ? (
            <View style={styles.fields}>
              <FormSelectRow
                label={DETAIL_LABELS.unit}
                value={draft.unitChoice}
                placeholder="Choose"
                options={UNIT_CHOICES}
                onChange={(unitChoice) => patch({ unitChoice })}
              />
              {draft.unitChoice === CUSTOM_UNIT ? (
                <FormFieldRow label={DETAIL_LABELS.customUnit}>
                  <FormInlineInput
                    value={draft.customUnit}
                    onChangeText={(customUnit) => patch({ customUnit })}
                    placeholder="e.g. laps"
                  />
                </FormFieldRow>
              ) : null}
              {amountField(
                targetAmountLabel(true, draft.repeatOn, draft.repeatPeriod),
              )}
            </View>
          ) : null}
        </DetailCard>

        <DetailCard
          title={DETAIL_LABELS.repeat}
          guide="Is this something you do regularly? Like 3 times a week, or every day."
          headerRight={
            <Switch
              value={draft.repeatOn}
              disabled={hasChildren}
              onValueChange={(on) => {
                if (hasChildren) {
                  return;
                }
                patch({
                  repeatOn: on,
                  repeatPeriod: on ? draft.repeatPeriod ?? 'week' : draft.repeatPeriod,
                  plannedDays: on ? draft.plannedDays : draft.plannedDays,
                  target: !on && !draft.trackOn ? '' : draft.target,
                });
              }}
            />
          }
        >
          {hasChildren ? (
            <Text style={styles.hint}>Steps with sub-steps can't repeat.</Text>
          ) : null}
          {draft.repeatOn ? (
            <View style={styles.fields}>
              <FormSelectRow
                label={DETAIL_LABELS.period}
                value={periodChoice}
                placeholder="Weekly"
                options={[...PERIOD_OPTIONS]}
                onChange={(value) => {
                  if (value === 'month') {
                    patch({
                      repeatPeriod: 'month',
                      repeatCount: clampRepeat('month', draft.repeatCount),
                      timesPerDay: 1,
                    });
                    return;
                  }
                  if (value === 'daily') {
                    const repeatCount = clampRepeat('daily', draft.repeatCount);
                    patch({
                      repeatPeriod: 'week',
                      plannedDays: [...ALL_PLANNED_DAYS],
                      target: draft.trackOn ? draft.target : '',
                      repeatCount,
                      timesPerDay: draft.trackOn ? draft.timesPerDay : repeatCount,
                    });
                    return;
                  }
                  const stillDaily =
                    !draft.trackOn &&
                    isDaily({
                      repeatPeriod: 'week',
                      plannedDays: draft.plannedDays,
                      unit: null,
                      targetAmount: null,
                    });
                  if (stillDaily) {
                    return;
                  }
                  patch({
                    repeatPeriod: 'week',
                    repeatCount: clampRepeat('week', draft.repeatCount),
                    timesPerDay: 1,
                  });
                }}
              />
              <View style={styles.formStackedBlock}>
                <Text style={formFieldStyles.formFieldLabel}>{DETAIL_LABELS.days}</Text>
                <View style={formFieldStyles.dayPicker}>
                  {weekdayOrder(settings.weekStart).map((day) => {
                    const label = WEEKDAY_INITIALS[day];
                    const selected = draft.plannedDays.includes(day);
                    return (
                      <Pressable
                        key={WEEKDAY_NAMES[day]}
                        onPress={() => togglePlannedDay(day)}
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
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              {!draft.trackOn ? (
                <TimesStepper
                  label={
                    periodChoice === 'daily'
                      ? 'Times per day'
                      : periodChoice === 'month'
                        ? 'Times per month'
                        : 'Times per week'
                  }
                  value={draft.repeatCount}
                  min={1}
                  max={
                    periodChoice === 'daily' ? 12 : periodChoice === 'month' ? 60 : 21
                  }
                  onChange={(repeatCount) =>
                    patch({
                      repeatCount,
                      timesPerDay: periodChoice === 'daily' ? repeatCount : draft.timesPerDay,
                    })
                  }
                  hint={
                    periodChoice === 'daily'
                      ? 'e.g. 3 for morning, noon and night'
                      : undefined
                  }
                />
              ) : null}
            </View>
          ) : null}
          {draft.repeatOn ? reminderRows : null}
        </DetailCard>

        <DetailCard title={DETAIL_LABELS.notes}>
          <TextInput
            value={draft.description}
            onChangeText={(description) => patch({ description })}
            placeholder="Optional"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            style={formFieldStyles.formMultilineInput}
          />
        </DetailCard>
      </View>

      <Pressable
        onPress={() =>
          confirmDeleteGoal(descendantIds(goal.id, nodesRef.current).length, () => {
            void deleteGoal(goal.id)
              .then(() => onDeleted())
              .catch((error) => {
                console.warn('Failed to delete goal', error);
                Alert.alert(
                  'Delete failed',
                  error instanceof Error ? error.message : 'Could not delete this step.',
                );
              });
          })
        }
        style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={goal.parentId == null ? 'Delete goal' : 'Delete step'}
      >
        <Text style={styles.deleteButtonText}>
          {goal.parentId == null ? 'Delete goal' : 'Delete step'}
        </Text>
      </Pressable>

      {reminderPicker ? (
        <TimePickerModal
          title="Remind me"
          value={dateAtClock(draft.reminderTime, 8, 0)}
          onCancel={() => setReminderPicker(false)}
          onConfirm={(date) => {
            setReminderPicker(false);
            patch({ reminderTime: clockFromDate(date), remindOn: true });
          }}
        />
      ) : null}
      {donePrompt ? (
        <DatePickerModal
          title={DETAIL_LABELS.actualEnd}
          value={parseLocalDate(donePrompt.initialDate)}
          minimumDate={
            donePrompt.minimumDate ? parseLocalDate(donePrompt.minimumDate) : undefined
          }
          maximumDate={parseLocalDate(today)}
          onCancel={cancelDoneDate}
          onConfirm={(date) => confirmDoneDate(toLocalDateString(date))}
        />
      ) : null}
    </>
  );
});

export default GoalEditForm;

const styles = StyleSheet.create({
  detailCards: {
    gap: 12,
  },
  detailCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  cardIntro: {
    gap: 4,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardHeader: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: '#6B6B70',
  },
  cardGuide: {
    fontSize: 14,
    color: '#6B6B70',
  },
  whyCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  whySectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B6B70',
    textTransform: 'uppercase',
  },
  whyAddHit: {
    minHeight: 44,
    justifyContent: 'center',
  },
  whyAdd: {
    fontSize: 15,
    fontWeight: '600',
    color: '#007aff',
  },
  fields: {
    gap: 6,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusHit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusWord: {
    fontSize: 15,
    color: '#111',
  },
  lockedDate: {
    fontSize: 15,
    color: '#C7C7CC',
    paddingVertical: 10,
  },
  lockedDateCaption: {
    fontSize: 12,
    color: '#C7C7CC',
    marginTop: -6,
  },
  hint: {
    fontSize: 13,
    color: '#8e8e93',
    marginTop: -2,
  },
  formStackedBlock: {
    gap: 6,
  },
  hairlineRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  deleteButton: {
    backgroundColor: '#fff',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    minHeight: 44,
  },
  deleteButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#c62828',
  },
  pressed: {
    opacity: 0.55,
  },
});
