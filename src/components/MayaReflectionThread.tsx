import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  View,
  type ViewInstance,
} from 'react-native';
import {
  MAYA_REFLECTION,
  mayaAdjustLine,
  mayaClose,
  mayaHello,
  mayaWinsLine,
} from '../constants/maya/reflection';
import { REFLECTION_ANSWERS, REFLECTION_COPY, type ReflectionAnswerId } from '../constants/reflection';
import { getDisplayName } from '../lib/profileApi';
import type { ReflectionDraft, ReflectionSection } from '../lib/reflectionDraft';
import { answerLabel, personName } from '../lib/reflectionFlow';
import type { Connection } from '../types/community';
import type { Goal } from '../types/goal';

type AnswerRecord = { goal_id: string; answer: ReflectionAnswerId };

export type ReflectionEdit =
  | { kind: 'goal'; goalId: string }
  | { kind: 'others' }
  | { kind: 'partner' }
  | { kind: 'coach' };

export type ReflectionTrailId = 'look' | 'adjust' | 'connect' | 'next';

const RANK: Record<ReflectionSection, number> = {
  choice: 0,
  look: 1,
  adjust: 2,
  connect: 3,
  next: 4,
  summary: 5,
};

export function MayaReflectionThread(props: {
  section: ReflectionSection;
  dayName: string;
  loading: boolean;
  loadError: string | null;
  onRetry: () => void;
  lookCard: ReactNode;
  wins: string[];
  onStartAdjust: () => void;
  adjustPhase: 'one' | 'others' | 'extra' | 'none';
  pickedIds: string[];
  adjustIndex: number;
  extraId: string | null;
  viewedExtraIds: string[];
  answers: AnswerRecord[];
  nodes: Goal[];
  remaining: Goal[];
  onAnswer: (goalId: string, answer: ReflectionAnswerId) => void;
  onFinishPicked: () => void;
  onOpenExtra: (goalId: string) => void;
  onImGood: () => void;
  onCloseExtra: () => void;
  renderGoal: (goalId: string, answer: ReflectionAnswerId | null) => ReactNode;
  connectReady: boolean;
  connectStep: ReflectionDraft['connectStep'];
  skipPartner: boolean;
  partners: Connection[];
  partnerCheckin: ReflectionDraft['partnerCheckin'];
  noteSentTo: string | null;
  onPartnerYes: () => void;
  onPartnerNotYet: () => void;
  onSendNote: () => void;
  onSkipToCoach: () => void;
  onInvite: () => void;
  onPartnerNotNow: () => void;
  coaches: Connection[];
  skipCoach: boolean;
  coachBroughtBack: boolean;
  coachRequestPending: boolean;
  coachCheckin: ReflectionDraft['coachCheckin'];
  onCoachYes: () => void;
  onCoachNotYet: () => void;
  onSetUpTime: () => void;
  onSkipCoachTime: () => void;
  onCoachPendingNext: () => void;
  onRequestCoach: () => void;
  onCoachNotNow: () => void;
  nextEmpty: boolean;
  onNextEmptyContinue: () => void;
  nextEditor: ReactNode;
  nextLines: string[];
  changes: string[];
  partnerLine: string | null;
  coachLine: string | null;
  saving: boolean;
  onDone: () => void;
  editing: ReflectionEdit | null;
  onEditGoal: (goalId: string) => void;
  onEditOthers: () => void;
  onEditPartner: () => void;
  onEditCoach: () => void;
  scrollTarget: { id: ReflectionTrailId; token: number } | null;
}) {
  const scrollRef = useRef<ScrollViewInstance>(null);
  const contentRef = useRef<ViewInstance>(null);
  const anchors = useRef<Partial<Record<ReflectionTrailId, number>>>({});
  const followEnd = useRef(true);
  const scrollY = useRef(0);
  const viewportH = useRef(0);
  const prevEditing = useRef<ReflectionEdit | null>(null);
  const [name, setName] = useState('');
  const [replyAnchor, setReplyAnchor] = useState<string | null>(null);
  if (props.editing != null || prevEditing.current != null) {
    followEnd.current = false;
  }
  const editing = props.editing;
  const hideAfterGoal = editing?.kind === 'goal';
  const hideConnect = editing?.kind === 'goal' || editing?.kind === 'others';
  const hideCoach = hideConnect || editing?.kind === 'partner';
  const hideNext = hideCoach || editing?.kind === 'coach';
  const at = (step: ReflectionSection) => RANK[props.section] >= RANK[step];
  const winsLine = mayaWinsLine(props.wins);
  const pastAdjust = props.adjustPhase !== 'one';
  const adjusting = props.section === 'adjust';

  useEffect(() => {
    void getDisplayName()
      .then(setName)
      .catch(() => {
        // The hello still reads clearly without a name.
      });
  }, []);

  const revealReply = useCallback((node: ViewInstance) => {
    const content = contentRef.current;
    const scroller = scrollRef.current;
    if (!content || !scroller) {
      return;
    }
    node.measureLayout(
      content,
      (_left, top, _width, height) => {
        const replyBottom = 16 + top + height;
        const visibleBottom = scrollY.current + viewportH.current;
        const margin = 16;
        if (replyBottom > visibleBottom - margin) {
          scroller.scrollTo({
            y: scrollY.current + (replyBottom - visibleBottom) + margin,
            animated: true,
          });
        }
      },
      () => {},
    );
  }, []);

  useEffect(() => {
    if (props.editing) {
      prevEditing.current = props.editing;
      setReplyAnchor(null);
      return;
    }
    const revised = prevEditing.current;
    if (revised) {
      prevEditing.current = null;
      followEnd.current = false;
      setReplyAnchor(revised.kind === 'goal' ? `goal:${revised.goalId}` : revised.kind);
      return;
    }
    followEnd.current = true;
    scrollRef.current?.scrollTo({ y: 100000, animated: true });
  }, [
    props.editing,
    props.section,
    props.adjustIndex,
    props.adjustPhase,
    props.connectStep,
    props.answers.length,
    props.partnerCheckin,
    props.coachCheckin,
  ]);

  useEffect(() => {
    if (!props.scrollTarget) {
      return;
    }
    followEnd.current = false;
    const id = props.scrollTarget.id;
    const timer = setTimeout(() => {
      const y = anchors.current[id];
      if (y != null) {
        scrollRef.current?.scrollTo({ y, animated: true });
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [props.scrollTarget]);

  const titleOf = (goalId: string) => props.nodes.find((goal) => goal.id === goalId)?.title || 'Untitled';
  const summaryLines = [
    ...new Set(props.changes),
    ...(props.partnerLine ? [props.partnerLine] : []),
    ...(props.coachLine ? [props.coachLine] : []),
    ...props.nextLines,
  ];
  const replyTarget = replyFor(replyAnchor, {
    section: props.section,
    partnerCheckin: props.partnerCheckin,
    coachCheckin: props.coachCheckin,
  });
  const partnerQuestion =
    props.partners.length > 1
      ? REFLECTION_COPY.partnerQuestionMany
      : REFLECTION_COPY.partnerQuestion.replace(
          '[name]',
          props.partners[0] ? personName(props.partners[0]) : 'your accountability partner',
        );

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      scrollEventThrottle={16}
      onScroll={(event) => {
        scrollY.current = event.nativeEvent.contentOffset.y;
      }}
      onLayout={(event) => {
        viewportH.current = event.nativeEvent.layout.height;
      }}
      onContentSizeChange={() => {
        if (followEnd.current) {
          scrollRef.current?.scrollTo({ y: 100000, animated: true });
        }
      }}
    >
      <View ref={contentRef} collapsable={false} style={styles.thread}>
      <View onLayout={(event) => { anchors.current.look = event.nativeEvent.layout.y; }}>
        <Divider label={REFLECTION_COPY.lookBack} />
      </View>
      <MayaBubble text={mayaHello(name)} />
      {props.loading && props.nodes.length === 0 ? <ActivityIndicator color="#007aff" /> : null}
      {props.loadError && props.nodes.length === 0 ? (
        <ChoiceButton label={REFLECTION_COPY.retry} onPress={props.onRetry} />
      ) : null}
      {(!props.loading && !props.loadError) || props.nodes.length > 0 ? props.lookCard : null}
      {winsLine ? <MayaBubble text={winsLine} /> : null}
      {props.section === 'look' && ((!props.loading && !props.loadError) || props.nodes.length > 0) ? (
        <ChoiceButton label={REFLECTION_COPY.next} onPress={props.onStartAdjust} />
      ) : null}

      {at('adjust') ? (
        <>
          <View onLayout={(event) => { anchors.current.adjust = event.nativeEvent.layout.y; }}>
            <Divider label={REFLECTION_COPY.adjust} />
          </View>
          {props.adjustPhase === 'none' ? (
            <>
              <MayaBubble text={MAYA_REFLECTION.nothingSlowed} />
              {props.section === 'adjust' ? (
                <ChoiceButton label={REFLECTION_COPY.next} onPress={props.onImGood} />
              ) : null}
            </>
          ) : (
            <>
              <MayaBubble text={MAYA_REFLECTION.adjustIntro} />
              {props.pickedIds.map((goalId, index) => {
                const answer = props.answers.find((item) => item.goal_id === goalId)?.answer ?? null;
                const current = !pastAdjust && index === props.adjustIndex;
                const editingThis = editing?.kind === 'goal' && editing.goalId === goalId;
                if (editing?.kind === 'goal') {
                  const hold = props.pickedIds.indexOf(editing.goalId);
                  if (hold >= 0 && index > hold) {
                    return null;
                  }
                } else if (!pastAdjust && index > props.adjustIndex) {
                  return null;
                }
                const showChoices = editingThis || (current && !answer);
                return (
                  <View key={goalId} style={styles.step}>
                    <MayaBubble text={MAYA_REFLECTION.howDid.replace('[goal]', titleOf(goalId))} />
                    {showChoices
                      ? REFLECTION_ANSWERS.map((option) => (
                          <ChoiceButton
                            key={option.id}
                            label={option.label}
                            selected={answer === option.id}
                            onPress={() => props.onAnswer(goalId, option.id)}
                          />
                        ))
                      : null}
                    {answer && !editingThis ? (
                      <UserBubble text={answerLabel(answer)} onPress={() => props.onEditGoal(goalId)} />
                    ) : null}
                    {answer && !editingThis ? (
                      <Reveal active={replyTarget === `goal:${goalId}`} onReveal={revealReply}>
                        <MayaBubble text={mayaAdjustLine(answer)} />
                      </Reveal>
                    ) : null}
                    {answer && !editingThis ? props.renderGoal(goalId, answer) : null}
                    {current && answer && !editingThis ? (
                      <ChoiceButton
                        label={
                          props.adjustIndex < props.pickedIds.length - 1
                            ? REFLECTION_COPY.nextGoal
                            : REFLECTION_COPY.doneGoal
                        }
                        onPress={props.onFinishPicked}
                      />
                    ) : null}
                  </View>
                );
              })}
              {!hideAfterGoal &&
              (props.adjustPhase === 'others' || props.adjustPhase === 'extra' || props.viewedExtraIds.length > 0) ? (
                <MayaBubble text={MAYA_REFLECTION.otherGoals} />
              ) : null}
              {!hideAfterGoal && ((adjusting && props.adjustPhase === 'others') || editing?.kind === 'others')
                ? props.remaining.map((goal) => (
                    <ChoiceButton
                      key={goal.id}
                      label={goal.title || 'Untitled'}
                      onPress={() => props.onOpenExtra(goal.id)}
                    />
                  ))
                : null}
              {!hideAfterGoal
                ? props.viewedExtraIds.map((goalId) => (
                    <View key={goalId}>{props.renderGoal(goalId, null)}</View>
                  ))
                : null}
              {!hideAfterGoal && adjusting && props.adjustPhase === 'extra' && props.extraId ? (
                <ChoiceButton label={REFLECTION_COPY.done} onPress={props.onCloseExtra} />
              ) : null}
              {!hideAfterGoal && ((adjusting && props.adjustPhase === 'others') || editing?.kind === 'others') ? (
                <ChoiceButton label={REFLECTION_COPY.imGood} onPress={props.onImGood} />
              ) : null}
              {!hideAfterGoal &&
              !adjusting &&
              editing?.kind !== 'others' &&
              (props.adjustPhase === 'others' || props.adjustPhase === 'extra') ? (
                <UserBubble text={REFLECTION_COPY.imGood} onPress={props.onEditOthers} />
              ) : null}
            </>
          )}
        </>
      ) : null}

      {!hideConnect && at('connect') ? (
        <>
          <View onLayout={(event) => { anchors.current.connect = event.nativeEvent.layout.y; }}>
            <Divider label={REFLECTION_COPY.connect} />
          </View>
          {props.section === 'connect' && !props.connectReady ? <ActivityIndicator color="#007aff" /> : null}
          {props.connectReady &&
          !props.skipPartner &&
          props.partners.length > 0 &&
          (props.connectStep === 'partner' || props.connectStep === 'partner-follow' || props.partnerCheckin != null) ? (
            <>
              <Reveal active={replyTarget === 'connect-q'} onReveal={revealReply}>
                <MayaBubble text={partnerQuestion} />
              </Reveal>
              {(editing?.kind === 'partner' ||
                (props.section === 'connect' && props.connectStep === 'partner' && !props.partnerCheckin)) &&
              props.partners.length > 0 ? (
                <>
                  <ChoiceButton
                    label={REFLECTION_COPY.yes}
                    selected={props.partnerCheckin === 'yes'}
                    onPress={props.onPartnerYes}
                  />
                  <ChoiceButton
                    label={REFLECTION_COPY.notYet}
                    selected={props.partnerCheckin === 'not_yet'}
                    onPress={props.onPartnerNotYet}
                  />
                </>
              ) : null}
            </>
          ) : null}
          {props.partnerCheckin === 'yes' && editing?.kind !== 'partner' ? (
            <>
              <UserBubble text={REFLECTION_COPY.yes} onPress={props.onEditPartner} />
              <Reveal active={replyTarget === 'love'} onReveal={revealReply}>
                <MayaBubble text={MAYA_REFLECTION.partnerYes} />
              </Reveal>
              {props.section === 'connect' && props.connectStep === 'partner-follow' ? (
                <ChoiceButton label={REFLECTION_COPY.next} onPress={props.onSkipToCoach} />
              ) : null}
            </>
          ) : null}
          {props.partnerCheckin === 'not_yet' && editing?.kind !== 'partner' ? (
            <>
              <UserBubble text={REFLECTION_COPY.notYet} onPress={props.onEditPartner} />
              {props.section === 'connect' && props.connectStep === 'partner-follow' ? (
                <>
                  <Reveal active={replyTarget === 'note'} onReveal={revealReply}>
                    <MayaBubble text={REFLECTION_COPY.partnerNote} />
                  </Reveal>
                  <ChoiceButton label={REFLECTION_COPY.sendNote} onPress={props.onSendNote} />
                  <ChoiceButton label={REFLECTION_COPY.skip} onPress={props.onSkipToCoach} />
                </>
              ) : null}
              {props.noteSentTo ? (
                <UserBubble text={REFLECTION_COPY.partnerLineNote.replace('[name]', props.noteSentTo)} />
              ) : null}
            </>
          ) : null}
          {props.connectReady &&
          !props.skipPartner &&
          props.partners.length === 0 &&
          (props.connectStep === 'partner' || props.partnerCheckin != null) ? (
            <>
              <Reveal active={replyTarget === 'connect-q'} onReveal={revealReply}>
                <MayaBubble text={REFLECTION_COPY.partnerInvite} />
              </Reveal>
              {(editing?.kind === 'partner' ||
                (props.section === 'connect' && props.connectStep === 'partner' && !props.partnerCheckin)) &&
              props.partners.length === 0 ? (
                <>
                  <ChoiceButton
                    label={REFLECTION_COPY.inviteCode}
                    selected={props.partnerCheckin === 'invited'}
                    onPress={props.onInvite}
                  />
                  <ChoiceButton
                    label={REFLECTION_COPY.notNow}
                    selected={props.partnerCheckin === 'not_now'}
                    onPress={props.onPartnerNotNow}
                  />
                </>
              ) : null}
            </>
          ) : null}
          {props.partnerCheckin === 'invited' && editing?.kind !== 'partner' ? (
            <UserBubble text={REFLECTION_COPY.inviteCode} onPress={props.onEditPartner} />
          ) : null}
          {props.partnerCheckin === 'not_now' && editing?.kind !== 'partner' ? (
            <UserBubble text={REFLECTION_COPY.notNow} onPress={props.onEditPartner} />
          ) : null}

          {!hideCoach && props.connectReady &&
          !props.skipCoach &&
          props.coaches.length > 0 &&
          (props.connectStep === 'coach' || props.connectStep === 'coach-follow' || props.coachCheckin != null || editing?.kind === 'coach') ? (
            <>
              <Reveal active={replyTarget === 'coach-q'} onReveal={revealReply}>
                <MayaBubble text={REFLECTION_COPY.coachQuestion} />
              </Reveal>
              {editing?.kind === 'coach' || (props.section === 'connect' && props.connectStep === 'coach') ? (
                <>
                  <ChoiceButton
                    label={REFLECTION_COPY.yes}
                    selected={props.coachCheckin === 'yes'}
                    onPress={props.onCoachYes}
                  />
                  <ChoiceButton
                    label={REFLECTION_COPY.notYet}
                    selected={props.coachCheckin === 'not_yet'}
                    onPress={props.onCoachNotYet}
                  />
                </>
              ) : null}
            </>
          ) : null}
          {!hideCoach &&
          props.coachCheckin === 'yes' &&
          editing?.kind !== 'coach' &&
          !(props.section === 'connect' && props.connectStep === 'coach') ? (
            <UserBubble text={REFLECTION_COPY.yes} onPress={props.onEditCoach} />
          ) : null}
          {!hideCoach && props.section === 'connect' && props.connectStep === 'coach-follow' && editing?.kind !== 'coach' ? (
            <>
              <UserBubble text={REFLECTION_COPY.notYet} onPress={props.onEditCoach} />
              <Reveal active={replyTarget === 'time'} onReveal={revealReply}>
                <MayaBubble text={REFLECTION_COPY.coachTime} />
              </Reveal>
              <ChoiceButton label={REFLECTION_COPY.setUpTime} onPress={props.onSetUpTime} />
              <ChoiceButton label={REFLECTION_COPY.skip} onPress={props.onSkipCoachTime} />
            </>
          ) : null}
          {!hideCoach && props.connectReady &&
          !props.skipCoach &&
          props.coaches.length === 0 &&
          props.coachRequestPending &&
          (props.connectStep === 'coach' || props.coachCheckin != null || editing?.kind === 'coach') ? (
            <>
              <Reveal active={replyTarget === 'coach-q'} onReveal={revealReply}>
                <MayaBubble text={REFLECTION_COPY.coachPending} />
              </Reveal>
              {editing?.kind === 'coach' || (props.section === 'connect' && props.connectStep === 'coach') ? (
                <ChoiceButton label={REFLECTION_COPY.next} onPress={props.onCoachPendingNext} />
              ) : null}
            </>
          ) : null}
          {!hideCoach && props.connectReady &&
          !props.skipCoach &&
          props.coaches.length === 0 &&
          !props.coachRequestPending &&
          (props.connectStep === 'coach' || props.coachCheckin != null || editing?.kind === 'coach') ? (
            <>
              <Reveal active={replyTarget === 'coach-q'} onReveal={revealReply}>
                <MayaBubble
                  text={
                    props.coachBroughtBack ? MAYA_REFLECTION.coachBroughtBack : REFLECTION_COPY.coachOffer
                  }
                />
              </Reveal>
              {editing?.kind === 'coach' || (props.section === 'connect' && props.connectStep === 'coach') ? (
                <>
                  <ChoiceButton
                    label={REFLECTION_COPY.yes}
                    selected={props.coachCheckin === 'requested'}
                    onPress={props.onRequestCoach}
                  />
                  <ChoiceButton
                    label={REFLECTION_COPY.notNow}
                    selected={props.coachCheckin === 'not_now'}
                    onPress={props.onCoachNotNow}
                  />
                </>
              ) : null}
            </>
          ) : null}
          {!hideCoach && props.coachCheckin === 'not_yet' && props.section !== 'connect' && editing?.kind !== 'coach' ? (
            <UserBubble text={REFLECTION_COPY.notYet} onPress={props.onEditCoach} />
          ) : null}
          {!hideCoach &&
          props.coachCheckin === 'requested' &&
          editing?.kind !== 'coach' &&
          !(props.section === 'connect' && props.connectStep === 'coach') ? (
            <UserBubble text={REFLECTION_COPY.yes} onPress={props.onEditCoach} />
          ) : null}
          {!hideCoach &&
          props.coachCheckin === 'not_now' &&
          props.coaches.length === 0 &&
          editing?.kind !== 'coach' &&
          !(props.section === 'connect' && props.connectStep === 'coach') ? (
            <UserBubble text={REFLECTION_COPY.notNow} onPress={props.onEditCoach} />
          ) : null}
          {!hideCoach && props.coachCheckin === 'pending' && props.section !== 'connect' ? (
            <MayaBubble text={REFLECTION_COPY.coachPending} />
          ) : null}
        </>
      ) : null}

      {!hideNext && at('next') ? (
        <>
          <View onLayout={(event) => { anchors.current.next = event.nativeEvent.layout.y; }}>
            <Divider label={REFLECTION_COPY.nextWeek} />
          </View>
          <Reveal active={replyTarget === 'next'} onReveal={revealReply}>
            <MayaBubble text={MAYA_REFLECTION.nextIntro} />
          </Reveal>
          {props.section === 'next' && props.nextEmpty ? (
            <>
              <MayaBubble text={REFLECTION_COPY.allSet} />
              <ChoiceButton label={REFLECTION_COPY.next} onPress={props.onNextEmptyContinue} />
            </>
          ) : null}
          {props.section === 'next' ? props.nextEditor : null}
        </>
      ) : null}

      {!hideNext && props.section === 'summary' ? (
        <>
          <MayaBubble text={props.changes.length === 0 ? MAYA_REFLECTION.noChanges : MAYA_REFLECTION.summaryIntro} />
          {summaryLines.length > 0 ? (
            <View style={styles.card}>
              {summaryLines.map((line, index) => (
                <Text key={`${index}-${line}`} style={styles.cardLine}>
                  {line}
                </Text>
              ))}
            </View>
          ) : null}
          <MayaBubble text={mayaClose(name, props.dayName)} />
          <Pressable
            onPress={props.onDone}
            disabled={props.saving}
            style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={REFLECTION_COPY.done}
          >
            {props.saving ? (
              <ActivityIndicator color="#007aff" />
            ) : (
              <Text style={styles.choiceText}>{REFLECTION_COPY.done}</Text>
            )}
          </Pressable>
        </>
      ) : null}
      </View>
    </ScrollView>
  );
}

function replyFor(
  anchor: string | null,
  state: {
    section: ReflectionSection;
    partnerCheckin: ReflectionDraft['partnerCheckin'];
    coachCheckin: ReflectionDraft['coachCheckin'];
  },
): string | null {
  if (!anchor) {
    return null;
  }
  if (anchor.startsWith('goal:')) {
    return anchor;
  }
  if (anchor === 'others') {
    return state.section === 'next' ? 'next' : 'connect-q';
  }
  if (anchor === 'partner') {
    if (state.section === 'next') {
      return 'next';
    }
    if (state.partnerCheckin === 'yes') {
      return 'love';
    }
    if (state.partnerCheckin === 'not_yet') {
      return 'note';
    }
    return 'coach-q';
  }
  if (anchor === 'coach') {
    return state.coachCheckin === 'not_yet' ? 'time' : 'next';
  }
  return null;
}

function Reveal({
  active,
  onReveal,
  children,
}: {
  active: boolean;
  onReveal: (node: ViewInstance) => void;
  children: ReactNode;
}) {
  const ref = useRef<ViewInstance>(null);
  useEffect(() => {
    if (!active || !ref.current) {
      return;
    }
    const node = ref.current;
    const timer = setTimeout(() => onReveal(node), 50);
    return () => clearTimeout(timer);
  }, [active, onReveal]);
  return (
    <View ref={ref} collapsable={false}>
      {children}
    </View>
  );
}

function MayaBubble({ text }: { text: string }) {
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

function UserBubble({ text, onPress }: { text: string; onPress?: () => void }) {
  const bubble = (
    <View style={styles.userBubble}>
      <Text style={styles.userText}>{text}</Text>
    </View>
  );
  if (!onPress) {
    return <View style={styles.userWrap}>{bubble}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      style={styles.userWrap}
      accessibilityRole="button"
      accessibilityLabel={`${text}. Change this answer`}
    >
      {bubble}
    </Pressable>
  );
}

function ChoiceButton({
  label,
  onPress,
  selected = false,
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.choice, selected && styles.choiceOn, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <Text style={[styles.choiceText, selected && styles.choiceTextOn]}>{label}</Text>
    </Pressable>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <View style={styles.dividerRow}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerText}>{label}</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  thread: {
    gap: 12,
  },
  step: {
    gap: 12,
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
  choice: {
    backgroundColor: '#fff',
    borderRadius: 14,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceOn: {
    backgroundColor: '#e8f1ff',
  },
  choiceText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#007aff',
    textAlign: 'center',
  },
  choiceTextOn: {
    color: '#007aff',
  },
  pressed: {
    opacity: 0.55,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#c7c7cc',
  },
  dividerText: {
    fontSize: 13,
    color: '#8e8e93',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  cardLine: {
    fontSize: 17,
    lineHeight: 22,
    color: '#111',
  },
});
