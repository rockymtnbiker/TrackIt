import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { badgeByKey } from '../constants/badges';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { setBadgeCelebrationListener } from '../lib/badgeCelebration';
import { checkBadges } from '../lib/badges';

export function BadgeStartup() {
  const { user } = useAuth();
  const { loading } = useSettings();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId || loading) {
      return;
    }
    void checkBadges().catch((error) => {
      console.warn('Failed to check badges', error);
    });
  }, [userId, loading]);

  return null;
}

export function BadgeCelebrationHost() {
  const [queue, setQueue] = useState<string[]>([]);

  useEffect(() => {
    setBadgeCelebrationListener((keys) => {
      setQueue((current) => [...current, ...keys]);
    });
    return () => setBadgeCelebrationListener(null);
  }, []);

  const key = queue[0];
  const badge = key ? badgeByKey(key) : null;
  const dismiss = () => {
    setQueue((current) => current.slice(1));
  };

  return (
    <Modal visible={badge != null} transparent animationType="fade" onRequestClose={dismiss}>
      <Pressable style={styles.overlay} onPress={dismiss} accessibilityLabel="Dismiss badge">
        {badge ? (
          <View style={styles.card}>
            <MaterialCommunityIcons name={badge.icon} size={56} color="#007aff" />
            <Text style={styles.name}>{badge.name}</Text>
            <Text style={styles.note}>Nice work.</Text>
          </View>
        ) : null}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
    minWidth: 220,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    textAlign: 'center',
  },
  note: {
    fontSize: 17,
    color: '#666',
    textAlign: 'center',
  },
});
