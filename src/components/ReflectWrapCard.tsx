import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { MayaBubble, MayaLine, MayaReflectFrame } from './MayaReflectBubble';
import { REFLECT_FLOW } from '../constants/maya/reflectFlow';
import { useReflectTheme } from '../constants/reflectTheme';
import { REFLECTION_COPY } from '../constants/reflection';
import { useReflectMaya } from '../context/ReflectMayaContext';
import { InviteCodeSheet } from './InviteCodeSheet';

export type ReflectPartner = {
  id: string;
  partnerId: string;
  name: string;
};

export type ReflectWrapStep = 'partner' | 'new' | 'closing';

export type ReflectWrapTurn = {
  prompt: string;
  you: string;
};

type Props = {
  step: ReflectWrapStep;
  turns: ReflectWrapTurn[];
  /** Null while the partner list is still loading. */
  partners: ReflectPartner[] | null;
  closing: string;
  saving: boolean;
  /** Reflect on my own: no avatar and no Maya name. */
  plain?: boolean;
  onSendNote: (partner: ReflectPartner, prompt: string) => void;
  onSkip: (prompt: string) => void;
  onInvite: (prompt: string) => void;
  onPartnerNotNow: (prompt: string) => void;
  onAddGoal: () => void;
  onDone: (prompt: string) => void;
};

function partnerPrompt(partners: ReflectPartner[] | null): string {
  if (partners == null) {
    return '';
  }
  if (partners.length > 1) {
    return REFLECT_FLOW.wrap.partnerMany;
  }
  if (partners.length === 1) {
    return REFLECT_FLOW.wrap.partnerOne.replace('[partner name]', partners[0].name);
  }
  return REFLECT_FLOW.wrap.partnerNone;
}

function currentPrompt(step: ReflectWrapStep, partners: ReflectPartner[] | null): string {
  if (step === 'new') {
    return REFLECT_FLOW.wrap.fresh;
  }
  return partnerPrompt(partners);
}

export function ReflectWrapCard({
  step,
  turns,
  partners,
  closing,
  saving,
  plain = false,
  onSendNote,
  onSkip,
  onInvite,
  onPartnerNotNow,
  onAddGoal,
  onDone,
}: Props) {
  const theme = useReflectTheme();
  const reflect = useReflectMaya();
  const [picking, setPicking] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const prompt = step === 'closing' ? '' : currentPrompt(step, partners);

  const leave = () => {
    Alert.alert(REFLECT_FLOW.hub.leaveAsk, undefined, [
      { text: REFLECT_FLOW.hub.exit, onPress: () => reflect?.clear() },
      { text: REFLECT_FLOW.hub.keepGoing, style: 'cancel' },
    ]);
  };

  const send = (partner: ReflectPartner) => {
    setPicking(false);
    onSendNote(partner, prompt);
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

  const actions =
    step === 'closing' ? null : (
      <View style={styles.chips}>
        {step === 'partner' && partners != null && partners.length > 0 ? (
          <>
            <Chip
              label={REFLECT_FLOW.wrap.send}
              disabled={saving}
              onPress={() => {
                if (partners.length === 1) {
                  send(partners[0]);
                  return;
                }
                setPicking(true);
              }}
            />
            <Chip label={REFLECT_FLOW.wrap.skip} disabled={saving} onPress={() => onSkip(prompt)} />
          </>
        ) : null}
        {step === 'partner' && partners != null && partners.length === 0 ? (
          <>
            <Chip
              label={REFLECT_FLOW.wrap.invite}
              disabled={saving}
              onPress={() => {
                setInviteOpen(true);
                onInvite(prompt);
              }}
            />
            <Chip
              label={REFLECT_FLOW.wrap.notNow}
              disabled={saving}
              onPress={() => onPartnerNotNow(prompt)}
            />
          </>
        ) : null}
        {step === 'new' ? (
          <>
            <Chip label={REFLECT_FLOW.wrap.add} disabled={saving} onPress={onAddGoal} />
            <Chip label={REFLECT_FLOW.wrap.done} disabled={saving} onPress={() => onDone(prompt)} />
          </>
        ) : null}
      </View>
    );

  const sheets = (
    <>
      {picking ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setPicking(false)}>
          <Pressable style={styles.backdrop} onPress={() => setPicking(false)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <Text style={styles.sheetTitle}>{REFLECT_FLOW.wrap.send}</Text>
              {(partners ?? []).map((partner) => (
                <Pressable
                  key={partner.id}
                  onPress={() => send(partner)}
                  style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={partner.name}
                >
                  <Text style={styles.choiceText}>{partner.name}</Text>
                </Pressable>
              ))}
              <Pressable
                onPress={() => setPicking(false)}
                style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={REFLECTION_COPY.cancel}
              >
                <Text style={styles.choiceText}>{REFLECTION_COPY.cancel}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
      {inviteOpen ? (
        <InviteCodeSheet title={REFLECTION_COPY.inviteCode} onClose={() => setInviteOpen(false)} />
      ) : null}
    </>
  );

  if (!plain) {
    return (
      <>
        <MayaReflectFrame trailing={step === 'closing' ? null : exit}>
          {turns.map((turn, index) => (
            <View key={`${turn.you}-${index}`}>
              <MayaBubble continued={index > 0}>
                <MayaLine>{turn.prompt}</MayaLine>
              </MayaBubble>
              <Text style={[styles.you, { color: theme.muted }]}>
                {REFLECT_FLOW.you.replace('[chip]', turn.you)}
              </Text>
            </View>
          ))}
          {step === 'closing' ? (
            <MayaBubble continued={turns.length > 0}>
              <MayaLine>{closing}</MayaLine>
            </MayaBubble>
          ) : prompt ? (
            <>
              <MayaBubble continued={turns.length > 0}>
                <MayaLine>{prompt}</MayaLine>
              </MayaBubble>
              {actions}
            </>
          ) : null}
        </MayaReflectFrame>
        {sheets}
      </>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.accentSoft, borderLeftColor: theme.accent }]}>
      {step === 'closing' ? null : (
        <View style={styles.header}>
          <View style={styles.name} />
          {exit}
        </View>
      )}
      <View style={styles.thread}>
        {turns.map((turn, index) => (
          <View key={`${turn.you}-${index}`} style={index > 0 ? styles.later : null}>
            <Text style={[styles.body, { color: theme.ink }]}>{turn.prompt}</Text>
            <Text style={[styles.you, { color: theme.muted }]}>
              {REFLECT_FLOW.you.replace('[chip]', turn.you)}
            </Text>
          </View>
        ))}
        {step === 'closing' ? (
          <Text style={[styles.body, turns.length > 0 ? styles.later : null, { color: theme.ink }]}>
            {closing}
          </Text>
        ) : prompt ? (
          <View style={turns.length > 0 ? styles.later : null}>
            <Text style={[styles.body, { color: theme.ink }]}>{prompt}</Text>
            {actions}
          </View>
        ) : null}
      </View>
      {sheets}
    </View>
  );
}

function Chip({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useReflectTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.chip,
        { borderColor: theme.accent },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <Text style={[styles.chipText, { color: theme.accent }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  },
  chipText: {
    fontSize: 15,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.6,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 8,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  choice: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  choiceText: {
    fontSize: 17,
    color: '#111',
  },
});
