import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { connectCandidates, groupTargetSummary } from '../lib/groupGoalShape';
import { connectGoalToGroupGoal, groupErrorMessage } from '../lib/groupsApi';
import type { Goal } from '../types/goal';

function storageKey(userId: string): string {
  return `group-connect-dismissed:${userId}`;
}

export function useDismissedGroupPrompts(userId: string | undefined): {
  dismissed: Set<string>;
  dismiss: (groupGoalId: string) => Promise<void>;
} {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) {
      setDismissed(new Set());
      return;
    }
    let cancel = false;
    void AsyncStorage.getItem(storageKey(userId)).then((raw) => {
      if (cancel || !raw) {
        return;
      }
      try {
        const ids = JSON.parse(raw) as unknown;
        if (Array.isArray(ids)) {
          setDismissed(new Set(ids.filter((id): id is string => typeof id === 'string')));
        }
      } catch {
        setDismissed(new Set());
      }
    });
    return () => {
      cancel = true;
    };
  }, [userId]);

  const dismiss = async (groupGoalId: string) => {
    if (!userId) {
      return;
    }
    const next = new Set(dismissed);
    next.add(groupGoalId);
    setDismissed(next);
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify([...next]));
  };

  return { dismissed, dismiss };
}

export function ConnectGroupGoalCard({
  groupName,
  title,
  onConnect,
  onKeepSeparate,
}: {
  groupName: string;
  title: string;
  onConnect: () => void;
  onKeepSeparate: () => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.body}>
        {`New group goal from ${groupName}: ${title}. You already have a similar goal. Want to connect it?`}
      </Text>
      <View style={styles.actions}>
        <Pressable
          onPress={onConnect}
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Connect a goal"
        >
          <Text style={styles.primaryText}>Connect a goal</Text>
        </Pressable>
        <Pressable
          onPress={onKeepSeparate}
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Keep separate"
        >
          <Text style={styles.secondaryText}>Keep separate</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function ConnectGroupGoalSheet({
  visible,
  copy,
  goals,
  groupName,
  onClose,
  onConnected,
}: {
  visible: boolean;
  copy: Goal | null;
  goals: Goal[];
  groupName: string;
  onClose: () => void;
  onConnected: (personalGoalId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const candidates = copy ? connectCandidates(copy, goals) : [];
  const [busy, setBusy] = useState(false);

  const choose = (goal: Goal) => {
    if (!copy?.groupGoalId || busy) {
      return;
    }
    const summary = groupTargetSummary(copy);
    const mine = goal.title.trim() || 'Untitled';
    Alert.alert(
      `${mine} will switch to ${groupName}'s target: ${summary}. Your history stays with your goal.`,
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Connect',
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                await connectGoalToGroupGoal(goal.id, copy.groupGoalId as string);
                onConnected(goal.id);
              } catch (cause) {
                Alert.alert(
                  'Could not connect',
                  groupErrorMessage(cause, 'The goal was not connected.'),
                );
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.dismiss} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.sheetTitle}>Connect a goal</Text>
          {candidates.map((goal, index) => (
            <Pressable
              key={goal.id}
              onPress={() => choose(goal)}
              disabled={busy}
              style={({ pressed }) => [styles.row, index > 0 && styles.rowBorder, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={goal.title || 'Untitled'}
            >
              <Text style={styles.rowTitle}>{goal.title || 'Untitled'}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
  },
  body: {
    fontSize: 16,
    lineHeight: 22,
    color: '#111',
  },
  actions: {
    marginTop: 12,
    gap: 8,
  },
  primary: {
    backgroundColor: '#007aff',
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  secondary: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    color: '#007aff',
    fontSize: 17,
    fontWeight: '600',
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
    paddingTop: 16,
    maxHeight: '70%',
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5ea',
  },
  rowTitle: {
    fontSize: 17,
    color: '#111',
  },
  pressed: {
    opacity: 0.7,
  },
});
