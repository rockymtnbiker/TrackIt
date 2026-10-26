import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { FeedbackSheet } from '../components/FeedbackSheet';
import { TimePickerModal } from '../components/TimePickerModal';
import { BADGES } from '../constants/badges';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { listEarnedBadges, type EarnedBadge } from '../lib/badges';
import { clockFromDate, dateAtClock } from '../lib/clock';
import { localCalendarDay } from '../lib/localDate';
import { getDisplayName, saveDisplayName } from '../lib/profileApi';
import {
  DEFAULT_CHECKIN,
  ensureNotificationPermission,
  NOTIFICATION_DENIED_MESSAGE,
} from '../lib/reminders';
import type { WeekStart } from '../lib/settingsApi';
import { formatDateMDY } from '../utils/date';
import { formatTime } from '../utils/formatTime';

type Props = {
  navigation: {
    navigate: (screen: 'DeleteAccount') => void;
  };
};

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
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [savedName, setSavedName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [checkinPicker, setCheckinPicker] = useState(false);
  const [earnedBadges, setEarnedBadges] = useState<EarnedBadge[]>([]);
  const [badgesLoaded, setBadgesLoaded] = useState(false);

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

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void listEarnedBadges()
        .then((rows) => {
          if (!cancelled) {
            setEarnedBadges(rows);
          }
        })
        .catch((error) => {
          console.warn('Failed to load badges', error);
        })
        .finally(() => {
          if (!cancelled) {
            setBadgesLoaded(true);
          }
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const earnedByKey = new Map(earnedBadges.map((badge) => [badge.badgeKey, badge]));

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

  const setEvening = (on: boolean) => {
    void (async () => {
      if (on) {
        const granted = await ensureNotificationPermission();
        if (!granted) {
          Alert.alert('Notifications', NOTIFICATION_DENIED_MESSAGE);
        }
        await save({ checkinTime: settings.checkinTime ?? DEFAULT_CHECKIN });
        return;
      }
      await save({ checkinTime: null });
    })();
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
    <>
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

      <Text style={styles.section}>Badges</Text>
      <View style={styles.card}>
        {badgesLoaded ? (
          <View style={styles.badgeGrid}>
            {BADGES.map((badge) => {
              const earned = earnedByKey.get(badge.key);
              const earnedDay = earned ? localCalendarDay(earned.earnedAt) : '';
              const earnedLabel = earnedDay ? formatDateMDY(earnedDay) : '';
              return (
                <View
                  key={badge.key}
                  style={styles.badgeCell}
                  accessibilityLabel={
                    earned
                      ? `${badge.name}, earned ${earnedLabel}`
                      : `${badge.name}, ${badge.hint}`
                  }
                >
                  <MaterialCommunityIcons
                    name={badge.icon}
                    size={32}
                    color={earned ? '#007aff' : '#c7c7cc'}
                  />
                  <Text style={[styles.badgeName, !earned && styles.badgeMuted]}>{badge.name}</Text>
                  <Text style={styles.badgeDetail}>{earned ? earnedLabel : badge.hint}</Text>
                </View>
              );
            })}
          </View>
        ) : (
          <ActivityIndicator color="#007aff" style={styles.badgeLoading} />
        )}
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
        <View style={styles.separator} />
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Evening check-in</Text>
          <Switch
            value={settings.checkinTime != null}
            onValueChange={setEvening}
            accessibilityLabel="Evening check-in"
          />
        </View>
        {settings.checkinTime != null ? (
          <>
            <View style={styles.separator} />
            <Pressable
              onPress={() => setCheckinPicker(true)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Evening check-in time"
            >
              <Text style={styles.rowLabel}>Time</Text>
              <Text style={styles.valueText}>
                {formatTime(dateAtClock(settings.checkinTime, 19, 0))}
              </Text>
            </Pressable>
          </>
        ) : null}
      </View>

      <Text style={styles.section}>Account</Text>
      <View style={styles.card}>
        <Pressable
          onPress={() => setFeedbackOpen(true)}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Send feedback"
        >
          <Text style={styles.rowLabel}>Send feedback</Text>
          <Ionicons name="chevron-forward" size={18} color="#c7c7cc" />
        </Pressable>
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

      {APP_VERSION ? <Text style={styles.version}>Version {APP_VERSION}</Text> : null}
      {checkinPicker ? (
        <TimePickerModal
          title="Evening check-in"
          value={dateAtClock(settings.checkinTime ?? DEFAULT_CHECKIN, 19, 0)}
          onCancel={() => setCheckinPicker(false)}
          onConfirm={(date) => {
            setCheckinPicker(false);
            void save({ checkinTime: clockFromDate(date) });
          }}
        />
      ) : null}
    </ScrollView>
    {feedbackOpen ? <FeedbackSheet onClose={() => setFeedbackOpen(false)} /> : null}
    </>
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
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  badgeCell: {
    width: '50%',
    paddingHorizontal: 12,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 4,
  },
  badgeName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
    textAlign: 'center',
  },
  badgeMuted: {
    color: '#8e8e93',
  },
  badgeDetail: {
    fontSize: 12,
    lineHeight: 16,
    color: '#8e8e93',
    textAlign: 'center',
  },
  badgeLoading: {
    margin: 16,
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
