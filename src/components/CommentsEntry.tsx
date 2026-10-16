import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { getMyConnections, getSharesForGoal, getThread } from '../lib/communityApi';
import type { GoalsStackParamList } from '../navigation/GoalsStackNavigator';

type Row = {
  partnerId: string;
  name: string;
  preview: string;
};

type Props = {
  goalId: string;
  goalTitle: string;
  ownerId: string;
  readOnly: boolean;
  sharedByName?: string;
};

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
  return 'Comments could not be loaded.';
}

function partnerLabel(
  connections: Awaited<ReturnType<typeof getMyConnections>>,
  partnerId: string,
): string {
  const match = connections.find((connection) => connection.partnerId === partnerId);
  return match?.displayName?.trim() || match?.email?.trim() || 'Workout partner';
}

export function CommentsEntry({
  goalId,
  goalTitle,
  ownerId,
  readOnly,
  sharedByName,
}: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<GoalsStackParamList>>();
  const { user } = useAuth();
  const me = user?.id;
  const [rows, setRows] = useState<Row[]>([]);
  const [preview, setPreview] = useState('');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (readOnly) {
      if (!me) {
        return;
      }
      try {
        const thread = await getThread(goalId, ownerId, me);
        setPreview(thread.at(-1)?.body ?? '');
        setError(null);
      } catch (loadError) {
        setError(errorMessage(loadError));
      } finally {
        setReady(true);
      }
      return;
    }

    try {
      const [shares, connections] = await Promise.all([
        getSharesForGoal(goalId),
        getMyConnections(),
      ]);
      const next = await Promise.all(
        shares.map(async (share) => {
          let text = '';
          try {
            const thread = await getThread(goalId, ownerId, share.viewerId);
            text = thread.at(-1)?.body ?? '';
          } catch (threadError) {
            text = errorMessage(threadError);
          }
          return {
            partnerId: share.viewerId,
            name: partnerLabel(connections, share.viewerId),
            preview: text,
          };
        }),
      );
      next.sort((a, b) => a.name.localeCompare(b.name));
      setRows(next);
      setError(null);
    } catch (loadError) {
      setRows([]);
      setError(errorMessage(loadError));
    } finally {
      setReady(true);
    }
  }, [goalId, me, ownerId, readOnly]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const openThread = (partnerId: string, partnerName: string) => {
    navigation.navigate('Comments', {
      goalId,
      ownerId,
      partnerId,
      goalTitle: goalTitle.trim() || 'Untitled',
      partnerName,
    });
  };

  if (readOnly) {
    if (!me) {
      return null;
    }
    const line = error || preview || 'Say something encouraging';
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Comments</Text>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          onPress={() => openThread(me, sharedByName?.trim() || 'Workout partner')}
          accessibilityRole="button"
          accessibilityLabel="Comments"
        >
          <Text
            style={[styles.preview, error ? styles.error : null]}
            numberOfLines={2}
          >
            {line}
          </Text>
          <Ionicons name="chevron-forward" size={18} color="#c7c7cc" />
        </Pressable>
      </View>
    );
  }

  if (!ready || (rows.length === 0 && !error)) {
    return null;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Comments</Text>
      {error ? <Text style={[styles.preview, styles.error, styles.errorPad]}>{error}</Text> : null}
      {rows.map((row, index) => (
        <Pressable
          key={row.partnerId}
          style={({ pressed }) => [
            styles.row,
            index > 0 && styles.border,
            pressed && styles.pressed,
          ]}
          onPress={() => openThread(row.partnerId, row.name)}
          accessibilityRole="button"
          accessibilityLabel={`Comments with ${row.name}`}
        >
          <View style={styles.copy}>
            <Text style={styles.name} numberOfLines={1}>
              {row.name}
            </Text>
            <Text style={styles.preview} numberOfLines={2}>
              {row.preview || 'Say something encouraging'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#c7c7cc" />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b6b70',
    textTransform: 'uppercase',
    paddingTop: 12,
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  border: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5ea',
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1c1c1e',
  },
  preview: {
    flex: 1,
    fontSize: 15,
    color: '#6b6b70',
  },
  error: {
    color: '#c2410c',
  },
  errorPad: {
    paddingBottom: 12,
  },
  pressed: {
    opacity: 0.6,
  },
});
