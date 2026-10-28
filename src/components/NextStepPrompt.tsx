import { Pressable, StyleSheet, Text, View } from 'react-native';

export const NEXT_STEP_MESSAGE = 'All steps done. Anything left to finish this goal?';

export function NextStepActions({
  onAddStep,
  onMarkDone,
}: {
  onAddStep: () => void;
  onMarkDone: () => void;
}) {
  return (
    <View style={styles.actions}>
      <Pressable
        onPress={onAddStep}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Add a step"
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <Text style={styles.add}>Add a step</Text>
      </Pressable>
      <Pressable
        onPress={onMarkDone}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Mark goal done"
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <Text style={styles.done}>Mark goal done</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  add: {
    fontSize: 15,
    fontWeight: '600',
    color: '#007aff',
  },
  done: {
    fontSize: 15,
    fontWeight: '600',
    color: '#248A3D',
  },
  pressed: {
    opacity: 0.55,
  },
});
