import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { GoalAdjustCard } from '../components/GoalAdjustCard';
import { MayaReflectionThread, type ReflectionEdit } from '../components/MayaReflectionThread';
import { showActionSheet } from '../components/showActionSheet';
import { InviteCodeSheet } from '../components/InviteCodeSheet';
import { KeyboardSafe } from '../components/KeyboardSafe';
import { SupportRequestSheet } from '../components/SupportRequestSheet';
import { formFieldStyles } from '../components/FormFields';
import { STATUS_COLORS } from '../constants';
import {
  REFLECTION_ANSWERS,
  REFLECTION_COPY,
  type ReflectionAnswerId,
} from '../constants/reflection';
import { WEEKDAY_INITIALS, WEEKDAY_NAMES } from '../lib/goalDetailText';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { celebrateBadges } from '../lib/badgeCelebration';
import { checkBadges } from '../lib/badges';
import { getMyConnections, getMySharesWith } from '../lib/communityApi';
import { getLatestSupportRequest } from '../lib/supportApi';
import { getAllGoals, getEntries, reorderGoals, updateGoal } from '../lib/goalTreeApi';
import { parseLocalDate, todayLocal } from '../lib/localDate';
import { getReflectionPath, saveReflectionPath, type ReflectionPath } from '../lib/reflectionChoice';
import {
  clearReflectionDraft,
  getReflectionDraft,
  saveReflectionDraft,
  type ReflectionDraft,
  type ReflectionSection,
} from '../lib/reflectionDraft';
import { cancelThisWeeksReflectionReminder } from '../lib/reminders';
import {
  getReview,
  listReflections,
  saveReflection,
  type CoachCheckin,
  type PartnerCheckin,
  type WeekReview,
} from '../lib/reviewApi';
import {
  answerLabel,
  assessConnect,
  candidatesFor,
  coachOutcome,
  copyGoals,
  describeChanges,
  goalPageChanges,
  oneTimeSteps,
  partnerOutcome,
  personName,
  pickLowest,
  repeatingStep,
  winLines,
} from '../lib/reflectionFlow';
import { getWeekProgressMessage } from '../lib/statusMessages';
import { getWeeklyItems } from '../lib/weeklyReview';
import type { WeekStart } from '../lib/settingsApi';
import { endOfWeek, startOfWeek, weekdayOrder } from '../lib/week';
import type { DashboardStackParamList } from '../navigation/TabNavigator';
import type { Connection } from '../types/community';
import type { Goal, GoalEntry } from '../types/goal';
import { addDays, formatShortDate } from '../utils/date';

type Props = NativeStackScreenProps<DashboardStackParamList, 'WeeklyReflection'>;

type Section = ReflectionSection;
type ConnectStep = ReflectionDraft['connectStep'];
type AnswerRecord = { goal_id: string; answer: ReflectionAnswerId };
type TrailId = 'look' | 'adjust' | 'connect' | 'next';

const SECTION_ORDER: Section[] = ['choice', 'look', 'adjust', 'connect', 'next', 'summary'];

function sectionRank(section: Section): number {
  const index = SECTION_ORDER.indexOf(section);
  return index < 0 ? 0 : index;
}

const TRAIL: { id: TrailId; label: string }[] = [
  { id: 'look', label: REFLECTION_COPY.lookBack },
  { id: 'adjust', label: REFLECTION_COPY.adjust },
  { id: 'connect', label: REFLECTION_COPY.connect },
  { id: 'next', label: REFLECTION_COPY.nextWeek },
];

function trailCurrent(section: Section): TrailId {
  if (section === 'summary' || section === 'next') {
    return 'next';
  }
  if (section === 'connect' || section === 'adjust' || section === 'look') {
    return section;
  }
  return 'look';
}

const DONUT_SIZE = 148;
const DONUT_STROKE = 14;

