import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { DatePickerModal } from './DatePickerModal';
import { formFieldStyles } from './FormFields';
import {
  HELPER_OPTIONS,
  LEVEL_OPTIONS,
  SHAPE_COPY,
} from '../constants/maya/shape';
import {
  coachingScript,
  habitCopy,
  habitSummaryLine,
  keptStepTitles,
  whyText,
  type ShapeDraft,
  type ShapeStepId,
} from '../lib/mayaShape';
import type { MayaAnswers } from '../lib/mayaFlow';
import { WEEKDAY_INITIALS, WEEKDAY_NAMES } from '../lib/goalDetailText';
import { parseLocalDate, todayLocal, toLocalDateString } from '../lib/localDate';
import type { MayaLevel, WeekStart } from '../lib/settingsApi';
import { weekdayOrder } from '../lib/week';
import { formatDateMDY } from '../utils/date';

export function MayaShapeView({
  step,
  draft,
  answers,
  weekStart,
  saving,
  onDraft,
  onLooksGood,
  onChangeSomething,
}: {
  step: ShapeStepId;
  draft: ShapeDraft;
  answers: MayaAnswers;
  weekStart: WeekStart;
  saving: boolean;
  onDraft: (next: ShapeDraft) => void;
  onLooksGood: () => void;
  onChangeSomething: () => void;
}) {
  if (step === 'coach') {
    return <CoachStep draft={draft} answers={answers} onDraft={onDraft} />;
  }
  if (step === 'name') {
    return <NameStep draft={draft} onDraft={onDraft} />;
  }
  if (step === 'habit') {
    return <HabitStep draft={draft} answers={answers} weekStart={weekStart} onDraft={onDraft} />;
  }
  if (step === 'helper') {
    return (
      <ChoiceStep
        prompt={SHAPE_COPY.helperPrompt}
        options={HELPER_OPTIONS}
        selected={draft.helper}
        onSelect={(id) => onDraft({ ...draft, helper: id })}
      />
    );
  }
  if (step === 'level') {
    return (
      <ChoiceStep
        prompt={SHAPE_COPY.levelPrompt}
        options={LEVEL_OPTIONS}
        selected={draft.level}
        onSelect={(id) => onDraft({ ...draft, level: id as MayaLevel })}
      />
    );
  }
  return (
    <SummaryStep
      draft={draft}
      answers={answers}
      weekStart={weekStart}
      saving={saving}
      onLooksGood={onLooksGood}
      onChangeSomething={onChangeSomething}
    />
  );
}

function Bubble({ text }: { text: string }) {
  return (
    <View style={styles.bubbleRow}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>M</Text>
      </View>
      <View style={styles.bubble}>
        <Text style={styles.bubbleText}>{text}</Text>
      </View>
    </View>
  );
}

function CoachStep({
  draft,
  answers,
  onDraft,
}: {
  draft: ShapeDraft;
  answers: MayaAnswers;
  onDraft: (next: ShapeDraft) => void;
}) {
  const script = coachingScript(answers);
  const [focusId, setFocusId] = useState<string | null>(null);
  return (
    <View style={styles.stack}>
      {script.lead ? <Bubble text={script.lead} /> : null}
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
      {script.follow ? <Bubble text={script.follow} /> : null}
    </View>
  );
}

