import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardSafe } from '../components/KeyboardSafe';
import { REFLECTION_COPY } from '../constants/reflection';
import { useAuth } from '../context/AuthContext';
import { useReflectMaya } from '../context/ReflectMayaContext';
import { useSettings } from '../context/SettingsContext';
import { getAllGoals } from '../lib/goalTreeApi';
import { getReflectionPath, saveReflectionPath, type ReflectionPath } from '../lib/reflectionChoice';
import { answerLabel, coachOutcome, partnerOutcome } from '../lib/reflectionFlow';
import { getReview, type WeekReview } from '../lib/reviewApi';
import { endOfWeek } from '../lib/week';
import type { DashboardStackParamList } from '../navigation/TabNavigator';
import type { Goal } from '../types/goal';
import { formatShortDate } from '../utils/date';

type Props = NativeStackScreenProps<DashboardStackParamList, 'WeeklyReflection'>;

export default function WeeklyReflectionScreen({ navigation, route }: Props) {
  const { settings } = useSettings();
  const { user } = useAuth();
  const reflectMaya = useReflectMaya();
  const weekStart = route.params.weekStart;
  const readOnly = route.params.readOnly === true;
  const range = `${formatShortDate(weekStart)} – ${formatShortDate(endOfWeek(weekStart, settings.weekStart))}`;
  const [path, setPath] = useState<ReflectionPath | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: `${REFLECTION_COPY.heading} · ${range}`,
      headerRight: () => (
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={REFLECTION_COPY.close}
        >
          <Ionicons name="close" size={26} color="#007aff" />
        </Pressable>
      ),
    });
  }, [navigation, range]);

  useFocusEffect(
    useCallback(() => {
      if (!user?.id || readOnly) {
        return;
      }
      let cancelled = false;
      void getReflectionPath(user.id).then((saved) => {
        if (!cancelled && saved) {
          setPath((current) => current ?? saved);
        }
      });
      return () => {
        cancelled = true;
      };
    }, [readOnly, user?.id]),
  );

  const choose = (next: ReflectionPath) => {
    if (user?.id) {
      void saveReflectionPath(user.id, next);
    }
    reflectMaya?.begin(weekStart, next === 'maya');
    navigation.goBack();
  };

  if (readOnly) {
    return <SavedReflection weekStart={weekStart} />;
  }

  return (
    <KeyboardSafe style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.stack}>
          <Pressable
            onPress={() => choose('maya')}
            style={({ pressed }) => [
              styles.choice,
              path === 'maya' && styles.choiceOn,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: path === 'maya' }}
            accessibilityLabel={REFLECTION_COPY.withMaya}
          >
            <Text style={[styles.choiceText, path === 'maya' && styles.choiceTextOn]}>
              {REFLECTION_COPY.withMaya}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => choose('own')}
            style={({ pressed }) => [
              styles.choice,
              path === 'own' && styles.choiceOn,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: path === 'own' }}
            accessibilityLabel={REFLECTION_COPY.onMyOwn}
          >
            <Text style={[styles.choiceText, path === 'own' && styles.choiceTextOn]}>
              {REFLECTION_COPY.onMyOwn}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardSafe>
  );
}

function SavedReflection({ weekStart }: { weekStart: string }) {
  const [review, setReview] = useState<WeekReview | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getReview(weekStart), getAllGoals()])
      .then(([row, loaded]) => {
        if (!cancelled) {
          setReview(row);
          setGoals(loaded);
          setError(null);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : REFLECTION_COPY.couldNotLoad);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [weekStart]);

  return (
    <KeyboardSafe style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? <ActivityIndicator color="#007aff" /> : null}
        {error ? <Text style={styles.soon}>{error}</Text> : null}
        {!loading && !error && !review ? (
          <Text style={styles.soon}>{REFLECTION_COPY.couldNotLoad}</Text>
        ) : null}
        {review ? (
          <View style={styles.summary}>
            {review.goalCheckins.map((item) => {
              const goal = goals.find((entry) => entry.id === item.goal_id);
              const detail = item.answer
                ? answerLabel(item.answer)
                : [item.r3b, item.r3c, item.r3d].filter((part) => part).join(' · ');
              return (
                <Text key={item.goal_id} style={styles.body}>
                  {detail ? `${goal?.title || 'Untitled'}: ${detail}` : goal?.title || 'Untitled'}
                </Text>
              );
            })}
            {partnerOutcome(review.partnerCheckin) ? (
              <Text style={styles.body}>{partnerOutcome(review.partnerCheckin)}</Text>
            ) : null}
            {coachOutcome(review.coachCheckin) ? (
              <Text style={styles.body}>{coachOutcome(review.coachCheckin)}</Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </KeyboardSafe>
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
  stack: {
    gap: 12,
  },
  choice: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e5ea',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  choiceOn: {
    backgroundColor: '#e8f1ff',
    borderColor: '#007aff',
  },
  choiceText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111',
    textAlign: 'center',
  },
  choiceTextOn: {
    color: '#007aff',
  },
  pressed: {
    opacity: 0.6,
  },
  soon: {
    fontSize: 13,
    lineHeight: 18,
    color: '#8e8e93',
  },
  summary: {
    gap: 8,
  },
  body: {
    fontSize: 17,
    lineHeight: 24,
    color: '#111',
  },
});