function SectionTrail({
  current,
  reached,
  onPress,
}: {
  current: TrailId;
  reached: Section;
  onPress: (id: TrailId) => void;
}) {
  return (
    <View style={styles.trailRow}>
      {TRAIL.map((item, index) => {
        const enabled = sectionRank(item.id) <= sectionRank(reached);
        const on = item.id === current;
        const text = (
          <Text style={on ? styles.trailOn : enabled ? styles.trailDone : styles.trailOff}>{item.label}</Text>
        );
        return (
          <View key={item.id} style={styles.trailItem}>
            {index > 0 ? <Text style={styles.trailOff}> · </Text> : null}
            {enabled ? (
              <Pressable
                onPress={() => onPress(item.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={item.label}
              >
                {text}
              </Pressable>
            ) : (
              text
            )}
          </View>
        );
      })}
    </View>
  );
}

function WeekDonut({ percent, phrase, tone }: { percent: number; phrase: string; tone: 'positive' | 'encourage' }) {
  const radius = (DONUT_SIZE - DONUT_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = DONUT_SIZE / 2;
  return (
    <View style={styles.donutBlock}>
      <View style={styles.donutWrap}>
        <Svg width={DONUT_SIZE} height={DONUT_SIZE}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke="#e5e5ea"
            strokeWidth={DONUT_STROKE}
            fill="none"
          />
          {percent > 0 ? (
            <Circle
              cx={center}
              cy={center}
              r={radius}
              stroke="#007aff"
              strokeWidth={DONUT_STROKE}
              fill="none"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={circumference * (1 - percent / 100)}
              strokeLinecap="round"
              rotation={-90}
              origin={`${center}, ${center}`}
            />
          ) : null}
        </Svg>
        <Text style={styles.donutValue}>{percent}%</Text>
      </View>
      <Text style={[styles.phrase, { color: STATUS_COLORS[tone] }]}>{phrase}</Text>
    </View>
  );
}

export default function WeeklyReflectionScreen({ navigation, route }: Props) {
  const { settings } = useSettings();
  const { user } = useAuth();
  const weekStart = route.params.weekStart;
  const weekStartsOn = settings.weekStart;
  const range = `${formatShortDate(weekStart)} – ${formatShortDate(endOfWeek(weekStart, weekStartsOn))}`;

  const openMenuRef = useRef<() => void>(() => {});

  const [path, setPath] = useState<ReflectionPath | null>(null);
  const [section, setSection] = useState<Section>('choice');
  const [reached, setReached] = useState<Section>('choice');
  const [editing, setEditing] = useState<ReflectionEdit | null>(null);
  const [confirmOver, setConfirmOver] = useState(false);
  const [scrollTarget, setScrollTarget] = useState<{ id: TrailId; token: number } | null>(null);
  const [nodes, setNodes] = useState<Goal[]>([]);
  const [entries, setEntries] = useState<GoalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [adjustIndex, setAdjustIndex] = useState(0);
  const [adjustPhase, setAdjustPhase] = useState<'one' | 'others' | 'extra' | 'none'>('one');
  const [extraId, setExtraId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [viewedExtraIds, setViewedExtraIds] = useState<string[]>([]);
  const [changes, setChanges] = useState<string[]>([]);
  const [noteSentTo, setNoteSentTo] = useState<string | null>(null);
  const [noteAwaitingReturn, setNoteAwaitingReturn] = useState<string | null>(null);
  const [connectStep, setConnectStep] = useState<ConnectStep>('partner');
  const [partnerCheckin, setPartnerCheckin] = useState<PartnerCheckin | null>(null);
  const [coachCheckin, setCoachCheckin] = useState<CoachCheckin | null>(null);
  const [partners, setPartners] = useState<Connection[]>([]);
  const [coaches, setCoaches] = useState<Connection[]>([]);
  const [skipPartner, setSkipPartner] = useState(false);
  const [skipCoach, setSkipCoach] = useState(false);
  const [coachBroughtBack, setCoachBroughtBack] = useState(false);
  const [coachRequestPending, setCoachRequestPending] = useState(false);
  const [connectReady, setConnectReady] = useState(false);
  const [nextStepIds, setNextStepIds] = useState<{ goalId: string; stepId: string }[]>([]);
  const [nextIndex, setNextIndex] = useState(0);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const finished = useRef(false);
  const pendingAfterSheet = useRef<null | 'coach' | 'next'>(null);
  const pendingNoteName = useRef<string | null>(null);
  const pendingGoalSnap = useRef<Goal[] | null>(null);
  const pendingGoalId = useRef<string | null>(null);
  const skipCoachNow = useRef(false);
  skipCoachNow.current = skipCoach;
  const readOnly = route.params.readOnly === true;

  useLayoutEffect(() => {
    navigation.setOptions({
      title: `${REFLECTION_COPY.heading} · ${range}`,
      headerRight: () => (
        <View style={styles.headerActions}>
          {!readOnly && section !== 'choice' ? (
            <Pressable
              onPress={() => openMenuRef.current()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={REFLECTION_COPY.more}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color="#007aff" />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={REFLECTION_COPY.close}
          >
            <Ionicons name="close" size={26} color="#007aff" />
          </Pressable>
        </View>
      ),
    });
  }, [navigation, range, readOnly, section]);

  const load = useCallback(async (): Promise<Goal[] | null> => {
    try {
      const next = await getAllGoals();
      const today = todayLocal();
      const current = startOfWeek(today, weekStartsOn);
      const asOf = weekStart === current ? today : endOfWeek(weekStart, weekStartsOn);
      const ids = next.map((goal) => goal.id);
      const loaded = ids.length > 0 ? await getEntries(ids, undefined, asOf) : [];
      setNodes(next);
      setEntries(loaded);
      setLoadError(null);
      return next;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : REFLECTION_COPY.couldNotLoad);
      return null;
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekStartsOn]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        const fresh = await load();
        if (cancelled) {
          return;
        }
        const snap = pendingGoalSnap.current;
        const goalId = pendingGoalId.current;
        if (fresh && snap && goalId) {
          pendingGoalSnap.current = null;
          pendingGoalId.current = null;
          const lines = goalPageChanges(goalId, snap, fresh);
          if (lines.length > 0) {
            setChanges((existing) => [...existing, ...lines]);
          }
        }
        const noteName = pendingNoteName.current;
        if (noteName) {
          pendingNoteName.current = null;
          setPartnerCheckin('not_yet');
          setNoteSentTo(noteName);
          setNoteAwaitingReturn(null);
          if (skipCoachNow.current) {
            setSection('next');
          } else {
            setConnectStep('coach');
          }
        }
      })();
      if (!user?.id) {
        return () => {
          cancelled = true;
        };
      }
      void getReflectionPath(user.id).then((saved) => {
        if (!cancelled && saved) {
          setPath((current) => current ?? saved);
        }
      });
      return () => {
        cancelled = true;
      };
    }, [load, user?.id]),
  );

  const applyNodes = useCallback((update: (current: Goal[]) => Goal[]) => {
    setNodes((current) => {
      const next = update(current);
      const lines = describeChanges(current, next);
      if (lines.length > 0) {
        setChanges((existing) => [...existing, ...lines]);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!user?.id || readOnly) {
      setDraftReady(true);
      return;
    }
    let cancelled = false;
    void getReflectionDraft(user.id, weekStart).then((draft) => {
      if (cancelled || !draft) {
        setDraftReady(true);
        return;
      }
      setSection(draft.section);
      setReached(draft.reached && sectionRank(draft.reached) >= sectionRank(draft.section) ? draft.reached : draft.section);
      setPath(draft.path);
      setAdjustIndex(draft.adjustIndex);
      setAdjustPhase(draft.adjustPhase);
      setExtraId(draft.extraId);
      setPickedIds(draft.pickedIds);
      setViewedExtraIds(draft.viewedExtraIds ?? []);
      setAnswers(draft.answers);
      setConnectStep(draft.connectStep);
      setPartnerCheckin(draft.partnerCheckin);
      setCoachCheckin(draft.coachCheckin);
      setNextStepIds(draft.nextStepIds ?? []);
      setNextIndex(draft.nextIndex ?? 0);
      setChanges(draft.changes ?? []);
      setNoteSentTo(draft.noteAwaitingReturn || draft.noteSentTo || null);
      if (draft.noteAwaitingReturn) {
        setPartnerCheckin('not_yet');
        setConnectStep('coach');
      }
      setNoteAwaitingReturn(null);
      setDraftReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [readOnly, user?.id, weekStart]);

  useEffect(() => {
    if (!user?.id || !draftReady || readOnly || finished.current) {
      return;
    }
    const draft: ReflectionDraft = {
      section,
      path,
      adjustIndex,
      adjustPhase,
      extraId,
      pickedIds,
      viewedExtraIds,
      answers,
      connectStep,
      partnerCheckin,
      coachCheckin,
      nextStepIds,
      nextIndex,
      changes,
      noteSentTo,
      noteAwaitingReturn,
      reached,
    };
    void saveReflectionDraft(user.id, weekStart, draft);
  }, [
    adjustIndex,
    adjustPhase,
    answers,
    changes,
    coachCheckin,
    connectStep,
    draftReady,
    extraId,
    nextIndex,
    noteAwaitingReturn,
    noteSentTo,
    nextStepIds,
    partnerCheckin,
    path,
    pickedIds,
    reached,
    readOnly,
    section,
    user?.id,
    viewedExtraIds,
    weekStart,
  ]);

  useEffect(() => {
    if (readOnly) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [connections, reviews, request] = await Promise.all([
          getMyConnections(),
          listReflections(8),
          getLatestSupportRequest(),
        ]);
        if (cancelled) {
          return;
        }
        if (
          connectReady &&
          (section === 'connect' || section === 'next' || section === 'summary')
        ) {
          return;
        }
        const assessed = assessConnect({
          connections,
          reviews,
          weekStart,
          weekStartsOn,
          nodes,
          entries,
          requestCreatedAt: request?.createdAt ?? null,
        });
        setPartners(assessed.partners);
        setCoaches(assessed.coaches);
        setSkipPartner(assessed.skipPartner);
        setSkipCoach(assessed.skipCoach);
        setCoachBroughtBack(assessed.coachBroughtBack);
        setCoachRequestPending(assessed.coachRequestPending);
        setConnectReady(true);
      } catch {
        if (!cancelled) {
          setConnectReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connectReady, entries, nodes, readOnly, section, weekStart, weekStartsOn]);

  useEffect(() => {
    setReached((current) => (sectionRank(section) > sectionRank(current) ? section : current));
  }, [section]);

  const choose = (next: ReflectionPath) => {
    setPath(next);
    if (user?.id) {
      void saveReflectionPath(user.id, next);
    }
    if (next === 'own' || next === 'maya') {
      setSection('look');
    }
  };

  const asOfDate = (() => {
    const today = todayLocal();
    const current = startOfWeek(today, weekStartsOn);
    return weekStart === current ? today : endOfWeek(weekStart, weekStartsOn);
  })();
  const isCurrentWeek = weekStart === startOfWeek(todayLocal(), weekStartsOn);
  const review = getWeeklyItems(
    nodes,
    entries,
    parseLocalDate(weekStart),
    parseLocalDate(asOfDate),
    weekStartsOn,
  );
  const percent = Math.round(review.partialPct * 100);
  const message = getWeekProgressMessage(percent, isCurrentWeek);
  const wins = winLines(nodes, entries, asOfDate, weekStart, weekStartsOn);
  const weekEnd = endOfWeek(weekStart, weekStartsOn);
  const remaining = candidatesFor(nodes, weekEnd).filter((goal) => !pickedIds.includes(goal.id));

  const startAdjust = () => {
    const ids = pickLowest(nodes, entries, weekStart, asOfDate, weekStartsOn);
    const extras = viewedExtraIds.filter((id) => !ids.includes(id));
    const keep = new Set([...ids, ...extras]);
    setPickedIds(ids);
    setAdjustIndex(0);
    setAdjustPhase(ids.length === 0 ? 'none' : 'one');
    setExtraId(null);
    setAnswers((current) => current.filter((item) => ids.includes(item.goal_id)));
    setViewedExtraIds(extras);
    setNextStepIds((current) =>
      current.filter((item) => keep.has(item.goalId) && nodes.some((goal) => goal.id === item.stepId)),
    );
    setEditing(null);
    setSection('adjust');
  };

  const jumpTo = (target: TrailId) => {
    if (sectionRank(target) > sectionRank(reached)) {
      return;
    }
    setEditing(null);
    if (path === 'maya') {
      setScrollTarget((current) => ({ id: target, token: (current?.token ?? 0) + 1 }));
      return;
    }
    if (target === 'look') {
      setSection('look');
      return;
    }
    if (target === 'adjust') {
      setAdjustIndex(0);
      setExtraId(null);
      setAdjustPhase(pickedIds.length === 0 ? 'none' : 'one');
      setSection('adjust');
      return;
    }
    if (target === 'connect') {
      setConnectStep('partner');
      setSection('connect');
      return;
    }
    setNextIndex(0);
    setSection('next');
  };

  const startOver = () => {
    setConfirmOver(false);
    setEditing(null);
    setScrollTarget(null);
    setPath(null);
    setSection('choice');
    setReached('choice');
    setPickedIds([]);
    setAdjustIndex(0);
    setAdjustPhase('one');
    setExtraId(null);
    setAnswers([]);
    setViewedExtraIds([]);
    setConnectStep('partner');
    setPartnerCheckin(null);
    setCoachCheckin(null);
    setNextStepIds([]);
    setNextIndex(0);
    setNoteSentTo(null);
    setNoteAwaitingReturn(null);
  };

  openMenuRef.current = () => {
    showActionSheet(REFLECTION_COPY.more, [REFLECTION_COPY.startOver], () => setConfirmOver(true));
  };

  const recordAnswer = (goalId: string, answer: ReflectionAnswerId) => {
    setAnswers((current) => [
      ...current.filter((item) => item.goal_id !== goalId),
      { goal_id: goalId, answer },
    ]);
  };

  const finishPicked = () => {
    if (adjustIndex < pickedIds.length - 1) {
      setAdjustIndex((index) => index + 1);
      return;
    }
    if (remaining.length > 0) {
      setAdjustPhase('others');
      return;
    }
    setSection('connect');
  };

  const openGoal = (goalId: string) => {
    pendingGoalId.current = goalId;
    pendingGoalSnap.current = copyGoals(nodes);
    navigation.navigate('Goal', { goalId, fromReflection: true });
  };

  const goCoach = () => {
    if (skipCoach) {
      setSection('next');
      return;
    }
    setConnectStep('coach');
  };

  const openPartnerNote = async () => {
    const partner = [...partners].sort((a, b) => personName(a).localeCompare(personName(b)))[0];
    if (!partner?.partnerId) {
      return;
    }
    try {
      const shares = await getMySharesWith(partner.partnerId);
      const shared = new Set(shares.map((share) => share.goalId));
      const goal = nodes.find((item) => shared.has(item.id));
      if (!goal || !user?.id) {
        navigation.navigate('Partner', {
          connectionId: partner.id,
          name: personName(partner),
          partnerId: partner.partnerId,
        });
        return;
      }
      const name = personName(partner);
      pendingNoteName.current = name;
      setNoteAwaitingReturn(name);
      navigation.navigate('Comments', {
        goalId: goal.id,
        ownerId: user.id,
        partnerId: partner.partnerId,
        goalTitle: goal.title || 'Untitled',
        partnerName: name,
        fromReflection: true,
      });
    } catch (error) {
      pendingNoteName.current = null;
      setNoteAwaitingReturn(null);
      Alert.alert(
        REFLECTION_COPY.couldNotFinish,
        error instanceof Error ? error.message : REFLECTION_COPY.couldNotFinish,
      );
    }
  };

  const nextGoalIds = [...pickedIds, ...viewedExtraIds.filter((id) => !pickedIds.includes(id))];

  const toggleHabitDay = (habit: Goal, day: number) => {
    const current = habit.plannedDays ?? [];
    const plannedDays = current.includes(day)
      ? current.filter((item) => item !== day)
      : [...current, day].sort((a, b) => a - b);
    applyNodes((goals) =>
      goals.map((goal) =>
        goal.id === habit.id
          ? { ...goal, plannedDays, repeatPeriod: habit.repeatPeriod ?? 'week' }
          : goal,
      ),
    );
    void updateGoal(habit.id, { plannedDays, repeatPeriod: habit.repeatPeriod ?? 'week' }).catch((error) => {
      Alert.alert(
        REFLECTION_COPY.couldNotSave,
        error instanceof Error ? error.message : REFLECTION_COPY.couldNotSave,
      );
    });
  };

  const chooseNextStep = (goalId: string, step: Goal) => {
    const siblings = nodes
      .filter((item) => item.parentId === step.parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdDate.localeCompare(b.createdDate));
    const ordered = [step, ...siblings.filter((item) => item.id !== step.id)];
    const order = new Map(ordered.map((item, index) => [item.id, index]));
    setNodes((goals) =>
      goals.map((goal) => (order.has(goal.id) ? { ...goal, sortOrder: order.get(goal.id) ?? goal.sortOrder } : goal)),
    );
    setNextStepIds((current) => [
      ...current.filter((item) => item.goalId !== goalId),
      { goalId, stepId: step.id },
    ]);
    void reorderGoals(ordered.map((item) => item.id)).catch((error) => {
      Alert.alert(
        REFLECTION_COPY.couldNotSave,
        error instanceof Error ? error.message : REFLECTION_COPY.couldNotSave,
      );
    });
  };

  const finishReflection = async () => {
    if (saving || !user?.id) {
      return;
    }
    setSaving(true);
    try {
      const percent = Math.round(review.partialPct * 100);
      await saveReflection({
        weekStart,
        donePct: percent,
        goalCheckins: answers,
        partnerCheckin,
        coachCheckin,
      });
      try {
        const keys = await checkBadges();
        celebrateBadges(keys);
      } catch (error) {
        console.warn('Could not check badges', error);
      }
      const today = todayLocal();
      const currentWeek = startOfWeek(today, weekStartsOn);
      if (weekStart === currentWeek || weekStart === addDays(currentWeek, -7)) {
        await cancelThisWeeksReflectionReminder();
      }
      finished.current = true;
      await clearReflectionDraft(user.id, weekStart);
      navigation.goBack();
    } catch (error) {
      Alert.alert(
        REFLECTION_COPY.couldNotFinish,
        error instanceof Error ? error.message : REFLECTION_COPY.couldNotFinish,
      );
      setSaving(false);
    }
  };

  useEffect(() => {
    if (readOnly || section !== 'connect' || !connectReady) {
      return;
    }
    if (connectStep === 'partner' && skipPartner) {
      if (skipCoach) {
        setSection('next');
      } else {
        setConnectStep('coach');
      }
      return;
    }
    if (connectStep === 'coach' && skipCoach) {
      setSection('next');
    }
  }, [connectReady, connectStep, readOnly, section, skipCoach, skipPartner]);

  const currentId = pickedIds[adjustIndex] ?? null;
  const currentAnswer = answers.find((item) => item.goal_id === currentId)?.answer ?? null;
  const nextGoal = nodes.find((goal) => goal.id === nextGoalIds[nextIndex]) ?? null;

  useEffect(() => {
    if (readOnly || section !== 'next' || nextGoalIds.length === 0 || nextGoal) {
      return;
    }
    if (nextIndex < nextGoalIds.length - 1) {
      setNextIndex((index) => index + 1);
      return;
    }
    setSection('summary');
  }, [nextGoal, nextGoalIds.length, nextIndex, readOnly, section]);

  const sheets = (
    <>
      {inviteOpen ? (
        <InviteCodeSheet
          title={REFLECTION_COPY.inviteCode}
          onClose={() => {
            setInviteOpen(false);
            goCoach();
          }}
        />
      ) : null}
      {supportOpen ? (
        <SupportRequestSheet
          initialHelpType="checkins"
          onClose={() => {
            setSupportOpen(false);
            if (pendingAfterSheet.current === 'next') {
              pendingAfterSheet.current = null;
              setSection('next');
            }
          }}
          onSent={() => {
            setSupportOpen(false);
            if (pendingAfterSheet.current === 'next') {
              pendingAfterSheet.current = null;
              setSection('next');
            }
          }}
        />
      ) : null}
      <Modal
        visible={confirmOver}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmOver(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setConfirmOver(false)}>
          <Pressable style={styles.confirmCard} onPress={() => {}}>
            <Text style={styles.question}>{REFLECTION_COPY.startOverAsk}</Text>
            <Pressable
              onPress={startOver}
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={REFLECTION_COPY.startOver}
            >
              <Text style={styles.primaryText}>{REFLECTION_COPY.startOver}</Text>
            </Pressable>
            <Pressable
              onPress={() => setConfirmOver(false)}
              style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={REFLECTION_COPY.cancel}
            >
              <Text style={styles.choiceText}>{REFLECTION_COPY.cancel}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );

  if (readOnly) {
    return <SavedReflection weekStart={weekStart} goals={nodes} />;
  }

  if (path === 'maya' && section !== 'choice') {
    const nextLines = nextStepIds.flatMap((item) => {
      const step = nodes.find((goal) => goal.id === item.stepId);
      const goal = nodes.find((entry) => entry.id === item.goalId);
      if (!step) {
        return [];
      }
      return [`${REFLECTION_COPY.nextUp}: ${step.title || 'Untitled'} · ${goal?.title || 'Untitled'}`];
    });
    return (
      <KeyboardSafe style={styles.screen}>
        <View style={styles.trailPad}>
          <SectionTrail current={trailCurrent(section)} reached={reached} onPress={jumpTo} />
        </View>
        <MayaReflectionThread
          section={section}
          editing={editing}
          onEditGoal={(goalId) => setEditing({ kind: 'goal', goalId })}
          onEditOthers={() => setEditing({ kind: 'others' })}
          onEditPartner={() => setEditing({ kind: 'partner' })}
          onEditCoach={() => setEditing({ kind: 'coach' })}
          scrollTarget={scrollTarget}
          dayName={WEEKDAY_NAMES[settings.reflectionDay]}
          loading={loading}
          loadError={loadError}
          onRetry={() => void load()}
          lookCard={<WeekDonut percent={percent} phrase={message.message} tone={message.tone} />}
          wins={wins}
          onStartAdjust={startAdjust}
          adjustPhase={adjustPhase}
          pickedIds={pickedIds}
          adjustIndex={adjustIndex}
          extraId={extraId}
          viewedExtraIds={viewedExtraIds}
          answers={answers}
          nodes={nodes}
          remaining={remaining}
          onAnswer={(goalId, answer) => {
            recordAnswer(goalId, answer);
            setEditing(null);
          }}
          onFinishPicked={finishPicked}
          onOpenExtra={(goalId) => {
            setViewedExtraIds((current) => (current.includes(goalId) ? current : [...current, goalId]));
            setExtraId(goalId);
            setAdjustPhase('extra');
            setEditing(null);
            if (section !== 'adjust') {
              setSection('adjust');
            }
          }}
          onImGood={() => {
            if (editing?.kind === 'others') {
              setEditing(null);
              return;
            }
            setSection('connect');
          }}
          onCloseExtra={() => {
            setExtraId(null);
            setAdjustPhase('others');
          }}
          renderGoal={(goalId, answer) => (
            <GoalAdjustCard
              goalId={goalId}
              nodes={nodes}
              entries={entries}
              asOf={asOfDate}
              weekStartsOn={weekStartsOn}
              answer={answer}
              focusAdd={answer === 'start'}
              reminderMode={settings.reminderMode}
              onChange={applyNodes}
              onOpenGoal={openGoal}
            />
          )}
          connectReady={connectReady}
          connectStep={connectStep}
          skipPartner={skipPartner}
          partners={partners}
          partnerCheckin={partnerCheckin}
          noteSentTo={noteSentTo}
          onPartnerYes={() => {
            setPartnerCheckin('yes');
            setNoteSentTo(null);
            setConnectStep('partner-follow');
            setEditing(null);
            if (sectionRank(section) > sectionRank('connect')) {
              setSection('connect');
            }
          }}
          onPartnerNotYet={() => {
            setPartnerCheckin('not_yet');
            setConnectStep('partner-follow');
            setEditing(null);
            if (sectionRank(section) > sectionRank('connect')) {
              setSection('connect');
            }
          }}
          onSendNote={() => void openPartnerNote()}
          onSkipToCoach={goCoach}
          onInvite={() => {
            setPartnerCheckin('invited');
            setNoteSentTo(null);
            setInviteOpen(true);
            setEditing(null);
          }}
          onPartnerNotNow={() => {
            setPartnerCheckin('not_now');
            setNoteSentTo(null);
            goCoach();
            setEditing(null);
          }}
          coaches={coaches}
          skipCoach={skipCoach}
          coachBroughtBack={coachBroughtBack}
          coachRequestPending={coachRequestPending}
          coachCheckin={coachCheckin}
          onCoachYes={() => {
            setCoachCheckin('yes');
            setSection('next');
            setEditing(null);
          }}
          onCoachNotYet={() => {
            setCoachCheckin('not_yet');
            setConnectStep('coach-follow');
            setEditing(null);
          }}
          onSetUpTime={() => {
            pendingAfterSheet.current = 'next';
            setSupportOpen(true);
          }}
          onSkipCoachTime={() => setSection('next')}
          onCoachPendingNext={() => {
            setCoachCheckin('pending');
            setSection('next');
          }}
          onRequestCoach={() => {
            setCoachCheckin('requested');
            pendingAfterSheet.current = 'next';
            setSupportOpen(true);
            setEditing(null);
          }}
          onCoachNotNow={() => {
            setCoachCheckin('not_now');
            setSection('next');
            setEditing(null);
          }}
          nextEmpty={nextGoalIds.length === 0}
          onNextEmptyContinue={() => setSection('summary')}
          nextEditor={
            nextGoal ? (
              <NextWeekGoal
                goal={nextGoal}
                nodes={nodes}
                weekStartsOn={weekStartsOn}
                selectedStepId={nextStepIds.find((item) => item.goalId === nextGoal.id)?.stepId ?? null}
                onToggleDay={toggleHabitDay}
                onChooseStep={(step) => chooseNextStep(nextGoal.id, step)}
                onContinue={() => {
                  if (nextIndex < nextGoalIds.length - 1) {
                    setNextIndex((index) => index + 1);
                  } else {
                    setSection('summary');
                  }
                }}
              />
            ) : null
          }
          nextLines={nextLines}
          changes={changes}
          partnerLine={
            noteSentTo
              ? REFLECTION_COPY.partnerLineNote.replace('[name]', noteSentTo)
              : partnerOutcome(partnerCheckin)
          }
          coachLine={coachOutcome(coachCheckin)}
          saving={saving}
          onDone={() => void finishReflection()}
        />
        {sheets}
      </KeyboardSafe>
    );
  }

  return (
    <KeyboardSafe style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {section === 'choice' ? (
          <View style={styles.stack}>
            <Pressable
              onPress={() => choose('maya')}
              style={({ pressed }) => [
                styles.choice,
                path === 'maya' && styles.choiceOn,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: path === 'maya' }}
              accessibilityLabel={REFLECTION_COPY.withMaya}
            >
              <Text style={[styles.choiceText, path === 'maya' && styles.choiceTextOn]}>
                {REFLECTION_COPY.withMaya}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => choose('own')}
              style={({ pressed }) => [
                styles.choice,
                path === 'own' && styles.choiceOn,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: path === 'own' }}
              accessibilityLabel={REFLECTION_COPY.onMyOwn}
            >
              <Text style={[styles.choiceText, path === 'own' && styles.choiceTextOn]}>
                {REFLECTION_COPY.onMyOwn}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {section === 'look' ? (
          <View style={styles.stack}>
            <SectionTrail current="look" reached={reached} onPress={jumpTo} />
            {loading && nodes.length === 0 ? (
              <ActivityIndicator color="#007aff" />
            ) : loadError && nodes.length === 0 ? (
              <View style={styles.stack}>
                <Text style={styles.soon}>{loadError}</Text>
                <Pressable
                  onPress={() => void load()}
                  style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={REFLECTION_COPY.retry}
                >
                  <Text style={styles.choiceText}>{REFLECTION_COPY.retry}</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <WeekDonut percent={percent} phrase={message.message} tone={message.tone} />
                {wins.map((line) => (
                  <Text key={line} style={styles.win}>
                    {line}
                  </Text>
                ))}
                <Pressable
                  onPress={startAdjust}
                  style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={REFLECTION_COPY.next}
                >
                  <Text style={styles.primaryText}>{REFLECTION_COPY.next}</Text>
                </Pressable>
              </>
            )}
          </View>
        ) : null}

        {section === 'adjust' ? (
          <View style={styles.stack}>
            <SectionTrail current="adjust" reached={reached} onPress={jumpTo} />
            {adjustPhase === 'none' ? (
              <>
                <Text style={styles.body}>{REFLECTION_COPY.nothingSlowed}</Text>
                <Pressable
                  onPress={() => setSection('connect')}
                  style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={REFLECTION_COPY.next}
                >
                  <Text style={styles.primaryText}>{REFLECTION_COPY.next}</Text>
                </Pressable>
              </>
            ) : null}
            {adjustPhase === 'one' && currentId ? (
              <>
                <Text style={styles.question}>
                  {REFLECTION_COPY.howDid.replace(
                    '[goal]',
                    nodes.find((goal) => goal.id === currentId)?.title || 'Untitled',
                  )}
                </Text>
                {REFLECTION_ANSWERS.map((option) => {
                  const selected = currentAnswer === option.id;
                  return (
                    <Pressable
                      key={option.id}
                      onPress={() => recordAnswer(currentId, option.id)}
                      style={({ pressed }) => [
                        styles.choice,
                        selected && styles.choiceOn,
                        pressed && styles.pressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={option.label}
                    >
                      <Text style={[styles.choiceText, selected && styles.choiceTextOn]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
                {currentAnswer ? (
                  <>
                    <GoalAdjustCard
                      goalId={currentId}
                      nodes={nodes}
                      entries={entries}
                      asOf={asOfDate}
                      weekStartsOn={weekStartsOn}
                      answer={currentAnswer}
                      focusAdd={currentAnswer === 'start'}
                      reminderMode={settings.reminderMode}
                      onChange={applyNodes}
                      onOpenGoal={openGoal}
                    />
                    <Pressable
                      onPress={finishPicked}
                      style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
                      accessibilityRole="button"
                      accessibilityLabel={
                        adjustIndex < pickedIds.length - 1
                          ? REFLECTION_COPY.nextGoal
                          : REFLECTION_COPY.doneGoal
                      }
                    >
                      <Text style={styles.primaryText}>
                        {adjustIndex < pickedIds.length - 1
                          ? REFLECTION_COPY.nextGoal
                          : REFLECTION_COPY.doneGoal}
                      </Text>
                    </Pressable>
                  </>
                ) : null}
              </>
            ) : null}
            {adjustPhase === 'others' ? (
              <>
                <Text style={styles.question}>{REFLECTION_COPY.otherGoals}</Text>
                {remaining.map((goal) => (
                  <Pressable
                    key={goal.id}
                    onPress={() => {
                      setViewedExtraIds((current) =>
                        current.includes(goal.id) ? current : [...current, goal.id],
                      );
                      setExtraId(goal.id);
                      setAdjustPhase('extra');
                    }}
                    style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={goal.title || 'Untitled'}
                  >
                    <Text style={styles.choiceText}>{goal.title || 'Untitled'}</Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => setSection('connect')}
                  style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={REFLECTION_COPY.imGood}
                >
                  <Text style={styles.primaryText}>{REFLECTION_COPY.imGood}</Text>
                </Pressable>
              </>
            ) : null}
            {adjustPhase === 'extra' && extraId ? (
              <>
                <GoalAdjustCard
                  goalId={extraId}
                  nodes={nodes}
                  entries={entries}
                  asOf={asOfDate}
                  weekStartsOn={weekStartsOn}
                  answer={null}
                  reminderMode={settings.reminderMode}
                  onChange={applyNodes}
                  onOpenGoal={openGoal}
                />
                <Pressable
                  onPress={() => {
                    setExtraId(null);
                    setAdjustPhase('others');
                  }}
                  style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={REFLECTION_COPY.done}
                >
                  <Text style={styles.primaryText}>{REFLECTION_COPY.done}</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        ) : null}

        {section === 'connect' ? (
          <View style={styles.stack}>
            <SectionTrail current="connect" reached={reached} onPress={jumpTo} />
            {!connectReady ? <ActivityIndicator color="#007aff" /> : null}
            {connectReady && connectStep === 'partner' && !skipPartner && partners.length > 0 ? (
              <>
                <Text style={styles.question}>
                  {partners.length > 1
                    ? REFLECTION_COPY.partnerQuestionMany
                    : REFLECTION_COPY.partnerQuestion.replace('[name]', personName(partners[0]))}
                </Text>
                <Pressable
                  onPress={() => {
                    setPartnerCheckin('yes');
                    setNoteSentTo(null);
                    setConnectStep('partner-follow');
                  }}
                  style={({ pressed }) => [
                    styles.choice,
                    partnerCheckin === 'yes' && styles.choiceOn,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: partnerCheckin === 'yes' }}
                  accessibilityLabel={REFLECTION_COPY.yes}
                >
                  <Text style={[styles.choiceText, partnerCheckin === 'yes' && styles.choiceTextOn]}>
                    {REFLECTION_COPY.yes}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setPartnerCheckin('not_yet');
                    setConnectStep('partner-follow');
                  }}
                  style={({ pressed }) => [
                    styles.choice,
                    partnerCheckin === 'not_yet' && styles.choiceOn,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: partnerCheckin === 'not_yet' }}
                  accessibilityLabel={REFLECTION_COPY.notYet}
                >
                  <Text style={[styles.choiceText, partnerCheckin === 'not_yet' && styles.choiceTextOn]}>
                    {REFLECTION_COPY.notYet}
                  </Text>
                </Pressable>
              </>
            ) : null}
            {connectReady && connectStep === 'partner-follow' && partnerCheckin === 'yes' ? (
              <>
                <Text style={styles.body}>{REFLECTION_COPY.partnerYes}</Text>
                <Pressable
                  onPress={goCoach}
                  style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={REFLECTION_COPY.next}
                >
                  <Text style={styles.primaryText}>{REFLECTION_COPY.next}</Text>
                </Pressable>
              </>
            ) : null}
            {connectReady && connectStep === 'partner-follow' && partnerCheckin === 'not_yet' ? (
              <>
                <Text style={styles.question}>{REFLECTION_COPY.partnerNote}</Text>
                <Pressable
                  onPress={() => void openPartnerNote()}
                  style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={REFLECTION_COPY.sendNote}
                >
                  <Text style={styles.choiceText}>{REFLECTION_COPY.sendNote}</Text>
                </Pressable>
                <Pressable
                  onPress={goCoach}
                  style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={REFLECTION_COPY.skip}
                >
                  <Text style={styles.primaryText}>{REFLECTION_COPY.skip}</Text>
                </Pressable>
              </>
            ) : null}
            {connectReady && connectStep === 'partner' && !skipPartner && partners.length === 0 ? (
              <>
                <Text style={styles.question}>{REFLECTION_COPY.partnerInvite}</Text>
                <Pressable
                  onPress={() => {
                    setPartnerCheckin('invited');
                    setNoteSentTo(null);
                    setInviteOpen(true);
                  }}
                  style={({ pressed }) => [
                    styles.choice,
                    partnerCheckin === 'invited' && styles.choiceOn,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: partnerCheckin === 'invited' }}
                  accessibilityLabel={REFLECTION_COPY.inviteCode}
                >
                  <Text style={[styles.choiceText, partnerCheckin === 'invited' && styles.choiceTextOn]}>
                    {REFLECTION_COPY.inviteCode}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setPartnerCheckin('not_now');
                    setNoteSentTo(null);
                    goCoach();
                  }}
                  style={({ pressed }) => [
                    styles.choice,
                    partnerCheckin === 'not_now' && styles.choiceOn,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: partnerCheckin === 'not_now' }}
                  accessibilityLabel={REFLECTION_COPY.notNow}
                >
                  <Text style={[styles.choiceText, partnerCheckin === 'not_now' && styles.choiceTextOn]}>
                    {REFLECTION_COPY.notNow}
                  </Text>
                </Pressable>
              </>
            ) : null}
            {connectReady && connectStep === 'coach' && !skipCoach && coaches.length > 0 ? (
              <>
                <Text style={styles.question}>{REFLECTION_COPY.coachQuestion}</Text>
                <Pressable
                  onPress={() => {
                    setCoachCheckin('yes');
                    setSection('next');
                  }}
                  style={({ pressed }) => [
                    styles.choice,
                    coachCheckin === 'yes' && styles.choiceOn,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: coachCheckin === 'yes' }}
                  accessibilityLabel={REFLECTION_COPY.yes}
                >
                  <Text style={[styles.choiceText, coachCheckin === 'yes' && styles.choiceTextOn]}>
                    {REFLECTION_COPY.yes}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setCoachCheckin('not_yet');
                    setConnectStep('coach-follow');
                  }}
                  style={({ pressed }) => [
                    styles.choice,
                    coachCheckin === 'not_yet' && styles.choiceOn,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: coachCheckin === 'not_yet' }}
                  accessibilityLabel={REFLECTION_COPY.notYet}
                >
                  <Text style={[styles.choiceText, coachCheckin === 'not_yet' && styles.choiceTextOn]}>
                    {REFLECTION_COPY.notYet}
                  </Text>
                </Pressable>
              </>
            ) : null}
            {connectReady && connectStep === 'coach-follow' ? (
              <>
                <Text style={styles.question}>{REFLECTION_COPY.coachTime}</Text>
                <Pressable
                  onPress={() => {
                    pendingAfterSheet.current = 'next';
                    setSupportOpen(true);
                  }}
                  style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={REFLECTION_COPY.setUpTime}
                >
                <Text style={styles.primaryText}>{REFLECTION_COPY.setUpTime}</Text>
              </Pressable>
              <Pressable
                onPress={() => setSection('next')}
                style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={REFLECTION_COPY.skip}
              >
                <Text style={styles.choiceText}>{REFLECTION_COPY.skip}</Text>
              </Pressable>
            </>
          ) : null}
            {connectReady && connectStep === 'coach' && !skipCoach && coaches.length === 0 && coachRequestPending ? (
              <>
                <Text style={styles.body}>{REFLECTION_COPY.coachPending}</Text>
                <Pressable
                  onPress={() => {
                    setCoachCheckin('pending');
                    setSection('next');
                  }}
                  style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={REFLECTION_COPY.next}
                >
                  <Text style={styles.primaryText}>{REFLECTION_COPY.next}</Text>
                </Pressable>
              </>
            ) : null}
            {connectReady &&
            connectStep === 'coach' &&
            !skipCoach &&
            coaches.length === 0 &&
            !coachRequestPending ? (
              <>
                <Text style={styles.question}>{REFLECTION_COPY.coachOffer}</Text>
                <Pressable
                  onPress={() => {
                    setCoachCheckin('requested');
                    pendingAfterSheet.current = 'next';
                    setSupportOpen(true);
                  }}
                  style={({ pressed }) => [
                    styles.choice,
                    coachCheckin === 'requested' && styles.choiceOn,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: coachCheckin === 'requested' }}
                  accessibilityLabel={REFLECTION_COPY.yes}
                >
                  <Text style={[styles.choiceText, coachCheckin === 'requested' && styles.choiceTextOn]}>
                    {REFLECTION_COPY.yes}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setCoachCheckin('not_now');
                    setSection('next');
                  }}
                  style={({ pressed }) => [
                    styles.choice,
                    coachCheckin === 'not_now' && styles.choiceOn,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: coachCheckin === 'not_now' }}
                  accessibilityLabel={REFLECTION_COPY.notNow}
                >
                  <Text style={[styles.choiceText, coachCheckin === 'not_now' && styles.choiceTextOn]}>
                    {REFLECTION_COPY.notNow}
                  </Text>
                </Pressable>
              </>
            ) : null}
          </View>
        ) : null}

        {section === 'next' ? (
          <View style={styles.stack}>
            <SectionTrail current="next" reached={reached} onPress={jumpTo} />
            {nextGoalIds.length === 0 ? (
              <>
                <Text style={styles.body}>{REFLECTION_COPY.allSet}</Text>
                <Pressable
                  onPress={() => setSection('summary')}
                  style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={REFLECTION_COPY.next}
                >
                  <Text style={styles.primaryText}>{REFLECTION_COPY.next}</Text>
                </Pressable>
              </>
            ) : null}
            {nextGoalIds.length > 0 && nextGoal ? (
              <NextWeekGoal
                goal={nextGoal}
                nodes={nodes}
                weekStartsOn={weekStartsOn}
                selectedStepId={nextStepIds.find((item) => item.goalId === nextGoal.id)?.stepId ?? null}
                onToggleDay={toggleHabitDay}
                onChooseStep={(step) => chooseNextStep(nextGoal.id, step)}
                onContinue={() => {
                  if (nextIndex < nextGoalIds.length - 1) {
                    setNextIndex((index) => index + 1);
                  } else {
                    setSection('summary');
                  }
                }}
              />
            ) : null}
          </View>
        ) : null}

        {section === 'summary' ? (
          <View style={styles.stack}>
            <SectionTrail current="next" reached={reached} onPress={jumpTo} />
            <View style={styles.summary}>
              <Text style={styles.question}>{REFLECTION_COPY.summaryTitle}</Text>
              {changes.length === 0 ? (
                <Text style={styles.body}>{REFLECTION_COPY.noChanges}</Text>
              ) : (
                [...new Set(changes)].map((line) => (
                  <Text key={line} style={styles.body}>
                    {line}
                  </Text>
                ))
              )}
              {noteSentTo ? (
                <Text style={styles.body}>
                  {REFLECTION_COPY.partnerLineNote.replace('[name]', noteSentTo)}
                </Text>
              ) : partnerOutcome(partnerCheckin) ? (
                <Text style={styles.body}>{partnerOutcome(partnerCheckin)}</Text>
              ) : null}
              {coachOutcome(coachCheckin) ? (
                <Text style={styles.body}>{coachOutcome(coachCheckin)}</Text>
              ) : null}
              {nextStepIds.map((item) => {
                const step = nodes.find((goal) => goal.id === item.stepId);
                const goal = nodes.find((entry) => entry.id === item.goalId);
                if (!step) {
                  return null;
                }
                return (
                  <Text key={item.goalId} style={styles.body}>
                    {`${REFLECTION_COPY.nextUp}: ${step.title || 'Untitled'} · ${goal?.title || 'Untitled'}`}
                  </Text>
                );
              })}
            </View>
            <Pressable
              onPress={() => void finishReflection()}
              disabled={saving}
              style={({ pressed }) => [styles.primary, pressed && styles.pressed, saving && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={REFLECTION_COPY.done}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>{REFLECTION_COPY.done}</Text>
              )}
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
      {sheets}
    </KeyboardSafe>
  );
}

function NextWeekGoal({
  goal,
  nodes,
  weekStartsOn,
  selectedStepId,
  onToggleDay,
  onChooseStep,
  onContinue,
}: {
  goal: Goal;
  nodes: Goal[];
  weekStartsOn: WeekStart;
  selectedStepId: string | null;
  onToggleDay: (habit: Goal, day: number) => void;
  onChooseStep: (step: Goal) => void;
  onContinue: () => void;
}) {
  const habit = repeatingStep(goal.id, nodes);
  const steps = oneTimeSteps(goal.id, nodes);
  return (
    <>
      {habit ? (
        <View style={styles.days}>
          {weekdayOrder(weekStartsOn).map((day) => {
            const selected = (habit.plannedDays ?? []).includes(day);
            return (
              <Pressable
                key={day}
                onPress={() => onToggleDay(habit, day)}
                style={[formFieldStyles.dayChip, selected && formFieldStyles.dayChipSelected]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={WEEKDAY_NAMES[day]}
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
      ) : null}
      {steps.length > 0 ? (
        <>
          <Text style={styles.question}>
            {REFLECTION_COPY.whatsNext.replace('[goal]', goal.title || 'Untitled')}
          </Text>
          {steps.map((step) => {
            const selected = selectedStepId === step.id;
            return (
              <Pressable
                key={step.id}
                onPress={() => onChooseStep(step)}
                style={({ pressed }) => [
                  styles.choice,
                  selected && styles.choiceOn,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={step.title || 'Untitled'}
              >
                <Text style={[styles.choiceText, selected && styles.choiceTextOn]}>
                  {step.title || 'Untitled'}
                </Text>
              </Pressable>
            );
          })}
        </>
      ) : null}
      <Pressable
        onPress={onContinue}
        style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={habit ? REFLECTION_COPY.keepDays : REFLECTION_COPY.next}
      >
        <Text style={styles.primaryText}>{habit ? REFLECTION_COPY.keepDays : REFLECTION_COPY.next}</Text>
      </Pressable>
    </>
  );
}

function SavedReflection({ weekStart, goals }: { weekStart: string; goals: Goal[] }) {
  const [review, setReview] = useState<WeekReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getReview(weekStart)
      .then((row) => {
        if (!cancelled) {
          setReview(row);
          setError(null);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : REFLECTION_COPY.couldNotLoad);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [weekStart]);

  return (
    <KeyboardSafe style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? <ActivityIndicator color="#007aff" /> : null}
        {error ? <Text style={styles.soon}>{error}</Text> : null}
        {!loading && !error && !review ? (
          <Text style={styles.soon}>{REFLECTION_COPY.couldNotLoad}</Text>
        ) : null}
        {review ? (
          <View style={styles.summary}>
            {review.goalCheckins.map((item) => {
              const goal = goals.find((entry) => entry.id === item.goal_id);
              return (
                <Text key={item.goal_id} style={styles.body}>
                  {`${goal?.title || 'Untitled'}: ${answerLabel(item.answer)}`}
                </Text>
              );
            })}
            {partnerOutcome(review.partnerCheckin) ? (
              <Text style={styles.body}>{partnerOutcome(review.partnerCheckin)}</Text>
            ) : null}
            {coachOutcome(review.coachCheckin) ? (
              <Text style={styles.body}>{coachOutcome(review.coachCheckin)}</Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </KeyboardSafe>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f2f2f7',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  stack: {
    gap: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  trailPad: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  trailRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  trailItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trailOn: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: '#111',
  },
  trailDone: {
    fontSize: 13,
    lineHeight: 18,
    color: '#007aff',
  },
  trailOff: {
    fontSize: 13,
    lineHeight: 18,
    color: '#8e8e93',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
    padding: 12,
  },
  confirmCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    gap: 12,
    marginBottom: 12,
  },
  choice: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e5ea',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  choiceOn: {
    backgroundColor: '#e8f1ff',
    borderColor: '#007aff',
  },
  choiceText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111',
    textAlign: 'center',
  },
  choiceTextOn: {
    color: '#007aff',
  },
  soon: {
    fontSize: 13,
    lineHeight: 18,
    color: '#8e8e93',
  },
  donutBlock: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  donutWrap: {
    width: DONUT_SIZE,
    height: DONUT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutValue: {
    position: 'absolute',
    fontSize: 28,
    fontWeight: '700',
    color: '#111',
  },
  phrase: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    textAlign: 'center',
  },
  win: {
    fontSize: 15,
    lineHeight: 20,
    color: '#111',
  },
  question: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    color: '#111',
  },
  body: {
    fontSize: 17,
    lineHeight: 22,
    color: '#111',
  },
  primary: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#007aff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  pressed: {
    opacity: 0.55,
  },
  days: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summary: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
});
