import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useCommunity } from '../context/CommunityContext';
import { removePartner } from '../lib/communityApi';
import type { Connection } from '../types/community';

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
  return 'Could not unblock this person.';
}

function partnerLabel(connection: Connection): string {
  const name = connection.displayName?.trim();
  if (name) {
    return name;
  }
  const email = connection.email?.trim();
  if (email) {
    return email;
  }
  return 'Workout partner';
}

function blockedByMe(connection: Connection): boolean {
  return connection.status.toLowerCase() === 'blocked' && connection.blockedByMe !== false;
}

export default function BlockedScreen() {
  const { refreshConnections } = useCommunity();
  const [blocked, setBlocked] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const connections = await refreshConnections();
      setBlocked(
        connections
          .filter((connection) => blockedByMe(connection))
          .sort((a, b) => partnerLabel(a).localeCompare(partnerLabel(b))),
      );
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [refreshConnections]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const unblock = async (connection: Connection) => {
    if (busyId) {
      return;
    }
    setBusyId(connection.id);
    try {
      await removePartner(connection.id);
      await load();
    } catch (error) {
      Alert.alert('Could not unblock', errorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  if (loading && blocked.length === 0) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#007aff" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}
      {blocked.length === 0 ? (
        <Text style={styles.empty}>No one is blocked.</Text>
      ) : (
        <View style={styles.card}>
          {blocked.map((connection, index) => (
            <View key={connection.id} style={[styles.row, index > 0 && styles.rowBorder]}>
              <Text style={styles.name} numberOfLines={1}>
                {partnerLabel(connection)}
              </Text>
              <Pressable
                onPress={() => {
                  void unblock(connection);
                }}
                disabled={busyId != null}
                style={({ pressed }) => pressed && styles.pressed}
                accessibilityRole="button"
                accessibilityLabel={`Unblock ${partnerLabel(connection)}`}
              >
                {busyId === connection.id ? (
                  <ActivityIndicator color="#007aff" />
                ) : (
                  <Text style={styles.unblock}>Unblock</Text>
                )}
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f2f2f7',
    padding: 16,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f2f2f7',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
  },
  row: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5ea',
  },
  name: {
    flex: 1,
    fontSize: 17,
    color: '#111',
  },
  unblock: {
    fontSize: 17,
    fontWeight: '600',
    color: '#007aff',
  },
  empty: {
    fontSize: 15,
    color: '#6b6b70',
    paddingHorizontal: 4,
  },
  errorText: {
    fontSize: 14,
    color: '#c62828',
    marginBottom: 12,
  },
  pressed: {
    opacity: 0.55,
  },
});
