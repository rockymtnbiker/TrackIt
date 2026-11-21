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
  type ViewInstance,
} from 'react-native';
import { DatePickerModal } from './DatePickerModal';
import { TimePickerModal } from './TimePickerModal';
import {
  FormDateRow,
  FormFieldRow,
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
import { connectCandidates } from '../lib/groupGoalShape';
import { deleteGoal, setGoalStatus, updateGoal, type GoalUpdates } from '../lib/goalTreeApi';
import { groupErrorMessage, type GroupGoalInput } from '../lib/groupsApi';
import { REFLECT_POINT } from '../lib/reflectPoint';
import { GroupGoalTag } from './GroupGoalTag';
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
  /** Save anything still uncommitted. Used when leaving the page or backgrounding the app. */
  persist: () => void;
  /** Open a text field the reflection pointed at. */
  focusField: (id: string) => void;
  /** The Reminder block, so a caller can scroll it into view. */
  reminderHost: () => ViewInstance | null;
};

type Props = {
  goal: Goal;
  nodes: Goal[];
  onSaved: (goal: Goal) => void;
  onDeleted: () => void;
  onReminderLayout?: () => void;
  metrics?: ReactNode;
  steps?: ReactNode;
  beforeDelete?: ReactNode;
  anchor?: (id: string, child: ReactNode) => ReactNode;
  groupCopy?: {
    groupName: string;
    link: 'copy' | 'connected';
    admin: boolean;
    onSaveForEveryone: (input: GroupGoalInput) => Promise<void>;
    onDisconnect: () => Promise<void>;
    onChanged?: () => void;
    onConnect?: () => void;
  } | null;
};

const NO_CONNECT_MATCH =
  'None of your goals match this one yet. To connect, your goal needs the same unit and the same repeat (for example, both pages, Daily).';

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

function dateOnly(value: string): string {
  return value.trim().slice(0, 10);
}

