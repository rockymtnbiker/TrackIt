import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormFieldRow, FormInlineInput } from '../components/FormFields';
import { KeyboardSafe } from '../components/KeyboardSafe';
import { useCommunity } from '../context/CommunityContext';
import {
  cancelInvite,
  respondToInvite,
  sendPartnerInvite,
} from '../lib/communityApi';
import type { CommunityStackParamList } from '../navigation/CommunityStackNavigator';
import type { Connection } from '../types/community';

type Props = NativeStackScreenProps<CommunityStackParamList, 'CommunityMain'>;

const INVITE_SENT =
  "Invite sent. If they have a TrackIt account, they'll see it in Community.";

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

function partnerLabel(connection: Connection): string {
  const name = connection.displayName?.trim();
  if (name) {
    return name;
  }
  const email = connection.email?.trim();
  if (email) {
    return email;
  }
  return 'Partner';
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function CommunityScreen({ navigation }: Props) {
  const { refreshConnections } = useCommunity();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const next = await refreshConnections();
      setConnections(next);
    } catch (error) {
      setLoadError(errorMessage(error, 'Could not load partners.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshConnections]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const pending = connections.filter(
    (connection) => connection.status.toLowerCase() === 'pending',
  );
  const incoming = pending.filter((connection) => connection.incoming === true);
  const outgoing = pending.filter((connection) => connection.incoming === false);
  const partners = connections
    .filter((connection) => connection.status.toLowerCase() === 'accepted')
    .sort((a, b) => partnerLabel(a).localeCompare(partnerLabel(b)));
  const hasInvites = incoming.length > 0 || outgoing.length > 0;
  const isEmpty = !hasInvites && partners.length === 0;

  const runInviteAction = async (id: string, action: () => Promise<unknown>) => {
    if (busyId) {
      return;
    }
    setBusyId(id);
    try {
      await action();
      await load();
    } catch (error) {
      Alert.alert('Could not update invite', errorMessage(error, 'The invite was not updated.'));
    } finally {
      setBusyId(null);
    }
  };

  const closeInvite = () => {
    if (sending) {
      return;
    }
    setInviteOpen(false);
    setEmail('');
    setEmailError(null);
  };

  const sendInvite = async () => {
    const trimmed = email.trim();
    if (!isEmail(trimmed)) {
      setEmailError('Enter a valid email.');
      return;
    }
    setEmailError(null);
    setSending(true);
    try {
      await sendPartnerInvite(trimmed);
      setInviteOpen(false);
      setEmail('');
      await load();
      Alert.alert(INVITE_SENT);
    } catch (error) {
      setEmailError(errorMessage(error, 'The invite could not be sent.'));
    } finally {
      setSending(false);
    }
  };

  if (loading && connections.length === 0) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#007aff" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor="#007aff"
          />
        }
      >
        <Pressable
          onPress={() => setInviteOpen(true)}
          style={({ pressed }) => [styles.inviteButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Invite partner"
        >
          <Text style={styles.inviteButtonText}>+ Invite workout partner</Text>
        </Pressable>

        {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}

        {hasInvites ? (
          <>
            <Text style={styles.section}>Invites</Text>
            <View style={styles.card}>
              {incoming.map((connection, index) => (
                <View key={connection.id}>
                  {index > 0 ? <View style={styles.separator} /> : null}
                  <View style={styles.inviteBlock}>
                    <Text style={styles.inviteText}>
                      {partnerLabel(connection)} wants to be your workout partner
                    </Text>
                    <View style={styles.inviteActions}>
                      {busyId === connection.id ? (
                        <ActivityIndicator color="#007aff" />
                      ) : (
                        <>
                          <Pressable
                            onPress={() =>
                              void runInviteAction(connection.id, () =>
                                respondToInvite(connection.id, true),
                              )
                            }
                            disabled={busyId != null}
                            style={({ pressed }) => pressed && styles.pressed}
                            accessibilityRole="button"
                            accessibilityLabel={`Accept ${partnerLabel(connection)}`}
                          >
                            <Text style={styles.accept}>Accept</Text>
                          </Pressable>
                          <Pressable
                            onPress={() =>
                              void runInviteAction(connection.id, () =>
                                respondToInvite(connection.id, false),
                              )
                            }
                            disabled={busyId != null}
                            style={({ pressed }) => pressed && styles.pressed}
                            accessibilityRole="button"
                            accessibilityLabel={`Decline ${partnerLabel(connection)}`}
                          >
                            <Text style={styles.decline}>Decline</Text>
                          </Pressable>
                        </>
                      )}
                    </View>
                  </View>
                </View>
              ))}
              {outgoing.map((connection, index) => (
                <View key={connection.id}>
                  {incoming.length > 0 || index > 0 ? <View style={styles.separator} /> : null}
                  <View style={styles.inviteBlock}>
                    <Text style={styles.inviteText}>
                      Invite sent to {partnerLabel(connection)} · Pending
                    </Text>
                    <View style={styles.inviteActions}>
                      {busyId === connection.id ? (
                        <ActivityIndicator color="#007aff" />
                      ) : (
                        <Pressable
                          onPress={() =>
                            void runInviteAction(connection.id, () => cancelInvite(connection.id))
                          }
                          disabled={busyId != null}
                          style={({ pressed }) => pressed && styles.pressed}
                          accessibilityRole="button"
                          accessibilityLabel={`Cancel invite to ${partnerLabel(connection)}`}
                        >
                          <Text style={styles.accept}>Cancel</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {partners.length > 0 ? (
          <>
            <Text style={styles.section}>Partners</Text>
            <View style={styles.card}>
              {partners.map((connection, index) => (
                <View key={connection.id}>
                  {index > 0 ? <View style={styles.separator} /> : null}
                  <Pressable
                    onPress={() =>
                      navigation.navigate('Partner', {
                        connectionId: connection.id,
                        name: partnerLabel(connection),
                      })
                    }
                    style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={partnerLabel(connection)}
                  >
                    <Text style={styles.rowLabel} numberOfLines={1}>
                      {partnerLabel(connection)}
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color="#c7c7cc" />
                  </Pressable>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {isEmpty && !loadError ? (
          <Text style={styles.empty}>
            Partners can see the goals you choose to share. Invite someone to get started.
          </Text>
        ) : null}
      </ScrollView>

      <Modal
        visible={inviteOpen}
        animationType="slide"
        transparent
        onRequestClose={closeInvite}
      >
        <KeyboardSafe style={styles.modalOverlay} keyboardVerticalOffset={0}>
          <ScrollView
            contentContainerStyle={styles.modalScroll}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Invite workout partner</Text>
              <FormFieldRow label="Email">
                <FormInlineInput
                  value={email}
                  onChangeText={(value) => {
                    setEmail(value);
                    if (emailError) {
                      setEmailError(null);
                    }
                  }}
                  placeholder="name@email.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="emailAddress"
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    void sendInvite();
                  }}
                />
              </FormFieldRow>
              {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
              <View style={styles.modalActions}>
                <Pressable
                  onPress={closeInvite}
                  disabled={sending}
                  style={styles.modalButtonSecondary}
                >
                  <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => void sendInvite()}
                  disabled={sending || !email.trim()}
                  style={[
                    styles.modalButtonPrimary,
                    (sending || !email.trim()) && styles.modalButtonDisabled,
                  ]}
                >
                  {sending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.modalButtonPrimaryText}>Send</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardSafe>
      </Modal>
    </View>
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
  inviteButton: {
    backgroundColor: '#fff',
    borderRadius: 14,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  inviteButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#007aff',
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
    flex: 1,
    fontSize: 17,
    color: '#111',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e5e5ea',
    marginLeft: 16,
  },
  inviteBlock: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  inviteText: {
    fontSize: 17,
    color: '#111',
  },
  inviteActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 20,
    minHeight: 32,
  },
  accept: {
    fontSize: 17,
    fontWeight: '600',
    color: '#007aff',
  },
  decline: {
    fontSize: 17,
    fontWeight: '600',
    color: '#ff3b30',
  },
  empty: {
    fontSize: 15,
    lineHeight: 22,
    color: '#6b6b70',
    paddingHorizontal: 4,
  },
  errorText: {
    fontSize: 14,
    color: '#c62828',
    marginBottom: 12,
  },
  pressed: {
    opacity: 0.55,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
  },
  modalScroll: {
    padding: 20,
    justifyContent: 'center',
    flexGrow: 1,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    color: '#111',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  modalButtonSecondary: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  modalButtonSecondaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#555',
  },
  modalButtonPrimary: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#007aff',
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonDisabled: {
    backgroundColor: '#a8c8f0',
  },
  modalButtonPrimaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
