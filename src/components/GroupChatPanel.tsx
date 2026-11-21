import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Keyboard,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardEvent,
  type StyleProp,
  type TextInputInstance,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  COMMUNITY_GUIDELINES_BODY,
  COMMUNITY_GUIDELINES_TITLE,
  SUPPORT_MESSAGE,
} from '../constants/communitySafety';
import { useAuth } from '../context/AuthContext';
import { blockMember } from '../lib/blocksApi';
import {
  deleteGroupMessage,
  getGroupMessages,
  getGroupReactions,
  GROUP_REACTION_EMOJIS,
  mapMessage,
  markGroupRead,
  mergeGroupMessages,
  groupUnreadCount,
  REPORT_REASONS,
  reportGroupMessage,
  sendGroupMessage,
  toggleGroupReaction,
  type GroupChatMessage,
  type GroupReaction,
  type GroupReactionEmoji,
  type ReportReason,
} from '../lib/groupChatApi';
import { groupErrorMessage, listGroupMembers, type GroupMember } from '../lib/groupsApi';
import { agreeToCommunityGuidelines, getGuidelinesAgreedAt } from '../lib/profileApi';
import { toLocalDateString, todayLocal } from '../lib/localDate';
import { supabase } from '../lib/supabase';
import { addDays } from '../utils/date';

type Props = {
  groupId: string;
  members: GroupMember[];
  active: boolean;
  tabBarHeight: number;
  onUnreadCount: (count: number) => void;
  chatAdminsOnly: boolean;
  viewerIsAdmin: boolean;
  blockedIds: string[];
  onBlocked: (userId: string) => void;
};

type ChatRow =
  | { type: 'day'; key: string; label: string }
  | {
      type: 'bubble';
      key: string;
      message: GroupChatMessage;
      showTime: boolean;
      showName: boolean;
      name: string;
    };

const DELETED_LABEL = 'Message deleted';
const BLOCKED_LABEL = 'Message from a blocked member';
const ADMINS_ONLY = 'Only admins can post in this group right now.';

function messageDay(iso: string): string | null {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }
  return toLocalDateString(date);
}

function dayLabel(iso: string): string {
  const day = messageDay(iso);
  if (!day) {
    return '';
  }
  const today = todayLocal();
  if (day === today) {
    return 'Today';
  }
  if (day === addDays(today, -1)) {
    return 'Yesterday';
  }
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function sameUser(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) {
    return false;
  }
  return left.toLowerCase() === right.toLowerCase();
}

function clockTime(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) {
    return '';
  }
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function buildRows(
  messages: GroupChatMessage[],
  names: Map<string, string>,
  myId: string | undefined,
): ChatRow[] {
  const rows: ChatRow[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    const newer = index + 1 < messages.length ? messages[index + 1] : null;
    const older = index > 0 ? messages[index - 1] : null;
    const day = messageDay(message.createdAt) ?? '';
    const newerDay = newer ? (messageDay(newer.createdAt) ?? '') : '';
    const olderDay = older ? (messageDay(older.createdAt) ?? '') : '';
    if (!older || olderDay !== day) {
      const label = dayLabel(message.createdAt);
      if (label) {
        rows.push({ type: 'day', key: `day-${day || message.id}`, label });
      }
    }
    const showTime = !newer || newer.senderId !== message.senderId || newerDay !== day;
    const showName =
      !sameUser(message.senderId, myId) &&
      (!older || older.senderId !== message.senderId || olderDay !== day);
    rows.push({
      type: 'bubble',
      key: message.id,
      message,
      showTime,
      showName,
      name: names.get(message.senderId) ?? 'Member',
    });
  }
  return rows;
}

function reactionKey(reaction: GroupReaction): string {
  return `${reaction.messageId}:${reaction.userId}:${reaction.emoji}`;
}

/** How far the keyboard covers the bottom of the screen. Zero when it is closed. */
function keyboardCover(event: KeyboardEvent): number {
  return Math.max(0, Dimensions.get('screen').height - event.endCoordinates.screenY);
}

