import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CONCEPTS } from '../constants/concepts';
import {
  getMyVotes,
  upsertVote,
  type ConceptVoteChoice,
  type MyVote,
} from '../lib/feedbackApi';
import { KeyboardSafe } from './KeyboardSafe';

const CARD_WIDTH = 280;
const CARD_GAP = 12;

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
  return 'Could not save that vote.';
}

export function WhatsComing() {
  const [votes, setVotes] = useState<Record<string, MyVote>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<{ key: string; draft: string } | null>(null);
  const generation = useRef(0);

  useFocusEffect(
    useCallback(() => {
      const gen = ++generation.current;
      let cancelled = false;
      getMyVotes()
        .then((rows) => {
          if (cancelled || gen !== generation.current) {
            return;
          }
          const next: Record<string, MyVote> = {};
          for (const row of rows) {
            next[row.conceptKey] = row;
          }
          setVotes(next);
        })
        .catch((loadError: unknown) => {
          if (!cancelled && gen === generation.current) {
            setError(errorMessage(loadError));
          }
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const choose = (key: string, vote: ConceptVoteChoice) => {
    const current = votes[key];
    if (current?.vote === vote || savingKey != null) {
      return;
    }
    const comment = current?.comment ?? null;
    generation.current += 1;
    setVotes((existing) => ({
      ...existing,
      [key]: {
        conceptKey: key,
        vote,
        comment,
        updatedAt: existing[key]?.updatedAt ?? '',
      },
    }));
    setSavingKey(key);
    setError(null);
    void upsertVote(key, vote, comment)
      .catch((saveError: unknown) => {
        setVotes((existing) => {
          const next = { ...existing };
          if (current) {
            next[key] = current;
          } else {
            delete next[key];
          }
          return next;
        });
        setError(errorMessage(saveError));
      })
      .finally(() => {
        setSavingKey((busy) => (busy === key ? null : busy));
      });
  };

  const saveNote = () => {
    if (!note || savingKey != null) {
      return;
    }
    const current = votes[note.key];
    if (!current) {
      setNote(null);
      return;
    }
    const comment = note.draft.trim() ? note.draft.trim() : null;
    generation.current += 1;
    setSavingKey(note.key);
    setError(null);
    void upsertVote(note.key, current.vote, comment)
      .then(() => {
        setVotes((existing) => ({
          ...existing,
          [note.key]: { ...current, comment },
        }));
        setNote(null);
      })
      .catch((saveError: unknown) => {
        setError(errorMessage(saveError));
      })
      .finally(() => {
        setSavingKey((busy) => (busy === note.key ? null : busy));
      });
  };

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + CARD_GAP}
        snapToAlignment="start"
        nestedScrollEnabled
        contentContainerStyle={styles.row}
      >
        {CONCEPTS.map((concept) => {
          const mine = votes[concept.key];
          return (
            <View key={concept.key} style={styles.card}>
              {concept.image ? (
                <Image source={concept.image} style={styles.image} resizeMode="cover" />
              ) : (
                <View style={styles.image} accessibilityLabel="Image coming soon" />
              )}
              <Text style={styles.title}>{concept.title}</Text>
              <Text style={styles.description}>{concept.description}</Text>
              <View style={styles.buttons}>
                <VoteButton
                  label="I'd use this"
                  selected={mine?.vote === 'yes'}
                  disabled={savingKey === concept.key}
                  onPress={() => choose(concept.key, 'yes')}
                />
                <VoteButton
                  label="Not for me"
                  selected={mine?.vote === 'no'}
                  disabled={savingKey === concept.key}
                  onPress={() => choose(concept.key, 'no')}
                />
              </View>
              {mine ? (
                <Pressable
                  onPress={() => setNote({ key: concept.key, draft: mine.comment ?? '' })}
                  style={({ pressed }) => [styles.more, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`Tell us more about ${concept.title}`}
                >
                  <Text style={styles.moreText}>Tell us more</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {note ? (
        <NoteSheet
          value={note.draft}
          saving={savingKey === note.key}
          onChange={(draft) => setNote({ key: note.key, draft })}
          onClose={() => {
            if (savingKey !== note.key) {
              setNote(null);
            }
          }}
          onSave={saveNote}
        />
      ) : null}
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

function NoteSheet({
  value,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  value: string;
  saving: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardSafe style={styles.overlay} keyboardVerticalOffset={0}>
        <Pressable
          style={styles.dismiss}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close note"
        />
        <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
          <Text style={styles.sheetTitle}>Tell us more</Text>
          <TextInput
            style={styles.noteInput}
            value={value}
            onChangeText={onChange}
            placeholder="Optional"
            placeholderTextColor="#8e8e93"
            multiline
            maxLength={500}
            editable={!saving}
            textAlignVertical="top"
            autoFocus
          />
          <View style={styles.sheetActions}>
            <Pressable onPress={onClose} disabled={saving} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onSave}
              disabled={saving}
              style={styles.saveButton}
              accessibilityRole="button"
              accessibilityLabel="Save"
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveText}>Save</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardSafe>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingRight: 4,
    gap: CARD_GAP,
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    paddingBottom: 14,
  },
  image: {
    height: 120,
    width: '100%',
    backgroundColor: '#e5e5ea',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
    marginTop: 12,
    marginHorizontal: 14,
  },
  description: {
    fontSize: 15,
    lineHeight: 21,
    color: '#6B6B70',
    marginTop: 4,
    marginHorizontal: 14,
  },
  buttons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    marginHorizontal: 14,
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
  more: {
    alignSelf: 'flex-start',
    minHeight: 36,
    justifyContent: 'center',
    marginTop: 8,
    marginHorizontal: 14,
  },
  moreText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#007aff',
  },
  error: {
    fontSize: 14,
    color: '#c62828',
    marginTop: 8,
  },
  pressed: {
    opacity: 0.55,
  },
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
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    marginBottom: 12,
  },
  noteInput: {
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
  sheetActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
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
  saveButton: {
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
});
