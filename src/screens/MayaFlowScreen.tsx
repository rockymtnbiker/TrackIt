import { CommonActions } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardSafe } from '../components/KeyboardSafe';
import {
  MayaCoachCard,
  MayaHabitCard,
  MayaPlanCard,
  MayaSummaryCard,
} from '../components/MayaShapeView';
import { MAYA_CLOSING, closingHello, closingSeeYou } from '../constants/maya/closing';
import { MAYA_DISCOVER, type MayaNode } from '../constants/maya/discover';
import { HELPER_OPTIONS, LEVEL_OPTIONS, SHAPE_COPY } from '../constants/maya/shape';
import { WEEKDAY_NAMES } from '../lib/goalDetailText';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import {
  areaCommitted,
  continueWalk,
  currentDiscoverNode,
  discoverAnswerLabel,
  initialWalk,
  nextGoalWalk,
  rewindWalk,
  stepCompleted,
  stepReached,
  type MayaWalk,
  type StepRef,
  type WalkOptions,
} from '../lib/mayaChat';
import {
  isAnswered,
  nodeById,
  renderNodeText,
  visibleOptions,
  type MayaAnswers,
} from '../lib/mayaFlow';
import { getMayaLevelAsked, markMayaLevelAsked, saveMayaHelper } from '../lib/mayaHelper';
import {
  coachingScript,
  habitCopy,
  habitIsReady,
  habitSummaryLine,
  keptStepTitles,
  savePartialMayaGoal,
  saveShapedGoal,
  whyText,
  type ShapeDraft,
  type ShapeStepId,
} from '../lib/mayaShape';
import { ageRangeFromChoice, getAgeRange, getDisplayName, markOnboarded, saveAgeRange } from '../lib/profileApi';
import type { MayaLevel } from '../lib/settingsApi';
import type { CommunityStackParamList } from '../navigation/CommunityStackNavigator';
import { finishOnboarding, finishOnboardingToCoach } from '../navigation/onboardingHandoff';
import { formatDateMDY } from '../utils/date';

type Props = NativeStackScreenProps<CommunityStackParamList, 'Maya'>;

type Line = { text: string; note?: string };

type Described = {
  before: Line[];
  after: Line[];
  user: string | null;
  card: string | null;
};

type Frozen =
  | { kind: 'maya'; text: string; note?: string }
  | { kind: 'user'; text: string }
  | { kind: 'card'; text: string }
  | { kind: 'divider'; label: string };

const TYPING_MS = 400;

function saveError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Something went wrong. Try again.';
}

function temperatureLine(answers: MayaAnswers): string | null {
  if (answers.temp === 'stretched') {
    return SHAPE_COPY.tempStretched;
  }
  if (answers.temp === 'stuck') {
    return SHAPE_COPY.tempStuck;
  }
  if (answers.temp === 'level-up') {
    return SHAPE_COPY.tempLevelUp;
  }
  return null;
}

