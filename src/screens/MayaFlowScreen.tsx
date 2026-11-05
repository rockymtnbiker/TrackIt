import { CommonActions } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardSafe } from '../components/KeyboardSafe';
import { MayaShapeView } from '../components/MayaShapeView';
import { MAYA_CLOSING, closingHello } from '../constants/maya/closing';
import { MAYA_DISCOVER, type MayaNode, type MayaOption } from '../constants/maya/discover';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import {
  advanceEnabled,
  advanceLabel,
  historyBack,
  historyForward,
  nodeById,
  previousNode,
  renderNodeText,
  resolveNext,
  startHistory,
  visibleOptions,
  type MayaAnswers,
} from '../lib/mayaFlow';
import {
  canAdvanceShape,
  createShapeDraft,
  focusKey,
  forwardShape,
  historyToStart,
  saveShapedGoal,
  startShapeHistory,
  type ShapeDraft,
  type ShapeStepId,
} from '../lib/mayaShape';
import { saveMayaHelper } from '../lib/mayaHelper';
import { getDisplayName } from '../lib/profileApi';
import type { CommunityStackParamList } from '../navigation/CommunityStackNavigator';

type Props = NativeStackScreenProps<CommunityStackParamList, 'Maya'>;

function saveError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Something went wrong. Try again.';
}