/** Started cannot be after today, or after Actual end when that date is set. */
function startedMaximum(actualEnd: string, today: string): string {
  const end = dateOnly(actualEnd);
  if (end && end < today) {
    return end;
  }
  return today;
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
  dimmed,
  children,
}: {
  title?: string;
  guide?: string;
  headerRight?: ReactNode;
  dimmed?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={styles.detailCard}>
      {title ? (
        <View
          pointerEvents={dimmed ? 'none' : 'auto'}
          style={[styles.cardIntro, dimmed && styles.reminderLocked]}
        >
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

function CueField({
  value,
  onChangeText,
  onFocus,
  onBlur,
  placeholder,
  multiline,
  keyboardType,
  forceOpen,
  textStyle,
  accessibilityLabel,
  display,
}: {
  value: string;
  onChangeText: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  placeholder: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric';
  forceOpen?: boolean;
  textStyle?: object;
  accessibilityLabel?: string;
  display?: (value: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const shown = open || forceOpen === true;
  if (!shown) {
    const text = value.trim();
    return (
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <Text style={[styles.cueText, textStyle, styles.cue, !text && styles.cueEmpty]}>
          {text ? (display ? display(text) : text) : placeholder}
        </Text>
      </Pressable>
    );
  }
  return (
    <TextInput
      autoFocus
      value={value}
      onChangeText={onChangeText}
      onFocus={onFocus}
      placeholder={placeholder}
      placeholderTextColor="#c7c7cc"
      multiline={multiline}
      keyboardType={keyboardType}
      textAlignVertical={multiline ? 'top' : 'center'}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.cueText,
        textStyle,
        styles.cue,
        styles.cueEditing,
        multiline && styles.cueMultiline,
      ]}
      onBlur={() => {
        setOpen(false);
        onBlur();
      }}
    />
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

type FocusedField = 'title' | 'why' | 'description' | 'customUnit' | 'target';

function sameDays(a: number[] | null, b: number[] | null): boolean {
  if (a == null || b == null) {
    return a == null && b == null;
  }
  if (a.length !== b.length) {
    return false;
  }
  const left = [...a].sort((x, y) => x - y);
  const right = [...b].sort((x, y) => x - y);
  return left.every((value, index) => value === right[index]);
}

const GoalEditForm = forwardRef<GoalEditFormHandle, Props>(function GoalEditForm(
  { goal, nodes, onSaved, onDeleted, onReminderLayout, metrics, steps, beforeDelete, anchor, groupCopy },
  ref,
) {
  const { settings } = useSettings();
  const initial = draftFromGoal(goal);
  const [draft, setDraft] = useState<Draft>(initial);
  const [whyOpen, setWhyOpen] = useState(false);
  const [titleOpen, setTitleOpen] = useState(false);
  const [amountOpen, setAmountOpen] = useState(false);
  const [donePrompt, setDonePrompt] = useState<{
    initialDate: string;
    minimumDate: string | null;
  } | null>(null);
  const [reminderPicker, setReminderPicker] = useState(false);
  const draftRef = useRef(draft);
  const goalRef = useRef(goal);
  const nodesRef = useRef(nodes);
  const seenGoal = useRef(goal.id);
  const reminderRef = useRef<ViewInstance>(null);
  const focused = useRef(new Set<FocusedField>());
  const tail = useRef(Promise.resolve());
  draftRef.current = draft;
  goalRef.current = goal;
  nodesRef.current = nodes;

  const patch = (next: Partial<Draft>) => {
    const merged = { ...draftRef.current, ...next };
    draftRef.current = merged;
    setDraft(merged);
  };

  useEffect(() => {
    if (goal.id !== seenGoal.current) {
      seenGoal.current = goal.id;
      const next = draftFromGoal(goal);
      draftRef.current = next;
      setDraft(next);
      setTitleOpen(false);
      setWhyOpen(false);
      setAmountOpen(false);
      return;
    }
    setDraft((current) => {
      const next = draftFromGoal(goal);
      if (focused.current.has('title')) {
        next.title = current.title;
      }
      if (focused.current.has('why')) {
        next.why = current.why;
      }
      if (focused.current.has('description')) {
        next.description = current.description;
      }
      if (focused.current.has('customUnit')) {
        next.customUnit = current.customUnit;
      }
      if (focused.current.has('target')) {
        next.target = current.target;
      }
      draftRef.current = next;
      return next;
    });
  }, [goal]);

  const desired = (current: Draft, source: Goal) => {
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
    return {
      title: current.title.trim(),
      description: current.description.trim() || null,
      why: source.parentId == null ? current.why.trim() || null : undefined,
      unit,
      targetAmount: amount,
      repeatPeriod: (current.repeatOn ? current.repeatPeriod : null) as RepeatPeriod | null,
      plannedDays: current.repeatOn ? current.plannedDays : null,
      timesPerDay: yesNo && dailyYesNo ? repeatCount : 1,
      actualStartDate: current.actualStartDate.trim()
        ? current.actualStartDate.trim() > today
          ? today
          : current.actualStartDate.trim()
        : undefined,
      targetStartDate: current.targetStartDate.trim() || null,
      targetEndDate: current.targetEndDate.trim() || null,
      actualEndDate: cappedToToday(current.actualEndDate),
      reminderTime: current.remindOn
        ? normalizeClock(current.reminderTime) ?? DEFAULT_REMINDER
        : null,
      status: current.status,
    };
  };

  const changedFields = (current: Draft, source: Goal): GoalUpdates => {
    const next = desired(current, source);
    const updates: GoalUpdates = {};
    if (!next.title) {
      return updates;
    }
    if (next.title !== source.title) {
      updates.title = next.title;
    }
    if ((next.description ?? null) !== (source.description ?? null)) {
      updates.description = next.description;
    }
    if (next.why !== undefined && (next.why ?? null) !== (source.why ?? null)) {
      updates.why = next.why;
    }
    if ((next.unit ?? null) !== (source.unit ?? null)) {
      updates.unit = next.unit;
    }
    if ((next.targetAmount ?? null) !== (source.targetAmount ?? null)) {
      updates.targetAmount = next.targetAmount;
    }
    if ((next.repeatPeriod ?? null) !== (source.repeatPeriod ?? null)) {
      updates.repeatPeriod = next.repeatPeriod;
    }
    if (!sameDays(next.plannedDays, source.plannedDays)) {
      updates.plannedDays = next.plannedDays;
    }
    if (next.timesPerDay !== (source.timesPerDay ?? 1)) {
      updates.timesPerDay = next.timesPerDay;
    }
    if (
      next.actualStartDate !== undefined &&
      next.actualStartDate !== (source.actualStartDate?.slice(0, 10) ?? '')
    ) {
      updates.actualStartDate = next.actualStartDate;
    }
    if ((next.targetStartDate ?? null) !== (source.targetStartDate?.slice(0, 10) ?? null)) {
      updates.targetStartDate = next.targetStartDate;
    }
    if ((next.targetEndDate ?? null) !== (source.targetEndDate?.slice(0, 10) ?? null)) {
      updates.targetEndDate = next.targetEndDate;
    }
    if ((next.actualEndDate ?? null) !== (source.actualEndDate?.slice(0, 10) ?? null)) {
      updates.actualEndDate = next.actualEndDate;
    }
    if ((next.reminderTime ?? null) !== (source.reminderTime ?? null)) {
      updates.reminderTime = next.reminderTime;
    }
    return updates;
  };

  const hideFocused = (updates: GoalUpdates, current: Draft): GoalUpdates => {
    const next = { ...updates };
    if (focused.current.has('title')) {
      delete next.title;
    }
    if (focused.current.has('why')) {
      delete next.why;
    }
    if (focused.current.has('description')) {
      delete next.description;
    }
    if (focused.current.has('customUnit') && current.unitChoice === CUSTOM_UNIT) {
      delete next.unit;
    }
    if (focused.current.has('target')) {
      delete next.targetAmount;
    }
    return next;
  };

  const saveScope = (scope: 'all' | 'unfocused') => {
    const run = tail.current.then(async () => {
      const source = goalRef.current;
      const current = draftRef.current;
      if (!current.title.trim()) {
        return;
      }
      const next = desired(current, source);
      let updates = changedFields(current, source);
      if (scope === 'unfocused') {
        updates = hideFocused(updates, current);
      }
      const disconnecting =
        groupCopy?.link === 'connected' &&
        (updates.unit !== undefined ||
          updates.targetAmount !== undefined ||
          updates.repeatPeriod !== undefined ||
          updates.plannedDays !== undefined ||
          updates.timesPerDay !== undefined ||
          updates.targetEndDate !== undefined);
      if (disconnecting && groupCopy) {
        const goalTitle = source.title.trim() || 'Untitled';
        const accepted = await new Promise<boolean>((resolve) => {
          Alert.alert(
            `This will disconnect ${goalTitle} from ${groupCopy.groupName}. Your goal and its history stay yours.`,
            undefined,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Disconnect and save', onPress: () => resolve(true) },
            ],
            { cancelable: false },
          );
        });
        if (!accepted) {
          const reset = draftFromGoal(source);
          draftRef.current = reset;
          setDraft(reset);
          return;
        }
        await groupCopy.onDisconnect();
      }
      if (groupCopy?.link === 'copy') {
        delete updates.title;
        delete updates.why;
        delete updates.unit;
        delete updates.targetAmount;
        delete updates.repeatPeriod;
        delete updates.plannedDays;
        delete updates.timesPerDay;
        delete updates.targetEndDate;
      }
      const statusChanged = next.status !== source.status;
      const endChanged =
        next.status === 'done' &&
        (next.actualEndDate ?? null) !== (source.actualEndDate?.slice(0, 10) ?? null);
      let latest = source;
      if (statusChanged || endChanged) {
        latest = await setGoalStatus(
          source.id,
          next.status,
          next.status === 'done' ? (next.actualEndDate ?? todayLocal()) : undefined,
        );
      }
      const saved = Object.keys(updates).length > 0 ? await updateGoal(source.id, updates) : latest;
      if (saved !== source) {
        goalRef.current = saved;
        onSaved(saved);
      }
    });
    tail.current = run.catch((error) => {
      Alert.alert(
        'Save failed',
        error instanceof Error ? error.message : 'Could not save.',
      );
    });
  };

  const commitNow = (next?: Partial<Draft>) => {
    if (next) {
      patch(next);
    }
    saveScope('unfocused');
  };

  const watch = (field: FocusedField) => ({
    onFocus: () => {
      focused.current.add(field);
    },
    onBlur: () => {
      focused.current.delete(field);
      saveScope('unfocused');
    },
  });

  useImperativeHandle(ref, () => ({
    persist: () => {
      saveScope('all');
    },
    focusField: (id: string) => {
      if (id === REFLECT_POINT.pencil) {
        setTitleOpen(true);
      }
      if (id === REFLECT_POINT.target) {
        setAmountOpen(true);
      }
    },
    reminderHost: () => reminderRef.current,
  }));

  const hasChildren = (buildChildrenMap(nodes).get(goal.id)?.length ?? 0) > 0;
  const reminderLocked = settings.reminderMode !== 'per_goal';
  const setReminder = (on: boolean) => {
    if (reminderLocked) {
      return;
    }
    void (async () => {
      if (!on) {
        commitNow({ remindOn: false });
        return;
      }
      const granted = await ensureNotificationPermission();
      if (!granted) {
        Alert.alert('Notifications', NOTIFICATION_DENIED_MESSAGE);
      }
      commitNow({
        remindOn: true,
        reminderTime: draftRef.current.reminderTime || DEFAULT_REMINDER,
      });
    })();
  };
  const displayUnit = resolvedUnit(draft);
  const today = todayLocal();
  const periodChoice =
    repeatPeriodChoice({
      repeatPeriod: draft.repeatOn ? draft.repeatPeriod : null,
      plannedDays: draft.repeatOn ? draft.plannedDays : null,
      unit: draft.trackOn ? displayUnit : null,
      targetAmount: parseAmount(draft.target),
    }) ?? 'week';

  const amountField = (label: string) =>
    anchor ? (
      anchor(
        REFLECT_POINT.target,
        <FormFieldRow label={label} labelWidth={150}>
          <CueField
            value={draft.target}
            placeholder="Optional"
            keyboardType="numeric"
            forceOpen={amountOpen}
            onChangeText={(target) => patch({ target })}
            onFocus={() => {
              focused.current.add('target');
            }}
            onBlur={() => {
              focused.current.delete('target');
              setAmountOpen(false);
              saveScope('unfocused');
            }}
          />
        </FormFieldRow>,
      )
    ) : (
      <FormFieldRow label={label} labelWidth={150}>
        <CueField
          value={draft.target}
          placeholder="Optional"
          keyboardType="numeric"
          forceOpen={amountOpen}
          onChangeText={(target) => patch({ target })}
          onFocus={() => {
            focused.current.add('target');
          }}
          onBlur={() => {
            focused.current.delete('target');
            setAmountOpen(false);
            saveScope('unfocused');
          }}
        />
      </FormFieldRow>
    );

  const cycleStatus = () => {
    const next = nextGoalStatus(draft.status);
    if (next === 'done') {
      setDonePrompt({
        initialDate: draft.actualEndDate.trim() || today,
        minimumDate: draft.actualStartDate.trim().slice(0, 10) || null,
      });
      return;
    }
    commitNow({ status: next, actualEndDate: '' });
  };

  const confirmDoneDate = (isoDate: string) => {
    const start = dateOnly(draft.actualStartDate);
    const date = cappedToToday(isoDate) ?? today;
    if (start && date < start) {
      Alert.alert("The end date can't be before Started.");
      return;
    }
    setDonePrompt(null);
    commitNow({ status: 'done', actualEndDate: date });
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
    commitNow({
      plannedDays: next,
      repeatCount,
      timesPerDay: becomingDaily ? repeatCount : leavingDaily ? 1 : draft.timesPerDay,
      target: becomingDaily && !draft.trackOn ? '' : draft.target,
    });
  };

  const groupLocked = groupCopy?.link === 'copy' && !groupCopy.admin;
  const groupDirty =
    groupCopy?.link === 'copy' &&
    Boolean(groupCopy.admin) &&
    (changedFields(draft, goal).title !== undefined ||
      changedFields(draft, goal).why !== undefined ||
      changedFields(draft, goal).unit !== undefined ||
      changedFields(draft, goal).targetAmount !== undefined ||
      changedFields(draft, goal).repeatPeriod !== undefined ||
      changedFields(draft, goal).plannedDays !== undefined ||
      changedFields(draft, goal).timesPerDay !== undefined ||
      changedFields(draft, goal).targetEndDate !== undefined);
  const saveForEveryone = () => {
    if (!groupCopy?.admin) {
      return;
    }
    const next = desired(draftRef.current, goalRef.current);
    if (!next.title) {
      Alert.alert('Enter a title.');
      return;
    }
    const input: GroupGoalInput = {
      title: next.title,
      why: next.why ?? null,
      unit: next.unit,
      targetAmount: next.targetAmount,
      repeatPeriod: next.repeatPeriod,
      plannedDays: next.plannedDays,
      timesPerDay: next.timesPerDay,
      targetEndDate: next.targetEndDate,
    };
    Alert.alert(`This changes it for everyone in ${groupCopy.groupName}.`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Save for everyone',
        onPress: () => {
          void groupCopy.onSaveForEveryone(input).catch((error) => {
            Alert.alert(
              'Save failed',
              error instanceof Error ? error.message : 'Could not save.',
            );
          });
        },
      },
    ]);
  };

  const mark = (id: string, child: ReactNode) => (anchor ? anchor(id, child) : child);
  const connectMatches = groupCopy?.link === 'copy' ? connectCandidates(goal, nodes) : [];

  const askDisconnect = () => {
    const goalTitle = goal.title.trim() || 'Untitled';
    const message = `${goalTitle} will go back to being just your goal. Your history stays, and it stops counting toward ${groupCopy?.groupName ?? ''}.`;
    return new Promise<boolean>((resolve) => {
      Alert.alert(
        message,
        undefined,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Disconnect', onPress: () => resolve(true) },
        ],
        { cancelable: false },
      );
    });
  };

  const disconnectFromGroup = async () => {
    if (!groupCopy) {
      return false;
    }
    const accepted = await askDisconnect();
    if (!accepted) {
      return false;
    }
    try {
      await groupCopy.onDisconnect();
      groupCopy.onChanged?.();
      return true;
    } catch (error) {
      Alert.alert(
        'Could not disconnect',
        groupErrorMessage(error, 'The goal was not disconnected.'),
      );
      return false;
    }
  };

  const deleteThisGoal = () => {
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
    });
  };

  return (
    <>
      <View style={styles.page}>
        {groupLocked ? (
          <Text style={styles.titleText}>{goal.title || 'Untitled'}</Text>
        ) : (
          mark(
            REFLECT_POINT.pencil,
            <CueField
              value={draft.title}
              placeholder="Untitled"
              multiline
              forceOpen={titleOpen}
              textStyle={styles.titleText}
              accessibilityLabel="Title"
              onChangeText={(title) => patch({ title })}
              onFocus={() => {
                focused.current.add('title');
              }}
              onBlur={() => {
                focused.current.delete('title');
                setTitleOpen(false);
                saveScope('unfocused');
              }}
            />,
          )
        )}
        {groupCopy?.groupName ? <GroupGoalTag name={groupCopy.groupName} /> : null}
        {groupLocked && groupCopy?.groupName ? (
          <Text style={styles.groupLock}>{`Set by ${groupCopy.groupName}. Only admins can change it.`}</Text>
        ) : null}
        {groupCopy?.link === 'copy' && groupCopy.onConnect ? (
          <>
            <Pressable
              onPress={() => {
                if (connectMatches.length === 0) {
                  Alert.alert(NO_CONNECT_MATCH);
                  return;
                }
                groupCopy.onConnect?.();
              }}
              style={({ pressed }) => [styles.groupAction, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Connect to one of my goals"
            >
              <Text style={styles.groupActionText}>Connect to one of my goals</Text>
            </Pressable>
            {connectMatches.length === 0 ? (
              <Text style={styles.groupMatch}>{NO_CONNECT_MATCH}</Text>
            ) : null}
          </>
        ) : null}
        {groupCopy?.link === 'connected' && groupCopy.groupName ? (
          <Pressable
            onPress={() => {
              void disconnectFromGroup();
            }}
            style={({ pressed }) => [styles.groupAction, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Disconnect from ${groupCopy.groupName}`}
          >
            <Text style={styles.groupActionText}>{`Disconnect from ${groupCopy.groupName}`}</Text>
          </Pressable>
        ) : null}
        {goal.parentId == null && !groupLocked ? (
          <View style={styles.whyBlock}>
            {whyOpen || draft.why.trim().length > 0 ? (
              <>
                <Text style={styles.whySectionLabel}>{DETAIL_LABELS.why}</Text>
                <CueField
                  value={draft.why}
                  placeholder="What will this change for you?"
                  multiline
                  forceOpen={whyOpen}
                  textStyle={styles.whyQuote}
                  display={(text) => `“${text}”`}
                  accessibilityLabel={DETAIL_LABELS.why}
                  onChangeText={(why) => patch({ why })}
                  onFocus={() => {
                    focused.current.add('why');
                  }}
                  onBlur={() => {
                    focused.current.delete('why');
                    if (!draftRef.current.why.trim()) {
                      setWhyOpen(false);
                    }
                    saveScope('unfocused');
                  }}
                />
              </>
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
        {metrics}
      <View style={styles.detailCards}>
        <DetailCard title={DETAIL_LABELS.timeline} guide="When does this happen?">
          <TimelineRows>
            <FormFieldRow label={DETAIL_LABELS.status}>
              {mark(
                REFLECT_POINT.status,
                <View style={styles.statusRow}>
                  <StatusCircle status={draft.status} onPress={cycleStatus} />
                  <Text style={styles.statusWord}>{formatStatus(draft.status)}</Text>
                </View>,
              )}
            </FormFieldRow>
            <FormDateRow
              label={DETAIL_LABELS.started}
              labelWidth={118}
              value={draft.actualStartDate}
              maximumDate={parseLocalDate(startedMaximum(draft.actualEndDate, today))}
              onChange={(actualStartDate) => {
                const end = dateOnly(draft.actualEndDate);
                if (end && dateOnly(actualStartDate) > end) {
                  Alert.alert("Started can't be after the end date.");
                  return;
                }
                commitNow({ actualStartDate });
              }}
            />
            {draft.status === 'done' ? (
              <FormDateRow
                label={DETAIL_LABELS.actualEnd}
                labelWidth={118}
                value={draft.actualEndDate}
                minimumDate={
                  dateOnly(draft.actualStartDate) &&
                  dateOnly(draft.actualStartDate) <= today
                    ? parseLocalDate(dateOnly(draft.actualStartDate))
                    : undefined
                }
                maximumDate={parseLocalDate(today)}
                onChange={(actualEndDate) => {
                  const start = dateOnly(draft.actualStartDate);
                  if (start && dateOnly(actualEndDate) < start) {
                    Alert.alert("The end date can't be before Started.");
                    return;
                  }
                  commitNow({ actualEndDate });
                }}
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
              onChange={(targetStartDate) => commitNow({ targetStartDate })}
            />
            {groupLocked
              ? null
              : mark(
                  REFLECT_POINT.targetEnd,
                  <FormDateRow
                    label={DETAIL_LABELS.targetEnd}
                    labelWidth={118}
                    value={draft.targetEndDate}
                    onChange={(targetEndDate) => commitNow({ targetEndDate })}
                  />,
                )}
          </TimelineRows>
        </DetailCard>

        {groupLocked ? null : (
        <>
        <DetailCard
          title={DETAIL_LABELS.track}
          guide="Want to measure progress? Count minutes, miles, pages and more toward a target."
          headerRight={
            <Switch
              value={draft.trackOn}
              onValueChange={(on) => {
                commitNow({
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
                onChange={(unitChoice) => commitNow({ unitChoice })}
              />
              {draft.unitChoice === CUSTOM_UNIT ? (
                <FormFieldRow label={DETAIL_LABELS.customUnit}>
                  <CueField
                    value={draft.customUnit}
                    placeholder="e.g. laps"
                    onChangeText={(customUnit) => patch({ customUnit })}
                    {...watch('customUnit')}
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
                commitNow({
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
                    commitNow({
                      repeatPeriod: 'month',
                      repeatCount: clampRepeat('month', draft.repeatCount),
                      timesPerDay: 1,
                    });
                    return;
                  }
                  if (value === 'daily') {
                    const repeatCount = clampRepeat('daily', draft.repeatCount);
                    commitNow({
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
                  commitNow({
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
                mark(
                  REFLECT_POINT.target,
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
                    commitNow({
                      repeatCount,
                      timesPerDay: periodChoice === 'daily' ? repeatCount : draft.timesPerDay,
                    })
                  }
                  hint={
                    periodChoice === 'daily'
                      ? 'e.g. 3 for morning, noon and night'
                      : undefined
                  }
                />,
                )
              ) : null}
            </View>
          ) : null}
        </DetailCard>
        </>
        )}
      </View>
      {groupCopy?.admin && groupDirty ? (
        <Pressable
          onPress={saveForEveryone}
          style={({ pressed }) => [styles.groupSave, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Save"
        >
          <Text style={styles.groupSaveText}>Save</Text>
        </Pressable>
      ) : null}
      {steps}
      <View style={styles.detailCards}>
        <DetailCard title={DETAIL_LABELS.notes}>
          <CueField
            value={draft.description}
            placeholder="Optional"
            multiline
            onChangeText={(description) => patch({ description })}
            {...watch('description')}
          />
        </DetailCard>

        <View ref={reminderRef} onLayout={() => onReminderLayout?.()}>
        <DetailCard
          title="Reminder"
          dimmed={reminderLocked}
          headerRight={
            <View style={styles.reminderControls}>
              {draft.remindOn ? (
                <Pressable
                  onPress={() => setReminderPicker(true)}
                  disabled={reminderLocked}
                  accessibilityRole="button"
                  accessibilityLabel="Reminder time"
                  accessibilityState={{ disabled: reminderLocked }}
                >
                  <Text style={styles.statusWord}>
                    {formatTime(dateAtClock(draft.reminderTime, 9, 0))}
                  </Text>
                </Pressable>
              ) : null}
              <Switch
                value={draft.remindOn}
                onValueChange={setReminder}
                disabled={reminderLocked}
                accessibilityLabel="Reminder"
              />
            </View>
          }
        >
          {reminderLocked ? (
            <Text style={styles.hint}>You're on one daily check-in. Change in Settings.</Text>
          ) : null}
        </DetailCard>
        </View>
      </View>
      {beforeDelete}

      <Pressable
        onPress={() => {
          if (groupCopy?.link === 'copy') {
            Alert.alert(
              'Remove from my goals',
              'Your copy will be deleted. You stay in the group.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Remove from my goals',
                  style: 'destructive',
                  onPress: () => {
                    void deleteGoal(goal.id)
                      .then(() => onDeleted())
                      .catch((error) => {
                        Alert.alert(
                          'Delete failed',
                          error instanceof Error ? error.message : 'Could not delete this step.',
                        );
                      });
                  },
                },
              ],
            );
            return;
          }
          if (groupCopy?.link === 'connected') {
            void disconnectFromGroup().then((disconnected) => {
              if (disconnected) {
                deleteThisGoal();
              }
            });
            return;
          }
          deleteThisGoal();
        }}
        style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={
          groupCopy?.link === 'copy'
            ? 'Remove from my goals'
            : goal.parentId == null
              ? 'Delete goal'
              : 'Delete step'
        }
      >
        <Text style={styles.deleteButtonText}>
          {groupCopy?.link === 'copy'
            ? 'Remove from my goals'
            : goal.parentId == null
              ? 'Delete goal'
              : 'Delete step'}
        </Text>
      </Pressable>
      </View>

      {reminderPicker ? (
        <TimePickerModal
          title="Reminder"
          value={dateAtClock(draft.reminderTime, 9, 0)}
          onCancel={() => setReminderPicker(false)}
          onConfirm={(date) => {
            setReminderPicker(false);
            commitNow({ reminderTime: clockFromDate(date), remindOn: true });
          }}
        />
      ) : null}
      {donePrompt ? (
        <DatePickerModal
          title={DETAIL_LABELS.actualEnd}
          value={parseLocalDate(donePrompt.initialDate)}
          minimumDate={
            donePrompt.minimumDate && donePrompt.minimumDate <= today
              ? parseLocalDate(donePrompt.minimumDate)
              : undefined
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
  page: {
    gap: 12,
  },
  titleText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111',
  },
  whyBlock: {
    gap: 8,
  },
  whyQuote: {
    fontSize: 17,
    fontStyle: 'italic',
    color: '#1C1C1E',
    lineHeight: 24,
  },
  cueText: {
    fontSize: 15,
    color: '#111',
  },
  cue: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C7C7CC',
    paddingBottom: 4,
  },
  cueEditing: {
    backgroundColor: '#F6F6F8',
    borderRadius: 6,
    paddingHorizontal: 4,
  },
  cueEmpty: {
    color: '#8e8e93',
  },
  cueMultiline: {
    minHeight: 88,
  },
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
  reminderControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reminderLocked: {
    opacity: 0.4,
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
  groupLock: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 20,
    color: '#6B6B70',
  },
  groupAction: {
    marginTop: 8,
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
  groupActionText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#007aff',
  },
  groupMatch: {
    marginTop: 4,
    fontSize: 15,
    lineHeight: 20,
    color: '#6B6B70',
  },
  groupSave: {
    marginTop: 12,
    backgroundColor: '#007aff',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  groupSaveText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  pressed: {
    opacity: 0.55,
  },
});
