import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import type { TimeFormat, WeekStart } from '../lib/settingsApi';
import type { GoalsStackParamList } from '../navigation/GoalsStackNavigator';

type Props = NativeStackScreenProps<GoalsStackParamList, 'Settings'>;

const TIME_OPTIONS: { value: TimeFormat; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: '12h', label: '12-hour' },
  { value: '24h', label: '24-hour' },
];

const WEEK_OPTIONS: { value: WeekStart; label: string }[] = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
];

function ChoiceRow<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value)?.label ?? '—';

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text style={styles.rowLabel}>{label}</Text>
        <View style={styles.rowValue}>
          <Text style={styles.valueText}>{selected}</Text>
          <Ionicons name="chevron-forward" size={18} color="#c7c7cc" />
        </View>
      </Pressable>
      <Modal visible={open} animationType="fade" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.menuCard}>
            <Text style={styles.menuTitle}>{label}</Text>
            {options.map((option) => (
              <Pressable
                key={String(option.value)}
                onPress={() => {
                  setOpen(false);
                  if (option.value !== value) {
                    onChange(option.value);
                  }
                }}
                style={({ pressed }) => [
                  styles.choiceRow,
                  option.value === value && styles.choiceRowSelected,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.choiceText}>{option.label}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => setOpen(false)}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

export default function SettingsScreen({ navigation }: Props) {
  const { user, signOut } = useAuth();
  const { settings, loading, updateSettings } = useSettings();
  const [signingOut, setSigningOut] = useState(false);

  const save = async (patch: Parameters<typeof updateSettings>[0]) => {
    try {
      await updateSettings(patch);
    } catch (error) {
      Alert.alert(
        'Could not save',
        error instanceof Error ? error.message : 'Settings were not saved.',
      );
    }
  };

  const confirmLogout = () => {
    if (signingOut) {
      return;
    }
    Alert.alert('Log out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setSigningOut(true);
            const result = await signOut();
            if (result.error) {
              setSigningOut(false);
              Alert.alert('Log out failed', result.error);
            }
          })();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#007aff" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.section}>Preferences</Text>
      <View style={styles.card}>
        <ChoiceRow
          label="Time format"
          value={settings.timeFormat}
          options={TIME_OPTIONS}
          onChange={(timeFormat) => void save({ timeFormat })}
        />
        <View style={styles.separator} />
        <ChoiceRow
          label="Week starts on"
          value={settings.weekStart}
          options={WEEK_OPTIONS}
          onChange={(weekStart) => void save({ weekStart })}
        />
      </View>

      <Text style={styles.section}>Account</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Email</Text>
          <Text style={styles.email} numberOfLines={1}>
            {user?.email ?? '—'}
          </Text>
        </View>
        <View style={styles.separator} />
        <Pressable
          onPress={confirmLogout}
          disabled={signingOut}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Log out"
        >
          {signingOut ? (
            <ActivityIndicator color="#ff3b30" />
          ) : (
            <Text style={styles.logout}>Log out</Text>
          )}
        </Pressable>
        <View style={styles.separator} />
        <Pressable
          onPress={() => navigation.navigate('DeleteAccount')}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Delete account"
        >
          <Text style={styles.logout}>Delete account</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f2f2f7',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f2f2f7',
  },
  section: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: '#6B6B70',
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: 24,
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
  rowLabel: {
    fontSize: 17,
    color: '#111',
  },
  rowValue: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  valueText: {
    fontSize: 17,
    color: '#8e8e93',
  },
  email: {
    flex: 1,
    fontSize: 17,
    color: '#8e8e93',
    textAlign: 'right',
  },
  logout: {
    fontSize: 17,
    color: '#ff3b30',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e5e5ea',
    marginLeft: 16,
  },
  pressed: {
    opacity: 0.55,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  menuCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  menuTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111',
    marginBottom: 4,
  },
  choiceRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  choiceRowSelected: {
    backgroundColor: '#e8f1ff',
  },
  choiceText: {
    fontSize: 17,
    color: '#111',
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  cancelText: {
    fontSize: 17,
    color: '#007aff',
  },
});
