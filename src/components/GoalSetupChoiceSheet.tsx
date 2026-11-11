import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { GoalSetupChoice } from '../lib/goalSetupChoice';

type ChoiceProps = {
  selected: GoalSetupChoice | null;
  onMaya: () => void;
  onOwn: () => void;
};

export function GoalSetupChoices({ selected, onMaya, onOwn }: ChoiceProps) {
  return (
    <View style={styles.choices}>
      <ChoiceButton
        title="Set up with Maya"
        line="Answer a few questions and she'll help you build it."
        selected={selected === 'maya'}
        onPress={onMaya}
      />
      <ChoiceButton
        title="Set up on my own"
        line="Pick an area and a starter goal."
        selected={selected === 'own'}
        onPress={onOwn}
      />
    </View>
  );
}

export function GoalSetupChoiceSheet({
  visible,
  selected,
  onMaya,
  onOwn,
  onCancel,
}: ChoiceProps & {
  visible: boolean;
  onCancel: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <Pressable
          style={styles.dismiss}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <GoalSetupChoices selected={selected} onMaya={onMaya} onOwn={onOwn} />
          <Pressable
            onPress={onCancel}
            style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function ChoiceButton({
  title,
  line,
  selected,
  onPress,
}: {
  title: string;
  line: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        selected && styles.choiceOn,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${line}`}
      accessibilityState={{ selected }}
    >
      <Text style={styles.choiceTitle}>{title}</Text>
      <Text style={styles.choiceLine}>{line}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  dismiss: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#f2f2f7',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 8,
  },
  choices: {
    gap: 8,
  },
  choice: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 4,
  },
  choiceOn: {
    borderColor: '#007aff',
    backgroundColor: '#e8f2ff',
  },
  choiceTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111',
  },
  choiceLine: {
    fontSize: 13,
    lineHeight: 18,
    color: '#6b6b70',
  },
  cancel: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#007aff',
  },
  pressed: {
    opacity: 0.7,
  },
});
