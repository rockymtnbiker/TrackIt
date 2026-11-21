import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
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
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { blockMember, listBlockedMembers } from '../lib/blocksApi';
import { ChooseGoalsSheet, MemberSharedGoals } from '../components/GroupGoalShare';
import { GroupChatPanel } from '../components/GroupChatPanel';
import { GroupGoalsPanel } from '../components/GroupGoalsPanel';
import { KeyboardSafe } from '../components/KeyboardSafe';
import {
  countMyGroupCopies,
  deleteGroup,
  getGroup,
  GROUP_LAST_ADMIN,
  groupErrorMessage,
  leaveGroup,
  listGroupGoalShares,
  listGroupMembers,
  removeMember,
  renameGroup,
  resetInviteCode,
  setChatAdminsOnly,
  setEveryoneAdmin,
  setShowMemberProgress,
  setMemberRole,
  shareGroupInvite,
  type GroupDetail,
  type GroupGoalShare,
  type GroupMember,
} from '../lib/groupsApi';
import type { CommunityStackParamList } from '../navigation/CommunityStackNavigator';
import { useFloatingTabBarHeight } from '../navigation/FloatingTabBar';
import { useAuth } from '../context/AuthContext';

type Props = NativeStackScreenProps<CommunityStackParamList, 'Group'>;

type Tab = 'chat' | 'progress' | 'members';
type Gear = 'menu' | 'rename' | 'code' | 'delete' | null;

const TABS: { id: Tab; label: string }[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'progress', label: 'Progress' },
  { id: 'members', label: 'Members' },
];

