import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { MayaBubble, MayaLine, MayaReflectFrame } from './MayaReflectBubble';
import { ReflectNextChat } from './ReflectNextChat';
import { REFLECT_FLOW } from '../constants/maya/reflectFlow';
import { useReflectTheme } from '../constants/reflectTheme';
import { REFLECTION_COPY } from '../constants/reflection';
import { useCoachRequest } from '../context/CoachRequestContext';
import { useReflectMaya } from '../context/ReflectMayaContext';
import { useSettings } from '../context/SettingsContext';
import { todayLocal } from '../lib/localDate';
import { getDisplayName } from '../lib/profileApi';
import { coachLineBand, shouldShowRecapCoachLine } from '../lib/reflectCoachLine';
import { listReflectionHistory } from '../lib/reviewApi';
import { getLatestSupportRequest } from '../lib/supportApi';
import { REFLECT_POINT } from '../lib/reflectPoint';
import {
  EMPTY_REFLECT_ANSWERS,
  advanceJobBranch,
  applyReflectAnswer,
  reflectChoice,
  reflectDateComment,
  reflectPending,
  reflectWeekComment,
  type ReflectChip,
  type ReflectChoiceResult,
  type ReflectEffect,
  type ReflectExchange,
  type ReflectSnapshot,
  type ReflectStepId,
} from '../lib/reflectMayaPrompt';
import { branchCoach, childrenAreBranches } from '../lib/reflectNextSteps';
import { startOfWeek } from '../lib/week';
import type { Goal, GoalEntry } from '../types/goal';

/** The "Reflecting" pill. `nav` drops the extra row padding so it can sit in a title. */
export function ReflectPill({ nav = false }: { nav?: boolean }) {
  const theme = useReflectTheme();
  return (
    <View style={nav ? styles.pillNav : styles.pillWrap}>
      <View style={[styles.pill, { backgroundColor: theme.accentSoft }]}>
        <Text style={[styles.pillText, { color: theme.accent }]}>{REFLECT_FLOW.reflecting}</Text>
      </View>
    </View>
  );
}

function withName(template: string, name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return template.replace(', [name]', '');
  }
  return template.replace('[name]', trimmed);
}

function hubTone(percent: number, name: string): string {
  if (percent >= 80) {
    return withName(REFLECT_FLOW.hub.strong, name);
  }
  if (percent >= 50) {
    return withName(REFLECT_FLOW.hub.solid, name);
  }
  if (percent >= 1) {
    return withName(REFLECT_FLOW.hub.progress, name);
  }
  return withName(REFLECT_FLOW.hub.quiet, name);
}

function coachOffer(percent: number): { line: string; link: string } {
  const band = coachLineBand(percent);
  if (band === 'high') {
    return { line: REFLECT_FLOW.hub.coachHigh, link: REFLECT_FLOW.hub.coachHighLink };
  }
  if (band === 'solid') {
    return { line: REFLECT_FLOW.hub.coachSolid, link: REFLECT_FLOW.hub.coachSolidLink };
  }
  if (band === 'low') {
    return { line: REFLECT_FLOW.hub.coachLow, link: REFLECT_FLOW.hub.coachLowLink };
  }
  return { line: REFLECT_FLOW.hub.coachZero, link: REFLECT_FLOW.hub.coachZeroLink };
}

