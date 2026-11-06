import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { DatePickerModal } from './DatePickerModal';
import { formFieldStyles } from './FormFields';
import { SHAPE_COPY } from '../constants/maya/shape';
import {
  habitCopy,
  habitIsReady,
  habitSummaryLine,
  keptStepTitles,
  whyText,
  type ShapeDraft,
} from '../lib/mayaShape';
import type { MayaAnswers } from '../lib/mayaFlow';
import { WEEKDAY_INITIALS, WEEKDAY_NAMES } from '../lib/goalDetailText';
import { parseLocalDate, todayLocal, toLocalDateString } from '../lib/localDate';
import type { WeekStart } from '../lib/settingsApi';
import { weekdayOrder } from '../lib/week';
import { formatDateMDY } from '../utils/date';

export function MayaCoachCard({
  draft,
  onDraft,
  onNext,
}: {
  draft: ShapeDraft;
  onDraft: (next: ShapeDraft) => void;
  onNext: () => void;
}) {
  const [focusId, setFocusId] = useState<string | null>(null);
  return (
    <View style={styles.stack}>
      <View style={styles.choices}>
        {draft.steps.map((step) => (
          <View key={step.id} style={styles.stepRow}>
            <Pressable
              onPress={() =>
                onDraft({
                  ...draft,
                  steps: draft.steps.map((item) =>
                    item.id === step.id ? { ...item, checked: !item.checked } : item,
                  ),
                })
              }
              hitSlop={6}
              accessibilityRole="checkbox"
              accessibilityLabel={step.text || 'Step'}
              accessibilityState={{ checked: step.checked }}
            >
              <Ionicons
                name={step.checked ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={step.checked ? '#007aff' : '#c7c7cc'}
              />
            </Pressable>
            <TextInput
              value={step.text}
              onChangeText={(text) =>
                onDraft({
                  ...draft,
                  steps: draft.steps.map((item) => (item.id === step.id ? { ...item, text } : item)),
                })
              }
              multiline
              maxLength={240}
              autoFocus={focusId === step.id}
              placeholder="Your step"
              placeholderTextColor="#8e8e93"
              style={[styles.stepInput, !step.checked && styles.stepInputOff]}
            />
          </View>
        ))}
        <Pressable
          onPress={() => {
            const id = `custom-${Date.now()}`;
            setFocusId(id);
            onDraft({
              ...draft,
              steps: [...draft.steps, { id, text: '', checked: true }],
            });
          }}
          style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Add your own step"
        >
          <Text style={styles.choiceText}>{SHAPE_COPY.addStep}</Text>
        </Pressable>
      </View>
      <Pressable
        onPress={onNext}
        style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Next"
      >
        <Text style={styles.choiceText}>Next</Text>
      </Pressable>
    </View>
  );
}

export function MayaPlanCard({
  draft,
  answers,
  showEditSteps,
  onDraft,
  onLooksRight,
  onEditSteps,
}: {
  draft: ShapeDraft;
  answers: MayaAnswers;
  showEditSteps: boolean;
  onDraft: (next: ShapeDraft) => void;
  onLooksRight: () => void;
  onEditSteps: () => void;
}) {
  const [open, setOpen] = useState(false);
  const why = whyText(answers);
  const steps = keptStepTitles(draft);
  const ready = draft.title.trim().length > 0;
  return (
    <View style={styles.stack}>
      <View style={styles.summary}>
        <TextInput
          value={draft.title}
          onChangeText={(title) => onDraft({ ...draft, title })}
          placeholder="Your goal"
          placeholderTextColor="#8e8e93"
          maxLength={120}
          style={styles.titleInput}
          accessibilityLabel="Goal title"
        />
        <Pressable
          onPress={() => setOpen(true)}
          style={({ pressed }) => [styles.dateRow, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`${SHAPE_COPY.targetDate}, ${formatDateMDY(draft.targetDate)}`}
        >
          <Text style={styles.dateLabel}>{SHAPE_COPY.targetDate}</Text>
          <Text style={styles.dateValue}>{formatDateMDY(draft.targetDate)}</Text>
        </Pressable>
        {why ? <Text style={styles.summaryBody}>{`${SHAPE_COPY.why}: ${why}`}</Text> : null}
        {steps.map((step, index) => (
          <Text key={`${index}-${step}`} style={styles.summaryBody}>
            {'• '}
            {step}
          </Text>
        ))}
        {showEditSteps ? (
          <Pressable
            onPress={onEditSteps}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={SHAPE_COPY.editSteps}
          >
            <Text style={styles.link}>{SHAPE_COPY.editSteps}</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={onLooksRight}
          disabled={!ready}
          style={({ pressed }) => [styles.choice, styles.choiceInset, pressed && ready && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={SHAPE_COPY.looksRight}
          accessibilityState={{ disabled: !ready }}
        >
          <Text style={[styles.choiceText, !ready && styles.choiceTextOff]}>{SHAPE_COPY.looksRight}</Text>
        </Pressable>
      </View>
      {open ? (
        <DatePickerModal
          title={SHAPE_COPY.targetDate}
          value={parseLocalDate(draft.targetDate)}
          minimumDate={parseLocalDate(todayLocal())}
          onCancel={() => setOpen(false)}
          onConfirm={(date) => {
            onDraft({ ...draft, targetDate: toLocalDateString(date) });
            setOpen(false);
          }}
        />
      ) : null}
    </View>
  );
}

export function MayaHabitCard({
  draft,
  answers,
  weekStart,
  onDraft,
  onNext,
  onSkip,
}: {
  draft: ShapeDraft;
  answers: MayaAnswers;
  weekStart: WeekStart;
  onDraft: (next: ShapeDraft) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const copy = habitCopy(answers);
  const ready = habitIsReady(answers, draft);
  const steps = keptStepTitles(draft);
  return (
    <View style={styles.stack}>
      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>{draft.title.trim() || 'Your goal'}</Text>
        {steps.map((step, index) => (
          <Text key={`${index}-${step}`} style={styles.summaryBody}>
            {'• '}
            {step}
          </Text>
        ))}
        {ready ? (
          <Text style={styles.habitRow}>{habitSummaryLine(answers, draft, weekStart)}</Text>
        ) : null}
      </View>
      <View style={styles.chipWrap}>
        {copy.choices.map((choice) => {
          const on = draft.habitChoice === choice.id;
          return (
            <Pressable
              key={choice.id}
              onPress={() => onDraft({ ...draft, habitChoice: choice.id, habitSkipped: false })}
              style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={choice.label}
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{choice.label}</Text>
            </Pressable>
          );
        })}
        {copy.allowMore ? (
          <Pressable
            onPress={() => onDraft({ ...draft, habitChoice: 'more', habitSkipped: false })}
            style={({ pressed }) => [
              styles.chip,
              draft.habitChoice === 'more' && styles.chipOn,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={SHAPE_COPY.more}
            accessibilityState={{ selected: draft.habitChoice === 'more' }}
          >
            <Text style={[styles.chipText, draft.habitChoice === 'more' && styles.chipTextOn]}>
              {SHAPE_COPY.more}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {copy.allowMore && draft.habitChoice === 'more' ? (
        <TextInput
          value={draft.habitCustom}
          onChangeText={(habitCustom) =>
            onDraft({ ...draft, habitCustom: habitCustom.replace(/[^0-9]/g, ''), habitSkipped: false })
          }
          keyboardType="number-pad"
          placeholder={SHAPE_COPY.minutesPlaceholder}
          placeholderTextColor="#8e8e93"
          maxLength={4}
          style={styles.minutesInput}
          accessibilityLabel="Minutes a week"
        />
      ) : null}
      <Text style={styles.daysLabel}>{SHAPE_COPY.daysPrompt}</Text>
      <View style={formFieldStyles.dayPicker}>
        {weekdayOrder(weekStart).map((day) => {
          const selected = draft.days.includes(day);
          return (
            <Pressable
              key={WEEKDAY_NAMES[day]}
              onPress={() => {
                const days = selected
                  ? draft.days.filter((item) => item !== day)
                  : [...draft.days, day].sort((a, b) => a - b);
                onDraft({ ...draft, days, habitSkipped: false });
              }}
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
      <Pressable
        onPress={onNext}
        disabled={!ready}
        style={({ pressed }) => [styles.choice, pressed && ready && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Next"
        accessibilityState={{ disabled: !ready }}
      >
        <Text style={[styles.choiceText, !ready && styles.choiceTextOff]}>Next</Text>
      </Pressable>
      <Pressable
        onPress={onSkip}
        style={({ pressed }) => [
          styles.choice,
          draft.habitSkipped && styles.optionOn,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={SHAPE_COPY.habitSkip}
      >
        <Text style={styles.choiceText}>{SHAPE_COPY.habitSkip}</Text>
      </Pressable>
    </View>
  );
}

export function MayaSummaryCard({
  draft,
  answers,
  weekStart,
  saving,
  showActions,
  onLooksGood,
}: {
  draft: ShapeDraft;
  answers: MayaAnswers;
  weekStart: WeekStart;
  saving: boolean;
  showActions: boolean;
  onLooksGood: () => void;
}) {
  const steps = keptStepTitles(draft);
  const why = whyText(answers);
  const habit = habitIsReady(answers, draft)
    ? habitSummaryLine(answers, draft, weekStart)
    : SHAPE_COPY.noTimeBlock;
  return (
    <View style={styles.stack}>
      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>{draft.title.trim()}</Text>
        <Text style={styles.summaryDate}>{formatDateMDY(draft.targetDate)}</Text>
        {why ? <Text style={styles.summaryBody}>{`${SHAPE_COPY.why}: ${why}`}</Text> : null}
        {steps.map((step, index) => (
          <Text key={`${index}-${step}`} style={styles.summaryBody}>
            {'• '}
            {step}
          </Text>
        ))}
        <Text style={styles.summaryHabit}>{habit}</Text>
        {showActions ? (
          <>
            <Pressable
              onPress={onLooksGood}
              disabled={saving}
              style={({ pressed }) => [styles.choice, styles.choiceInset, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={SHAPE_COPY.looksGood}
              accessibilityState={{ disabled: saving }}
            >
              {saving ? <ActivityIndicator color="#007aff" /> : <Text style={styles.choiceText}>{SHAPE_COPY.looksGood}</Text>}
            </Pressable>
            <Text style={styles.hint}>{SHAPE_COPY.summaryHint}</Text>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 12,
  },
  choices: {
    gap: 8,
  },
  choice: {
    backgroundColor: '#fff',
    borderRadius: 14,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceInset: {
    marginTop: 4,
  },
  choiceText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#007aff',
    textAlign: 'center',
  },
  choiceTextOff: {
    color: '#c7c7cc',
  },
  optionOn: {
    backgroundColor: '#e8f1ff',
  },
  stepRow: {
    backgroundColor: '#fff',
    borderRadius: 14,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  stepInput: {
    flex: 1,
    fontSize: 17,
    lineHeight: 24,
    color: '#111',
    padding: 0,
  },
  stepInputOff: {
    color: '#8e8e93',
  },
  titleInput: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    color: '#111',
    padding: 0,
  },
  minutesInput: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
    color: '#111',
  },
  dateRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  dateLabel: {
    fontSize: 17,
    color: '#111',
  },
  dateValue: {
    fontSize: 17,
    color: '#007aff',
    fontWeight: '600',
  },
  summary: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  summaryTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    color: '#111',
  },
  summaryDate: {
    fontSize: 15,
    color: '#6B6B70',
  },
  summaryBody: {
    fontSize: 17,
    lineHeight: 24,
    color: '#111',
  },
  summaryHabit: {
    marginTop: 6,
    fontSize: 17,
    lineHeight: 24,
    color: '#111',
  },
  habitRow: {
    marginTop: 4,
    backgroundColor: '#e8f1ff',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    color: '#111',
  },
  link: {
    fontSize: 17,
    fontWeight: '600',
    color: '#007aff',
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
    color: '#6B6B70',
    textAlign: 'center',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '100%',
  },
  chipOn: {
    backgroundColor: '#007aff',
  },
  chipText: {
    fontSize: 17,
    color: '#111',
  },
  chipTextOn: {
    color: '#fff',
    fontWeight: '600',
  },
  daysLabel: {
    fontSize: 15,
    color: '#6B6B70',
  },
  pressed: {
    opacity: 0.55,
  },
});
