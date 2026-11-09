import { CommonActions, useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { todayLocal } from '../lib/localDate';
import { getDisplayName } from '../lib/profileApi';
import { saveReflectionPath } from '../lib/reflectionChoice';
import { getReflectionDraft, saveReflectionDraft, type ReflectionDraft } from '../lib/reflectionDraft';
import { getReview } from '../lib/reviewApi';
import { reflectionTargetWeek } from '../lib/week';
import type { CommunityStackParamList } from '../navigation/CommunityStackNavigator';

type Props = NativeStackScreenProps<CommunityStackParamList, 'MayaHome'>;

function hello(name: string): string {
  const trimmed = name.trim();
  return trimmed
    ? `Hi ${trimmed}. What would you like to work on?`
    : 'Hi. What would you like to work on?';
}

function mayaStart(changes: string[]): ReflectionDraft {
  return {
    section: 'look',
    path: 'maya',
    adjustIndex: 0,
    adjustPhase: 'one',
    extraId: null,
    pickedIds: [],
    viewedExtraIds: [],
    answers: [],
    connectStep: 'partner',
    partnerCheckin: null,
    coachCheckin: null,
    nextStepIds: [],
    nextIndex: 0,
    changes,
    noteSentTo: null,
    noteAwaitingReturn: null,
    reached: 'look',
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'The reflection could not be opened.';
}

export default function MayaHomeScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const [name, setName] = useState('');
  const [reflected, setReflected] = useState(false);
  const [starting, setStarting] = useState(false);

  const targetWeek = useCallback(
    () => reflectionTargetWeek(todayLocal(), settings.weekStart, settings.reflectionDay),
    [settings.reflectionDay, settings.weekStart],
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void getDisplayName()
        .then((value) => {
          if (!cancelled) {
            setName(value);
          }
        })
        .catch(() => undefined);
      void getReview(targetWeek())
        .then((review) => {
          if (!cancelled) {
            setReflected(review != null);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setReflected(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }, [targetWeek]),
  );

  const startReflection = async () => {
    if (starting) {
      return;
    }
    const weekStart = targetWeek();
    setStarting(true);
    try {
      const review = await getReview(weekStart);
      if (review) {
        setReflected(true);
        return;
      }
      if (user?.id) {
        const draft = await getReflectionDraft(user.id, weekStart);
        if (!draft || draft.section === 'choice') {
          await saveReflectionDraft(user.id, weekStart, mayaStart(draft?.changes ?? []));
          await saveReflectionPath(user.id, 'maya');
        }
      }
      navigation.getParent()?.dispatch(
        CommonActions.navigate({
          name: 'Dashboard',
          params: {
            screen: 'WeeklyReflection',
            params: { weekStart },
          },
        }),
      );
    } catch (error) {
      Alert.alert('Could not open your reflection', errorMessage(error));
    } finally {
      setStarting(false);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.bubbleRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>M</Text>
        </View>
        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>{hello(name)}</Text>
        </View>
      </View>
      <Pressable
        onPress={() => navigation.navigate('Maya')}
        style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Work on a new goal"
      >
        <Text style={styles.choiceText}>Work on a new goal</Text>
      </Pressable>
      {reflected ? (
        <View style={styles.bubbleRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>M</Text>
          </View>
          <View style={styles.bubble}>
            <Text style={styles.bubbleText}>You've already reflected this week. Nice work.</Text>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={() => void startReflection()}
          disabled={starting}
          style={({ pressed }) => [styles.choice, pressed && !starting && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Start my weekly reflection"
          accessibilityState={{ disabled: starting }}
        >
          <Text style={styles.choiceText}>Start my weekly reflection</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f2f2f7',
  },
  content: {
    padding: 16,
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
  choice: {
    backgroundColor: '#fff',
    borderRadius: 14,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#007aff',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.55,
  },
});