/** Opening card on the Reflect tab. Scrolls with the week. */
export function ReflectHubCard({
  percent,
  maya = true,
  weekStart,
}: {
  percent: number;
  maya?: boolean;
  weekStart?: string;
}) {
  const theme = useReflectTheme();
  const reflect = useReflectMaya();
  const markCoachLineShown = reflect?.markCoachLineShown;
  const { openCoachRequest } = useCoachRequest();
  const [name, setName] = useState('');
  const [coach, setCoach] = useState<{ line: string; link: string } | null>(null);

  useEffect(() => {
    if (!maya) {
      return;
    }
    let cancelled = false;
    getDisplayName()
      .then((displayName) => {
        if (!cancelled) {
          setName(displayName);
        }
      })
      .catch(() => {
        // The donut line still reads clearly without a name.
      });
    return () => {
      cancelled = true;
    };
  }, [maya]);

  useEffect(() => {
    if (!maya || !weekStart) {
      setCoach(null);
      return;
    }
    let cancelled = false;
    const today = todayLocal();
    Promise.all([listReflectionHistory(), getLatestSupportRequest()])
      .then(([reviews, request]) => {
        if (cancelled) {
          return;
        }
        const show = shouldShowRecapCoachLine({
          weekStart,
          percent,
          today,
          reviews,
          supportRequestAt: request?.createdAt ?? null,
        });
        if (show) {
          setCoach(coachOffer(percent));
          markCoachLineShown?.();
        } else {
          setCoach(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCoach(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [markCoachLineShown, maya, percent, weekStart]);

  const leave = () => {
    Alert.alert(REFLECT_FLOW.hub.leaveAsk, undefined, [
      { text: REFLECT_FLOW.hub.exit, onPress: () => reflect?.clear() },
      { text: REFLECT_FLOW.hub.keepGoing, style: 'cancel' },
    ]);
  };

  const exit = (
    <Pressable
      onPress={leave}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={REFLECT_FLOW.hub.exit}
    >
      <Text style={[styles.exit, { color: theme.accent }]}>{REFLECT_FLOW.hub.exit}</Text>
    </Pressable>
  );

  if (maya) {
    return (
      <MayaReflectFrame trailing={exit}>
        {coach ? (
          <>
            <MayaBubble>
              <MayaLine>{hubTone(percent, name)}</MayaLine>
              <MayaLine follow>{coach.line}</MayaLine>
            </MayaBubble>
            <Pressable
              onPress={() => openCoachRequest({ onSent: () => reflect?.markCoachRequested() })}
              hitSlop={8}
              style={({ pressed }) => [styles.under, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={coach.link}
            >
              <Text style={[styles.coachLink, { color: theme.accent }]}>{coach.link}</Text>
            </Pressable>
            <MayaBubble continued>
              <MayaLine>{REFLECT_FLOW.hub.pick}</MayaLine>
            </MayaBubble>
          </>
        ) : (
          <MayaBubble>
            <MayaLine>{hubTone(percent, name)}</MayaLine>
            <MayaLine follow>{REFLECT_FLOW.hub.pick}</MayaLine>
          </MayaBubble>
        )}
      </MayaReflectFrame>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.accentSoft, borderLeftColor: theme.accent }]}>
      <View style={styles.header}>
        <View style={styles.name} />
        {exit}
      </View>
      <View style={styles.thread}>
        <Text style={[styles.body, { color: theme.ink }]}>{REFLECT_FLOW.own.glance}</Text>
      </View>
    </View>
  );
}

export function ReflectMayaCard({
  goal,
  nodes,
  entries,
  onPoint,
  onOpenGoal,
  onGoalsUpdated,
}: {
  goal: Goal;
  nodes: Goal[];
  entries: GoalEntry[];
  onPoint: (id: string) => void;
  onOpenGoal: (id: string) => void;
  onGoalsUpdated: (goals: Goal[]) => void;
}) {
  const theme = useReflectTheme();
  const reflectSession = useReflectMaya();
  const { settings } = useSettings();
  const { openCoachRequest } = useCoachRequest();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const settlingRef = useRef(false);
  const [chat, setChat] = useState<{
    effect: Extract<ReflectEffect, { type: 'handoff' }>;
    chip: ReflectChip;
    choice: ReflectChoiceResult;
    snapshot: ReflectSnapshot;
    exchange: ReflectExchange;
    step: ReflectStepId;
  } | null>(null);
  const stored = reflectSession?.session?.exchanges[goal.id] ?? null;

  useEffect(() => {
    let cancelled = false;
    getDisplayName()
      .then((displayName) => {
        if (!cancelled) {
          setName(displayName);
        }
      })
      .catch(() => {
        // The done line still reads clearly without a name.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const today = todayLocal();
  const snapshot: ReflectSnapshot = {
    goal,
    nodes,
    entries,
    weekStart: reflectSession?.session?.weekStart ?? startOfWeek(today, settings.weekStart),
    weekStartsOn: settings.weekStart,
    today,
  };
  const pending = stored?.pending ?? (stored ? null : reflectPending('start', snapshot));
  const turns = stored?.turns ?? [];

  const settle = (
    held: {
      chip: ReflectChip;
      choice: ReflectChoiceResult;
      snapshot: ReflectSnapshot;
      exchange: ReflectExchange;
      step: ReflectStepId;
      subject: string;
    },
    created: Goal[],
    dismissed: boolean,
  ) => {
    if (settlingRef.current) {
      return;
    }
    settlingRef.current = true;
    if (!reflectSession) {
      setChat(null);
      savingRef.current = false;
      settlingRef.current = false;
      setSaving(false);
      return;
    }
    if (created.length > 0) {
      onGoalsUpdated(created);
    }
    const nextPending = reflectPending(held.step, held.snapshot);
    const reply = dismissed
      ? REFLECT_FLOW.r3c.skipped.replace('[branch or goal]', held.subject)
      : held.choice.reply;
    const prompt = held.exchange.pending?.prompt ?? pending?.prompt ?? '';
    const exchange: ReflectExchange = {
      answers: applyReflectAnswer(held.exchange.answers, held.chip.id),
      turns: [
        ...held.exchange.turns,
        { prompt, you: held.choice.you, reply, showCoach: held.choice.showCoach },
      ],
      pending: nextPending,
    };
    reflectSession.saveExchange(goal.id, exchange);
    if (dismissed) {
      onPoint(REFLECT_POINT.addStep);
    }
    setChat(null);
    savingRef.current = false;
    settlingRef.current = false;
    setSaving(false);
  };

  const choose = (chip: ReflectChip) => {
    if (!pending || savingRef.current || !reflectSession) {
      return;
    }
    savingRef.current = true;
    const current: ReflectExchange = stored ?? {
      answers: EMPTY_REFLECT_ANSWERS,
      turns: [],
      pending,
    };
    const choice = reflectChoice(pending, chip.id, snapshot, name);
    if (!choice) {
      savingRef.current = false;
      return;
    }
    const handoff = choice.effects.find((effect) => effect.type === 'handoff');
    if (handoff && handoff.type === 'handoff' && handoff.mode === 'branch' && !branchCoach(handoff.subject)) {
      savingRef.current = false;
      Alert.alert(REFLECTION_COPY.couldNotSave);
      return;
    }
    setSaving(true);
    void (async () => {
      let nextNodes = snapshot.nodes;
      try {
        for (const effect of choice.effects) {
          if (effect.type !== 'advance') {
            continue;
          }
          const updated = await advanceJobBranch(effect.currentId, effect.nextId, today);
          onGoalsUpdated(updated);
          const byId = new Map(updated.map((item) => [item.id, item]));
          nextNodes = nextNodes.map((item) => byId.get(item.id) ?? item);
        }
      } catch {
        savingRef.current = false;
        setSaving(false);
        Alert.alert(REFLECTION_COPY.couldNotSave);
        return;
      }
      const nextSnapshot = { ...snapshot, nodes: nextNodes };
      if (handoff && handoff.type === 'handoff') {
        setChat({
          effect: handoff,
          chip,
          choice,
          snapshot: nextSnapshot,
          exchange: current,
          step: pending.step,
        });
        return;
      }
      const nextPending = reflectPending(pending.step, nextSnapshot);
      const exchange: ReflectExchange = {
        answers: applyReflectAnswer(current.answers, chip.id),
        turns: [
          ...current.turns,
          { prompt: pending.prompt, you: choice.you, reply: choice.reply, showCoach: choice.showCoach },
        ],
        pending: nextPending,
      };
      reflectSession.saveExchange(goal.id, exchange);
      savingRef.current = false;
      setSaving(false);
      for (const effect of choice.effects) {
        if (effect.type === 'point') {
          onPoint(effect.id);
        } else if (effect.type === 'advance') {
          onPoint(effect.pointId);
        } else if (effect.type === 'coach') {
          openCoachRequest({ onSent: () => reflectSession.markCoachRequested() });
        }
      }
    })();
  };

  const weekComment = reflectWeekComment(snapshot);
  const dateComment = pending == null ? reflectDateComment(snapshot) : null;

  const hasWeek = weekComment.lines.length > 0;

  const showMe = (id: string) => (
    <Pressable
      onPress={() => onPoint(id)}
      hitSlop={8}
      style={({ pressed }) => [styles.under, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={REFLECT_FLOW.showMe}
    >
      <Text style={[styles.goalCoachLink, { color: theme.accent }]}>{REFLECT_FLOW.showMe}</Text>
    </Pressable>
  );

  return (
    <View>
      <MayaReflectFrame>
        {hasWeek ? (
          <MayaBubble>
            {weekComment.lines.map((line, index) => (
              <MayaLine
                key={`${index}-${line.text}`}
                follow={index > 0 && !line.bullet}
                bullet={line.bullet === true}
              >
                {line.text}
              </MayaLine>
            ))}
          </MayaBubble>
        ) : null}
        {weekComment.pointId ? showMe(weekComment.pointId) : null}
        {weekComment.openStep ? (
          <Pressable
            onPress={() => onOpenGoal(weekComment.openStep?.id ?? '')}
            hitSlop={8}
            style={({ pressed }) => [styles.under, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={weekComment.openStep.label}
          >
            <Text style={[styles.goalCoachLink, { color: theme.accent }]}>
              {weekComment.openStep.label}
            </Text>
          </Pressable>
        ) : null}
        {weekComment.coach ? (
          <Pressable
            onPress={() =>
              openCoachRequest({ onSent: () => reflectSession?.markCoachRequested() })
            }
            hitSlop={8}
            style={({ pressed }) => [styles.under, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={REFLECT_FLOW.r3b.coach}
          >
            <Text style={[styles.goalCoachLink, { color: theme.accent }]}>{REFLECT_FLOW.r3b.coach}</Text>
          </Pressable>
        ) : null}
        {turns.map((turn, index) => (
          <View key={`${turn.you}-${index}`}>
            <MayaBubble continued={hasWeek || index > 0}>
              <MayaLine>{turn.prompt}</MayaLine>
            </MayaBubble>
            <Text style={[styles.you, { color: theme.muted }]}>{turn.you}</Text>
            {turn.reply ? (
              <MayaBubble continued>
                <MayaLine>{turn.reply}</MayaLine>
              </MayaBubble>
            ) : null}
            {turn.showCoach ? (
              <Pressable
                onPress={() =>
                  openCoachRequest({ onSent: () => reflectSession?.markCoachRequested() })
                }
                style={({ pressed }) => [
                  styles.chip,
                  { borderColor: theme.accent },
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={REFLECT_FLOW.coach}
              >
                <Text style={[styles.chipText, { color: theme.accent }]}>{REFLECT_FLOW.coach}</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
        {pending ? (
          <View>
            <MayaBubble continued={hasWeek || turns.length > 0}>
              <MayaLine>{pending.prompt}</MayaLine>
            </MayaBubble>
            <View style={styles.chips}>
              {pending.chips.map((chip) => (
                <Pressable
                  key={chip.id}
                  onPress={() => choose(chip)}
                  disabled={saving}
                  style={({ pressed }) => [
                    styles.chip,
                    { borderColor: theme.accent },
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={chip.label}
                  accessibilityState={{ disabled: saving }}
                >
                  <Text style={[styles.chipText, { color: theme.accent }]}>{chip.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        {dateComment ? (
          <>
            <MayaBubble continued={hasWeek || turns.length > 0 || pending != null}>
              <MayaLine>{dateComment}</MayaLine>
            </MayaBubble>
            {showMe(REFLECT_POINT.targetEnd)}
          </>
        ) : null}
      </MayaReflectFrame>
      {chat?.effect.mode === 'branch' ? (
        <BranchChat
          parentId={chat.effect.parentId}
          subject={chat.effect.subject}
          onDone={(created) =>
            settle(
              {
                chip: chat.chip,
                choice: chat.choice,
                snapshot: chat.snapshot,
                exchange: chat.exchange,
                step: chat.step,
                subject: chat.effect.subject,
              },
              created,
              false,
            )
          }
          onDismiss={() =>
            settle(
              {
                chip: chat.chip,
                choice: chat.choice,
                snapshot: chat.snapshot,
                exchange: chat.exchange,
                step: chat.step,
                subject: chat.effect.subject,
              },
              [],
              true,
            )
          }
        />
      ) : null}
      {chat?.effect.mode === 'walk' ? (
        <ReflectNextChat
          mode="walk"
          subject={chat.effect.subject}
          goalId={goal.id}
          branched={childrenAreBranches(goal.id, chat.snapshot.nodes)}
          onDone={(created) =>
            settle(
              {
                chip: chat.chip,
                choice: chat.choice,
                snapshot: chat.snapshot,
                exchange: chat.exchange,
                step: chat.step,
                subject: chat.effect.subject,
              },
              created,
              false,
            )
          }
          onDismiss={() =>
            settle(
              {
                chip: chat.chip,
                choice: chat.choice,
                snapshot: chat.snapshot,
                exchange: chat.exchange,
                step: chat.step,
                subject: chat.effect.subject,
              },
              [],
              true,
            )
          }
        />
      ) : null}
    </View>
  );
}

function BranchChat({
  parentId,
  subject,
  onDone,
  onDismiss,
}: {
  parentId: string;
  subject: string;
  onDone: (created: Goal[]) => void;
  onDismiss: () => void;
}) {
  const coach = branchCoach(subject);
  if (!coach) {
    return null;
  }
  return (
    <ReflectNextChat
      mode="branch"
      subject={subject}
      parentId={parentId}
      coaching={coach.coaching}
      suggestions={coach.steps}
      warning={coach.warning}
      onDone={onDone}
      onDismiss={onDismiss}
    />
  );
}

const styles = StyleSheet.create({
  pillWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 2,
  },
  pillNav: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    borderLeftWidth: 3,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pressed: {
    opacity: 0.6,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  name: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
  },
  exit: {
    fontSize: 15,
    fontWeight: '600',
  },
  hubLine: {
    marginTop: 10,
  },
  under: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  coachLink: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
  },
  thread: {
    marginTop: 10,
  },
  later: {
    marginTop: 16,
  },
  body: {
    fontSize: 17,
    lineHeight: 24,
  },
  you: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
  },
  reply: {
    marginTop: 6,
  },
  goalCoachLink: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  chip: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 8,
  },
  chipText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
