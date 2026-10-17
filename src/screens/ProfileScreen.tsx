import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { getDisplayName, saveDisplayName } from '../lib/profileApi';
import type { WeekStart } from '../lib/settingsApi';
import type { GoalsStackParamList } from '../navigation/GoalsStackNavigator';

type Props = NativeStackScreenProps<GoalsStackParamList, 'Profile'>;

const WEEK_OPTIONS: { value: WeekStart; label: string }[] = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
];

const APP_VERSION = Constants.expoConfig?.version ?? '';

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
            <Pressable onPress={() => setOpen(false)} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

function errorMessage(error: unknown, fallback: string): string {
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
  return fallback;
}

export default function ProfileScreen({ navigation }: Props) {
  const { user, signOut } = useAuth();
  const { settings, loading, updateSettings } = useSettings();
  const [signingOut, setSigningOut] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [savedName, setSavedName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [editingName, setEditingName] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getDisplayName()
      .then((name) => {
        if (cancelled) {
          return;
        }
        setDisplayName(name);
        setSavedName(name);
      })
      .catch((error) => {
        if (!cancelled) {
          Alert.alert(
            'Could not load display name',
            errorMessage(error, 'Display name was not loaded.'),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persistDisplayName = async (value: string) => {
    const trimmed = value.trim();
    if (savingName) {
      return;
    }
    if (trimmed === savedName) {
      setDisplayName(savedName);
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      await saveDisplayName(trimmed);
      setDisplayName(trimmed);
      setSavedName(trimmed);
      setEditingName(false);
    } catch (error) {
      Alert.alert('Could not save', errorMessage(error, 'Display name was not saved.'));
    } finally {
      setSavingName(false);
    }
  };

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

  const initial = displayName.trim().charAt(0).toUpperCase();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.headerCard}>
        <View style={styles.avatar}>
          {initial ? (
            <Text style={styles.avatarLetter}>{initial}</Text>
          ) : (
            <Ionicons name="person" size={28} color="#6B6B70" />
          )}
        </View>
        <View style={styles.headerText}>
          {editingName ? (
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              onEndEditing={(event) => {
                void persistDisplayName(event.nativeEvent.text);
              }}
              onSubmitEditing={(event) => {
                void persistDisplayName(event.nativeEvent.text);
              }}
              placeholder="Your name"
              placeholderTextColor="#c7c7cc"
              autoCapitalize="words"
              autoCorrect={false}
              autoFocus
              returnKeyType="done"
              style={styles.nameInput}
            />
          ) : (
            <Pressable
              onPress={() => setEditingName(true)}
              accessibilityRole="button"
              accessibilityLabel="Edit display name"
            >
              <Text style={[styles.displayName, !displayName.trim() && styles.namePlaceholder]}>
                {displayName.trim() || 'Your name'}
              </Text>
            </Pressable>
          )}
          <Text style={styles.email} numberOfLines={1}>
            {user?.email ?? '—'}
          </Text>
        </View>
      </View>

      <Text style={styles.section}>Help</Text>
      <View style={styles.card}>
        <Pressable
          onPress={() => navigation.navigate('HelpSettingGoals')}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Help setting goals"
        >
          <Text style={styles.rowLabel}>Help setting goals</Text>
          <Ionicons name="chevron-forward" size={18} color="#c7c7cc" />
        </Pressable>
        <View style={styles.separator} />
        <Pressable
          onPress={() => navigation.navigate('HelpReachingGoals')}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Help reaching goals"
        >
          <Text style={styles.rowLabel}>Help reaching goals</Text>
          <Ionicons name="chevron-forward" size={18} color="#c7c7cc" />
        </Pressable>
      </View>

      <Text style={styles.section}>Subscription</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Free during testing</Text>
          <View style={styles.pill}>
            <Text style={styles.pillText}>Pro · Coming soon</Text>
          </View>
        </View>
      </View>

      <Text style={styles.section}>Settings</Text>
      <View style={styles.card}>
        <ChoiceRow
          label="Week starts on"
          value={settings.weekStart}
          options={WEEK_OPTIONS}
          onChange={(weekStart) => void save({ weekStart })}
        />
      </View>

      <Text style={styles.section}>Account</Text>
      <View style={styles.card}>
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

      {APP_VERSION ? <Text style={styles.version}>Version {APP_VERSION}</Text> : null}
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
  headerCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#e8f1ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 28,
    fontWeight: '600',
    color: '#007aff',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  displayName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111',
  },
  namePlaceholder: {
    color: '#c7c7cc',
    fontWeight: '400',
  },
  nameInput: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111',
    paddingVertical: 0,
  },
  email: {
    fontSize: 15,
    color: '#8e8e93',
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
    flexShrink: 1,
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
  pill: {
    backgroundColor: '#ececf0',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b6b70',
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
  version: {
    fontSize: 13,
    color: '#8e8e93',
    textAlign: 'center',
    marginTop: -8,
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
