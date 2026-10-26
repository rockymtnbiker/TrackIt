import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardSafe } from '../components/KeyboardSafe';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

const CONFIRM_TEXT = 'DELETE';

async function invokeErrorMessage(error: unknown): Promise<string> {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === 'function') {
      try {
        const body = (await context.json()) as { error?: string };
        if (body?.error) {
          return body.error;
        }
      } catch {
        // The response body was empty or not JSON.
      }
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Could not delete the account.';
}

export default function DeleteAccountScreen() {
  const { signOut } = useAuth();
  const [phrase, setPhrase] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = phrase === CONFIRM_TEXT;

  const deleteAccount = async () => {
    if (!confirmed || deleting) {
      return;
    }
    setDeleting(true);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke('delete-account');
    if (invokeError || data?.ok !== true) {
      setError(
        invokeError
          ? await invokeErrorMessage(invokeError)
          : (data?.error ?? 'Could not delete the account.'),
      );
      setDeleting(false);
      return;
    }

    const result = await signOut();
    if (result.error) {
      await supabase.auth.signOut({ scope: 'local' });
    }
  };

  return (
    <KeyboardSafe style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.lead}>
          This permanently deletes all goals and history. It can’t be undone.
        </Text>
        <Text style={styles.hint}>Type DELETE to confirm.</Text>
        <TextInput
          value={phrase}
          onChangeText={setPhrase}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!deleting}
          placeholder="DELETE"
          placeholderTextColor="#aeaeb2"
          style={styles.input}
          accessibilityLabel="Type DELETE to confirm"
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          onPress={() => void deleteAccount()}
          disabled={!confirmed || deleting}
          style={({ pressed }) => [
            styles.button,
            (!confirmed || deleting) && styles.buttonDisabled,
            pressed && confirmed && !deleting && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Delete account"
          accessibilityState={{ disabled: !confirmed || deleting }}
        >
          {deleting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Delete account</Text>
          )}
        </Pressable>
      </View>
    </KeyboardSafe>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f2f2f7',
  },
  content: {
    padding: 20,
    gap: 12,
  },
  lead: {
    fontSize: 17,
    lineHeight: 24,
    color: '#111',
  },
  hint: {
    fontSize: 15,
    color: '#6B6B70',
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
    color: '#111',
  },
  error: {
    fontSize: 15,
    color: '#ff3b30',
  },
  button: {
    marginTop: 8,
    backgroundColor: '#ff3b30',
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  pressed: {
    opacity: 0.55,
  },
});
