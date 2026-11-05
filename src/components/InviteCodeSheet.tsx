import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardSafe } from './KeyboardSafe';
import {
  createPartnerInvite,
  normalizeInviteCode,
  redeemPartnerInvite,
  sharePartnerInvite,
  type RedeemStatus,
} from '../lib/invitesApi';

const REDEEM_MESSAGE: Record<RedeemStatus, string> = {
  ok: '',
  invalid: "That code didn't work. Check it and try again.",
  used: 'That code has already been used. Ask for a new one.',
  expired: 'That code has expired. Ask for a new one.',
  self: "That's your own invite code. Send it to a friend.",
};

export function InviteCodeSheet({
  title,
  goalId,
  goalTitle,
  onClose,
}: {
  title: string;
  goalId?: string | null;
  goalTitle?: string | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createPartnerInvite(name, goalId);
      setCode(created);
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : 'Could not create an invite.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!code) {
      return;
    }
    try {
      const Clipboard = await import('expo-clipboard');
      await Clipboard.setStringAsync(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy needs an updated app. Use Share invite for now.');
    }
  };

  const share = () => {
    if (!code) {
      return;
    }
    void sharePartnerInvite({
      name,
      goalTitle: goalTitle ?? null,
      code,
    });
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardSafe style={styles.overlay} keyboardVerticalOffset={0}>
        <Pressable style={styles.dismissArea} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.title}>{title}</Text>
          {code ? (
            <>
              <Text style={styles.code}>{code}</Text>
              <Text style={styles.expires}>Expires in 14 days</Text>
              <Pressable
                onPress={share}
                style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Share invite"
              >
                <Text style={styles.primaryText}>Share invite</Text>
              </Pressable>
              <Pressable
                onPress={() => void copy()}
                style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Copy code"
              >
                <Text style={styles.secondaryText}>{copied ? 'Copied' : 'Copy code'}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.label}>Who are you inviting?</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="First name"
                autoCapitalize="words"
                autoCorrect={false}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => void create()}
                style={styles.input}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable
                onPress={() => void create()}
                disabled={busy}
                style={({ pressed }) => [
                  styles.primary,
                  busy && styles.disabled,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Create invite"
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryText}>Create invite</Text>
                )}
              </Pressable>
            </>
          )}
        </View>
      </KeyboardSafe>
    </Modal>
  );
}

export function RedeemInviteSheet({
  onClose,
  onConnected,
}: {
  onClose: () => void;
  onConnected: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const ready = normalizeInviteCode(code).replace('-', '').length === 6;

  const connect = async () => {
    if (!ready || busy) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await redeemPartnerInvite(code);
      if (result.status === 'ok') {
        const partner = result.inviterName ?? 'your partner';
        Alert.alert(`You're now ${partner}'s accountability partner.`);
        onConnected();
        onClose();
        return;
      }
      setMessage(REDEEM_MESSAGE[result.status]);
    } catch (cause) {
      setMessage(cause instanceof Error && cause.message ? cause.message : REDEEM_MESSAGE.invalid);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardSafe style={styles.overlay} keyboardVerticalOffset={0}>
        <Pressable style={styles.dismissArea} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.title}>Have an invite code?</Text>
          <TextInput
            value={code}
            onChangeText={(value) => {
              setCode(normalizeInviteCode(value));
              if (message) {
                setMessage(null);
              }
            }}
            placeholder="K7P-4QX"
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => void connect()}
            style={[styles.input, styles.codeInput]}
          />
          {message ? <Text style={styles.error}>{message}</Text> : null}
          <Pressable
            onPress={() => void connect()}
            disabled={!ready || busy}
            style={({ pressed }) => [
              styles.primary,
              (!ready || busy) && styles.disabled,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Connect"
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>Connect</Text>
            )}
          </Pressable>
        </View>
      </KeyboardSafe>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  dismissArea: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
  },
  label: {
    fontSize: 17,
    color: '#111',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 17,
    color: '#111',
  },
  codeInput: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 2,
    textAlign: 'center',
  },
  code: {
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: 2,
    textAlign: 'center',
    color: '#111',
    marginTop: 8,
  },
  expires: {
    fontSize: 15,
    color: '#6B6B70',
    textAlign: 'center',
    marginBottom: 8,
  },
  primary: {
    backgroundColor: '#007aff',
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  secondary: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    color: '#007aff',
    fontSize: 17,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },
  error: {
    fontSize: 14,
    color: '#c62828',
  },
  pressed: {
    opacity: 0.55,
  },
});
