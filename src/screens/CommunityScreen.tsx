import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
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
import { PageHeader } from '../components/PageHeader';
import { FeedbackSheet } from '../components/FeedbackSheet';
import { InviteCodeSheet, RedeemInviteSheet } from '../components/InviteCodeSheet';
import { KeyboardSafe } from '../components/KeyboardSafe';
import { SupportRequestSheet } from '../components/SupportRequestSheet';
import { WhatsComing } from '../components/WhatsComing';
import { CONCEPTS } from '../constants/concepts';
import { useAuth } from '../context/AuthContext';
import { useCommunity } from '../context/CommunityContext';
import {
  cancelInvite,
  respondToInvite,
  sendPartnerInvite,
} from '../lib/communityApi';
import { getGoal } from '../lib/goalTreeApi';
import {
  cancelInvite as cancelCodeInvite,
  listMyPendingInvites,
  sharePartnerInvite,
  type PartnerInvite,
} from '../lib/invitesApi';
import type { ConnectionSummary } from '../lib/messagesApi';
import type { HelpType } from '../lib/supportApi';
import type { CommunityStackParamList } from '../navigation/CommunityStackNavigator';
import type { Connection } from '../types/community';
import { formatDate } from '../utils/date';

type Props = NativeStackScreenProps<CommunityStackParamList, 'CommunityMain'>;

type CodeSheetRequest = {
  title: string;
  goalId?: string | null;
  goalTitle?: string | null;
};

type PendingCode = PartnerInvite & { goalTitle: string | null };

function expiresLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return formatDate(value.slice(0, 10));
  }
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const INVITE_SENT =
  "Invite sent. If they have a TrackIt account, they'll see it in Connect.";

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
  return 'Workout partner';
}

function blockedByMe(connection: Connection): boolean {
  return (
    connection.status.toLowerCase() === 'blocked' && connection.blockedByMe !== false
  );
}

