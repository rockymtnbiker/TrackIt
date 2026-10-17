import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { hasCoachingInterest, saveCoachingInterest } from '../lib/helpApi';

const BULLETS = ['Personal goal-setting session', 'Weekly check-ins', 'Help when you get stuck'];

const THANKS = "Thanks! We'll let you know when coaching is ready.";

function errorMessage(error: unknown, fallback: string): string {
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
  return fallback;
}

export default function HelpReachingGoalsScreen() {
  const [interested, setInterested] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    hasCoachingInterest()
      .then((exists) => {
        if (!cancelled) {
          setInterested(exists);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setInterested(false);
          Alert.alert(
            'Could not load',
            errorMessage(error, 'Coaching interest was not loaded.'),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const registerInterest = async () => {
    if (saving || interested) {
      return;
    }
    setSaving(true);
    try {
      await saveCoachingInterest();
      setInterested(true);
    } catch (error) {
      Alert.alert('Could not save', errorMessage(error, 'Your interest was not saved.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.intro}>
          Sometimes you need more than an app. Coming soon: work one-on-one with a certified life
          coach who helps you set the right goals, stay accountable, and push through when it gets
          hard.
        </Text>
        {BULLETS.map((item) => (
          <View key={item} style={styles.bulletRow}>
            <Text style={styles.bulletMark}>•</Text>
            <Text style={styles.bullet}>{item}</Text>
          </View>
        ))}
        {interested == null ? (
          <ActivityIndicator color="#007aff" style={styles.status} />
        ) : interested ? (
          <Text style={styles.thanks}>{THANKS}</Text>
        ) : (
          <Pressable
            onPress={() => void registerInterest()}
            disabled={saving}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="I'm interested"
            accessibilityState={{ disabled: saving }}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>I'm interested</Text>
            )}
          </Pressable>
        )}
      </View>
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
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  intro: {
    fontSize: 17,
    lineHeight: 24,
    color: '#111',
  },
  bulletRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  bulletMark: {
    fontSize: 17,
    lineHeight: 22,
    color: '#111',
  },
  bullet: {
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
    color: '#111',
  },
  status: {
    marginTop: 8,
  },
  thanks: {
    fontSize: 17,
    lineHeight: 24,
    color: '#248A3D',
    marginTop: 4,
  },
  button: {
    backgroundColor: '#007aff',
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.55,
  },
});
