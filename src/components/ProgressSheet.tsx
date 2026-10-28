import Slider from '@react-native-community/slider';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function snapPct(value: number | null): number {
  if (value == null || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value / 10) * 10));
}

export default function ProgressSheet({
  visible,
  title,
  initialPct,
  showClearEstimate = false,
  onSave,
  onMarkDone,
  onClearEstimate,
  onCancel,
}: {
  visible: boolean;
  title: string;
  initialPct: number | null;
  showClearEstimate?: boolean;
  onSave: (pct: number) => void;
  onMarkDone: () => void;
  onClearEstimate?: () => void;
  onCancel: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [pct, setPct] = useState(() => snapPct(initialPct));

  useEffect(() => {
    if (visible) {
      setPct(snapPct(initialPct));
    }
  }, [initialPct, visible]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable
          style={[styles.card, { marginBottom: Math.max(insets.bottom, 12) }]}
          onPress={() => {}}
        >
          <Text style={styles.title} numberOfLines={2}>
            {title || 'Progress'}
          </Text>
          <Text style={styles.readout}>{`${pct}%`}</Text>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={100}
            step={10}
            value={pct}
            onValueChange={(next) => setPct(snapPct(next))}
            minimumTrackTintColor="#248A3D"
            maximumTrackTintColor="#E3E3E8"
            thumbTintColor="#248A3D"
            accessibilityLabel="Progress percent"
          />
          <Pressable
            onPress={() => onSave(pct)}
            style={({ pressed }) => [styles.save, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Save"
          >
            <Text style={styles.saveText}>Save</Text>
          </Pressable>
          <Pressable
            onPress={onMarkDone}
            style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Mark done"
          >
            <Text style={styles.markDoneText}>Mark done</Text>
          </Pressable>
          <Pressable
            onPress={onCancel}
            style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          {showClearEstimate ? (
            <Pressable
              onPress={onClearEstimate}
              style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Clear my estimate"
            >
              <Text style={styles.clearText}>Clear my estimate</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    gap: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
  },
  readout: {
    fontSize: 44,
    fontWeight: '700',
    color: '#1C1C1E',
    textAlign: 'center',
    marginTop: 8,
  },
  slider: {
    width: '100%',
    height: 40,
    marginBottom: 8,
  },
  save: {
    backgroundColor: '#007aff',
    borderRadius: 10,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  textButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markDoneText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#248A3D',
  },
  cancelText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#8e8e93',
  },
  clearText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#007aff',
  },
  pressed: {
    opacity: 0.7,
  },
});
