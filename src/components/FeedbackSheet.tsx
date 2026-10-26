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
import { sendFeedback } from '../lib/feedbackApi';
import { navigationRef } from '../navigation/navigationRef';
import { KeyboardSafe } from './KeyboardSafe';

function currentRouteName(): string {
  if (!navigationRef.isReady()) {
    return '';
  }
  return navigationRef.getCurrentRoute()?.name ?? '';
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
  return 'The note could not be sent.';
}

export function FeedbackSheet({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSend = body.trim().length > 0 && !saving;

  const close = () => {
    if (saving) {
      return;
    }
    onClose();
  };

  const send = () => {
    if (!canSend) {
      return;
    }
    setSaving(true);
    setError(null);
    void sendFeedback(body, currentRouteName())
      .then(() => {
        Alert.alert('Thanks! We read every note.');
        onClose();
      })
      .catch((sendError: unknown) => {
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
          accessibilityLabel="Close feedback"
        />
        <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
          <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
            <Text style={styles.title}>What's on your mind?</Text>
            <TextInput
              style={styles.input}
              value={body}
              onChangeText={(value) => {
                setBody(value);
                if (error) {
                  setError(null);
                }
              }}
              multiline
              maxLength={2000}
              editable={!saving}
              textAlignVertical="top"
              autoFocus
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
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 17,
    color: '#111',
    backgroundColor: '#fff',
    minHeight: 120,
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
});
