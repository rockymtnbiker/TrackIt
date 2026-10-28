import { Ionicons } from '@expo/vector-icons';
import { useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { DatePickerModal } from '../components/DatePickerModal';
import { FormSelectRow, formFieldStyles } from '../components/FormFields';
import { KeyboardSafe } from '../components/KeyboardSafe';
import { TimesStepper } from '../components/TimesStepper';
import { UNIT_OPTIONS } from '../constants';
import { AREAS, startersInArea, type Starter } from '../constants/starters';
import { useSettings } from '../context/SettingsContext';
import { createGoal, type GoalInput } from '../lib/goalTreeApi';
import { isDaily, storedTimesPerDay, weeklyTarget } from '../lib/goalTree';
import { WEEKDAY_INITIALS, WEEKDAY_NAMES } from '../lib/goalDetailText';
import { markOnboarded } from '../lib/profileApi';
import { captureStatusDates } from '../lib/statusDates';
import { openDoToday } from '../lib/reminders';
import { finishOnboarding } from '../navigation/onboardingHandoff';
import type { WeekStart } from '../lib/settingsApi';
import type { GoalsStackParamList } from '../navigation/GoalsStackNavigator';
import type { Goal, RepeatPeriod } from '../types/goal';
import { parseLocalDate, toLocalDateString, todayLocal } from '../lib/localDate';
import { formatDateMDY } from '../utils/date';

type Props = NativeStackScreenProps<GoalsStackParamList, 'GoalSetup'>;

type Cadence = 'once' | 'daily' | 'weekly' | 'monthly';
type TrackMode = 'check' | 'amount';

type Draft = {
  title: string;
  cadence: Cadence;
  times: number;
  plannedDays: number[];
  track: TrackMode;
  target: string;
  unitChoice: string;
  customUnit: string;
  deadline: string;
  why: string;
  category: string | null;
  starterKey: string | null;
  needsDeadline: boolean;
};

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const CUSTOM_UNIT = '__custom__';

const CADENCE_OPTIONS: { value: Cadence; label: string }[] = [
  { value: 'once', label: 'Once' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const TRACK_OPTIONS: { value: TrackMode; label: string }[] = [
  { value: 'check', label: 'Check it off' },
  { value: 'amount', label: 'Track an amount' },
];

const UNIT_CHOICES = [
  ...UNIT_OPTIONS.map((unit) => ({ value: unit, label: unit })),
  { value: CUSTOM_UNIT, label: 'Custom…' },
];

function clampCount(value: number, max: number): number {
  const rounded = Math.round(value);
  if (!Number.isFinite(rounded) || rounded < 1) {
    return 1;
  }
  return Math.min(max, rounded);
}

function endOfThisYear(): string {
  return `${todayLocal().slice(0, 4)}-12-31`;
}

function parseAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const amount = Number(trimmed);
  return Number.isFinite(amount) ? amount : null;
}

function isPresetUnit(unit: string): boolean {
  return (UNIT_OPTIONS as readonly string[]).includes(unit);
}

function emptyDraft(category: string | null): Draft {
  return {
    title: '',
    cadence: 'once',
    times: 1,
    plannedDays: [],
    track: 'check',
    target: '',
    unitChoice: '',
    customUnit: '',
    deadline: '',
    why: '',
    category,
    starterKey: null,
    needsDeadline: false,
  };
}

function cadenceFor(starter: Starter): Cadence {
  if (starter.repeatPeriod == null || starter.plannedDays == null) {
    return 'once';
  }
  if (starter.repeatPeriod === 'month') {
    return 'monthly';
  }
  const daily = isDaily({
    repeatPeriod: 'week',
    plannedDays: starter.plannedDays,
    unit: starter.unit,
    targetAmount: starter.unit == null ? null : starter.targetAmount,
  });
  return daily ? 'daily' : 'weekly';
}

function draftFromStarter(starter: Starter): Draft {
  const tracked = starter.unit != null;
  const cadence = cadenceFor(starter);
  const preset = starter.unit != null && isPresetUnit(starter.unit);
  const times =
    cadence === 'daily'
      ? storedTimesPerDay(starter.timesPerDay)
      : !tracked && starter.targetAmount != null
        ? starter.targetAmount
        : 1;
  return {
    title: starter.title,
    cadence,
    times,
    plannedDays: starter.plannedDays ?? [],
    track: tracked ? 'amount' : 'check',
    target: tracked && starter.targetAmount != null ? String(starter.targetAmount) : '',
    unitChoice: starter.unit == null ? '' : preset ? starter.unit : CUSTOM_UNIT,
    customUnit: starter.unit != null && !preset ? starter.unit : '',
    deadline: starter.deadlineEndOfYear ? endOfThisYear() : '',
    why: '',
    category: starter.areaKey,
    starterKey: starter.key,
    needsDeadline: starter.needsDeadline,
  };
}

function resolvedUnit(draft: Draft): string | null {
  if (draft.track !== 'amount') {
    return null;
  }
  if (draft.unitChoice === CUSTOM_UNIT) {
    const custom = draft.customUnit.trim();
    return custom || null;
  }
  return draft.unitChoice.trim() || null;
}

function probe(
  fields: Pick<Goal, 'repeatPeriod' | 'plannedDays' | 'unit' | 'targetAmount' | 'timesPerDay'>,
): Goal {
  return {
    id: 'setup',
    userId: '',
    parentId: null,
    title: '',
    description: null,
    why: null,
    category: null,
    sortOrder: 0,
    status: 'active',
    targetStartDate: null,
    targetEndDate: null,
    actualStartDate: null,
    actualEndDate: null,
    createdDate: todayLocal(),
    reminderTime: null,
    starterKey: null,
    progressPct: null,
    ...fields,
  };
}

function fieldsFor(draft: Draft, weekStartsOn: WeekStart): GoalInput {
  const tracked = draft.track === 'amount';
  const unit = resolvedUnit(draft);
  const parsed = parseAmount(draft.target);
  let repeatPeriod: RepeatPeriod | null = null;
  let plannedDays: number[] | null = null;
  let timesPerDay = 1;
  let targetAmount: number | null = tracked ? parsed : null;

  if (draft.cadence === 'daily') {
    repeatPeriod = 'week';
    plannedDays = [...ALL_DAYS];
    timesPerDay = tracked ? 1 : storedTimesPerDay(draft.times);
    targetAmount = tracked ? parsed : null;
    const daily = isDaily({ repeatPeriod, plannedDays, unit, targetAmount });
    if (!daily && unit == null) {
      targetAmount = null;
    }
  } else if (draft.cadence === 'weekly') {
    repeatPeriod = 'week';
    plannedDays = [...draft.plannedDays].sort((a, b) => a - b);
    const times = clampCount(draft.times, 21);
    targetAmount = tracked
      ? parsed
      : weeklyTarget(
          probe({
            repeatPeriod: 'week',
            plannedDays,
            unit: null,
            targetAmount: times,
            timesPerDay: 1,
          }),
          weekStartsOn,
        ) ?? times;
  } else if (draft.cadence === 'monthly') {
    repeatPeriod = 'month';
    plannedDays = [];
    targetAmount = tracked ? parsed : clampCount(draft.times, 60);
  }

  const dates = captureStatusDates(
    'active',
    { actual_start_date: null, actual_end_date: null },
    todayLocal(),
  );

  return {
    title: draft.title.trim(),
    parentId: null,
    category: draft.category,
    starterKey: draft.starterKey,
    why: draft.why.trim() || null,
    unit,
    targetAmount,
    repeatPeriod,
    plannedDays,
    timesPerDay,
    targetEndDate: draft.deadline.trim() || null,
    status: 'active',
    actualStartDate: dates.actual_start_date,
    actualEndDate: dates.actual_end_date,
  };
}

function targetLabel(cadence: Cadence): string {
  if (cadence === 'monthly') {
    return 'Target per month';
  }
  if (cadence === 'once') {
    return 'Total';
  }
  return 'Target per week';
}

export default function GoalSetupScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [areaKey, setAreaKey] = useState<string | null>(null);
  const [skippedStarters, setSkippedStarters] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft(null));
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [dateOpen, setDateOpen] = useState(false);

  const goBack = () => {
    setCreateError(null);
    setStep((current) => {
      if (current === 3) {
        return skippedStarters ? 1 : 2;
      }
      return 1;
    });
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      title: `Step ${step} of 3`,
      headerBackVisible: false,
      gestureEnabled: step === 1,
      headerLeft: () =>
        step === 1 ? (
          <Pressable
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
            style={styles.headerButton}
          >
            <Ionicons name="close" size={26} color="#007aff" />
          </Pressable>
        ) : (
          <Pressable
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
            style={styles.headerButton}
          >
            <Ionicons name="chevron-back" size={22} color="#007aff" />
            <Text style={styles.headerButtonText}>Back</Text>
          </Pressable>
        ),
    });
  }, [navigation, step, skippedStarters]);

  const pickArea = (key: string) => {
    setAreaKey(key);
    setSkippedStarters(false);
    setCreateError(null);
    setStep(2);
  };

  const writeOwn = (category: string | null, skipList: boolean) => {
    setAreaKey(category);
    setSkippedStarters(skipList);
    setDraft(emptyDraft(category));
    setCreateError(null);
    setStep(3);
  };

  const pickStarter = (starter: Starter) => {
    setSkippedStarters(false);
    setDraft(draftFromStarter(starter));
    setCreateError(null);
    setStep(3);
  };

  const create = async () => {
    if (!draft.title.trim() || creating) {
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createGoal(fieldsFor(draft, settings.weekStart));
      const routeNames = navigation.getState()?.routeNames as readonly string[] | undefined;
      if (routeNames?.includes('FirstGoal')) {
        await markOnboarded();
        setCreating(false);
        finishOnboarding(created.id);
        return;
      }
      setCreating(false);
      navigation.popToTop();
      openDoToday(created.id);
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : 'Could not create that goal.',
      );
      setCreating(false);
    }
  };

  const area = AREAS.find((item) => item.key === areaKey) ?? null;
  const highlightDeadline = draft.needsDeadline && !draft.deadline;
  const canCreate = draft.title.trim().length > 0 && !creating;

  return (
    <KeyboardSafe style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {step === 1 ? (
          <>
            <Text style={styles.heading}>What's this goal about?</Text>
            <View style={styles.grid}>
              {AREAS.map((item) => (
                <Pressable
                  key={item.key}
                  onPress={() => pickArea(item.key)}
                  style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
                  accessibilityRole="button"
                >
                  <Text style={styles.tileLabel}>{item.label}</Text>
                  <Text style={styles.tileHint}>{item.hint}</Text>
                </Pressable>
              ))}
              <Pressable
                onPress={() => writeOwn(null, true)}
                style={({ pressed }) => [
                  styles.tile,
                  styles.tileDashed,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
              >
                <Text style={styles.tileLabel}>Something else</Text>
                <Text style={styles.tileHint}>Write your own</Text>
              </Pressable>
            </View>
          </>
        ) : null}

        {step === 2 && area ? (
          <>
            <Text style={styles.kicker}>{area.label}</Text>
            <Text style={styles.heading}>Pick a starter</Text>
            {startersInArea(area.key).map((starter) => (
              <Pressable
                key={starter.key}
                onPress={() => pickStarter(starter)}
                style={({ pressed }) => [styles.starter, pressed && styles.pressed]}
                accessibilityRole="button"
              >
                <View style={styles.starterText}>
                  <Text style={styles.starterTitle}>{starter.cardTitle}</Text>
                  <Text style={styles.starterDetail}>{starter.cardDetail}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#c7c7cc" />
              </Pressable>
            ))}
            <Pressable
              onPress={() => writeOwn(area.key, false)}
              style={({ pressed }) => [
                styles.starter,
                styles.starterDashed,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.starterTitle}>Write your own</Text>
            </Pressable>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Text style={styles.fieldLabel}>
              {draft.starterKey == null ? "What's your goal?" : 'Name'}
            </Text>
            <TextInput
              key={draft.starterKey ?? 'own'}
              value={draft.title}
              onChangeText={(title) => setDraft((current) => ({ ...current, title }))}
              placeholder="Name your goal"
              autoFocus={draft.starterKey == null}
              style={styles.nameInput}
            />

            <Text style={styles.fieldLabel}>How often?</Text>
            <Segmented
              options={CADENCE_OPTIONS}
              value={draft.cadence}
              onChange={(cadence) =>
                setDraft((current) => ({
                  ...current,
                  cadence,
                  times:
                    cadence === 'daily'
                      ? storedTimesPerDay(current.cadence === 'daily' ? current.times : 1)
                      : cadence === current.cadence
                        ? current.times
                        : 1,
                }))
              }
            />
            {draft.cadence === 'weekly' ||
            (draft.track === 'check' &&
              (draft.cadence === 'daily' || draft.cadence === 'monthly')) ? (
              <View style={styles.amountBlock}>
                {draft.cadence === 'daily' && draft.track === 'check' ? (
                  <TimesStepper
                    label="Times a day"
                    value={storedTimesPerDay(draft.times)}
                    min={1}
                    max={12}
                    onChange={(times) => setDraft((current) => ({ ...current, times }))}
                  />
                ) : null}
                {draft.cadence === 'weekly' && draft.track === 'check' ? (
                  <TimesStepper
                    label="Times a week"
                    value={clampCount(draft.times, 21)}
                    min={1}
                    max={21}
                    onChange={(times) => setDraft((current) => ({ ...current, times }))}
                  />
                ) : null}
                {draft.cadence === 'monthly' && draft.track === 'check' ? (
                  <TimesStepper
                    label="Times a month"
                    value={clampCount(draft.times, 60)}
                    min={1}
                    max={60}
                    onChange={(times) => setDraft((current) => ({ ...current, times }))}
                  />
                ) : null}
                {draft.cadence === 'weekly' ? (
                  <View style={styles.daysBlock}>
                    <View style={formFieldStyles.dayPicker}>
                      {ALL_DAYS.map((day) => {
                        const selected = draft.plannedDays.includes(day);
                        return (
                          <Pressable
                            key={WEEKDAY_NAMES[day]}
                            onPress={() =>
                              setDraft((current) => ({
                                ...current,
                                plannedDays: selected
                                  ? current.plannedDays.filter((item) => item !== day)
                                  : [...current.plannedDays, day],
                              }))
                            }
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
                    <Text style={styles.hint}>Planned days are flexible. Log any day.</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            <Text style={styles.fieldLabel}>How will you track it?</Text>
            <Segmented
              options={TRACK_OPTIONS}
              value={draft.track}
              onChange={(track) => setDraft((current) => ({ ...current, track }))}
            />
            {draft.track === 'amount' ? (
              <View style={styles.amountBlock}>
                <Text style={styles.amountLabel}>{targetLabel(draft.cadence)}</Text>
                <TextInput
                  value={draft.target}
                  onChangeText={(target) => setDraft((current) => ({ ...current, target }))}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  style={styles.amountInput}
                />
                <FormSelectRow
                  label="Unit"
                  value={draft.unitChoice}
                  placeholder="Choose a unit"
                  options={UNIT_CHOICES}
                  onChange={(unitChoice) =>
                    setDraft((current) => ({ ...current, unitChoice }))
                  }
                />
                {draft.unitChoice === CUSTOM_UNIT ? (
                  <TextInput
                    value={draft.customUnit}
                    onChangeText={(customUnit) =>
                      setDraft((current) => ({ ...current, customUnit }))
                    }
                    placeholder="Custom unit"
                    style={styles.amountInput}
                  />
                ) : null}
              </View>
            ) : null}

            <Text style={styles.fieldLabel}>Optional</Text>
            <Pressable
              onPress={() => setDateOpen(true)}
              style={({ pressed }) => [
                styles.optionRow,
                highlightDeadline && styles.optionRowHighlight,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Deadline"
            >
              <Text style={styles.optionLabel}>Deadline</Text>
              <Text
                style={[
                  styles.optionValue,
                  !draft.deadline && styles.optionPlaceholder,
                  highlightDeadline && styles.optionHighlightText,
                ]}
              >
                {draft.deadline
                  ? formatDateMDY(draft.deadline)
                  : highlightDeadline
                    ? 'Pick a date'
                    : 'Add a date'}
              </Text>
            </Pressable>
            <Text style={styles.optionLabel}>Why it matters</Text>
            <TextInput
              value={draft.why}
              onChangeText={(why) => setDraft((current) => ({ ...current, why }))}
              placeholder="Optional"
              multiline
              style={styles.whyInput}
            />
          </>
        ) : null}
      </ScrollView>

      {step === 3 ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {createError ? <Text style={styles.error}>{createError}</Text> : null}
          <Pressable
            onPress={() => void create()}
            disabled={!canCreate}
            style={({ pressed }) => [
              styles.createButton,
              !canCreate && styles.createButtonDisabled,
              pressed && canCreate && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Create goal"
          >
            {creating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.createText}>Create goal</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {dateOpen ? (
        <DatePickerModal
          title="Deadline"
          value={draft.deadline ? parseLocalDate(draft.deadline.slice(0, 10)) : null}
          onCancel={() => setDateOpen(false)}
          onConfirm={(date) => {
            setDateOpen(false);
            setDraft((current) => ({ ...current, deadline: toLocalDateString(date) }));
          }}
        />
      ) : null}
    </KeyboardSafe>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segment}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.segmentItem, selected && styles.segmentItemSelected]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f2f2f7',
  },
  content: {
    padding: 16,
    paddingBottom: 24,
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
    marginBottom: 16,
  },
  kicker: {
    fontSize: 13,
    fontWeight: '600',
    color: '#007aff',
    marginBottom: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  tile: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 16,
    marginBottom: 12,
    minHeight: 92,
    justifyContent: 'center',
  },
  tileDashed: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#8e8e93',
  },
  tileLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
    marginBottom: 4,
  },
  tileHint: {
    fontSize: 13,
    color: '#666',
  },
  starter: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
    gap: 8,
  },
  starterDashed: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#8e8e93',
  },
  starterText: {
    flex: 1,
  },
  starterTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  starterDetail: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    marginTop: 16,
  },
  nameInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 20,
    fontWeight: '600',
    color: '#111',
  },
  daysBlock: {
    marginTop: 12,
    gap: 8,
  },
  hint: {
    fontSize: 13,
    color: '#666',
  },
  amountBlock: {
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  amountLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  amountInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    color: '#111',
    backgroundColor: '#fff',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  optionRowHighlight: {
    backgroundColor: '#fff6e8',
    borderWidth: 1,
    borderColor: '#ff9f0a',
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  optionValue: {
    fontSize: 16,
    color: '#111',
  },
  optionPlaceholder: {
    color: '#8e8e93',
  },
  optionHighlightText: {
    color: '#c93400',
    fontWeight: '600',
  },
  whyInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 88,
    fontSize: 16,
    color: '#111',
    textAlignVertical: 'top',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: '#f2f2f7',
  },
  createButton: {
    backgroundColor: '#007aff',
    borderRadius: 12,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonDisabled: {
    backgroundColor: '#a8c8f0',
  },
  createText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  error: {
    color: '#c62828',
    fontSize: 14,
    marginBottom: 8,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: '#e5e5ea',
    borderRadius: 10,
    padding: 2,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  segmentItemSelected: {
    backgroundColor: '#fff',
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  segmentTextSelected: {
    color: '#111',
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 4,
  },
  headerButtonText: {
    color: '#007aff',
    fontSize: 17,
  },
  pressed: {
    opacity: 0.7,
  },
});