export default function MayaFlowScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { settings, updateSettings } = useSettings();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const moving = useRef(false);
  const savedGoalId = useRef<string | null>(null);
  const now = useMemo(() => new Date(), []);
  const [name, setName] = useState('');
  const [history, setHistory] = useState<string[]>(() => startHistory(MAYA_DISCOVER));
  const [answers, setAnswers] = useState<MayaAnswers>({});
  const [phase, setPhase] = useState<'discover' | 'shape' | 'closing'>('discover');
  const [shapeHistory, setShapeHistory] = useState<ShapeStepId[]>([]);
  const [shapeDraft, setShapeDraft] = useState<ShapeDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const currentId = history[history.length - 1] ?? MAYA_DISCOVER.startId;
  const node = nodeById(MAYA_DISCOVER, currentId);
  const shapeStep = shapeHistory[shapeHistory.length - 1] ?? null;
  const showingShape = phase === 'shape' && shapeDraft != null && shapeStep != null;

  useEffect(() => {
    let cancelled = false;
    getDisplayName()
      .then((displayName) => {
        if (!cancelled) {
          setName(displayName);
        }
      })
      .catch(() => {
        // The intro still reads clearly without a name.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    moving.current = false;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [currentId, phase, shapeStep]);

  const openSetup = useCallback(() => {
    const tab = navigation.getParent();
    navigation.goBack();
    tab?.dispatch(
      CommonActions.navigate({
        name: 'Goals',
        params: { screen: 'GoalSetup' },
      }),
    );
  }, [navigation]);

  const openSavedGoal = useCallback(() => {
    const goalId = savedGoalId.current;
    if (!goalId) {
      return;
    }
    navigation.dispatch(
      CommonActions.reset({
        index: 1,
        routes: [
          { name: 'CommunityMain' },
          { name: 'Goal', params: { goalId } },
        ],
      }),
    );
  }, [navigation]);

  const confirmLeave = useCallback(() => {
    if (saving) {
      return;
    }
    if (phase === 'closing') {
      openSavedGoal();
      return;
    }
    Alert.alert('Leave Maya?', "Your answers won't be saved.", [
      { text: 'Stay', style: 'cancel' },
      { text: 'Leave', onPress: openSetup },
    ]);
  }, [openSavedGoal, openSetup, phase, saving]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={confirmLeave}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      ),
    });
  }, [navigation, confirmLeave]);

  const enterShape = () => {
    const key = focusKey(answers);
    setShapeDraft((current) => (current && current.focusKey === key ? current : createShapeDraft(answers)));
    setShapeHistory(startShapeHistory(answers));
    savedGoalId.current = null;
    setPhase('shape');
  };

  if (!showingShape && !node) {
    return null;
  }

  const text = node ? renderNodeText(MAYA_DISCOVER, node, answers, { name, now }) : '';
  const options = node ? visibleOptions(MAYA_DISCOVER, node, answers) : [];
  const label = showingShape
    ? shapeStep === 'summary'
      ? null
      : 'Next'
    : node
      ? advanceLabel(node, answers)
      : null;
  const canAdvance = showingShape
    ? shapeDraft != null && shapeStep != null && canAdvanceShape(shapeStep, shapeDraft, answers) && !saving
    : node
      ? advanceEnabled(node, answers)
      : false;
  const showBack =
    phase !== 'closing' &&
    (showingShape || (node != null && previousNode(MAYA_DISCOVER, history) != null));

  const go = (step: ReturnType<typeof resolveNext>) => {
    if (step.type === 'stay' || moving.current) {
      return;
    }
    moving.current = true;
    if (step.type === 'shape') {
      enterShape();
      return;
    }
    if (step.type === 'node') {
      setHistory((current) => historyForward(current, step.id));
      return;
    }
    if (step.type === 'setup') {
      openSetup();
      return;
    }
    navigation.goBack();
  };

  const choose = (option: MayaOption) => {
    if (!node) {
      return;
    }
    const nextAnswers = { ...answers, [node.id]: option.id };
    setAnswers(nextAnswers);
    go(resolveNext(MAYA_DISCOVER, node, nextAnswers));
  };

  const advance = () => {
    if (showingShape && shapeDraft && shapeStep) {
      if (!canAdvance || moving.current) {
        return;
      }
      moving.current = true;
      setShapeHistory((current) => forwardShape(current, answers));
      return;
    }
    if (!node) {
      return;
    }
    if (label === 'Skip') {
      const nextAnswers = { ...answers };
      delete nextAnswers[node.id];
      setAnswers(nextAnswers);
      go(resolveNext(MAYA_DISCOVER, node, nextAnswers));
      return;
    }
    go(resolveNext(MAYA_DISCOVER, node, answers));
  };

  const goBack = () => {
    if (!showBack || moving.current || saving) {
      return;
    }
    moving.current = true;
    if (showingShape) {
      savedGoalId.current = null;
      if (shapeHistory.length > 1) {
        setShapeHistory((current) => current.slice(0, -1));
        return;
      }
      setPhase('discover');
      return;
    }
    setHistory((current) => historyBack(current));
  };

  const saveGoal = () => {
    if (!shapeDraft || saving) {
      return;
    }
    setSaving(true);
    const draft = shapeDraft;
    void (async () => {
      try {
        let goalId = savedGoalId.current;
        if (!goalId) {
          goalId = await saveShapedGoal(answers, draft);
          savedGoalId.current = goalId;
        }
        await updateSettings({ mayaLevel: draft.level });
        if (user?.id) {
          await saveMayaHelper(user.id, goalId, draft.helper);
        }
        setPhase('closing');
      } catch (error) {
        Alert.alert('Could not save your goal', saveError(error));
      } finally {
        setSaving(false);
      }
    })();
  };

  return (
    <KeyboardSafe style={styles.screen}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {phase === 'closing' ? (
          <View style={styles.discover}>
            <View style={styles.bubbleRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>M</Text>
              </View>
              <View style={styles.bubble}>
                <Text style={styles.bubbleText}>{closingHello(name)}</Text>
              </View>
            </View>
            <View style={styles.bubbleRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>M</Text>
              </View>
              <View style={styles.bubble}>
                <Text style={styles.bubbleText}>{MAYA_CLOSING.coach}</Text>
              </View>
            </View>
            <View style={styles.choices}>
              <Pressable
                onPress={() => navigation.popTo('CommunityMain', { openSupport: 'setup' })}
                style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={MAYA_CLOSING.talk}
              >
                <Text style={styles.choiceText}>{MAYA_CLOSING.talk}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const keep = new Set<string>([MAYA_DISCOVER.startId, 'age', 'week', 'temp']);
                  setAnswers((current) => {
                    const next: MayaAnswers = {};
                    for (const [id, value] of Object.entries(current)) {
                      if (keep.has(id)) {
                        next[id] = value;
                      }
                    }
                    return next;
                  });
                  setHistory([MAYA_DISCOVER.startId, 'age', 'week', 'temp', MAYA_DISCOVER.areaId]);
                  setShapeDraft(null);
                  setShapeHistory([]);
                  savedGoalId.current = null;
                  setPhase('discover');
                }}
                style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={MAYA_CLOSING.another}
              >
                <Text style={styles.choiceText}>{MAYA_CLOSING.another}</Text>
              </Pressable>
              <Pressable
                onPress={openSavedGoal}
                style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={MAYA_CLOSING.done}
              >
                <Text style={styles.choiceText}>{MAYA_CLOSING.done}</Text>
              </Pressable>
            </View>
          </View>
        ) : showingShape && shapeDraft && shapeStep ? (
          <MayaShapeView
            step={shapeStep}
            draft={shapeDraft}
            answers={answers}
            weekStart={settings.weekStart}
            saving={saving}
            onDraft={setShapeDraft}
            onLooksGood={saveGoal}
            onChangeSomething={() => {
              if (saving) {
                return;
              }
              savedGoalId.current = null;
              setShapeHistory((current) => historyToStart(current, answers));
            }}
          />
        ) : node ? (
          <View style={styles.discover}>
            <View style={styles.bubbleRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>M</Text>
              </View>
              <View style={styles.bubble}>
                <Text style={styles.bubbleText}>{text}</Text>
              </View>
            </View>
            <AnswerControls
              node={node}
              options={options}
              answers={answers}
              onChoose={choose}
              onChange={(value) => setAnswers((current) => ({ ...current, [node.id]: value }))}
            />
          </View>
        ) : null}
      </ScrollView>
      {showBack || label ? (
        <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {showBack ? (
            <Pressable
              onPress={goBack}
              hitSlop={8}
              style={styles.barHit}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Text style={styles.barButton}>Back</Text>
            </Pressable>
          ) : (
            <View />
          )}
          {label ? (
            <Pressable
              onPress={advance}
              disabled={!canAdvance}
              hitSlop={8}
              style={styles.barHit}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ disabled: !canAdvance }}
            >
              <Text style={[styles.barButton, !canAdvance && styles.barButtonOff]}>{label}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </KeyboardSafe>
  );
}

function AnswerControls({
  node,
  options,
  answers,
  onChoose,
  onChange,
}: {
  node: MayaNode;
  options: MayaOption[];
  answers: MayaAnswers;
  onChoose: (option: MayaOption) => void;
  onChange: (value: string | string[] | number) => void;
}) {
  if (node.kind === 'message' || node.kind === 'playback') {
    return (
      <View style={styles.choices}>
        {options.map((option) => (
          <Pressable
            key={option.id}
            onPress={() => onChoose(option)}
            style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={option.label}
          >
            <Text style={styles.choiceText}>{option.label}</Text>
          </Pressable>
        ))}
      </View>
    );
  }

  if (node.kind === 'single' || node.kind === 'multi') {
    const selected = answers[node.id];
    const selectedIds = Array.isArray(selected)
      ? selected
      : typeof selected === 'string'
        ? [selected]
        : [];
    return (
      <View style={styles.choices}>
        {options.map((option) => {
          const on = selectedIds.includes(option.id);
          return (
            <Pressable
              key={option.id}
              onPress={() => {
                if (node.kind === 'multi') {
                  const next = on
                    ? selectedIds.filter((id) => id !== option.id)
                    : [...selectedIds, option.id];
                  onChange(next);
                  return;
                }
                onChange(option.id);
              }}
              style={({ pressed }) => [
                styles.option,
                on && styles.optionOn,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.optionText, on && styles.optionTextOn]}>{option.label}</Text>
              {node.kind === 'multi' ? (
                <Ionicons
                  name={on ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={on ? '#007aff' : '#c7c7cc'}
                />
              ) : on ? (
                <Ionicons name="checkmark" size={20} color="#007aff" />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    );
  }

  if (node.kind === 'text') {
    const stored = answers[node.id];
    const value = typeof stored === 'string' ? stored : '';
    return (
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={node.placeholder}
        placeholderTextColor="#8e8e93"
        multiline
        maxLength={400}
        textAlignVertical="top"
        style={styles.input}
        accessibilityLabel={node.placeholder ?? 'Your answer'}
      />
    );
  }

  const min = node.scaleMin ?? 1;
  const max = node.scaleMax ?? 10;
  const selected = typeof answers[node.id] === 'number' ? answers[node.id] : null;
  const numbers = [];
  for (let value = min; value <= max; value += 1) {
    numbers.push(value);
  }
  return (
    <View style={styles.scale}>
      {numbers.map((value) => {
        const on = selected === value;
        return (
          <Pressable
            key={value}
            onPress={() => onChange(value)}
            style={({ pressed }) => [styles.scaleChip, on && styles.scaleChipOn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={String(value)}
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.scaleText, on && styles.scaleTextOn]}>{value}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f2f2f7',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 24,
    gap: 16,
  },
  discover: {
    gap: 16,
  },
  cancel: {
    fontSize: 17,
    color: '#007aff',
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
  scale: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  scaleChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scaleChipOn: {
    backgroundColor: '#007aff',
  },
  scaleText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111',
  },
  scaleTextOn: {
    color: '#fff',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5ea',
    backgroundColor: '#f2f2f7',
  },
  barHit: {
    minHeight: 44,
    justifyContent: 'center',
  },
  barButton: {
    fontSize: 17,
    fontWeight: '600',
    color: '#007aff',
  },
  barButtonOff: {
    color: '#c7c7cc',
  },
  pressed: {
    opacity: 0.55,
  },
});
