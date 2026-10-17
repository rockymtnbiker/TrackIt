import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export function TimePickerModal({
  title,
  value,
  onConfirm,
  onCancel,
}: {
  title: string;
  value: Date;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <DateTimePicker
            value={draft}
            mode="time"
            display="spinner"
            onChange={(_event, date) => {
              if (date) {
                setDraft(date);
              }
            }}
            style={styles.picker}
          />
          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={() => onConfirm(draft)} style={styles.doneButton}>
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111',
    marginBottom: 8,
  },
  picker: {
    alignSelf: 'center',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  cancelText: {
    fontSize: 17,
    color: '#007aff',
  },
  doneButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  doneText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#007aff',
  },
});