function hiddenFromMe(connection: Connection): boolean {
  return connection.status.toLowerCase() === 'blocked' && connection.blockedByMe === false;
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function byRecent(
  connections: Connection[],
  summaries: Map<string, ConnectionSummary>,
): Connection[] {
  return [...connections].sort((a, b) => {
    const aTime = summaries.get(a.id)?.lastMessage?.createdAt ?? '';
    const bTime = summaries.get(b.id)?.lastMessage?.createdAt ?? '';
    if (aTime !== bTime) {
      if (!aTime) {
        return 1;
      }
      if (!bTime) {
        return -1;
      }
      return bTime.localeCompare(aTime);
    }
    return partnerLabel(a).localeCompare(partnerLabel(b));
  });
}

function messagePreview(summary: ConnectionSummary | undefined, userId: string | undefined): string {
  const body = summary?.lastMessage?.body.trim() ?? '';
  if (!summary?.lastMessage || !body) {
    return 'No messages yet';
  }
  if (userId && summary.lastMessage.senderId === userId) {
    return `You: ${body}`;
  }
  return body;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) {
    return '';
  }
  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) {
    return 'now';
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function initial(name: string): string {
  const letter = name.trim().charAt(0).toUpperCase();
  return letter || '?';
}

function roleLabel(role: Connection['role']): string {
  return role === 'coach' ? 'Achievement Coach' : 'Accountability partner';
}

export default function CommunityScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const { refreshConnections, summaries } = useCommunity();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestHelp, setRequestHelp] = useState<HelpType | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [codeInvites, setCodeInvites] = useState<PendingCode[]>([]);
  const [codeSheet, setCodeSheet] = useState<CodeSheetRequest | null>(null);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [inviteMenu, setInviteMenu] = useState(false);

  useEffect(() => {
    const support = route.params?.openSupport;
    if (support !== 'talk' && support !== 'setup') {
      return;
    }
    setRequestHelp(support === 'setup' ? 'setup' : null);
    setRequestOpen(true);
    navigation.setParams({ openSupport: undefined });
  }, [navigation, route.params?.openSupport]);

  useEffect(() => {
    if (route.params?.openInvite !== true) {
      return;
    }
    setInviteOpen(true);
    navigation.setParams({ openInvite: undefined });
  }, [navigation, route.params?.openInvite]);

  useEffect(() => {
    const request = route.params?.openCodeInvite;
    if (!request) {
      return;
    }
    setCodeSheet({
      title: request.title,
      goalId: request.goalId,
      goalTitle: request.goalTitle,
    });
    navigation.setParams({ openCodeInvite: undefined });
  }, [navigation, route.params?.openCodeInvite]);

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

  const loadCodes = useCallback(async () => {
    try {
      const invites = await listMyPendingInvites();
      const withTitles = await Promise.all(
        invites.map(async (invite) => {
          if (!invite.goalId) {
            return { ...invite, goalTitle: null };
          }
          try {
            const goal = await getGoal(invite.goalId);
            return { ...invite, goalTitle: goal?.title.trim() || null };
          } catch {
            return { ...invite, goalTitle: null };
          }
        }),
      );
      setCodeInvites(withTitles);
    } catch {
      // Partners still load if invite codes fail.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      void loadCodes();
    }, [load, loadCodes]),
  );

  const visible = connections.filter((connection) => !hiddenFromMe(connection));
  const pending = visible.filter(
    (connection) => connection.status.toLowerCase() === 'pending',
  );
  const incoming = pending.filter((connection) => connection.incoming === true);
  const outgoing = pending.filter((connection) => connection.incoming === false);
  const accepted = visible.filter(
    (connection) => connection.status.toLowerCase() === 'accepted',
  );
  const coaches = byRecent(
    accepted.filter((connection) => connection.role === 'coach'),
    summaries,
  );
  const partners = byRecent(
    accepted.filter((connection) => connection.role !== 'coach'),
    summaries,
  );
  const blocked = visible
    .filter((connection) => blockedByMe(connection))
    .sort((a, b) => partnerLabel(a).localeCompare(partnerLabel(b)));
  const hasRequests = incoming.length > 0 || outgoing.length > 0 || codeInvites.length > 0;
  const comingConcepts = CONCEPTS.filter(
    (concept) => concept.key !== 'teams' && concept.key !== 'find_coach',
  );

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

  const openCodeInvite = () => {
    setInviteMenu(false);
    setCodeSheet({ title: 'Invite with a code' });
  };

  const renderPerson = (connection: Connection) => {
    const name = partnerLabel(connection);
    const summary = summaries.get(connection.id);
    const preview = messagePreview(summary, user?.id);
    const when = summary?.lastMessage?.createdAt
      ? relativeTime(summary.lastMessage.createdAt)
      : '';
    const unread = summary?.unread === true;
    return (
      <Pressable
        onPress={() =>
          navigation.navigate('Chat', {
            connectionId: connection.id,
            otherId: connection.partnerId,
            otherName: name,
            role: connection.role === 'coach' ? 'coach' : 'partner',
          })
        }
        style={({ pressed }) => [styles.personRow, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${roleLabel(connection.role)}, ${preview}${unread ? ', unread' : ''}`}
      >
        <View style={styles.personAvatar}>
          <Text style={styles.personInitial}>{initial(name)}</Text>
        </View>
        <View style={styles.personBody}>
          <Text style={styles.personName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.personRole}>{roleLabel(connection.role)}</Text>
          <Text style={styles.personPreview} numberOfLines={1}>
            {preview}
          </Text>
        </View>
        <View style={styles.personMeta}>
          {when ? <Text style={styles.personTime}>{when}</Text> : null}
          {unread ? <View style={styles.unreadDot} accessibilityLabel="Unread" /> : null}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.screen}>
      <PageHeader
        title="Connect"
        subtitle="The people helping you reach your goals"
        help={() => navigation.navigate('Learn', { tab: 'connect' })}
        right={
          <Pressable
            onPress={() => navigation.navigate('Profile')}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={8}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Ionicons name="settings-outline" size={26} color="#111" />
          </Pressable>
        }
      />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
              void loadCodes();
            }}
            tintColor="#007aff"
          />
        }
      >
        {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}

        {loading && connections.length === 0 ? (
          <ActivityIndicator color="#007aff" style={styles.partnersLoading} />
        ) : (
          <>
            {hasRequests ? (
              <>
                <Text style={styles.section}>Requests</Text>
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
                      <View style={styles.waitingRow}>
                        <Text style={styles.waitingText} numberOfLines={1}>
                          Waiting for {partnerLabel(connection)}
                        </Text>
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
                  ))}
                  {codeInvites.map((invite, index) => (
                    <View key={invite.id}>
                      {incoming.length > 0 || outgoing.length > 0 || index > 0 ? (
                        <View style={styles.separator} />
                      ) : null}
                      <View style={styles.waitingRow}>
                        <View style={styles.waitingCopy}>
                          <Text style={styles.waitingText} numberOfLines={1}>
                            Waiting for {invite.inviteeName || 'someone'}
                          </Text>
                          <Text style={styles.codeExpires}>Expires {expiresLabel(invite.expiresAt)}</Text>
                        </View>
                        <Pressable
                          onPress={() =>
                            void sharePartnerInvite({
                              name: invite.inviteeName ?? '',
                              goalTitle: invite.goalTitle,
                              code: invite.code,
                            })
                          }
                          style={({ pressed }) => pressed && styles.pressed}
                          accessibilityRole="button"
                          accessibilityLabel={`Share invite ${invite.code} again`}
                        >
                          <Text style={styles.accept}>Share again</Text>
                        </Pressable>
                        <Pressable
                          onPress={() =>
                            Alert.alert('Cancel this invite?', 'This code will stop working.', [
                              { text: 'Keep', style: 'cancel' },
                              {
                                text: 'Cancel',
                                style: 'destructive',
                                onPress: () =>
                                  void runInviteAction(invite.id, async () => {
                                    await cancelCodeInvite(invite.id);
                                    await loadCodes();
                                  }),
                              },
                            ])
                          }
                          disabled={busyId != null}
                          style={({ pressed }) => pressed && styles.pressed}
                          accessibilityRole="button"
                          accessibilityLabel={`Cancel invite ${invite.code}`}
                        >
                          <Text style={styles.decline}>Cancel</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            <View style={styles.card}>
              <Pressable
                onPress={() => navigation.navigate('MayaHome')}
                style={({ pressed }) => [styles.personRow, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Maya, Automated Advisor"
              >
                <View style={[styles.personAvatar, styles.mayaAvatar]}>
                  <Text style={styles.mayaInitial}>M</Text>
                </View>
                <View style={styles.personBody}>
                  <Text style={styles.personName}>Maya</Text>
                  <Text style={styles.personRole}>Automated Advisor</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#c7c7cc" />
              </Pressable>
            </View>

            <Text style={styles.section}>Achievement Coach</Text>
            <View style={styles.card}>
              {coaches.length > 0 ? (
                coaches.map((connection, index) => (
                  <View key={connection.id}>
                    {index > 0 ? <View style={styles.separator} /> : null}
                    {renderPerson(connection)}
                  </View>
                ))
              ) : (
                <Pressable
                  onPress={() => {
                    setRequestHelp(null);
                    setRequestOpen(true);
                  }}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Talk with an Achievement Coach"
                >
                  <View style={styles.actionText}>
                    <Text style={styles.rowLabel}>Talk with an Achievement Coach</Text>
                    <Text style={styles.actionBody}>Talk with a real person about your goals</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#c7c7cc" />
                </Pressable>
              )}
            </View>

            <Text style={styles.section}>Accountability Partners</Text>
            <View style={styles.card}>
              {partners.map((connection, index) => (
                <View key={connection.id}>
                  {index > 0 ? <View style={styles.separator} /> : null}
                  {renderPerson(connection)}
                </View>
              ))}
              {partners.length === 0 ? (
                <Text style={styles.partnerEmpty}>
                  Invite a friend to keep each other on track.
                </Text>
              ) : (
                <View style={styles.separator} />
              )}
              <Pressable
                onPress={() => setInviteMenu(true)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Invite a partner"
              >
                <Text style={styles.inviteButtonText}>+ Invite a partner</Text>
              </Pressable>
            </View>
          </>
        )}

        {blocked.length > 0 ? (
          <Pressable
            onPress={() => navigation.navigate('Blocked')}
            style={({ pressed }) => [styles.blockedRow, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Blocked, ${blocked.length}`}
          >
            <Text style={styles.blockedLabel}>Blocked</Text>
            <Ionicons name="chevron-forward" size={16} color="#c7c7cc" />
          </Pressable>
        ) : null}

        <Text style={styles.section}>Groups</Text>
        <View style={styles.card}>
          <Pressable
            onPress={() => navigation.navigate('GroupsInterest')}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Create a group"
          >
            <View style={styles.actionText}>
              <Text style={styles.rowLabel}>Create a group</Text>
              <Text style={styles.actionBody}>
                A team, friend group, or family where you can share group goals and individual goals in one place.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#c7c7cc" />
          </Pressable>
        </View>

        <Text style={[styles.section, styles.comingSection]}>What's coming?</Text>
        <WhatsComing concepts={comingConcepts} />
        <Pressable
          onPress={() => setFeedbackOpen(true)}
          style={({ pressed }) => [styles.feedbackLink, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Send feedback"
        >
          <Text style={styles.feedbackLinkText}>Send feedback</Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={inviteMenu}
        animationType="slide"
        transparent
        onRequestClose={() => setInviteMenu(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setInviteMenu(false)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <Pressable
              onPress={openCodeInvite}
              style={({ pressed }) => [styles.sheetButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Invite with a code"
            >
              <Text style={styles.sheetButtonText}>Invite with a code</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setInviteMenu(false);
                setRedeemOpen(true);
              }}
              style={({ pressed }) => [styles.sheetButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Have an invite code?"
            >
              <Text style={styles.sheetButtonText}>Have an invite code?</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

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

      {requestOpen ? (
        <SupportRequestSheet
          initialHelpType={requestHelp}
          onClose={() => {
            setRequestOpen(false);
            setRequestHelp(null);
          }}
          onSent={() => {
            setRequestOpen(false);
            setRequestHelp(null);
          }}
        />
      ) : null}
      {feedbackOpen ? <FeedbackSheet onClose={() => setFeedbackOpen(false)} /> : null}
      {codeSheet ? (
        <InviteCodeSheet
          title={codeSheet.title}
          goalId={codeSheet.goalId}
          goalTitle={codeSheet.goalTitle}
          onClose={() => {
            setCodeSheet(null);
            void loadCodes();
          }}
        />
      ) : null}
      {redeemOpen ? (
        <RedeemInviteSheet
          onClose={() => setRedeemOpen(false)}
          onConnected={() => {
            void load();
          }}
        />
      ) : null}
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
  partnersLoading: {
    marginTop: 12,
  },
  actionCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionText: {
    flex: 1,
    gap: 4,
  },
  actionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
  },
  actionBody: {
    fontSize: 15,
    lineHeight: 21,
    color: '#6B6B70',
  },
  inviteRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  inviteButton: {
    backgroundColor: '#fff',
    borderRadius: 14,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  inviteButtonHalf: {
    flex: 1,
    marginBottom: 0,
    paddingHorizontal: 8,
  },
  codeRow: {
    backgroundColor: '#fff',
    borderRadius: 14,
    minHeight: 48,
    paddingHorizontal: 16,
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  codeRowLabel: {
    fontSize: 17,
    color: '#111',
  },
  codeExpires: {
    fontSize: 13,
    color: '#6B6B70',
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
  comingSection: {
    marginTop: 8,
  },
  partnerEmpty: {
    fontSize: 15,
    lineHeight: 21,
    color: '#6B6B70',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 2,
  },
  feedbackLink: {
    marginTop: 16,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackLinkText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#007aff',
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
  blockedRow: {
    marginTop: 8,
    minHeight: 44,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  blockedLabel: {
    fontSize: 15,
    color: '#6b6b70',
  },
  errorText: {
    fontSize: 14,
    color: '#c62828',
    marginBottom: 12,
  },
  pressed: {
    opacity: 0.55,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  personAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e5e5ea',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mayaAvatar: {
    backgroundColor: '#007aff',
  },
  personInitial: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
  },
  mayaInitial: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  personBody: {
    flex: 1,
    gap: 2,
  },
  personName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111',
  },
  personRole: {
    fontSize: 13,
    color: '#6B6B70',
  },
  personPreview: {
    fontSize: 15,
    color: '#3a3a3c',
  },
  personMeta: {
    alignItems: 'flex-end',
    gap: 6,
    minWidth: 28,
  },
  personTime: {
    fontSize: 13,
    color: '#8e8e93',
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#007AFF',
  },
  waitingRow: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  waitingCopy: {
    flex: 1,
    gap: 2,
  },
  waitingText: {
    flex: 1,
    fontSize: 15,
    color: '#6B6B70',
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 28,
  },
  sheetButton: {
    minHeight: 48,
    justifyContent: 'center',
  },
  sheetButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#007aff',
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