function NameStep({
  draft,
  onDraft,
}: {
  draft: ShapeDraft;
  onDraft: (next: ShapeDraft) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.stack}>
      <Bubble text={SHAPE_COPY.namePrompt} />
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

function HabitStep({
  draft,
  answers,
  weekStart,
  onDraft,
}: {
  draft: ShapeDraft;
  answers: MayaAnswers;
  weekStart: WeekStart;
  onDraft: (next: ShapeDraft) => void;
}) {
  const script = coachingScript(answers);
  const copy = habitCopy(answers);
  return (
    <View style={styles.stack}>
      {script.skipScreen && script.lead ? <Bubble text={script.lead} /> : null}
      <Bubble text={SHAPE_COPY.habitPrompt} />
      <View style={styles.choices}>
        {copy.choices.map((choice) => {
          const on = draft.habitChoice === choice.id;
          return (
            <Pressable
              key={choice.id}
              onPress={() => onDraft({ ...draft, habitChoice: choice.id })}
              style={({ pressed }) => [styles.option, on && styles.optionOn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={choice.label}
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.optionText, on && styles.optionTextOn]}>{choice.label}</Text>
              {on ? <Ionicons name="checkmark" size={20} color="#007aff" /> : null}
            </Pressable>
          );
        })}
        {copy.allowMore ? (
          <Pressable
            onPress={() => onDraft({ ...draft, habitChoice: 'more' })}
            style={({ pressed }) => [
              styles.option,
              draft.habitChoice === 'more' && styles.optionOn,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={SHAPE_COPY.more}
            accessibilityState={{ selected: draft.habitChoice === 'more' }}
          >
            <Text style={[styles.optionText, draft.habitChoice === 'more' && styles.optionTextOn]}>
              {SHAPE_COPY.more}
            </Text>
            {draft.habitChoice === 'more' ? <Ionicons name="checkmark" size={20} color="#007aff" /> : null}
          </Pressable>
        ) : null}
      </View>
      {copy.allowMore && draft.habitChoice === 'more' ? (
        <TextInput
          value={draft.habitCustom}
          onChangeText={(habitCustom) => onDraft({ ...draft, habitCustom: habitCustom.replace(/[^0-9]/g, '') })}
          keyboardType="number-pad"
          placeholder={SHAPE_COPY.minutesPlaceholder}
          placeholderTextColor="#8e8e93"
          maxLength={4}
          style={styles.titleInput}
          accessibilityLabel="Minutes a week"
        />
      ) : null}
      <Bubble text={SHAPE_COPY.daysPrompt} />
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
                onDraft({ ...draft, days });
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
    </View>
  );
}

function ChoiceStep({
  prompt,
  options,
  selected,
  onSelect,
}: {
  prompt: string;
  options: readonly { id: string; label: string }[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <View style={styles.stack}>
      <Bubble text={prompt} />
      <View style={styles.choices}>
        {options.map((option) => {
          const on = selected === option.id;
          return (
            <Pressable
              key={option.id}
              onPress={() => onSelect(option.id)}
              style={({ pressed }) => [styles.option, on && styles.optionOn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.optionText, on && styles.optionTextOn]}>{option.label}</Text>
              {on ? <Ionicons name="checkmark" size={20} color="#007aff" /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SummaryStep({
  draft,
  answers,
  weekStart,
  saving,
  onLooksGood,
  onChangeSomething,
}: {
  draft: ShapeDraft;
  answers: MayaAnswers;
  weekStart: WeekStart;
  saving: boolean;
  onLooksGood: () => void;
  onChangeSomething: () => void;
}) {
  const steps = keptStepTitles(draft);
  const why = whyText(answers);
  return (
    <View style={styles.stack}>
      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>{draft.title.trim()}</Text>
        <Text style={styles.summaryDate}>{formatDateMDY(draft.targetDate)}</Text>
        {why ? (
          <>
            <Text style={styles.summaryLabel}>{SHAPE_COPY.why}</Text>
            <Text style={styles.summaryBody}>{why}</Text>
          </>
        ) : null}
        {steps.map((step, index) => (
          <Text key={`${index}-${step}`} style={styles.summaryBody}>
            {'• '}
            {step}
          </Text>
        ))}
        <Text style={styles.summaryHabit}>{habitSummaryLine(answers, draft, weekStart)}</Text>
      </View>
      <Pressable
        onPress={onLooksGood}
        disabled={saving}
        style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={SHAPE_COPY.looksGood}
        accessibilityState={{ disabled: saving }}
      >
        {saving ? (
          <ActivityIndicator color="#007aff" />
        ) : (
          <Text style={styles.choiceText}>{SHAPE_COPY.looksGood}</Text>
        )}
      </Pressable>
      <Pressable
        onPress={onChangeSomething}
        disabled={saving}
        style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={SHAPE_COPY.changeSomething}
        accessibilityState={{ disabled: saving }}
      >
        <Text style={[styles.choiceText, saving && styles.choiceTextOff]}>{SHAPE_COPY.changeSomething}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 16,
  },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#007aff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  bubble: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bubbleText: {
    fontSize: 17,
    lineHeight: 24,
    color: '#111',
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
  choiceText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#007aff',
    textAlign: 'center',
  },
  choiceTextOff: {
    color: '#c7c7cc',
  },
  option: {
    backgroundColor: '#fff',
    borderRadius: 14,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  optionOn: {
    backgroundColor: '#e8f1ff',
  },
  optionText: {
    flex: 1,
    fontSize: 17,
    color: '#111',
  },
  optionTextOn: {
    color: '#007aff',
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
    backgroundColor: '#fff',
    borderRadius: 14,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  summaryLabel: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
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
  pressed: {
    opacity: 0.55,
  },
});
