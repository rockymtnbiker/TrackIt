import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  getMyVotes,
  upsertVote,
  type ConceptVoteChoice,
} from '../lib/feedbackApi';

const GROUPS_KEY = 'teams';
const GROUP_TEXT =
  'A team, friend group, or family where you can share group goals and individual goals in one place.';

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
  return 'Could not save that.';
}

export default function GroupsInterestScreen() {
  const [vote, setVote] = useState<ConceptVoteChoice | null>(null);
  const [comment, setComment] = useState('');
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getMyVotes()
        .then((rows) => {
          if (cancelled) {
            return;
          }
          const mine = rows.find((row) => row.conceptKey === GROUPS_KEY);
          setVote(mine?.vote ?? null);
          setComment(mine?.comment ?? '');
          setReady(true);
        })
        .catch((loadError: unknown) => {
          if (!cancelled) {
            setError(errorMessage(loadError));
            setReady(true);
          }
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const persist = (nextVote: ConceptVoteChoice, nextComment: string) => {
    if (saving) {
      return;
    }
    setSaving(true);
    setError(null);
    const trimmed = nextComment.trim();
    void upsertVote(GROUPS_KEY, nextVote, trimmed ? trimmed : null)
      .catch((saveError: unknown) => {
        setError(errorMessage(saveError));
      })
      .finally(() => {
        setSaving(false);
      });
  };

  const choose = (next: ConceptVoteChoice) => {
    setVote(next);
    persist(next, comment);
  };

  const saveComment = () => {
    if (!vote) {
      setError("Pick I'd use this or Not for me first.");
      return;
    }
    persist(vote, comment);
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.lead}>{GROUP_TEXT}</Text>
        {ready ? (
          <>
            <View style={styles.buttons}>
              <VoteButton
                label="I'd use this"
                selected={vote === 'yes'}
                disabled={saving}
                onPress={() => choose('yes')}
              />
              <VoteButton
                label="Not for me"
                selected={vote === 'no'}
                disabled={saving}
                onPress={() => choose('no')}
              />
            </View>
            <Text style={styles.label}>What kind of group would you most likely create?</Text>
            <TextInput
              style={styles.input}
              value={comment}
              onChangeText={setComment}
              placeholder="My volleyball team, my roommates, my family…"
              placeholderTextColor="#8e8e93"
              multiline
              maxLength={500}
              editable={!saving}
              textAlignVertical="top"
            />
            <Pressable
              onPress={saveComment}
              disabled={saving}
              style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Save"
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveText}>Save</Text>
              )}
            </Pressable>
          </>
        ) : (
          <ActivityIndicator color="#007aff" style={styles.loading} />
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </View>
  );
}

function VoteButton({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.vote, selected && styles.voteSelected]}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
    >
      <Text style={[styles.voteText, selected && styles.voteTextSelected]}>{label}</Text>
    </Pressable>
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
  lead: {
    fontSize: 17,
    lineHeight: 24,
    color: '#111',
  },
  buttons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  vote: {
    flex: 1,
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  voteSelected: {
    backgroundColor: '#e8f1ff',
    borderColor: '#007aff',
  },
  voteText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
    textAlign: 'center',
  },
  voteTextSelected: {
    color: '#007aff',
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
    marginTop: 20,
    marginBottom: 8,
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
    minHeight: 96,
  },
  saveButton: {
    alignSelf: 'flex-end',
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#007aff',
    minWidth: 88,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  loading: {
    marginTop: 24,
  },
  error: {
    fontSize: 14,
    color: '#c62828',
    marginTop: 12,
  },
  pressed: {
    opacity: 0.55,
  },
});