function FullWidthCell({
  style,
  children,
  ...rest
}: {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  return (
    <View {...rest} style={[style, styles.fullCell]}>
      {children}
    </View>
  );
}

export function GroupChatPanel({
  groupId,
  members,
  active,
  tabBarHeight,
  onUnreadCount,
  chatAdminsOnly,
  viewerIsAdmin,
  blockedIds,
  onBlocked,
}: Props) {
  const { user } = useAuth();
  const [authUserId, setAuthUserId] = useState<string | undefined>(undefined);
  const [senderNames, setSenderNames] = useState<Map<string, string>>(() => new Map());
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<ChatRow>>(null);
  const inputRef = useRef<TextInputInstance>(null);
  const messagesRef = useRef<GroupChatMessage[]>([]);
  const activeRef = useRef(active);
  const awayFromBottom = useRef(false);
  const userDrag = useRef(false);
  const holdFocus = useRef(false);
  const keyboardCoverRef = useRef(0);
  const [messages, setMessages] = useState<GroupChatMessage[]>([]);
  const [reactions, setReactions] = useState<GroupReaction[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [keyboardCoverPx, setKeyboardCoverPx] = useState(0);
  const [menuMessage, setMenuMessage] = useState<GroupChatMessage | null>(null);
  const [reportMessage, setReportMessage] = useState<GroupChatMessage | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [guidelinesOpen, setGuidelinesOpen] = useState(false);
  const [guidelinesAgreed, setGuidelinesAgreed] = useState<boolean | null>(null);
  const [agreeing, setAgreeing] = useState(false);

  messagesRef.current = messages;
  activeRef.current = active;
  const myId = authUserId;

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data, error }) => {
      if (cancelled) {
        return;
      }
      setAuthUserId(!error && data.user?.id ? data.user.id : undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, active]);

  useEffect(() => {
    let cancelled = false;
    void listGroupMembers(groupId)
      .then((listed) => {
        if (cancelled) {
          return;
        }
        const map = new Map<string, string>();
        for (const member of listed) {
          map.set(member.userId, member.displayName.trim() || 'Member');
        }
        setSenderNames(map);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [groupId, members]);

  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members) {
      map.set(member.userId, member.displayName.trim() || 'Member');
    }
    for (const [id, name] of senderNames) {
      map.set(id, name);
    }
    return map;
  }, [members, senderNames]);
  const blockedSet = useMemo(() => new Set(blockedIds), [blockedIds]);
  const rows = useMemo(() => buildRows(messages, names, myId), [messages, names, myId]);
  const adminsLocked = chatAdminsOnly && !viewerIsAdmin;
  const canSend = draft.trim().length > 0 && !sending && guidelinesAgreed === true && !adminsLocked;

  const distanceFromBottom = (event: {
    contentOffset: { y: number };
    contentSize: { height: number };
    layoutMeasurement: { height: number };
  }) => event.contentSize.height - event.layoutMeasurement.height - event.contentOffset.y;

  const revealLatest = () => {
    if (awayFromBottom.current || userDrag.current) {
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (awayFromBottom.current || userDrag.current) {
          return;
        }
        listRef.current?.scrollToOffset({ offset: 1_000_000, animated: false });
      });
    });
  };

  const refreshUnread = useCallback(async () => {
    try {
      onUnreadCount(await groupUnreadCount(groupId));
    } catch {
      // The badge stays as it was.
    }
  }, [groupId, onUnreadCount]);

  const markOpen = useCallback(async () => {
    try {
      await markGroupRead(groupId);
      onUnreadCount(0);
    } catch {
      // Opening the tab still shows the messages.
    }
  }, [groupId, onUnreadCount]);

  useEffect(() => {
    if (active) {
      void markOpen();
    } else {
      void refreshUnread();
    }
  }, [active, markOpen, refreshUnread]);

  const loadReactions = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      return;
    }
    const next = await getGroupReactions(ids);
    setReactions((current) => {
      const kept = current.filter((reaction) => !ids.includes(reaction.messageId));
      const byKey = new Map<string, GroupReaction>();
      for (const reaction of [...kept, ...next]) {
        byKey.set(reactionKey(reaction), reaction);
      }
      return [...byKey.values()];
    });
  }, []);

  const loadFirst = useCallback(async () => {
    setLoading(true);
    try {
      const page = await getGroupMessages(groupId);
      setMessages(page.messages);
      setHasMore(page.hasMore);
      await loadReactions(page.messages.map((message) => message.id));
    } catch (error) {
      Alert.alert('Could not load messages', groupErrorMessage(error, 'Could not load messages.'));
    } finally {
      setLoading(false);
    }
  }, [groupId, loadReactions]);

  useEffect(() => {
    void loadFirst();
  }, [loadFirst]);

  useEffect(() => {
    if (!active) {
      Keyboard.dismiss();
      return;
    }
    awayFromBottom.current = false;
    Keyboard.dismiss();
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 1_000_000, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);

  useEffect(() => {
    if (!active) {
      return;
    }
    let cancelled = false;
    void getGuidelinesAgreedAt()
      .then((at) => {
        if (cancelled) {
          return;
        }
        const agreed = at != null;
        setGuidelinesAgreed(agreed);
        if (!agreed) {
          setGuidelinesOpen(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGuidelinesAgreed(false);
          setGuidelinesOpen(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => {
    let frame = 0;
    let lastEventAt = 0;
    const setCover = (value: number) => {
      keyboardCoverRef.current = value;
      setKeyboardCoverPx(value);
    };
    const animateTo = (to: number, duration: number) => {
      cancelAnimationFrame(frame);
      const from = keyboardCoverRef.current;
      const start = Date.now();
      const tick = () => {
        const t = duration <= 0 ? 1 : Math.min(1, (Date.now() - start) / duration);
        const eased = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
        setCover(from + (to - from) * eased);
        if (t < 1) {
          frame = requestAnimationFrame(tick);
        }
      };
      tick();
    };
    const applyFrame = (event: KeyboardEvent) => {
      const next = keyboardCover(event);
      const now = Date.now();
      const rapid = now - lastEventAt < 80;
      lastEventAt = now;
      const duration = event.duration ?? 0;
      const opening = next > keyboardCoverRef.current + 24;
      if (opening && !awayFromBottom.current) {
        listRef.current?.scrollToOffset({ offset: 1_000_000, animated: false });
      }
      if (!rapid && duration > 0 && Math.abs(next - keyboardCoverRef.current) > 24) {
        animateTo(next, duration);
        return;
      }
      cancelAnimationFrame(frame);
      setCover(next);
    };
    const close = () => {
      cancelAnimationFrame(frame);
      setCover(0);
    };
    if (Platform.OS === 'ios') {
      const change = Keyboard.addListener('keyboardWillChangeFrame', applyFrame);
      const hide = Keyboard.addListener('keyboardDidHide', close);
      return () => {
        cancelAnimationFrame(frame);
        change.remove();
        hide.remove();
      };
    }
    const show = Keyboard.addListener('keyboardDidShow', applyFrame);
    const hide = Keyboard.addListener('keyboardDidHide', close);
    return () => {
      cancelAnimationFrame(frame);
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel(`group-chat:${groupId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_messages', filter: `group_id=eq.${groupId}` },
        (payload) => {
          const eventType = payload.eventType;
          const next = (eventType === 'DELETE' ? payload.old : payload.new) as {
            id?: string | null;
            group_id?: string | null;
            sender_id?: string | null;
            body?: string | null;
            created_at?: string | null;
            deleted_at?: string | null;
          };
          if (eventType === 'DELETE') {
            if (!next.id) {
              return;
            }
            const removedId = next.id;
            setMessages((current) => current.filter((message) => message.id !== removedId));
            setReactions((current) => current.filter((reaction) => reaction.messageId !== removedId));
            return;
          }
          if (next.group_id && next.group_id !== groupId) {
            return;
          }
          const message = mapMessage(next);
          if (!message) {
            return;
          }
          if (message.deleted) {
            setReactions((current) => current.filter((reaction) => reaction.messageId !== message.id));
          }
          const existed = messagesRef.current.some((item) => item.id === message.id);
          setMessages((current) => mergeGroupMessages(current, [message]));
          if (!existed && !sameUser(message.senderId, myId)) {
            if (activeRef.current && !awayFromBottom.current) {
              void markGroupRead(groupId).then(() => onUnreadCount(0)).catch(() => undefined);
            } else if (!activeRef.current) {
              void refreshUnread();
            }
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions' },
        (payload) => {
          const eventType = payload.eventType;
          const row = (eventType === 'DELETE' ? payload.old : payload.new) as {
            message_id?: string;
            user_id?: string;
            emoji?: string;
          };
          if (!row.message_id || !row.user_id || !row.emoji) {
            return;
          }
          if (!messagesRef.current.some((message) => message.id === row.message_id)) {
            return;
          }
          if (!(GROUP_REACTION_EMOJIS as readonly string[]).includes(row.emoji)) {
            return;
          }
          const reaction: GroupReaction = {
            messageId: row.message_id,
            userId: row.user_id,
            emoji: row.emoji as GroupReactionEmoji,
          };
          setReactions((current) => {
            const without = current.filter((item) => reactionKey(item) !== reactionKey(reaction));
            return eventType === 'DELETE' ? without : [...without, reaction];
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [groupId, myId, onUnreadCount, refreshUnread]);

  const loadEarlier = useCallback(async () => {
    const oldest = messagesRef.current[0];
    if (!oldest || loadingEarlier || !hasMore) {
      return;
    }
    setLoadingEarlier(true);
    try {
      const page = await getGroupMessages(groupId, { before: oldest.createdAt });
      setMessages((current) => mergeGroupMessages(page.messages, current));
      setHasMore(page.hasMore);
      await loadReactions(page.messages.map((message) => message.id));
    } catch (error) {
      Alert.alert('Could not load messages', groupErrorMessage(error, 'Could not load messages.'));
    } finally {
      setLoadingEarlier(false);
    }
  }, [groupId, hasMore, loadReactions, loadingEarlier]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) {
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      const result = await sendGroupMessage(groupId, text);
      if (result.kind === 'support') {
        setDraft('');
        setSupportOpen(true);
        return;
      }
      setDraft('');
      setMessages((current) => mergeGroupMessages(current, [result.message]));
      awayFromBottom.current = false;
      revealLatest();
      inputRef.current?.focus();
    } catch (error) {
      setSendError(groupErrorMessage(error, 'Could not send the message.'));
    } finally {
      setSending(false);
    }
  };

  const toggle = async (message: GroupChatMessage, emoji: GroupReactionEmoji) => {
    if (!myId) {
      return;
    }
    const on = reactions.some(
      (reaction) =>
        reaction.messageId === message.id && sameUser(reaction.userId, myId) && reaction.emoji === emoji,
    );
    const next: GroupReaction = { messageId: message.id, userId: myId, emoji };
    setReactions((current) => {
      const without = current.filter((reaction) => reactionKey(reaction) !== reactionKey(next));
      return on ? without : [...without, next];
    });
    try {
      await toggleGroupReaction(message.id, myId, emoji, !on);
    } catch (error) {
      setReactions((current) => {
        const without = current.filter((reaction) => reactionKey(reaction) !== reactionKey(next));
        return on ? [...without, next] : without;
      });
      Alert.alert('Could not react', groupErrorMessage(error, 'Could not react.'));
    }
  };

  const copyMessage = async (message: GroupChatMessage) => {
    const Clipboard = await import('expo-clipboard');
    await Clipboard.setStringAsync(message.body);
  };

  const isBlockedSender = (message: GroupChatMessage) =>
    !sameUser(message.senderId, myId) && blockedSet.has(message.senderId);

  const visibleBody = (message: GroupChatMessage) => {
    if (message.deleted) {
      return DELETED_LABEL;
    }
    if (isBlockedSender(message)) {
      return BLOCKED_LABEL;
    }
    return message.body;
  };

  const agree = async () => {
    setAgreeing(true);
    try {
      await agreeToCommunityGuidelines();
      setGuidelinesAgreed(true);
      setGuidelinesOpen(false);
    } catch (error) {
      Alert.alert('Could not save', groupErrorMessage(error, 'The guidelines were not saved.'));
    } finally {
      setAgreeing(false);
    }
  };

  const confirmDelete = (message: GroupChatMessage) => {
    Alert.alert('Delete this message?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await deleteGroupMessage(message.id);
              setMessages((current) =>
                current.map((item) =>
                  item.id === message.id ? { ...item, deleted: true, body: '' } : item,
                ),
              );
              setReactions((current) => current.filter((reaction) => reaction.messageId !== message.id));
            } catch (error) {
              Alert.alert('Could not delete', groupErrorMessage(error, 'The message was not deleted.'));
            }
          })();
        },
      },
    ]);
  };

  const offerBlock = (message: GroupChatMessage) => {
    if (isBlockedSender(message) || sameUser(message.senderId, myId)) {
      return;
    }
    const name = names.get(message.senderId) ?? 'Member';
    Alert.alert(`Block ${name}?`, undefined, [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Block',
        onPress: () => {
          void blockSender(message);
        },
      },
    ]);
  };

  const blockSender = async (message: GroupChatMessage) => {
    try {
      await blockMember(message.senderId);
      onBlocked(message.senderId);
    } catch (error) {
      Alert.alert('Could not block', groupErrorMessage(error, 'This person was not blocked.'));
    }
  };

  const submitReport = async (message: GroupChatMessage, reason: ReportReason) => {
    setReportMessage(null);
    try {
      await reportGroupMessage(message.id, reason);
      Alert.alert('Thanks for letting us know. We review every report within 24 hours.', undefined, [
        {
          text: 'OK',
          onPress: () => offerBlock(message),
        },
      ]);
    } catch (error) {
      Alert.alert('Could not report', groupErrorMessage(error, 'The report was not saved.'));
    }
  };

  const chipsFor = (messageId: string) => {
    const counts = new Map<GroupReactionEmoji, { count: number; mine: boolean }>();
    for (const reaction of reactions) {
      if (reaction.messageId !== messageId) {
        continue;
      }
      const current = counts.get(reaction.emoji) ?? { count: 0, mine: false };
      current.count += 1;
      if (sameUser(reaction.userId, myId)) {
        current.mine = true;
      }
      counts.set(reaction.emoji, current);
    }
    return GROUP_REACTION_EMOJIS.flatMap((emoji) => {
      const chip = counts.get(emoji);
      return chip ? [{ emoji, ...chip }] : [];
    });
  };

  const closedInset = Math.max(insets.bottom, 8) + tabBarHeight;
  const composerInset = keyboardCoverPx > 0 ? keyboardCoverPx : closedInset;

  return (
    <View style={styles.screen}>
      <View style={styles.messages}>
        <FlatList
          ref={listRef}
          style={styles.messages}
          data={rows}
          extraData={myId}
          CellRendererComponent={FullWidthCell}
          keyExtractor={(item) => item.key}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          alwaysBounceVertical
          contentContainerStyle={[styles.list, rows.length === 0 && styles.listEmpty]}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          onContentSizeChange={revealLatest}
          onLayout={revealLatest}
          onScrollBeginDrag={() => {
            userDrag.current = true;
          }}
          onScroll={(event) => {
            if (!userDrag.current) {
              return;
            }
            awayFromBottom.current = distanceFromBottom(event.nativeEvent) > 48;
            if (event.nativeEvent.contentOffset.y < 48) {
              void loadEarlier();
            }
          }}
          onScrollEndDrag={(event) => {
            const velocity = event.nativeEvent.velocity?.y ?? 0;
            if (Math.abs(velocity) < 0.05) {
              awayFromBottom.current = distanceFromBottom(event.nativeEvent) > 48;
              userDrag.current = false;
            }
          }}
          onMomentumScrollEnd={(event) => {
            if (!userDrag.current) {
              return;
            }
            awayFromBottom.current = distanceFromBottom(event.nativeEvent) > 48;
            userDrag.current = false;
          }}
          scrollEventThrottle={16}
          ListHeaderComponent={
            loadingEarlier ? <ActivityIndicator color="#007aff" style={styles.earlier} /> : undefined
          }
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator color="#007aff" style={styles.loading} />
            ) : (
              <Text style={styles.empty}>Say hi to your group 👋</Text>
            )
          }
          renderItem={({ item }) => {
            if (item.type === 'day') {
              return <Text style={styles.day}>{item.label}</Text>;
            }
            const message = item.message;
            const mine = sameUser(message.senderId, myId);
            const blocked = isBlockedSender(message);
            const placeholder = message.deleted || blocked;
            const chips = placeholder ? [] : chipsFor(message.id);
            const canOpenMenu = !message.deleted && (!blocked || viewerIsAdmin);
            return (
              <View style={[styles.messageLine, mine ? styles.messageLineMine : styles.messageLineTheirs]}>
                <Pressable
                  onLongPress={canOpenMenu ? () => setMenuMessage(message) : undefined}
                  delayLongPress={350}
                  style={[styles.group, mine ? styles.groupMine : styles.groupTheirs]}
                >
                  {item.showName && !placeholder ? <Text style={styles.sender}>{item.name}</Text> : null}
                  <View style={[styles.bubble, mine && !placeholder ? styles.bubbleMine : styles.bubbleTheirs]}>
                    <Text style={[styles.body, mine && !placeholder && styles.bodyMine, placeholder && styles.bodyMuted]}>
                      {visibleBody(message)}
                    </Text>
                  </View>
                  {chips.length > 0 ? (
                    <View style={styles.chips}>
                      {chips.map((chip) => (
                        <View
                          key={chip.emoji}
                          style={[styles.chip, chip.mine && styles.chipMine]}
                        >
                          <Text style={styles.chipText}>{`${chip.emoji} ${chip.count}`}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  {item.showTime ? <Text style={styles.time}>{clockTime(message.createdAt)}</Text> : null}
                </Pressable>
              </View>
            );
          }}
        />
      </View>
      {sendError ? <Text style={styles.sendError}>{sendError}</Text> : null}
      {adminsLocked ? <Text style={styles.locked}>{ADMINS_ONLY}</Text> : null}
      <View
        style={[styles.composer, { paddingBottom: composerInset }]}
      >
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={draft}
          onChangeText={(value) => {
            setDraft(value);
            if (sendError) {
              setSendError(null);
            }
          }}
          placeholder=""
          maxLength={1000}
          multiline
          blurOnSubmit={false}
          editable={guidelinesAgreed === true && !adminsLocked}
          onBlur={() => {
            if (holdFocus.current) {
              inputRef.current?.focus();
            }
          }}
          accessibilityLabel="Message"
        />
        <Pressable
          onPressIn={() => {
            holdFocus.current = true;
            inputRef.current?.focus();
          }}
          onPressOut={() => {
            setTimeout(() => {
              holdFocus.current = false;
            }, 400);
          }}
          onPress={() => void send()}
          disabled={!canSend}
          style={styles.sendButton}
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityState={{ disabled: !canSend }}
        >
          <Text style={[styles.sendLabel, !canSend && styles.sendDisabled]}>Send</Text>
        </Pressable>
      </View>
      <Modal
        visible={active && menuMessage != null}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuMessage(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setMenuMessage(null)} accessibilityLabel="Close">
          <Pressable style={styles.sheet} onPress={() => undefined}>
            {menuMessage && !isBlockedSender(menuMessage) ? (
              <View style={styles.reactionBar}>
                {GROUP_REACTION_EMOJIS.map((emoji) => (
                  <Pressable
                    key={emoji}
                    onPress={() => {
                      const message = menuMessage;
                      if (!message) {
                        return;
                      }
                      setMenuMessage(null);
                      void toggle(message, emoji);
                      inputRef.current?.focus();
                    }}
                    style={({ pressed }) => [styles.reactionHit, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={emoji}
                  >
                    <Text style={styles.reactionEmoji}>{emoji}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {menuMessage && !isBlockedSender(menuMessage) ? (
              <Pressable
                onPress={() => {
                  const message = menuMessage;
                  setMenuMessage(null);
                  if (message) {
                    void copyMessage(message);
                  }
                  inputRef.current?.focus();
                }}
                style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Copy"
              >
                <Text style={styles.menuLabel}>Copy</Text>
              </Pressable>
            ) : null}
            {menuMessage && !sameUser(menuMessage.senderId, myId) && !isBlockedSender(menuMessage) ? (
              <Pressable
                onPress={() => {
                  setReportMessage(menuMessage);
                  setMenuMessage(null);
                }}
                style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Report"
              >
                <Text style={styles.menuLabel}>Report</Text>
              </Pressable>
            ) : null}
            {menuMessage && !sameUser(menuMessage.senderId, myId) && !isBlockedSender(menuMessage) ? (
              <Pressable
                onPress={() => {
                  const message = menuMessage;
                  setMenuMessage(null);
                  if (message) {
                    void blockSender(message);
                  }
                }}
                style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`Block ${names.get(menuMessage.senderId) ?? 'Member'}`}
              >
                <Text style={styles.menuLabel}>
                  {`Block ${names.get(menuMessage.senderId) ?? 'Member'}`}
                </Text>
              </Pressable>
            ) : null}
            {menuMessage && (sameUser(menuMessage.senderId, myId) || viewerIsAdmin) ? (
              <Pressable
                onPress={() => {
                  const message = menuMessage;
                  setMenuMessage(null);
                  if (message) {
                    confirmDelete(message);
                  }
                }}
                style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Delete"
              >
                <Text style={styles.destructive}>Delete</Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
      <Modal
        visible={active && reportMessage != null}
        transparent
        animationType="fade"
        onRequestClose={() => setReportMessage(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setReportMessage(null)} accessibilityLabel="Close">
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <Text style={styles.sheetTitle}>Report</Text>
            {REPORT_REASONS.map((reason) => (
              <Pressable
                key={reason}
                onPress={() => {
                  if (reportMessage) {
                    void submitReport(reportMessage, reason);
                  }
                }}
                style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={reason}
              >
                <Text style={styles.menuLabel}>{reason}</Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
      <Modal visible={active && supportOpen} transparent animationType="fade" onRequestClose={() => setSupportOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setSupportOpen(false)} accessibilityLabel="Close">
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <Text style={styles.supportBody}>{SUPPORT_MESSAGE}</Text>
            <Pressable
              onPress={() => {
                void Linking.openURL('tel:988');
              }}
              style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Call 988"
            >
              <Text style={styles.menuLabel}>Call 988</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                void Linking.openURL('sms:988');
              }}
              style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Text 988"
            >
              <Text style={styles.menuLabel}>Text 988</Text>
            </Pressable>
            <Pressable
              onPress={() => setSupportOpen(false)}
              style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={styles.menuLabel}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal visible={active && guidelinesOpen} transparent animationType="fade" onRequestClose={() => undefined}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{COMMUNITY_GUIDELINES_TITLE}</Text>
            <Text style={styles.supportBody}>{COMMUNITY_GUIDELINES_BODY}</Text>
            <Pressable
              onPress={() => void agree()}
              disabled={agreeing}
              style={({ pressed }) => [styles.agree, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="I agree"
            >
              {agreeing ? <ActivityIndicator color="#fff" /> : <Text style={styles.agreeText}>I agree</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f2f2f7',
  },
  messages: {
    flex: 1,
  },
  list: {
    flexGrow: 1,
    padding: 16,
    gap: 8,
    alignItems: 'stretch',
  },
  fullCell: {
    width: '100%',
    alignItems: 'stretch',
  },
  messageLine: {
    width: '100%',
    flexDirection: 'row',
  },
  messageLineMine: {
    justifyContent: 'flex-end',
  },
  messageLineTheirs: {
    justifyContent: 'flex-start',
  },
  listEmpty: {
    justifyContent: 'center',
  },
  loading: {
    marginTop: 24,
  },
  earlier: {
    paddingVertical: 8,
  },
  empty: {
    color: '#8e8e93',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 24,
  },
  day: {
    alignSelf: 'center',
    fontSize: 13,
    fontWeight: '600',
    color: '#8e8e93',
    marginTop: 8,
  },
  group: {
    maxWidth: '82%',
    gap: 4,
  },
  groupMine: {
    alignItems: 'flex-end',
  },
  groupTheirs: {
    alignItems: 'flex-start',
  },
  sender: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B6B70',
    marginLeft: 8,
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleMine: {
    backgroundColor: '#007aff',
  },
  bubbleTheirs: {
    backgroundColor: '#fff',
  },
  body: {
    fontSize: 16,
    lineHeight: 22,
    color: '#1c1c1e',
  },
  bodyMine: {
    color: '#fff',
  },
  bodyMuted: {
    color: '#8e8e93',
    fontStyle: 'italic',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  chip: {
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  chipMine: {
    backgroundColor: '#d6e8ff',
  },
  chipText: {
    fontSize: 12,
    color: '#1c1c1e',
  },
  time: {
    fontSize: 11,
    color: '#8e8e93',
  },
  sendError: {
    color: '#c62828',
    fontSize: 13,
    paddingHorizontal: 16,
    paddingBottom: 4,
    backgroundColor: '#fff',
  },
  locked: {
    color: '#6b6b70',
    fontSize: 15,
    lineHeight: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5ea',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 20,
    backgroundColor: '#f2f2f7',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 16,
    color: '#1c1c1e',
  },
  sendButton: {
    paddingHorizontal: 4,
    paddingVertical: 10,
  },
  sendLabel: {
    color: '#007aff',
    fontSize: 17,
    fontWeight: '600',
  },
  sendDisabled: {
    color: '#b0b0b5',
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  reactionBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  reactionHit: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionEmoji: {
    fontSize: 28,
  },
  menuRow: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5ea',
  },
  menuLabel: {
    fontSize: 17,
    color: '#111',
  },
  destructive: {
    fontSize: 17,
    color: '#ff3b30',
  },
  sheetTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8e8e93',
    textAlign: 'center',
    paddingBottom: 8,
  },
  supportBody: {
    fontSize: 17,
    lineHeight: 24,
    color: '#1c1c1e',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  agree: {
    marginHorizontal: 20,
    marginTop: 8,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#007aff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  agreeText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.55,
  },
});
