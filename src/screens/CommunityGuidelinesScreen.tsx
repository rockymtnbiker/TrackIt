import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  COMMUNITY_GUIDELINES_BODY,
  COMMUNITY_GUIDELINES_TITLE,
} from '../constants/communitySafety';
import { agreeToCommunityGuidelines, getGuidelinesAgreedAt } from '../lib/profileApi';
import { useFloatingTabBarHeight } from '../navigation/FloatingTabBar';

export default function CommunityGuidelinesScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useFloatingTabBarHeight();
  const [agreed, setAgreed] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void getGuidelinesAgreedAt()
        .then((at) => {
          if (!cancelled) {
            setAgreed(at != null);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setAgreed(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const agree = async () => {
    setSaving(true);
    try {
      await agreeToCommunityGuidelines();
      setAgreed(true);
    } catch {
      Alert.alert('Could not save', 'The guidelines were not saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: 32 + tabBarHeight + insets.bottom }]}
    >
      <Text style={styles.title}>{COMMUNITY_GUIDELINES_TITLE}</Text>
      <Text style={styles.body}>{COMMUNITY_GUIDELINES_BODY}</Text>
      {agreed === false ? (
        <Pressable
          onPress={() => void agree()}
          disabled={saving}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="I agree"
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>I agree</Text>}
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
  },
  body: {
    fontSize: 17,
    lineHeight: 24,
    color: '#1c1c1e',
  },
  button: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#007aff',
    alignItems: 'center',
    justifyContent: 'center',
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