export default function GroupScreen({ navigation, route }: Props) {
  const { groupId } = route.params;
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useFloatingTabBarHeight();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [shares, setShares] = useState<GroupGoalShare[]>([]);
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [chooseOpen, setChooseOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('members');
  const [chatUnread, setChatUnread] = useState(0);
  const [gear, setGear] = useState<Gear>(null);
  const [rename, setRename] = useState('');
  const [deleteText, setDeleteText] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [gearError, setGearError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GroupMember | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextGroup, nextMembers, nextShares, nextBlocked] = await Promise.all([
        getGroup(groupId),
        listGroupMembers(groupId),
        listGroupGoalShares(groupId),
        listBlockedMembers(),
      ]);
      setGroup(nextGroup);
      setMembers(nextMembers);
      setShares(nextShares);
      setBlockedIds(nextBlocked.map((member) => member.userId));
      setCode(nextGroup.inviteCode);
    } catch (cause) {
      setError(groupErrorMessage(cause, 'Could not load this group.'));
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      title: group?.name ?? '',
      headerRight: () =>
        group?.role === 'admin' ? (
          <Pressable
            onPress={() => {
              setRename(group.name);
              setDeleteText('');
              setGearError(null);
              setGear('menu');
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Group settings"
          >
            <Ionicons name="settings-outline" size={22} color="#111" />
          </Pressable>
        ) : null,
    });
  }, [group, navigation]);

  const fail = (cause: unknown) => {
    const message = groupErrorMessage(cause, 'Could not update the group.');
    if (message === GROUP_LAST_ADMIN) {
      Alert.alert(GROUP_LAST_ADMIN);
      return;
    }
    Alert.alert(message);
  };

  const finishLeave = (keepCopies: boolean) => {
    void (async () => {
      try {
        await leaveGroup(groupId, keepCopies);
        navigation.goBack();
      } catch (cause) {
        fail(cause);
      }
    })();
  };

  const leave = () => {
    void (async () => {
      let copies = 0;
      try {
        copies = await countMyGroupCopies(groupId);
      } catch {
        copies = 0;
      }
      if (copies > 0 && group) {
        Alert.alert(`What should happen to your ${copies} goals from ${group.name}?`, undefined, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Keep them as my own goals', onPress: () => finishLeave(true) },
          { text: 'Remove them', style: 'destructive', onPress: () => finishLeave(false) },
        ]);
        return;
      }
      Alert.alert('Leave group', undefined, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Leave group', style: 'destructive', onPress: () => finishLeave(true) },
      ]);
    })();
  };

  const shareCounts = useMemo(() => {
    const blocked = new Set(blockedIds);
    const counts = new Map<string, number>();
    for (const share of shares) {
      if (blocked.has(share.ownerId)) {
        continue;
      }
      counts.set(share.ownerId, (counts.get(share.ownerId) ?? 0) + 1);
    }
    return counts;
  }, [blockedIds, shares]);

  const orderedMembers = useMemo(() => {
    const mine = members.filter((member) => member.userId === user?.id);
    const rest = members.filter((member) => member.userId !== user?.id);
    return [...mine, ...rest];
  }, [members, user?.id]);

  const toggleExpanded = (userId: string) => {
    setExpanded((current) => {
      const copy = new Set(current);
      if (copy.has(userId)) {
        copy.delete(userId);
      } else {
        copy.add(userId);
      }
      return copy;
    });
  };

  const changeRole = async (member: GroupMember, role: 'admin' | 'member') => {
    setSelected(null);
    try {
      await setMemberRole(groupId, member.userId, role);
      await load();
    } catch (cause) {
      fail(cause);
    }
  };

  const blockFromMembers = (member: GroupMember) => {
    setSelected(null);
    void (async () => {
      try {
        await blockMember(member.userId);
        setBlockedIds((current) => (current.includes(member.userId) ? current : [...current, member.userId]));
      } catch (cause) {
        fail(cause);
      }
    })();
  };

  const confirmRemove = (member: GroupMember) => {
    setSelected(null);
    Alert.alert('Remove from group', `Remove ${member.displayName} from this group?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove from group',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await removeMember(groupId, member.userId);
              await load();
            } catch (cause) {
              fail(cause);
            }
          })();
        },
      },
    ]);
  };

  const saveRename = async () => {
    if (!group || busy) {
      return;
    }
    setBusy(true);
    setGearError(null);
    try {
      const next = await renameGroup(groupId, rename);
      setGroup({ ...group, name: next });
      setGear(null);
    } catch (cause) {
      setGearError(groupErrorMessage(cause, 'Could not rename the group.'));
    } finally {
      setBusy(false);
    }
  };

  const toggleAdminsOnly = async (on: boolean) => {
    if (!group || busy) {
      return;
    }
    setBusy(true);
    setGearError(null);
    try {
      await setChatAdminsOnly(groupId, on);
      await load();
    } catch (cause) {
      setGearError(groupErrorMessage(cause, 'Could not update the group.'));
    } finally {
      setBusy(false);
    }
  };

  const toggleMemberProgress = async (on: boolean) => {
    if (!group || busy) {
      return;
    }
    setBusy(true);
    setGearError(null);
    try {
      await setShowMemberProgress(groupId, on);
      await load();
    } catch (cause) {
      setGearError(groupErrorMessage(cause, 'Could not update the group.'));
    } finally {
      setBusy(false);
    }
  };

  const toggleEveryone = async (on: boolean) => {
    if (!group || busy) {
      return;
    }
    setBusy(true);
    setGearError(null);
    try {
      await setEveryoneAdmin(groupId, on);
      await load();
    } catch (cause) {
      setGearError(groupErrorMessage(cause, 'Could not update the group.'));
    } finally {
      setBusy(false);
    }
  };

  const resetCode = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setGearError(null);
    try {
      const next = await resetInviteCode(groupId);
      setCode(next);
      setGroup((current) => (current ? { ...current, inviteCode: next } : current));
    } catch (cause) {
      setGearError(groupErrorMessage(cause, 'Could not reset the invite code.'));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!group || busy || deleteText.trim() !== group.name) {
      return;
    }
    setBusy(true);
    setGearError(null);
    try {
      await deleteGroup(groupId);
      navigation.goBack();
    } catch (cause) {
      setGearError(groupErrorMessage(cause, 'Could not delete the group.'));
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.tabs}>
        {TABS.map((item) => {
          const selectedTab = tab === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => setTab(item.id)}
              style={styles.tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: selectedTab }}
              accessibilityLabel={
                item.id === 'chat' && chatUnread > 0 ? `Chat, ${chatUnread} unread` : item.label
              }
            >
              <View style={styles.tabLabel}>
                <Text style={[styles.tabText, selectedTab && styles.tabTextOn]}>{item.label}</Text>
                {item.id === 'chat' && chatUnread > 0 ? (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>{chatUnread > 99 ? '99+' : String(chatUnread)}</Text>
                  </View>
                ) : null}
              </View>
              <View style={[styles.tabLine, selectedTab && styles.tabLineOn]} />
            </Pressable>
          );
        })}
      </View>
      {loading && !group ? (
        <ActivityIndicator color="#007aff" style={styles.loading} />
      ) : error && !group ? (
        <View style={styles.soon}>
          <Text style={styles.error}>{error}</Text>
          <Pressable onPress={() => void load()} accessibilityRole="button" accessibilityLabel="Retry">
            <Text style={styles.link}>Retry</Text>
          </Pressable>
        </View>
      ) : tab === 'members' ? (
        <ScrollView style={styles.membersScroll} contentContainerStyle={{ paddingBottom: 32 + tabBarHeight }}>
          <View style={styles.card}>
            {orderedMembers.map((member, index) => {
              const mine = member.userId === user?.id;
              const count = shareCounts.get(member.userId) ?? 0;
              const open = expanded.has(member.userId);
              const name = mine ? 'You' : member.displayName;
              return (
                <View key={member.userId}>
                  {index > 0 ? <View style={styles.separator} /> : null}
                  <View style={styles.memberBlock}>
                    <View style={styles.memberRow}>
                      <Pressable
                        onPress={() => toggleExpanded(member.userId)}
                        style={({ pressed }) => [styles.memberText, pressed && styles.pressed]}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: open }}
                        accessibilityLabel={`${name}, ${count} shared goals`}
                      >
                        <View style={styles.memberTitle}>
                          <Text style={styles.memberName} numberOfLines={1}>
                            {name}
                          </Text>
                          {member.role === 'admin' ? <Text style={styles.adminLabel}>Admin</Text> : null}
                        </View>
                        <Text style={styles.sharedCount}>{count} shared goals</Text>
                      </Pressable>
                      {!mine && (group?.role === 'admin' || !blockedIds.includes(member.userId)) ? (
                        <Pressable
                          onPress={() => setSelected(member)}
                          hitSlop={8}
                          style={({ pressed }) => [styles.more, pressed && styles.pressed]}
                          accessibilityRole="button"
                          accessibilityLabel={`Actions for ${member.displayName}`}
                        >
                          <Text style={styles.moreText}>…</Text>
                        </Pressable>
                      ) : null}
                    </View>
                    {mine ? (
                      <Pressable
                        onPress={() => setChooseOpen(true)}
                        hitSlop={6}
                        style={({ pressed }) => [styles.chooseHit, pressed && styles.pressed]}
                        accessibilityRole="button"
                        accessibilityLabel="Choose goals to share"
                      >
                        <Text style={styles.choose}>Choose goals to share</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {open && !blockedIds.includes(member.userId) ? (
                    <MemberSharedGoals
                      key={`${member.userId}-${count}`}
                      groupId={groupId}
                      ownerId={member.userId}
                      onOpen={(goal) => {
                        if (mine) {
                          navigation.navigate('Goal', { goalId: goal.id });
                          return;
                        }
                        navigation.navigate('Goal', {
                          goalId: goal.id,
                          readOnly: true,
                          ownerId: member.userId,
                          sharedByName: member.displayName,
                        });
                      }}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>
          <Pressable
            onPress={leave}
            style={({ pressed }) => [styles.leave, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Leave group"
          >
            <Text style={styles.leaveText}>Leave group</Text>
          </Pressable>
        </ScrollView>
      ) : tab === 'progress' ? (
        <GroupGoalsPanel
          groupId={groupId}
          groupName={group?.name ?? ''}
          admin={group?.role === 'admin'}
          showMemberProgress={group?.showMemberProgress === true}
          blockedIds={blockedIds}
        />
      ) : null}
      <View style={tab === 'chat' ? styles.chatHost : styles.chatHidden}>
        <GroupChatPanel
          groupId={groupId}
          members={members}
          active={tab === 'chat'}
          tabBarHeight={tabBarHeight}
          onUnreadCount={setChatUnread}
          chatAdminsOnly={group?.chatAdminsOnly === true}
          viewerIsAdmin={group?.role === 'admin'}
          blockedIds={blockedIds}
          onBlocked={(userId) =>
            setBlockedIds((current) => (current.includes(userId) ? current : [...current, userId]))
          }
        />
      </View>

      <Modal visible={gear != null} transparent animationType="slide" onRequestClose={() => setGear(null)}>
        <KeyboardSafe style={styles.overlay} keyboardVerticalOffset={0}>
          <Pressable style={styles.dismiss} onPress={() => setGear(null)} accessibilityLabel="Close" />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            {gear === 'menu' ? (
              <>
                <Pressable
                  onPress={() => {
                    setGearError(null);
                    setGear('rename');
                  }}
                  style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Rename group"
                >
                  <Text style={styles.sheetLabel}>Rename group</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setGearError(null);
                    setGear('code');
                  }}
                  style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Invite code"
                >
                  <Text style={styles.sheetLabel}>Invite code</Text>
                </Pressable>
                <View style={styles.sheetRow}>
                  <Text style={styles.sheetLabel}>Everyone is an admin</Text>
                  <Switch
                    value={group?.everyoneAdmin === true}
                    onValueChange={(on) => void toggleEveryone(on)}
                    disabled={busy}
                    accessibilityLabel="Everyone is an admin"
                  />
                </View>
                <View style={styles.sheetRow}>
                  <View style={styles.sheetCopy}>
                    <Text style={styles.sheetSwitchLabel}>Show each member's progress</Text>
                    <Text style={styles.sheetHint}>
                      Members can see each other's progress on group goals. When off, only group totals are shown.
                    </Text>
                  </View>
                  <Switch
                    value={group?.showMemberProgress === true}
                    onValueChange={(on) => void toggleMemberProgress(on)}
                    disabled={busy}
                    accessibilityLabel="Show each member's progress"
                  />
                </View>
                <View style={styles.sheetRow}>
                  <Text style={styles.sheetLabel}>Only admins can post</Text>
                  <Switch
                    value={group?.chatAdminsOnly === true}
                    onValueChange={(on) => void toggleAdminsOnly(on)}
                    disabled={busy}
                    accessibilityLabel="Only admins can post"
                  />
                </View>
                <Pressable
                  onPress={() => {
                    setDeleteText('');
                    setGearError(null);
                    setGear('delete');
                  }}
                  style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Delete group"
                >
                  <Text style={styles.destructive}>Delete group</Text>
                </Pressable>
                {gearError ? <Text style={styles.error}>{gearError}</Text> : null}
              </>
            ) : null}
            {gear === 'rename' ? (
              <>
                <Text style={styles.sheetTitle}>Rename group</Text>
                <TextInput
                  value={rename}
                  onChangeText={setRename}
                  maxLength={40}
                  autoFocus
                  style={styles.input}
                />
                {gearError ? <Text style={styles.error}>{gearError}</Text> : null}
                <Pressable
                  onPress={() => void saveRename()}
                  disabled={busy || rename.trim().length === 0}
                  style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Rename group"
                >
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Rename group</Text>}
                </Pressable>
              </>
            ) : null}
            {gear === 'code' ? (
              <>
                <Text style={styles.sheetTitle}>Invite code</Text>
                <Text style={styles.code}>{code ?? ''}</Text>
                {gearError ? <Text style={styles.error}>{gearError}</Text> : null}
                <Pressable
                  onPress={() => {
                    if (group && code) {
                      void shareGroupInvite(group.name, code);
                    }
                  }}
                  style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Share invite"
                >
                  <Text style={styles.primaryText}>Share invite</Text>
                </Pressable>
                <Pressable
                  onPress={() => void resetCode()}
                  disabled={busy}
                  style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Reset code"
                >
                  <Text style={styles.secondaryText}>Reset code</Text>
                </Pressable>
              </>
            ) : null}
            {gear === 'delete' && group ? (
              <>
                <Text style={styles.sheetTitle}>Delete group</Text>
                <Text style={styles.hint}>Type {group.name} to confirm.</Text>
                <TextInput
                  value={deleteText}
                  onChangeText={setDeleteText}
                  autoFocus
                  autoCapitalize="none"
                  style={styles.input}
                />
                {gearError ? <Text style={styles.error}>{gearError}</Text> : null}
                <Pressable
                  onPress={() => void confirmDelete()}
                  disabled={busy || deleteText.trim() !== group.name}
                  style={({ pressed }) => [
                    styles.danger,
                    (busy || deleteText.trim() !== group.name) && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Delete group"
                >
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Delete group</Text>}
                </Pressable>
              </>
            ) : null}
          </View>
        </KeyboardSafe>
      </Modal>

      <ChooseGoalsSheet
        groupId={groupId}
        visible={chooseOpen}
        onClose={() => {
          setChooseOpen(false);
          void load();
        }}
      />

      <Modal visible={selected != null} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <Pressable style={styles.overlay} onPress={() => setSelected(null)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => undefined}>
            {selected ? (
              <>
                <Text style={styles.sheetTitle}>{selected.displayName}</Text>
                {group?.role === 'admin' ? (
                  <>
                    {selected.role === 'member' ? (
                      <Pressable
                        onPress={() => void changeRole(selected, 'admin')}
                        style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}
                        accessibilityRole="button"
                        accessibilityLabel="Make admin"
                      >
                        <Text style={styles.sheetLabel}>Make admin</Text>
                      </Pressable>
                    ) : group.everyoneAdmin ? null : (
                      <Pressable
                        onPress={() => void changeRole(selected, 'member')}
                        style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}
                        accessibilityRole="button"
                        accessibilityLabel="Remove admin"
                      >
                        <Text style={styles.sheetLabel}>Remove admin</Text>
                      </Pressable>
                    )}
                    <Pressable
                      onPress={() => confirmRemove(selected)}
                      style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}
                      accessibilityRole="button"
                      accessibilityLabel="Remove from group"
                    >
                      <Text style={styles.destructive}>Remove from group</Text>
                    </Pressable>
                  </>
                ) : null}
                {!blockedIds.includes(selected.userId) ? (
                  <Pressable
                    onPress={() => blockFromMembers(selected)}
                    style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Block ${selected.displayName}`}
                  >
                    <Text style={styles.sheetLabel}>Block {selected.displayName}</Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f2f2f7',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5ea',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 12,
  },
  tabLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  unreadBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: '#007aff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  chatHost: {
    flex: 1,
  },
  chatHidden: {
    display: 'none',
  },
  membersScroll: {
    flex: 1,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B6B70',
  },
  tabTextOn: {
    color: '#007aff',
  },
  tabLine: {
    marginTop: 10,
    height: 2,
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
  },
  tabLineOn: {
    backgroundColor: '#007aff',
  },
  loading: {
    marginTop: 32,
  },
  soon: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  soonText: {
    fontSize: 17,
    color: '#6B6B70',
  },
  card: {
    backgroundColor: '#fff',
    marginTop: 16,
  },
  memberBlock: {
    paddingBottom: 8,
  },
  memberRow: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  memberText: {
    flex: 1,
    gap: 2,
  },
  memberTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  memberName: {
    flexShrink: 1,
    fontSize: 17,
    color: '#111',
  },
  sharedCount: {
    fontSize: 13,
    color: '#6B6B70',
  },
  chooseHit: {
    alignSelf: 'flex-start',
    marginLeft: 16,
    marginBottom: 4,
  },
  choose: {
    fontSize: 15,
    fontWeight: '600',
    color: '#007aff',
  },
  more: {
    minWidth: 32,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
  },
  adminLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B46C1',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e5e5ea',
    marginLeft: 16,
  },
  leave: {
    marginTop: 24,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaveText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#ff3b30',
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  dismiss: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
  },
  sheetRow: {
    minHeight: 48,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sheetCopy: {
    flex: 1,
    paddingVertical: 8,
  },
  sheetLabel: {
    flex: 1,
    fontSize: 17,
    color: '#111',
  },
  sheetSwitchLabel: {
    fontSize: 17,
    color: '#111',
  },
  sheetHint: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: '#6B6B70',
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  destructive: {
    fontSize: 17,
    color: '#ff3b30',
  },
  hint: {
    fontSize: 15,
    color: '#6B6B70',
    paddingHorizontal: 20,
  },
  input: {
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 17,
    color: '#111',
  },
  code: {
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: 2,
    textAlign: 'center',
    color: '#111',
    marginVertical: 8,
  },
  primary: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: '#007aff',
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  secondary: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    color: '#007aff',
    fontSize: 17,
    fontWeight: '600',
  },
  danger: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: '#ff3b30',
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  error: {
    fontSize: 14,
    color: '#c62828',
    paddingHorizontal: 20,
  },
  link: {
    fontSize: 17,
    fontWeight: '600',
    color: '#007aff',
  },
  pressed: {
    opacity: 0.55,
  },
});
