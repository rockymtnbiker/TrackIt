import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { getMyProfile } from '../lib/profileApi';
import { openDoToday } from '../lib/reminders';
import {
  setOnboardingFinishedHandler,
  takeFreshGoalId,
} from './onboardingHandoff';
import AuthStackNavigator from './AuthStackNavigator';
import OnboardingStackNavigator from './OnboardingStackNavigator';
import TabNavigator from './TabNavigator';

type Gate = {
  userId: string;
  onboarded: boolean;
};

export default function RootNavigator() {
  const { session, loading } = useAuth();
  const userId = session?.user.id ?? null;
  const [gate, setGate] = useState<Gate | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!userId) {
      setGate(null);
      setProfileError(null);
      return;
    }

    let cancelled = false;
    setProfileError(null);
    getMyProfile()
      .then((profile) => {
        if (cancelled) {
          return;
        }
        setGate((current) => {
          if (current?.userId === userId && current.onboarded) {
            return current;
          }
          return { userId, onboarded: profile.onboardedAt != null };
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setProfileError(error instanceof Error && error.message ? error.message : 'Could not load your profile.');
      });

    return () => {
      cancelled = true;
    };
  }, [userId, reloadKey]);

  useEffect(() => {
    if (!userId) {
      setOnboardingFinishedHandler(null);
      return;
    }
    setOnboardingFinishedHandler(() => {
      setGate({ userId, onboarded: true });
    });
    return () => {
      setOnboardingFinishedHandler(null);
    };
  }, [userId]);

  if (loading || (userId && !profileError && gate?.userId !== userId)) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#007aff" />
      </View>
    );
  }

  if (!session) {
    return <AuthStackNavigator />;
  }

  if (profileError && gate?.userId !== userId) {
    return (
      <View style={styles.loading}>
        <Text style={styles.error}>{profileError}</Text>
        <Pressable
          onPress={() => setReloadKey((key) => key + 1)}
          style={styles.retry}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (!gate?.onboarded) {
    return <OnboardingStackNavigator />;
  }

  return <OnboardedApp />;
}

function OnboardedApp() {
  useEffect(() => {
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }
      const goalId = takeFreshGoalId();
      if (goalId) {
        openDoToday(goalId);
      }
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, []);

  return <TabNavigator />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f2f2f7',
    padding: 24,
  },
  error: {
    fontSize: 15,
    lineHeight: 21,
    color: '#c62828',
    textAlign: 'center',
    marginBottom: 16,
  },
  retry: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#007aff',
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});
