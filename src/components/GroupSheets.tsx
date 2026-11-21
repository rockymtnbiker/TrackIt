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
import { MAYA_DISCOVER } from '../constants/maya/discover';
import {
  createGroup,
  GROUP_BAD_CODE,
  groupErrorMessage,
  joinGroupByCode,
  previewGroupCode,
  shareGroupInvite,
  type CreatedGroup,
  type GroupPreview,
} from '../lib/groupsApi';
import { ageRangeFromChoice, saveAgeRange } from '../lib/profileApi';
import { KeyboardSafe } from './KeyboardSafe';

const AGE_NODE = MAYA_DISCOVER.nodes.find((node) => node.id === 'age');

export function GroupAgeSheet({
  visible,
  onClose,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const options = AGE_NODE?.options ?? [];

  const choose = async (id: string, label: string) => {
    if (busy) {
      return;
    }
    const stored = ageRangeFromChoice(id) ?? ageRangeFromChoice(label);
    if (!stored) {
      return;
    }
    setBusy(true);
    try {
      await saveAgeRange(stored);
      onSaved();
    } catch (error) {
      Alert.alert('Could not save your age range', groupErrorMessage(error, 'Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => undefined}>
          <Text style={styles.title}>{AGE_NODE?.text ?? "First, a little about you. What's your age range?"}</Text>
          {options.map((option) => (
            <Pressable
              key={option.id}
              onPress={() => void choose(option.id, option.label)}
              disabled={busy}
              style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={option.label}
            >
              <Text style={styles.choiceText}>{option.label}</Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function CreateGroupSheet({
  visible,
  onClose,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  onDone: (group: CreatedGroup) => void;
}) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [created, setCreated] = useState<CreatedGroup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setName('');
    setDescription('');
    setCreated(null);
    setError(null);
    onClose();
  };

  const create = async () => {
    if (busy) {
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Enter a group name.');
      return;
    }
    if (trimmed.length > 40) {
      setError('Group name must be 40 characters or less.');
      return;
    }
    if (description.trim().length > 200) {
      setError('Description must be 200 characters or less.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const group = await createGroup(trimmed, description);
      setCreated(group);
    } catch (cause) {
      setError(groupErrorMessage(cause, 'Could not create the group.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardSafe style={styles.overlay} keyboardVerticalOffset={0}>
        <Pressable style={styles.dismiss} onPress={close} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          {created ? (
            <>
              <Text style={styles.code}>{created.inviteCode}</Text>
              <Pressable
                onPress={() => void shareGroupInvite(created.name, created.inviteCode)}
                style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Share invite"
              >
                <Text style={styles.primaryText}>Share invite</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const group = created;
                  setName('');
                  setDescription('');
                  setCreated(null);
                  setError(null);
                  onDone(group);
                }}
                style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Done"
              >
                <Text style={styles.secondaryText}>Done</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.label}>Group name</Text>
              <TextInput
                value={name}
                onChangeText={(value) => {
                  setName(value);
                  if (error) {
                    setError(null);
                  }
                }}
                maxLength={40}
                autoFocus
                style={styles.input}
              />
              <Text style={styles.label}>Description (optional)</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                maxLength={200}
                multiline
                style={[styles.input, styles.multiline]}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable
                onPress={() => void create()}
                disabled={busy || name.trim().length === 0}
                style={({ pressed }) => [
                  styles.primary,
                  (busy || name.trim().length === 0) && styles.disabled,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Create"
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Create</Text>}
              </Pressable>
            </>
          )}
        </View>
      </KeyboardSafe>
    </Modal>
  );
}

export function JoinGroupSheet({
  visible,
  onClose,
  onOpen,
}: {
  visible: boolean;
  onClose: () => void;
  onOpen: (groupId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<GroupPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setCode('');
    setPreview(null);
    setError(null);
    onClose();
  };

  const lookup = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await previewGroupCode(code);
      if (next.alreadyMember) {
        close();
        onOpen(next.groupId);
        return;
      }
      setPreview(next);
    } catch (cause) {
      const message = groupErrorMessage(cause, GROUP_BAD_CODE);
      setError(message.includes("didn't work") ? GROUP_BAD_CODE : message);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    if (busy || !preview) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await joinGroupByCode(code);
      close();
      onOpen(next.groupId);
    } catch (cause) {
      setError(groupErrorMessage(cause, GROUP_BAD_CODE));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardSafe style={styles.overlay} keyboardVerticalOffset={0}>
        <Pressable style={styles.dismiss} onPress={close} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.title}>Have an invite code?</Text>
          {preview ? (
            <>
              <Text style={styles.preview}>
                {preview.name} · {preview.memberCount} members
              </Text>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.joinRow}>
                <Pressable
                  onPress={() => void join()}
                  disabled={busy}
                  style={({ pressed }) => [styles.primary, styles.joinButton, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Join"
                >
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Join</Text>}
                </Pressable>
                <Pressable
                  onPress={() => {
                    setPreview(null);
                    setError(null);
                  }}
                  style={({ pressed }) => [styles.secondary, styles.joinButton, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text style={styles.secondaryText}>Cancel</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <TextInput
                value={code}
                onChangeText={(value) => {
                  setCode(value.toUpperCase());
                  if (error) {
                    setError(null);
                  }
                }}
                autoCapitalize="characters"
                autoCorrect={false}
                autoFocus
                maxLength={12}
                returnKeyType="done"
                onSubmitEditing={() => void lookup()}
                style={[styles.input, styles.codeInput]}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable
                onPress={() => void lookup()}
                disabled={busy || code.trim().length === 0}
                style={({ pressed }) => [
                  styles.primary,
                  (busy || code.trim().length === 0) && styles.disabled,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Have an invite code?"
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Have an invite code?</Text>}
              </Pressable>
            </>
          )}
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
  dismiss: {
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
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
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
    marginVertical: 8,
  },
  preview: {
    fontSize: 17,
    color: '#111',
    textAlign: 'center',
    marginVertical: 8,
  },
  choice: {
    minHeight: 48,
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5ea',
  },
  choiceText: {
    fontSize: 17,
    color: '#111',
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
  joinRow: {
    flexDirection: 'row',
    gap: 12,
  },
  joinButton: {
    flex: 1,
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
