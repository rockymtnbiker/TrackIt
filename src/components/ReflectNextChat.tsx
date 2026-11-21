import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { REFLECT_FLOW } from '../constants/maya/reflectFlow';
import { REFLECTION_COPY } from '../constants/reflection';
import { KeyboardAnswer, useKeyboardPoke } from '../lib/keyboardScroll';
import { todayLocal } from '../lib/localDate';
import type { StepDraft } from '../lib/mayaShape';
import { REFLECT_MAYA } from '../lib/reflection';
import {
  JOB_AI_WARNING,
  saveBranchSteps,
  saveWalkSteps,
} from '../lib/reflectNextSteps';
import { keptStepTitles } from '../lib/mayaShape';
import type { Goal } from '../types/goal';
import { KeyboardSafe } from './KeyboardSafe';
import { MayaCoachCard } from './MayaShapeView';

type BranchProps = {
  mode: 'branch';
  subject: string;
  parentId: string;
  coaching: string;
  suggestions: string[];
  warning: boolean;
};

type WalkProps = {
  mode: 'walk';
  subject: string;
  goalId: string;
  branched: boolean;
};

type Props = (BranchProps | WalkProps) & {
  onDone: (created: Goal[]) => void;
  onDismiss: () => void;
};

export function ReflectNextChat(props: Props) {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<'ask' | 'steps' | 'done'>(props.mode === 'branch' ? 'steps' : 'ask');
  const [answer, setAnswer] = useState('');
  const [added, setAdded] = useState<string[]>([]);
  const [draftStep, setDraftStep] = useState('');
  const [steps, setSteps] = useState<StepDraft[]>(() =>
    props.mode === 'branch'
      ? props.suggestions.map((text, index) => ({ id: `suggest-${index}`, text, checked: true }))
      : [],
  );
  const [saving, setSaving] = useState(false);
  const savingLock = useRef(false);
  const finished = useRef(false);
  const [created, setCreated] = useState<Goal[]>([]);
  const poke = useKeyboardPoke();

  const close = () => {
    if (savingLock.current && !finished.current) {
      return;
    }
    if (finished.current) {
      props.onDone(created);
      return;
    }
    props.onDismiss();
  };

  const confirmBranch = async () => {
    if (props.mode !== 'branch' || savingLock.current) {
      return;
    }
    savingLock.current = true;
    const titles = keptStepTitles({
      focusKey: 'reflect-next',
      steps,
      title: '',
      targetDate: todayLocal(),
      habitChoice: null,
      habitCustom: '',
      days: [],
      helper: null,
      level: 'occasional',
      habitSkipped: true,
    });
    setSaving(true);
    try {
      const saved = await saveBranchSteps(props.parentId, titles, todayLocal());
      finished.current = true;
      setCreated(saved);
      setPhase('done');
    } catch (error) {
      Alert.alert(
        REFLECTION_COPY.couldNotSave,
        error instanceof Error ? error.message : REFLECTION_COPY.couldNotSave,
      );
    } finally {
      if (!finished.current) {
        savingLock.current = false;
      }
      setSaving(false);
    }
  };

  const confirmWalk = async () => {
    if (props.mode !== 'walk' || savingLock.current || added.length === 0) {
      return;
    }
    savingLock.current = true;
    setSaving(true);
    try {
      const saved = await saveWalkSteps({
        goalId: props.goalId,
        branched: props.branched,
        answer: answer.trim(),
        steps: added,
        today: todayLocal(),
      });
      finished.current = true;
      setCreated(saved);
      setPhase('done');
    } catch (error) {
      Alert.alert(
        REFLECTION_COPY.couldNotSave,
        error instanceof Error ? error.message : REFLECTION_COPY.couldNotSave,
      );
    } finally {
      if (!finished.current) {
        savingLock.current = false;
      }
      setSaving(false);
    }
  };

  const addStep = () => {
    const text = draftStep.trim();
    if (!text || saving) {
      return;
    }
    setAdded((current) => [...current, text]);
    setDraftStep('');
  };

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={close}
    >
      <KeyboardSafe style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable
            onPress={close}
            hitSlop={8}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel={REFLECTION_COPY.close}
          >
            <Ionicons name="close" size={26} color="#007aff" />
          </Pressable>
          <Text style={styles.headerTitle}>{REFLECT_MAYA.name}</Text>
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
        >
          {props.mode === 'branch' ? (
            <Bubble text={props.coaching} />
          ) : (
            <Bubble text={REFLECT_FLOW.r3c.figure.replace('[goal]', props.subject)} />
          )}
          {props.mode === 'walk' && phase !== 'ask' ? (
            <View style={styles.userWrap}>
              <View style={styles.userBubble}>
                <Text style={styles.userText}>{answer.trim()}</Text>
              </View>
            </View>
          ) : null}
          {props.mode === 'walk' && phase === 'ask' ? (
            <KeyboardAnswer mode="tail" style={styles.stack}>
              <TextInput
                value={answer}
                onChangeText={setAnswer}
                onFocus={poke}
                onContentSizeChange={poke}
                placeholder={REFLECT_FLOW.r3c.example}
                placeholderTextColor="#8e8e93"
                multiline
                maxLength={240}
                textAlignVertical="top"
                style={styles.input}
                accessibilityLabel={REFLECT_FLOW.r3c.example}
              />
              <Choice
                label="Next"
                disabled={saving || answer.trim().length === 0}
                onPress={() => setPhase('steps')}
              />
            </KeyboardAnswer>
          ) : null}
          {props.mode === 'walk' && phase !== 'ask' ? <Bubble text={REFLECT_FLOW.r3c.firstSteps} /> : null}
          {props.mode === 'walk' && phase === 'steps' ? (
            <KeyboardAnswer mode="tail" style={styles.stack}>
              {added.map((title, index) => (
                <Text key={`${index}-${title}`} style={styles.added}>
                  {'• '}
                  {title}
                </Text>
              ))}
              <TextInput
                value={draftStep}
                onChangeText={setDraftStep}
                onFocus={poke}
                onContentSizeChange={poke}
                multiline
                maxLength={240}
                textAlignVertical="top"
                style={styles.input}
                accessibilityLabel={REFLECT_FLOW.r3c.addOne}
              />
              <View style={styles.row}>
                <Choice label={REFLECT_FLOW.r3c.addOne} disabled={saving || draftStep.trim().length === 0} onPress={addStep} />
                <Choice
                  label={REFLECT_FLOW.r3c.thatsIt}
                  disabled={saving || added.length === 0}
                  onPress={() => void confirmWalk()}
                />
              </View>
            </KeyboardAnswer>
          ) : null}
          {props.mode === 'branch' && phase === 'steps' ? (
            <MayaCoachCard
              draft={{
                focusKey: 'reflect-next',
                steps,
                title: '',
                targetDate: todayLocal(),
                habitChoice: null,
                habitCustom: '',
                days: [],
                helper: null,
                level: 'occasional',
                habitSkipped: true,
              }}
              onDraft={(next) => {
                if (!saving) {
                  setSteps(next.steps);
                }
              }}
              onNext={() => void confirmBranch()}
              actionLabel={REFLECT_FLOW.r3c.confirm}
              beforeNext={
                props.warning ? (
                  <View style={styles.warning}>
                    <Text style={styles.warningText}>{JOB_AI_WARNING}</Text>
                  </View>
                ) : null
              }
            />
          ) : null}
          {phase === 'done' ? (
            <>
              <Bubble
                text={
                  props.mode === 'branch'
                    ? REFLECT_FLOW.r3c.ready.replace('[branch]', props.subject)
                    : REFLECT_FLOW.r3c.nice
                }
              />
              <Choice label={REFLECT_FLOW.r3c.back} disabled={saving} onPress={() => props.onDone(created)} />
            </>
          ) : null}
        </ScrollView>
      </KeyboardSafe>
    </Modal>
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

function Choice({
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
      style={({ pressed }) => [styles.choice, pressed && !disabled && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
    >
      <Text style={[styles.choiceText, disabled && styles.choiceTextOff]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f2f2f7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f2f2f7',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111',
  },
  scroll: {
    flex: 1,
    backgroundColor: '#f2f2f7',
  },
  content: {
    padding: 16,
    gap: 12,
  },
  stack: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
  userWrap: {
    alignSelf: 'flex-end',
    maxWidth: '82%',
  },
  userBubble: {
    backgroundColor: '#007aff',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userText: {
    fontSize: 17,
    lineHeight: 24,
    color: '#fff',
  },
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
  added: {
    fontSize: 17,
    lineHeight: 24,
    color: '#111',
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
  pressed: {
    opacity: 0.6,
  },
  warning: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  warningText: {
    fontSize: 17,
    lineHeight: 24,
    color: '#111',
  },
});