export default function MayaFlowScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { settings, updateSettings } = useSettings();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const lock = useRef(false);
  const saveLock = useRef(false);
  const savedGoalId = useRef<string | null>(null);
  const lastSavedId = useRef<string | null>(null);
  const fromOnboarding = (navigation.getState().routeNames as string[]).includes('FirstGoal');
  const ageKnownRef = useRef(false);
  const askLevelRef = useRef(true);
  const levelAskedRef = useRef(false);
  const [name, setName] = useState('');
  const [profileReady, setProfileReady] = useState(false);
  const [walk, setWalk] = useState<MayaWalk>(() => initialWalk());
  const walkRef = useRef(walk);
  walkRef.current = walk;
  const [revealed, setRevealed] = useState(0);
  const [closing, setClosing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [archive, setArchive] = useState<Frozen[]>([]);
  const [goalNumber, setGoalNumber] = useState(1);

  useEffect(() => {
    lock.current = false;
  });

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
    let cancelled = false;
    void (async () => {
      const [age, asked] = await Promise.all([
        getAgeRange().catch(() => null),
        user?.id ? getMayaLevelAsked(user.id).catch(() => false) : Promise.resolve(false),
      ]);
      if (cancelled) {
        return;
      }
      ageKnownRef.current = age != null;
      levelAskedRef.current = asked;
      askLevelRef.current = !asked;
      setProfileReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const visibleEnd = closing ? walk.path.length + 3 : walk.cursor + 1;
  const shown = Math.min(revealed, visibleEnd);
  const stepCount = Math.min(shown, closing ? walk.path.length : walk.cursor + 1);
  const closingCount = closing ? Math.max(0, shown - walk.path.length) : 0;
  const typing = shown < visibleEnd;

  useEffect(() => {
    if (revealed >= visibleEnd) {
      return;
    }
    const timer = setTimeout(() => {
      setRevealed((value) => value + 1);
    }, TYPING_MS);
    return () => clearTimeout(timer);
  }, [revealed, visibleEnd]);

  const scrollToEnd = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 100000, animated: true });
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [shown, archive.length, closing, scrollToEnd]);

  const walkOptions = useCallback((): WalkOptions => {
    return {
      ageKnown: ageKnownRef.current,
      askLevel: askLevelRef.current,
      level: settings.mayaLevel,
    };
  }, [settings.mayaLevel]);

  const replaceWalk = useCallback((next: MayaWalk) => {
    walkRef.current = next;
    setWalk(next);
  }, []);

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

  const openSavedGoal = useCallback(
    (startEditing = false) => {
      const goalId = savedGoalId.current;
      if (!goalId) {
        navigation.goBack();
        return;
      }
      navigation.dispatch(
        CommonActions.reset({
          index: 1,
          routes: [
            { name: 'CommunityMain' },
            {
              name: 'Goal',
              params: startEditing ? { goalId, startEditing: true } : { goalId },
            },
          ],
        }),
      );
    },
    [navigation],
  );

  const confirmLeave = useCallback(() => {
    if (saving) {
      return;
    }
    if (fromOnboarding) {
      const goalId = lastSavedId.current;
      if (goalId) {
        finishOnboarding(goalId);
        return;
      }
      navigation.goBack();
      return;
    }
    if (closing) {
      openSavedGoal(false);
      return;
    }
    if (areaCommitted(walkRef.current)) {
      setSheet(true);
      return;
    }
    navigation.goBack();
  }, [closing, fromOnboarding, navigation, openSavedGoal, saving]);

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

  const commitWalk = useCallback(
    (next: MayaWalk) => {
      if (lock.current || saving || closing) {
        return;
      }
      lock.current = true;
      replaceWalk(next);
      if (next.action === 'setup') {
        openSetup();
        return;
      }
      if (next.action === 'close') {
        navigation.goBack();
      }
    },
    [closing, navigation, openSetup, replaceWalk, saving],
  );

  const patchDraft = useCallback((draft: ShapeDraft) => {
    const next = { ...walkRef.current, draft };
    walkRef.current = next;
    setWalk(next);
  }, []);

  const patchAnswer = useCallback((id: string, value: MayaAnswers[string]) => {
    const next = {
      ...walkRef.current,
      answers: { ...walkRef.current.answers, [id]: value },
    };
    walkRef.current = next;
    setWalk(next);
  }, []);

  const answerDiscover = useCallback(
    (value: string | string[] | number | null) => {
      const node = currentDiscoverNode(walkRef.current);
      if (!node || !profileReady) {
        return;
      }
      const answers = { ...walkRef.current.answers };
      if (value == null) {
        delete answers[node.id];
      } else {
        answers[node.id] = value;
      }
      if (node.id === 'age' && typeof value === 'string') {
        const stored = ageRangeFromChoice(value) ?? ageRangeFromChoice(
          node.options?.find((option) => option.id === value)?.label ?? '',
        );
        if (stored) {
          void saveAgeRange(stored).catch((error: unknown) => {
            Alert.alert('Could not save your age range', saveError(error));
          });
        }
      }
      commitWalk(continueWalk({ ...walkRef.current, answers }, walkOptions()));
    },
    [commitWalk, profileReady, walkOptions],
  );

  const advanceShape = useCallback(
    (draft?: ShapeDraft) => {
      const current = walkRef.current;
      const nextDraft = draft ?? current.draft;
      if (!nextDraft) {
        return;
      }
      commitWalk(continueWalk({ ...current, draft: nextDraft }, walkOptions()));
    },
    [commitWalk, walkOptions],
  );

  const rewindTo = useCallback(
    (index: number) => {
      if (closing || saving) {
        return;
      }
      const current = walkRef.current;
      if (index < 0 || index >= current.cursor || index >= current.path.length) {
        return;
      }
      replaceWalk(rewindWalk(current, index));
      setRevealed(index + 1);
    },
    [closing, replaceWalk, saving],
  );

  const editSteps = useCallback(() => {
    const index = walkRef.current.path.findIndex(
      (step) => step.kind === 'shape' && step.id === 'coach',
    );
    if (index >= 0) {
      rewindTo(index);
    }
  }, [rewindTo]);

  const saveGoal = useCallback(() => {
    const current = walkRef.current;
    const draft = current.draft;
    if (!draft || saveLock.current || savedGoalId.current) {
      return;
    }
    saveLock.current = true;
    setSaving(true);
    void (async () => {
      try {
        const goalId = await saveShapedGoal(current.answers, draft);
        if (fromOnboarding) {
          await markOnboarded();
        }
        savedGoalId.current = goalId;
        lastSavedId.current = goalId;
        if (askLevelRef.current) {
          await updateSettings({ mayaLevel: draft.level });
        }
        if (user?.id) {
          await saveMayaHelper(user.id, goalId, draft.helper);
        }
        setWalk((value) => ({ ...value, cursor: value.path.length }));
        setClosing(true);
      } catch (error) {
        Alert.alert('Could not save your goal', saveError(error));
      } finally {
        saveLock.current = false;
        setSaving(false);
      }
    })();
  }, [fromOnboarding, updateSettings, user?.id]);

  const saveAndFinish = useCallback(() => {
    if (saveLock.current || savedGoalId.current) {
      return;
    }
    const current = walkRef.current;
    saveLock.current = true;
    setSaving(true);
    void (async () => {
      try {
        const goalId = await savePartialMayaGoal(current.answers, current.draft, {
          coach: stepReached(current, 'shape', 'coach'),
          habit: stepReached(current, 'shape', 'habit'),
        });
        if (current.draft && stepCompleted(current, 'shape', 'level')) {
          await updateSettings({ mayaLevel: current.draft.level });
        }
        if (user?.id && stepCompleted(current, 'shape', 'helper')) {
          await saveMayaHelper(user.id, goalId, current.draft?.helper ?? null);
        }
        if (fromOnboarding) {
          await markOnboarded();
        }
        savedGoalId.current = goalId;
        lastSavedId.current = goalId;
        if (fromOnboarding) {
          finishOnboarding(goalId);
          return;
        }
        openSavedGoal(true);
      } catch (error) {
        Alert.alert('Could not save your goal', saveError(error));
      } finally {
        saveLock.current = false;
        setSaving(false);
      }
    })();
  }, [fromOnboarding, openSavedGoal, updateSettings, user?.id]);

  const describe = useCallback(
    (step: StepRef): Described => {
      const answers = walk.answers;
      const draft = walk.draft;
      if (step.kind === 'discover') {
        const node = nodeById(MAYA_DISCOVER, step.id);
        if (!node) {
          return { before: [], after: [], user: null, card: null };
        }
        const label = discoverAnswerLabel(step.id, answers);
        return {
          before: [{ text: renderNodeText(MAYA_DISCOVER, node, answers, { name }) }],
          after: [],
          user: label || (node.skippable ? 'Skip' : null),
          card: null,
        };
      }
      if (!draft) {
        return { before: [], after: [], user: null, card: null };
      }
      return describeShape(step.id, draft, answers, settings.weekStart);
    },
    [name, settings.weekStart, walk.answers, walk.draft],
  );

  const writeAnother = useCallback(() => {
    const current = walkRef.current;
    const frozen: Frozen[] = [];
    for (const step of current.path) {
      frozen.push(...freezeStep(describe(step)));
    }
    frozen.push({ kind: 'maya', text: closingHello(name) });
    frozen.push({ kind: 'maya', text: closingSeeYou(WEEKDAY_NAMES[settings.reflectionDay]) });
    frozen.push({ kind: 'maya', text: MAYA_CLOSING.coach });
    frozen.push({ kind: 'user', text: MAYA_CLOSING.another });
    const number = goalNumber + 1;
    setArchive((items) => [...items, ...frozen, { kind: 'divider', label: `Goal ${number}` }]);
    setGoalNumber(number);
    askLevelRef.current = !levelAskedRef.current;
    replaceWalk(nextGoalWalk(current.answers));
    setClosing(false);
    setRevealed(0);
    savedGoalId.current = null;
  }, [describe, goalNumber, name, replaceWalk, settings.reflectionDay]);

  const showEditSteps = walk.path.some(
    (step, index) => step.kind === 'shape' && step.id === 'coach' && index < walk.cursor,
  );
  const levelRevisited = walk.cursor < walk.path.length - 1;

  return (
    <KeyboardSafe style={styles.screen}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onContentSizeChange={scrollToEnd}
      >
        {archive.map((item, index) => (
          <FrozenView key={`past-${index}`} item={item} />
        ))}
        {walk.path.slice(0, stepCount).map((step, index) => {
          const isCurrent = !closing && index === walk.cursor;
          const lines = describe(step);
          const showUndo = !closing && !isCurrent && index === walk.cursor - 1 && lines.user != null;
          return (
            <View key={`${goalNumber}-${index}-${step.kind}-${step.id}`} style={styles.step}>
              {lines.before.map((line, lineIndex) => (
                <MayaBubble key={`before-${lineIndex}`} text={line.text} note={line.note} />
              ))}
              {isCurrent && profileReady ? (
                <CurrentStep
                  step={step}
                  walk={walk}
                  weekStart={settings.weekStart}
                  saving={saving}
                  showEditSteps={showEditSteps}
                  levelRevisited={levelRevisited}
                  onAnswer={answerDiscover}
                  onPatchAnswer={patchAnswer}
                  onDraft={patchDraft}
                  onAdvanceShape={advanceShape}
                  onEditSteps={editSteps}
                  onLevel={(id) => {
                    const draft = walkRef.current.draft;
                    if (!draft) {
                      return;
                    }
                    levelAskedRef.current = true;
                    if (user?.id) {
                      void markMayaLevelAsked(user.id);
                    }
                    advanceShape({ ...draft, level: id });
                  }}
                  onLooksGood={saveGoal}
                />
              ) : !isCurrent && step.kind === 'shape' && step.id === 'summary' && walk.draft ? (
                <MayaSummaryCard
                  draft={walk.draft}
                  answers={walk.answers}
                  weekStart={settings.weekStart}
                  saving={false}
                  showActions={false}
                  onLooksGood={() => {}}
                />
              ) : !isCurrent && lines.user ? (
                <View style={styles.userWrap}>
                  <Pressable
                    onPress={() => rewindTo(index)}
                    style={({ pressed }) => [styles.userBubble, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`${lines.user}. Change this answer`}
                  >
                    <Text style={styles.userText}>{lines.user}</Text>
                  </Pressable>
                  {showUndo ? (
                    <Pressable
                      onPress={() => rewindTo(walk.cursor - 1)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={SHAPE_COPY.undo}
                    >
                      <Text style={styles.undo}>{SHAPE_COPY.undo}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
              {lines.after.map((line, lineIndex) => (
                <MayaBubble key={`after-${lineIndex}`} text={line.text} note={line.note} />
              ))}
            </View>
          );
        })}
        {closingCount >= 1 ? <MayaBubble text={closingHello(name)} /> : null}
        {closingCount >= 2 ? (
          <MayaBubble text={closingSeeYou(WEEKDAY_NAMES[settings.reflectionDay])} />
        ) : null}
        {closingCount >= 3 ? (
          <>
            <MayaBubble text={MAYA_CLOSING.coach} />
            <View style={styles.choices}>
              <ChoiceButton
                label={MAYA_CLOSING.talk}
                onPress={() => {
                  if (fromOnboarding) {
                    finishOnboardingToCoach();
                    return;
                  }
                  navigation.popTo('CommunityMain', { openSupport: 'talk' });
                }}
              />
              <ChoiceButton label={MAYA_CLOSING.another} onPress={writeAnother} />
              <ChoiceButton
                label={MAYA_CLOSING.done}
                onPress={() => {
                  const goalId = lastSavedId.current;
                  if (fromOnboarding && goalId) {
                    finishOnboarding(goalId);
                    return;
                  }
                  openSavedGoal(false);
                }}
              />
            </View>
          </>
        ) : null}
        {typing ? <TypingDots /> : null}
      </ScrollView>
      <Modal
        visible={sheet}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!saving) {
            setSheet(false);
          }
        }}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            style={styles.sheetDismiss}
            onPress={() => {
              if (!saving) {
                setSheet(false);
              }
            }}
            accessibilityRole="button"
            accessibilityLabel="Keep going"
          />
          <View style={[styles.sheet, { paddingBottom: 12 + insets.bottom }]}>
            <Pressable
              onPress={saveAndFinish}
              disabled={saving}
              style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Save and finish on my own"
            >
              <Text style={styles.sheetText}>Save and finish on my own</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.goBack()}
              disabled={saving}
              style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Discard"
            >
              <Text style={styles.sheetDiscard}>Discard</Text>
            </Pressable>
            <Pressable
              onPress={() => setSheet(false)}
              disabled={saving}
              style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Keep going"
            >
              <Text style={styles.sheetText}>Keep going</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </KeyboardSafe>
  );
}

function describeShape(
  id: ShapeStepId,
  draft: ShapeDraft,
  answers: MayaAnswers,
  weekStart: 0 | 1,
): Described {
  if (id === 'coach') {
    const script = coachingScript(answers);
    const kept = keptStepTitles(draft);
    return {
      before: [
        ...(script.lead ? [{ text: script.lead }] : []),
        { text: script.steps.length > 0 ? SHAPE_COPY.stepsSuggest : SHAPE_COPY.stepsFirst },
      ],
      after: script.follow ? [{ text: script.follow }] : [],
      user: kept.length > 0 ? kept.join(' · ') : 'No steps kept',
      card: null,
    };
  }
  if (id === 'name') {
    return {
      before: [{ text: SHAPE_COPY.namePrompt }],
      after: [],
      user: `${draft.title.trim()} · ${formatDateMDY(draft.targetDate)}`,
      card: null,
    };
  }
  if (id === 'habit') {
    const script = coachingScript(answers);
    const before: Line[] = [];
    if (script.skipScreen && script.lead) {
      before.push({ text: script.lead });
    }
    const temp = temperatureLine(answers);
    if (temp) {
      before.push({ text: temp });
    }
    const copy = habitCopy(answers);
    const times = copy.kind === 'times';
    before.push({
      text: copy.prompt ?? (times ? SHAPE_COPY.habitTimesPrompt : SHAPE_COPY.habitPrompt),
      note: times ? SHAPE_COPY.habitTimesNote : SHAPE_COPY.habitNote,
    });
    return {
      before,
      after: [],
      user: draft.habitSkipped
        ? SHAPE_COPY.habitSkip
        : habitIsReady(answers, draft)
          ? habitSummaryLine(answers, draft, weekStart)
          : draft.title.trim(),
      card: null,
    };
  }
  if (id === 'helper') {
    return {
      before: [{ text: SHAPE_COPY.helperPrompt }],
      after: [],
      user: HELPER_OPTIONS.find((option) => option.id === draft.helper)?.label ?? '',
      card: null,
    };
  }
  if (id === 'level') {
    return {
      before: [{ text: SHAPE_COPY.levelPrompt }],
      after: [],
      user: LEVEL_OPTIONS.find((option) => option.id === draft.level)?.label ?? '',
      card: null,
    };
  }
  const lines = [draft.title.trim(), formatDateMDY(draft.targetDate)];
  const why = whyText(answers);
  if (why) {
    lines.push(`${SHAPE_COPY.why}: ${why}`);
  }
  for (const step of keptStepTitles(draft)) {
    lines.push(`• ${step}`);
  }
  lines.push(
    habitIsReady(answers, draft)
      ? habitSummaryLine(answers, draft, weekStart)
      : SHAPE_COPY.noTimeBlock,
  );
  return { before: [], after: [], user: null, card: lines.join('\n') };
}

function freezeStep(lines: Described): Frozen[] {
  const items: Frozen[] = [];
  for (const line of lines.before) {
    items.push({ kind: 'maya', text: line.text, note: line.note });
  }
  if (lines.card) {
    items.push({ kind: 'card', text: lines.card });
  } else if (lines.user) {
    items.push({ kind: 'user', text: lines.user });
  }
  for (const line of lines.after) {
    items.push({ kind: 'maya', text: line.text, note: line.note });
  }
  return items;
}

function CurrentStep({
  step,
  walk,
  weekStart,
  saving,
  showEditSteps,
  levelRevisited,
  onAnswer,
  onPatchAnswer,
  onDraft,
  onAdvanceShape,
  onEditSteps,
  onLevel,
  onLooksGood,
}: {
  step: StepRef;
  walk: MayaWalk;
  weekStart: 0 | 1;
  saving: boolean;
  showEditSteps: boolean;
  levelRevisited: boolean;
  onAnswer: (value: string | string[] | number | null) => void;
  onPatchAnswer: (id: string, value: MayaAnswers[string]) => void;
  onDraft: (draft: ShapeDraft) => void;
  onAdvanceShape: (draft?: ShapeDraft) => void;
  onEditSteps: () => void;
  onLevel: (id: MayaLevel) => void;
  onLooksGood: () => void;
}) {
  const draft = walk.draft;
  if (step.kind === 'discover') {
    const node = nodeById(MAYA_DISCOVER, step.id);
    if (!node) {
      return null;
    }
    return (
      <DiscoverControls
        node={node}
        answers={walk.answers}
        onAnswer={onAnswer}
        onPatch={(value) => onPatchAnswer(node.id, value)}
      />
    );
  }
  if (!draft) {
    return null;
  }
  if (step.id === 'coach') {
    return <MayaCoachCard draft={draft} onDraft={onDraft} onNext={() => onAdvanceShape()} />;
  }
  if (step.id === 'name') {
    return (
      <MayaPlanCard
        draft={draft}
        answers={walk.answers}
        showEditSteps={showEditSteps}
        onDraft={onDraft}
        onLooksRight={() => onAdvanceShape()}
        onEditSteps={onEditSteps}
      />
    );
  }
  if (step.id === 'habit') {
    return (
      <MayaHabitCard
        draft={draft}
        answers={walk.answers}
        weekStart={weekStart}
        onDraft={onDraft}
        onNext={() => onAdvanceShape({ ...draft, habitSkipped: false })}
        onSkip={() => onAdvanceShape({ ...draft, habitSkipped: true })}
      />
    );
  }
  if (step.id === 'helper') {
    return (
      <ChoiceChips
        options={HELPER_OPTIONS}
        selected={levelRevisited ? draft.helper : null}
        onSelect={(id) => onAdvanceShape({ ...draft, helper: id })}
      />
    );
  }
  if (step.id === 'level') {
    return (
      <ChoiceChips
        options={LEVEL_OPTIONS}
        selected={levelRevisited ? draft.level : null}
        onSelect={(id) => {
          if (id === 'lots' || id === 'occasional' || id === 'self') {
            onLevel(id);
          }
        }}
      />
    );
  }
  return (
    <MayaSummaryCard
      draft={draft}
      answers={walk.answers}
      weekStart={weekStart}
      saving={saving}
      showActions
      onLooksGood={onLooksGood}
    />
  );
}

function DiscoverControls({
  node,
  answers,
  onAnswer,
  onPatch,
}: {
  node: MayaNode;
  answers: MayaAnswers;
  onAnswer: (value: string | string[] | number | null) => void;
  onPatch: (value: MayaAnswers[string]) => void;
}) {
  const options = visibleOptions(MAYA_DISCOVER, node, answers);
  if (node.kind === 'message' || node.kind === 'playback') {
    return (
      <View style={styles.choices}>
        {options.map((option) => (
          <ChoiceButton
            key={option.id}
            label={option.label}
            selected={answers[node.id] === option.id}
            onPress={() => onAnswer(option.id)}
          />
        ))}
      </View>
    );
  }
  if (node.kind === 'single') {
    const selected = typeof answers[node.id] === 'string' ? answers[node.id] : null;
    return (
      <View style={styles.stack}>
        <ChoiceChips
          options={options}
          selected={typeof selected === 'string' ? selected : null}
          onSelect={(id) => onAnswer(id)}
        />
        {node.skippable ? (
          <Pressable onPress={() => onAnswer(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Skip">
            <Text style={styles.undo}>Skip</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }
  if (node.kind === 'multi') {
    const selected = Array.isArray(answers[node.id]) ? answers[node.id] : [];
    const ids = Array.isArray(selected) ? selected : [];
    return (
      <View style={styles.stack}>
        <View style={styles.chipWrap}>
          {options.map((option) => {
            const on = ids.includes(option.id);
            return (
              <Pressable
                key={option.id}
                onPress={() => {
                  const next = on ? ids.filter((id) => id !== option.id) : [...ids, option.id];
                  onPatch(next);
                }}
                style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <ChoiceButton label="Next" disabled={!isAnswered(node, answers)} onPress={() => onAnswer(ids)} />
      </View>
    );
  }
  if (node.kind === 'text') {
    const value = typeof answers[node.id] === 'string' ? answers[node.id] : '';
    const text = typeof value === 'string' ? value : '';
    return (
      <View style={styles.stack}>
        <TextInput
          value={text}
          onChangeText={onPatch}
          placeholder={node.placeholder}
          placeholderTextColor="#8e8e93"
          multiline
          maxLength={400}
          textAlignVertical="top"
          style={styles.input}
          accessibilityLabel={node.placeholder ?? 'Your answer'}
        />
        <ChoiceButton label="Next" disabled={text.trim().length === 0} onPress={() => onAnswer(text)} />
      </View>
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
            onPress={() => onAnswer(value)}
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

function ChoiceChips({
  options,
  selected,
  onSelect,
}: {
  options: readonly { id: string; label: string }[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <View style={styles.chipWrap}>
      {options.map((option) => {
        const on = selected === option.id;
        return (
          <Pressable
            key={option.id}
            onPress={() => onSelect(option.id)}
            style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ChoiceButton({
  label,
  onPress,
  disabled = false,
  selected = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.choice, selected && styles.choiceOn, pressed && !disabled && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
    >
      <Text style={[styles.choiceText, disabled && styles.choiceTextOff]}>{label}</Text>
    </Pressable>
  );
}

function MayaBubble({ text, note }: { text: string; note?: string }) {
  return (
    <View style={styles.bubbleRow}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>M</Text>
      </View>
      <View style={styles.bubble}>
        <Text style={styles.bubbleText}>{text}</Text>
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>
    </View>
  );
}

function TypingDots() {
  const opacity = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 350, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <View style={styles.bubbleRow}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>M</Text>
      </View>
      <Animated.View style={[styles.typingBubble, { opacity }]}>
        <Text style={styles.typingText}>●  ●  ●</Text>
      </Animated.View>
    </View>
  );
}

function FrozenView({ item }: { item: Frozen }) {
  if (item.kind === 'divider') {
    return (
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>{item.label}</Text>
        <View style={styles.dividerLine} />
      </View>
    );
  }
  if (item.kind === 'maya') {
    return <MayaBubble text={item.text} note={item.note} />;
  }
  if (item.kind === 'card') {
    return (
      <View style={styles.frozenCard}>
        <Text style={styles.bubbleText}>{item.text}</Text>
      </View>
    );
  }
  return (
    <View style={styles.userWrap}>
      <View style={styles.userBubble}>
        <Text style={styles.userText}>{item.text}</Text>
      </View>
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
    gap: 12,
  },
  step: {
    gap: 12,
  },
  stack: {
    gap: 12,
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
  note: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 20,
    color: '#6B6B70',
  },
  typingBubble: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  typingText: {
    fontSize: 14,
    letterSpacing: 1,
    color: '#8e8e93',
  },
  userWrap: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
    maxWidth: '82%',
    gap: 4,
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
  undo: {
    fontSize: 15,
    fontWeight: '600',
    color: '#007aff',
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
  choiceOn: {
    backgroundColor: '#e8f1ff',
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
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 8,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#c7c7cc',
  },
  dividerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B6B70',
  },
  frozenCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheetDismiss: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
  },
  sheetRow: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  sheetText: {
    fontSize: 17,
    color: '#007aff',
  },
  sheetDiscard: {
    fontSize: 17,
    color: '#ff3b30',
  },
  pressed: {
    opacity: 0.55,
  },
});
