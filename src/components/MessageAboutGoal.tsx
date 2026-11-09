import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { getGoalShareTargets, type GoalShareTarget } from '../lib/messagesApi';
import type { ChatParams } from '../navigation/GoalsStackNavigator';

type Props = {
  goalId: string;
};

export function MessageAboutGoal({ goalId }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<{ Chat: ChatParams }>>();
  const [targets, setTargets] = useState<GoalShareTarget[]>([]);
  const [ready, setReady] = useState(false);
  const [picking, setPicking] = useState(false);

  const load = useCallback(async () => {
    try {
      setTargets(await getGoalShareTargets(goalId));
    } catch {
      setTargets([]);
    } finally {
      setReady(true);
    }
  }, [goalId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const open = (target: GoalShareTarget) => {
    setPicking(false);
    navigation.navigate('Chat', {
      connectionId: target.id,
      otherId: target.otherId,
      otherName: target.otherName,
      role: target.role,
      goalId,
    });
  };

  if (!ready || targets.length === 0) {
    return null;
  }

  const only = targets.length === 1 ? targets[0] : null;
  const label = only ? `Message ${only.otherName} about this goal` : 'Message about this goal';

  return (
    <>
      <Pressable
        onPress={() => {
          if (only) {
            open(only);
            return;
          }
          setPicking(true);
        }}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text style={styles.label}>{label}</Text>
      </Pressable>
      <Modal
        visible={picking}
        transparent
        animationType="fade"
        onRequestClose={() => setPicking(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setPicking(false)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <Text style={styles.sheetTitle}>Message about this goal</Text>
            {targets.map((target) => (
              <Pressable
                key={target.otherId}
                onPress={() => open(target)}
                style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`Message ${target.otherName} about this goal`}
              >
                <Text style={styles.choiceText}>{target.otherName}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => setPicking(false)}
              style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#fff',
    borderRadius: 14,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 17,
    fontWeight: '600',
    color: '#007aff',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.55,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
    padding: 12,
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 8,
    marginBottom: 8,
  },
  sheetTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b6b70',
    textTransform: 'uppercase',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  choice: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  choiceText: {
    fontSize: 17,
    color: '#007aff',
  },
  cancel: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  cancelText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111',
  },
});
