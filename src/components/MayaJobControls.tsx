import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputInstance } from 'react-native';
import {
  JOB_AI_WARNING,
  JOB_BLOCK,
  JOB_CARD,
  JOB_DATE,
  JOB_FOLLOWS,
  JOB_HELPER,
  JOB_HOURS,
  JOB_IMPORTANCE,
  JOB_LEVEL,
  JOB_STAGE,
  JOB_TIGHT,
  JOB_WHY,
  type JobFollowId,
} from '../constants/maya/jobFlow';
import { KeyboardAnswer, useKeyboardPoke } from '../lib/keyboardScroll';
import {
  jobCardLines,
  jobDateFor,
  jobFollowChoices,
  jobTimeLine,
  jobTitleLine,
  resolvedFollow,
  type JobDateChoice,
  type JobDraft,
  type JobHoursId,
  type JobStageId,
  type JobStepId,
} from '../lib/mayaJob';
import { parseLocalDate, todayLocal, toLocalDateString } from '../lib/localDate';
import type { StepDraft } from '../lib/mayaShape';
import type { MayaLevel } from '../lib/settingsApi';
import { DatePickerModal } from './DatePickerModal';
import { MayaCoachCard } from './MayaShapeView';

export function MayaJobControls({
  step,
  job,
  saving,
  onSubmit,
  onDraft,
}: {
  step: JobStepId;
  job: JobDraft;
  saving: boolean;
  onSubmit: (patch: Partial<JobDraft>) => void;
  onDraft: (patch: Partial<JobDraft>) => void;
}) {
  if (step === 'why') {
    return <WhyStep job={job} saving={saving} onSubmit={onSubmit} />;
  }
  if (step === 'importance') {
    return <Scale onPick={(importance) => onSubmit({ importance })} />;
  }
  if (step === 'importanceLow') {
    return (
      <Choices
        options={[
          { id: 'keep', label: JOB_IMPORTANCE.keep },
          { id: 'else', label: JOB_IMPORTANCE.else },
        ]}
        onPick={(id) => onSubmit({ lowChoice: id === 'else' ? 'else' : 'keep' })}
      />
    );
  }
  if (step === 'stage') {
    return (
      <Choices
        options={[
          { id: 'not-started', label: JOB_STAGE.notStarted },
          { id: 'applying', label: JOB_STAGE.applying },
          { id: 'interviewing', label: JOB_STAGE.interviewing },
        ]}
        onPick={(id) => onSubmit({ stage: id as JobStageId })}
      />
    );
  }
  if (step === 'date') {
    return <DateStep saving={saving} onSubmit={onSubmit} />;
  }
  if (step === 'hours') {
    return (
      <Choices
        options={[
          { id: '1-2', label: JOB_HOURS.low },
          { id: '3-5', label: JOB_HOURS.mid },
          { id: '6-10', label: JOB_HOURS.high },
          { id: 'skip', label: JOB_HOURS.skip },
        ]}
        selected={job.hours}
        onPick={(id) => onSubmit({ hours: id as JobHoursId, hoursConfirmed: true })}
      />
    );
  }
  if (step === 'tight') {
    return (
      <Choices
        options={[
          { id: 'date', label: JOB_TIGHT.date },
          { id: 'hours', label: JOB_TIGHT.hours },
          { id: 'keep', label: JOB_TIGHT.keep },
        ]}
        onPick={(id) => {
          if (id === 'date') {
            onSubmit({ tightChoice: 'date', reask: 'date', resumeTo: job.pendingAfterTight });
            return;
          }
          if (id === 'hours') {
            onSubmit({ tightChoice: 'hours', reask: 'hours', resumeTo: job.pendingAfterTight });
            return;
          }
          onSubmit({ tightChoice: 'keep', reask: null });
        }}
      />
    );
  }
  if (step === 'hold') {
    return (
      <Choices
        options={jobFollowChoices(job)}
        onPick={(id) => onSubmit({ follow: id as JobFollowId })}
      />
    );
  }
  if (step === 'block') {
    return (
      <Choices
        options={[
          { id: 'yes', label: JOB_BLOCK.yes },
          { id: 'unsure', label: JOB_BLOCK.unsure },
        ]}
        onPick={(id) => onSubmit({ blockTime: id === 'yes' ? 'yes' : 'unsure' })}
      />
    );
  }
  if (step === 'start') {
    return (
      <Choices
        options={[
          { id: 'a', label: JOB_BLOCK.figure },
          { id: 'b', label: JOB_BLOCK.resume },
          { id: 'own', label: JOB_BLOCK.own },
        ]}
        onPick={(id) => onSubmit({ startWith: id === 'b' ? 'b' : id === 'own' ? 'own' : 'a' })}
      />
    );
  }
  if (step === 'coach') {
    return <CoachStep job={job} onDraft={onDraft} onSubmit={onSubmit} />;
  }
  if (step === 'card') {
    return <CardStep job={job} saving={saving} onDraft={onDraft} onSubmit={onSubmit} />;
  }
  if (step === 'helper') {
    return (
      <Choices
        options={[
          { id: 'friend', label: JOB_HELPER.friend },
          { id: 'classmate', label: JOB_HELPER.classmate },
          { id: 'family', label: JOB_HELPER.family },
          { id: 'hunter', label: JOB_HELPER.hunter },
          { id: 'unsure', label: JOB_HELPER.unsure },
        ]}
        onPick={(helper) => onSubmit({ helper })}
      />
    );
  }
  if (step === 'invite') {
    return (
      <Choices
        options={[
          { id: 'now', label: JOB_HELPER.invite },
          { id: 'later', label: JOB_HELPER.later },
        ]}
        onPick={(id) => onSubmit({ invite: id === 'now' ? 'now' : 'later' })}
      />
    );
  }
  if (step === 'helperLater') {
    return <NextButton label="Next" disabled={saving} onPress={() => onSubmit({})} />;
  }
  return (
    <Choices
      options={[
        { id: 'lots', label: JOB_LEVEL.lots },
        { id: 'occasional', label: JOB_LEVEL.occasional },
        { id: 'self', label: JOB_LEVEL.self },
      ]}
      onPick={(id) => onSubmit({ level: id as MayaLevel, levelChosen: true })}
    />
  );
}

