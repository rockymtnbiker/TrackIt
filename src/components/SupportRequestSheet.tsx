import { useState } from 'react';
import {
  ActivityIndicator,
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
import { useAuth } from '../context/AuthContext';
import {
  createSupportRequest,
  type ContactMethod,
  type HelpType,
  type SupportRequest,
} from '../lib/supportApi';
import { KeyboardSafe } from './KeyboardSafe';

const HELP_CHOICES: { value: HelpType; label: string }[] = [
  { value: 'setup', label: 'Help setting up my goals' },
  { value: 'checkins', label: 'Weekly check-ins to keep me on track' },
  { value: 'life', label: 'Talking through bigger life stuff' },
];

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message
  ) {
    return error.message;
  }
  return 'The request could not be sent.';
}

export function SupportRequestSheet({
  onClose,
  onSent,
}: {
  onClose: () => void;
  onSent: (request: SupportRequest) => void;
}) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [helpType, setHelpType] = useState<HelpType | null>(null);
  const [details, setDetails] = useState('');
  const [method, setMethod] = useState<ContactMethod>('email');
  const [emailValue, setEmailValue] = useState(user?.email ?? '');
  const [phoneValue, setPhoneValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contact = method === 'email' ? emailValue : phoneValue;
  const canSend = helpType != null && contact.trim().length > 0 && !saving;

  const close = () => {
    if (saving) {
      return;
    }
    onClose();
  };

  const send = () => {
    if (saving) {
      return;
    }
    if (!helpType) {
      setError('Pick what would help most.');
      return;
    }
    const contactValue = contact.trim();
    if (!contactValue) {
      setError(method === 'email' ? 'Enter an email address.' : 'Enter a phone number.');
      return;
    }
    if (method === 'email' && !isEmail(contactValue)) {
      setError('Enter a valid email.');
      return;
    }
    setSaving(true);
    setError(null);
    const trimmedDetails = details.trim();
    void createSupportRequest({
      helpType,
      details: trimmedDetails ? trimmedDetails : null,
      contactMethod: method,
      contactValue,
    })
      .then((request) => {
        Alert.alert("Thanks! We'll reach out soon.");
        onSent(request);
      })
      .catch((sendError) => {
        setError(errorMessage(sendError));
        setSaving(false);
      });
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={close}>
      <KeyboardSafe style={styles.overlay} keyboardVerticalOffset={0}>
        <Pressable
          style={styles.dismiss}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close request"
        />
        <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
          <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
            <Text style={styles.title}>Talk to someone</Text>
            <Text style={styles.label}>What would help most?</Text>
            <View style={styles.choiceCard}>
              {HELP_CHOICES.map((choice, index) => {
                const selected = helpType === choice.value;
                return (
                  <View key={choice.value}>
                    {index > 0 ? <View style={styles.separator} /> : null}
                    <Pressable
                      onPress={() => setHelpType(choice.value)}
                      disabled={saving}
                      style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={choice.label}
                    >
                      <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>
                        {choice.label}
                      </Text>
                      <View style={[styles.radio, selected && styles.radioSelected]}>
                        {selected ? <View style={styles.radioDot} /> : null}
                      </View>
                    </Pressable>
                  </View>
                );
              })}
            </View>

            <Text style={styles.label}>Anything we should know?</Text>
            <TextInput
              style={styles.details}
              value={details}
              onChangeText={setDetails}
              placeholder="Optional"
              placeholderTextColor="#8e8e93"
              multiline
              maxLength={500}
              editable={!saving}
              textAlignVertical="top"
            />

            <Text style={styles.label}>How should we reach you?</Text>
            <View style={styles.methodRow}>
              {(['text', 'email'] as const).map((option) => {
                const selected = method === option;
                const label = option === 'text' ? 'Text' : 'Email';
                return (
                  <Pressable
                    key={option}
                    onPress={() => setMethod(option)}
                    disabled={saving}
                    style={[styles.method, selected && styles.methodSelected]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={label}
                  >
                    <Text style={[styles.methodText, selected && styles.methodTextSelected]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              style={styles.contact}
              value={contact}
              onChangeText={(value) => {
                if (method === 'email') {
                  setEmailValue(value);
                } else {
                  setPhoneValue(value);
                }
                if (error) {
                  setError(null);
                }
              }}
              placeholder={method === 'email' ? 'name@email.com' : 'Phone number'}
              placeholderTextColor="#8e8e93"
              keyboardType={method === 'email' ? 'email-address' : 'phone-pad'}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType={method === 'email' ? 'emailAddress' : 'telephoneNumber'}
              maxLength={200}
              editable={!saving}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.actions}>
              <Pressable onPress={close} disabled={saving} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={send}
                disabled={!canSend}
                style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
                accessibilityRole="button"
                accessibilityLabel="Send"
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.sendText}>Send</Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
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
    paddingTop: 16,
    maxHeight: '90%',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    marginBottom: 16,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
    marginBottom: 8,
  },
  choiceCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e5ea',
    marginBottom: 16,
    overflow: 'hidden',
  },
  choice: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  choiceLabel: {
    flex: 1,
    fontSize: 16,
    color: '#111',
  },
  choiceLabelSelected: {
    color: '#007aff',
    fontWeight: '600',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#c7c7cc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: '#007aff',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#007aff',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e5e5ea',
  },
  details: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 17,
    color: '#111',
    backgroundColor: '#fff',
    minHeight: 96,
    marginBottom: 16,
  },
  methodRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  method: {
    flex: 1,
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  methodSelected: {
    backgroundColor: '#007aff',
    borderColor: '#007aff',
  },
  methodText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  methodTextSelected: {
    color: '#fff',
  },
  contact: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 17,
    color: '#111',
    backgroundColor: '#fff',
    minHeight: 44,
    marginBottom: 8,
  },
  error: {
    fontSize: 14,
    color: '#c62828',
    marginBottom: 8,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 8,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#555',
  },
  sendButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#007aff',
    minWidth: 88,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#a8c8f0',
  },
  sendText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  pressed: {
    opacity: 0.55,
  },
});