function WhyStep({
  job,
  saving,
  onSubmit,
}: {
  job: JobDraft;
  saving: boolean;
  onSubmit: (patch: Partial<JobDraft>) => void;
}) {
  const poke = useKeyboardPoke();
  const inputRef = useRef<TextInputInstance>(null);
  const [text, setText] = useState(job.why);
  const [open, setOpen] = useState(job.why.trim().length > 0);
  useEffect(() => {
    setText(job.why);
    if (job.why.trim().length > 0) {
      setOpen(true);
    }
  }, [job.why]);
  useEffect(() => {
    if (!open) {
      return;
    }
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);
  const reveal = (value: string) => {
    setText(value);
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  return (
    <KeyboardAnswer mode="tail" style={styles.stack}>
      <View style={styles.chips}>
        <Chip label={JOB_WHY.tuition} onPress={() => reveal(JOB_WHY.tuition)} />
        <Chip label={JOB_WHY.care} onPress={() => reveal(JOB_WHY.care)} />
        <Chip label={JOB_WHY.own} onPress={() => reveal('')} />
      </View>
      {open ? (
        <>
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            onFocus={poke}
            onContentSizeChange={poke}
            autoFocus
            multiline
            maxLength={400}
            textAlignVertical="top"
            style={styles.input}
            accessibilityLabel={JOB_WHY.prompt}
          />
          <NextButton
            label="Next"
            disabled={saving || text.trim().length === 0}
            onPress={() => onSubmit({ why: text.trim() })}
          />
        </>
      ) : null}
    </KeyboardAnswer>
  );
}

function DateStep({
  saving,
  onSubmit,
}: {
  saving: boolean;
  onSubmit: (patch: Partial<JobDraft>) => void;
}) {
  const [open, setOpen] = useState(false);
  const choose = (choice: Exclude<JobDateChoice, 'pick'>) => {
    onSubmit({ dateChoice: choice, targetDate: jobDateFor(choice) });
  };
  return (
    <View style={styles.stack}>
      <Choices
        options={[
          { id: 'semester', label: JOB_DATE.semester },
          { id: 'summer', label: JOB_DATE.summer },
          { id: '3', label: JOB_DATE.three },
          { id: '6', label: JOB_DATE.six },
          { id: 'pick', label: JOB_DATE.pick },
        ]}
        onPick={(id) => {
          if (id === 'pick') {
            setOpen(true);
            return;
          }
          choose(id as Exclude<JobDateChoice, 'pick'>);
        }}
      />
      {open ? (
        <DatePickerModal
          title={JOB_DATE.pick}
          value={parseLocalDate(todayLocal())}
          minimumDate={parseLocalDate(todayLocal())}
          onCancel={() => setOpen(false)}
          onConfirm={(date) => {
            setOpen(false);
            if (saving) {
              return;
            }
            onSubmit({ dateChoice: 'pick', targetDate: toLocalDateString(date) });
          }}
        />
      ) : null}
    </View>
  );
}

function CoachStep({
  job,
  onDraft,
  onSubmit,
}: {
  job: JobDraft;
  onDraft: (patch: Partial<JobDraft>) => void;
  onSubmit: (patch: Partial<JobDraft>) => void;
}) {
  const follow = resolvedFollow(job);
  const shape = {
    focusKey: 'job',
    steps: job.steps,
    title: job.title,
    targetDate: job.targetDate ?? todayLocal(),
    habitChoice: null,
    habitCustom: '',
    days: [] as number[],
    helper: null,
    level: job.level,
    habitSkipped: true,
  };
  return (
    <MayaCoachCard
      draft={shape}
      onDraft={(next) => onDraft({ steps: next.steps })}
      onNext={() => onSubmit({})}
      beforeNext={
        follow && JOB_FOLLOWS[follow].warning ? (
          <View style={styles.warning}>
            <Text style={styles.warningText}>{JOB_AI_WARNING}</Text>
          </View>
        ) : null
      }
    />
  );
}

function CardStep({
  job,
  saving,
  onDraft,
  onSubmit,
}: {
  job: JobDraft;
  saving: boolean;
  onDraft: (patch: Partial<JobDraft>) => void;
  onSubmit: (patch: Partial<JobDraft>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const time = jobTimeLine(job);
  const branches = jobCardLines(job);
  return (
    <View style={styles.stack}>
      <View style={styles.card}>
        {editing ? (
          <TextInput
            value={job.title}
            onChangeText={(title) => onDraft({ title })}
            maxLength={120}
            style={styles.titleInput}
            accessibilityLabel={JOB_CARD.goalTitle}
          />
        ) : (
          <Text style={styles.cardTitle}>{jobTitleLine(job)}</Text>
        )}
        {editing ? (
          <Pressable
            onPress={() => setOpen(true)}
            style={styles.dateRow}
            accessibilityRole="button"
            accessibilityLabel={JOB_DATE.pick}
          >
            <Text style={styles.dateValue}>{job.targetDate ? jobTitleLine(job) : JOB_DATE.pick}</Text>
          </Pressable>
        ) : null}
        {time ? <Text style={styles.cardLine}>{time}</Text> : null}
        {branches.map((branch) => (
          <View key={branch.title} style={styles.branch}>
            <Text style={styles.cardLine}>{branch.title}</Text>
            {editing
              ? null
              : branch.steps.map((item) => (
                  <Text key={item} style={styles.step}>
                    {'• '}
                    {item}
                  </Text>
                ))}
          </View>
        ))}
        {editing ? (
          <StepEditor steps={job.steps} onChange={(steps) => onDraft({ steps })} onDone={() => setEditing(false)} />
        ) : null}
      </View>
      <NextButton label={JOB_CARD.looksRight} disabled={saving || job.title.trim().length === 0} onPress={() => onSubmit({})} />
      <NextButton label={JOB_CARD.edit} disabled={saving} onPress={() => setEditing((value) => !value)} />
      {open ? (
        <DatePickerModal
          title={JOB_DATE.pick}
          value={job.targetDate ? parseLocalDate(job.targetDate) : parseLocalDate(todayLocal())}
          minimumDate={parseLocalDate(todayLocal())}
          onCancel={() => setOpen(false)}
          onConfirm={(date) => {
            setOpen(false);
            onDraft({ targetDate: toLocalDateString(date), dateChoice: 'pick' });
          }}
        />
      ) : null}
    </View>
  );
}

function StepEditor({
  steps,
  onChange,
  onDone,
}: {
  steps: StepDraft[];
  onChange: (steps: StepDraft[]) => void;
  onDone: () => void;
}) {
  return (
    <MayaCoachCard
      draft={{
        focusKey: 'job-edit',
        steps,
        title: JOB_CARD.goalTitle,
        targetDate: todayLocal(),
        habitChoice: null,
        habitCustom: '',
        days: [],
        helper: null,
        level: 'occasional',
        habitSkipped: true,
      }}
      onDraft={(next) => onChange(next.steps)}
      onNext={onDone}
    />
  );
}

function Scale({ onPick }: { onPick: (value: number) => void }) {
  const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  return (
    <View style={styles.scale}>
      {numbers.map((value) => (
        <Pressable
          key={value}
          onPress={() => onPick(value)}
          style={styles.scaleChip}
          accessibilityRole="button"
          accessibilityLabel={String(value)}
        >
          <Text style={styles.scaleText}>{value}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Choices({
  options,
  selected,
  onPick,
}: {
  options: Array<{ id: string; label: string }>;
  selected?: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <View style={styles.chips}>
      {options.map((option) => (
        <Chip
          key={option.id}
          label={option.label}
          selected={selected === option.id}
          onPress={() => onPick(option.id)}
        />
      ))}
    </View>
  );
}

function Chip({
  label,
  selected = false,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipOn]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
    >
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

function NextButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={styles.choice}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <Text style={[styles.choiceText, disabled && styles.choiceTextOff]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '100%',
  },
  chipOn: { backgroundColor: '#007aff' },
  chipText: { fontSize: 17, color: '#111' },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  choice: {
    backgroundColor: '#fff',
    borderRadius: 14,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceText: { fontSize: 17, fontWeight: '600', color: '#007aff', textAlign: 'center' },
  choiceTextOff: { color: '#c7c7cc' },
  input: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 96,
    fontSize: 17,
    lineHeight: 24,
    color: '#111',
  },
  scale: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  scaleChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scaleText: { fontSize: 17, color: '#111' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 14, gap: 8 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#111' },
  cardLine: { fontSize: 17, lineHeight: 24, color: '#111' },
  step: { fontSize: 16, lineHeight: 22, color: '#111', paddingLeft: 8 },
  branch: { gap: 4 },
  titleInput: { fontSize: 20, fontWeight: '700', color: '#111', padding: 0 },
  dateRow: { paddingVertical: 4 },
  dateValue: { fontSize: 17, color: '#007aff' },
  warning: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  warningText: { fontSize: 17, lineHeight: 24, color: '#111' },
});
