import { Ionicons } from '@expo/vector-icons';
import { CommonActions, useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardSafe } from '../components/KeyboardSafe';
import { PartnerGoalsView } from '../components/PartnerGoalsView';
import { showActionSheet } from '../components/showActionSheet';
import { useAuth } from '../context/AuthContext';
import { useCommunity } from '../context/CommunityContext';
import { blockPartner, getGoalsSharedWithMe, removePartner } from '../lib/communityApi';
import { getAllGoals } from '../lib/goalTreeApi';
import { toLocalDateString, todayLocal } from '../lib/localDate';
import {
  deleteMessage,
  getMessages,
  markRead,
  mergeMessages,
  reportMessage,
  sendMessage,
  type ChatMessage,
} from '../lib/messagesApi';
import { markReflectionNoteSent } from '../lib/reflectionNote';
import type { CommunityStackParamList } from '../navigation/CommunityStackNavigator';
import type { Goal } from '../types/goal';
import { addDays } from '../utils/date';

type Props = NativeStackScreenProps<CommunityStackParamList, 'Chat'>;

type GoalLink = {
  title: string;
  mine: boolean;
};

type ChatRow =
  | { type: 'day'; key: string; label: string }
  | { type: 'bubble'; key: string; message: ChatMessage; showTime: boolean };

function roleTitle(role: 'partner' | 'coach'): string {
  return role === 'coach' ? 'Achievement Coach' : 'Accountability partner';
}

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
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function clockTime(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) {
    return '';
  }
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Newest first, so an inverted list shows the oldest day at the top. */
function buildRows(messages: ChatMessage[]): ChatRow[] {
  const rows: ChatRow[] = [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const newer = index + 1 < messages.length ? messages[index + 1] : null;
    const older = index > 0 ? messages[index - 1] : null;
    const day = messageDay(message.createdAt) ?? '';
    const newerDay = newer ? (messageDay(newer.createdAt) ?? '') : '';
    const olderDay = older ? (messageDay(older.createdAt) ?? '') : '';
    const showTime = !newer || newer.senderId !== message.senderId || newerDay !== day;
    rows.push({ type: 'bubble', key: message.id, message, showTime });
    if (!older || olderDay !== day) {
      const label = dayLabel(message.createdAt);
      if (label) {
        rows.push({ type: 'day', key: `day-${day || message.id}`, label });
      }
    }
  }
  return rows;
}

function ChatTitle({ name, role }: { name: string; role: string }) {
  return (
    <View style={styles.titleBlock}>
      <Text style={styles.titleName} numberOfLines={1}>
        {name}
      </Text>
      <Text style={styles.titleRole} numberOfLines={1}>
        {role}
      </Text>
    </View>
  );
}

export default function ChatScreen({ navigation, route }: Props) {
  const { connectionId, otherId, otherName, role, fromReflection } = route.params;
  const isCoach = role === 'coach';
  const { user } = useAuth();
  const { clearUnread } = useCommunity();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<ChatRow>>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const newestIdRef = useRef<string | null>(null);
  const awayFromBottom = useRef(false);
  const keyboardOpenRef = useRef(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaving = useRef(false);
  const [tab, setTab] = useState<'chat' | 'goals'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [goalLinks, setGoalLinks] = useState<Map<string, GoalLink>>(() => new Map());
  const [goalsReady, setGoalsReady] = useState(false);
  const [tagGoalId, setTagGoalId] = useState<string | null>(route.params.goalId ?? null);
  const [hasNew, setHasNew] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  messagesRef.current = messages;
  const rows = useMemo(() => buildRows(messages), [messages]);
  const canSend = draft.trim().length > 0;

  const noteRead = useCallback(() => {
    void markRead(connectionId)
      .then(() => clearUnread(connectionId))
      .catch(() => undefined);
  }, [clearUnread, connectionId]);

  const showNotice = useCallback((text: string) => {
    if (noticeTimer.current) {
      clearTimeout(noticeTimer.current);
    }
    setNotice(text);
    noticeTimer.current = setTimeout(() => {
      setNotice(null);
      noticeTimer.current = null;
    }, 2200);
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimer.current) {
        clearTimeout(noticeTimer.current);
      }
    };
  }, []);

  const returnToConnect = useCallback(() => {
    navigation.popToTop();
    navigation.getParent()?.dispatch(
      CommonActions.navigate({
        name: 'Community',
        params: { screen: 'CommunityMain' },
      }),
    );
  }, [navigation]);

  const finishPartnerAction = useCallback(
    (action: () => Promise<void>, failureTitle: string) => {
      if (leaving.current) {
        return;
      }
      leaving.current = true;
      void (async () => {
        try {
          await action();
          returnToConnect();
        } catch (error) {
          leaving.current = false;
          const message = error instanceof Error && error.message ? error.message : failureTitle;
          Alert.alert(failureTitle, message);
        }
      })();
    },
    [returnToConnect],
  );

  const confirmRemove = useCallback(() => {
    Alert.alert(
      `Remove ${otherName}?`,
      "You'll both stop seeing each other's shared goals. You can invite each other again later.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => finishPartnerAction(() => removePartner(connectionId), 'Could not remove partner'),
        },
      ],
    );
  }, [connectionId, finishPartnerAction, otherName]);

  const confirmBlock = useCallback(() => {
    Alert.alert(
      `Block ${otherName}?`,
      "You'll stop seeing each other's goals and they can't invite you again.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => finishPartnerAction(() => blockPartner(connectionId), 'Could not block partner'),
        },
      ],
    );
  }, [connectionId, finishPartnerAction, otherName]);

  const openMenu = useCallback(() => {
    const removeLabel = `Remove ${otherName}`;
    const blockLabel = `Block ${otherName}`;
    const options = isCoach ? ['What I share', removeLabel, blockLabel] : [removeLabel, blockLabel];
    showActionSheet(
      'More',
      options,
      (index) => {
        const choice = options[index];
        if (choice === 'What I share') {
          setShareOpen(true);
          return;
        }
        if (choice === removeLabel) {
          confirmRemove();
          return;
        }
        if (choice === blockLabel) {
          confirmBlock();
        }
      },
      [blockLabel],
    );
  }, [confirmBlock, confirmRemove, isCoach, otherName]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => <ChatTitle name={otherName} role={roleTitle(role)} />,
      headerRight: () => (
        <Pressable
          onPress={openMenu}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="More"
          style={styles.menuButton}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color="#007aff" />
        </Pressable>
      ),
    });
  }, [navigation, openMenu, otherName, role]);

  const clearTag = useCallback(() => {
    setTagGoalId(null);
    navigation.setParams({ goalId: undefined });
  }, [navigation]);

  useEffect(() => {
    return navigation.addListener('blur', () => {
      setTagGoalId(null);
    });
  }, [navigation]);

  useEffect(() => {
    const newest = messages.length > 0 ? messages[messages.length - 1].id : null;
    const previous = newestIdRef.current;
    newestIdRef.current = newest;
    if (previous && newest && previous !== newest && awayFromBottom.current) {
      setHasNew(true);
    }
  }, [messages]);

  const jumpToNewest = useCallback(() => {
    setHasNew(false);
    awayFromBottom.current = false;
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => {
      keyboardOpenRef.current = true;
      setKeyboardOpen(true);
      setHasNew(false);
      awayFromBottom.current = false;
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardOpenRef.current = false;
      setKeyboardOpen(false);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const rememberMessages = useCallback((next: ChatMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      noteRead();

      const loadTitles = async () => {
        const [mineResult, sharedResult] = await Promise.allSettled([
          getAllGoals(),
          otherId
            ? getGoalsSharedWithMe(otherId)
            : Promise.resolve({ goals: [] as Goal[], entries: [] }),
        ]);
        if (cancelled) {
          return;
        }
        const map = new Map<string, GoalLink>();
        if (mineResult.status === 'fulfilled') {
          for (const goal of mineResult.value) {
            map.set(goal.id, { title: goal.title.trim() || 'Untitled', mine: true });
          }
        }
        if (sharedResult.status === 'fulfilled') {
          for (const goal of sharedResult.value.goals) {
            if (!map.has(goal.id)) {
              map.set(goal.id, { title: goal.title.trim() || 'Untitled', mine: false });
            }
          }
        }
        setGoalLinks(map);
        setGoalsReady(true);
      };

      const loadLatest = async () => {
        try {
          const page = await getMessages(connectionId, { limit: 50 });
          if (cancelled) {
            return;
          }
          const hadMessages = messagesRef.current.length > 0;
          const next = hadMessages ? mergeMessages(messagesRef.current, page.messages) : page.messages;
          if (!hadMessages) {
            setHasMore(page.hasMore);
          }
          rememberMessages(next);
          setSendError((current) => (current === "Couldn't load messages." ? null : current));
        } catch {
          if (!cancelled && messagesRef.current.length === 0) {
            setSendError("Couldn't load messages.");
          }
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      };

      void loadTitles();
      void loadLatest();

      const timer = setInterval(() => {
        void (async () => {
          try {
            const page = await getMessages(connectionId, { limit: 50 });
            if (cancelled) {
              return;
            }
            const current = messagesRef.current;
            const fromOther = page.messages.some(
              (message) =>
                message.senderId !== user?.id && !current.some((item) => item.id === message.id),
            );
            rememberMessages(mergeMessages(current, page.messages));
            if (fromOther) {
              noteRead();
            }
          } catch {
            // Keep the messages already on screen.
          }
        })();
      }, 10000);

      return () => {
        cancelled = true;
        clearInterval(timer);
        noteRead();
      };
    }, [connectionId, noteRead, otherId, rememberMessages, user?.id]),
  );

  const loadEarlier = async () => {
    const oldest = messagesRef.current[0]?.createdAt;
    if (!oldest || loadingEarlier) {
      return;
    }
    setLoadingEarlier(true);
    try {
      const page = await getMessages(connectionId, { before: oldest, limit: 50 });
      setHasMore(page.hasMore);
      rememberMessages(mergeMessages(page.messages, messagesRef.current));
    } catch {
      setSendError("Couldn't load earlier messages.");
    } finally {
      setLoadingEarlier(false);
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || !user?.id) {
      return;
    }
    setDraft('');
    setSendError(null);
    const tempId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic: ChatMessage = {
      id: tempId,
      connectionId,
      senderId: user.id,
      body: text,
      goalId: tagGoalId,
      createdAt: new Date().toISOString(),
    };
    rememberMessages([...messagesRef.current, optimistic]);
    try {
      const saved = await sendMessage(connectionId, text, tagGoalId);
      if (fromReflection) {
        markReflectionNoteSent(otherName);
        navigation.goBack();
        return;
      }
      rememberMessages(mergeMessages(
        messagesRef.current.filter((message) => message.id !== tempId),
        [saved],
      ));
    } catch {
      rememberMessages(messagesRef.current.filter((message) => message.id !== tempId));
      setDraft((current) => (current.trim() ? current : text));
      setSendError("Couldn't send that.");
    }
  };

  const dropMessage = (id: string) => {
    const next = messagesRef.current.filter((item) => item.id !== id);
    newestIdRef.current = next.length > 0 ? next[next.length - 1].id : null;
    rememberMessages(next);
  };

  const confirmDelete = (message: ChatMessage) => {
    Alert.alert('Delete this message?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              if (!message.id.startsWith('local-')) {
                await deleteMessage(message.id);
              }
              dropMessage(message.id);
            } catch {
              Alert.alert('Could not delete', 'Could not delete that message.');
            }
          })();
        },
      },
    ]);
  };

  const confirmReport = (message: ChatMessage) => {
    Alert.alert("Report this message? We'll review it.", undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report',
        onPress: () => {
          void (async () => {
            try {
              await reportMessage(message.id);
              showNotice("Thanks. We'll take a look.");
            } catch {
              Alert.alert('Could not report', 'Could not report that message.');
            }
          })();
        },
      },
    ]);
  };

  const onMessageLongPress = (message: ChatMessage) => {
    if (message.senderId === user?.id) {
      showActionSheet('Message', ['Delete'], () => confirmDelete(message), ['Delete']);
      return;
    }
    showActionSheet('Message', ['Report'], () => confirmReport(message));
  };

  const openGoal = (goalId: string) => {
    const info = goalLinks.get(goalId);
    if (!info) {
      return;
    }
    if (info.mine) {
      navigation.navigate('Goal', { goalId });
      return;
    }
    navigation.navigate('Goal', {
      goalId,
      readOnly: true,
      ownerId: otherId ?? undefined,
      sharedByName: otherName,
    });
  };

  const openSharedGoal = (goal: Goal) => {
    if (!otherId) {
      return;
    }
    navigation.navigate('Goal', {
      goalId: goal.id,
      readOnly: true,
      ownerId: otherId,
      sharedByName: otherName,
    });
  };

  return (
    <View style={styles.screen}>
      {isCoach ? null : (
        <View style={styles.segmentBar}>
          <View style={styles.segments}>
            <Pressable
              onPress={() => {
                setHasNew(false);
                awayFromBottom.current = false;
                setTab('chat');
              }}
              style={[styles.segment, tab === 'chat' && styles.segmentOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: tab === 'chat' }}
              accessibilityLabel="Chat"
            >
              <Text style={[styles.segmentText, tab === 'chat' && styles.segmentTextOn]}>Chat</Text>
            </Pressable>
            <Pressable
              onPress={() => setTab('goals')}
              style={[styles.segment, tab === 'goals' && styles.segmentOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: tab === 'goals' }}
              accessibilityLabel="Goals"
            >
              <Text style={[styles.segmentText, tab === 'goals' && styles.segmentTextOn]}>Goals</Text>
            </Pressable>
          </View>
        </View>
      )}

      {tab === 'goals' && !isCoach ? (
        <PartnerGoalsView
          partnerId={otherId}
          name={otherName}
          onOpenGoal={openSharedGoal}
        />
      ) : (
        <KeyboardSafe style={styles.screen}>
          <View style={styles.messages}>
            <FlatList
              ref={listRef}
              style={styles.messages}
              data={rows}
              inverted
              keyExtractor={(item) => item.key}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[styles.list, rows.length === 0 && styles.listEmpty]}
              maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 48 }}
              onScroll={(event) => {
                const atBottom = event.nativeEvent.contentOffset.y <= 48;
                awayFromBottom.current = !atBottom;
                if (atBottom) {
                  setHasNew((current) => (current ? false : current));
                }
              }}
              scrollEventThrottle={16}
              onLayout={() => {
                if (keyboardOpenRef.current) {
                  listRef.current?.scrollToOffset({ offset: 0, animated: false });
                }
              }}
              ListFooterComponent={
                hasMore ? (
                  <Pressable
                    onPress={() => void loadEarlier()}
                    disabled={loadingEarlier}
                    style={({ pressed }) => [styles.earlier, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel="Load earlier messages"
                  >
                    {loadingEarlier ? (
                      <ActivityIndicator color="#007aff" />
                    ) : (
                      <Text style={styles.earlierText}>Load earlier messages</Text>
                    )}
                  </Pressable>
                ) : undefined
              }
              ListEmptyComponent={
                loading ? (
                  <ActivityIndicator color="#007aff" style={styles.loading} />
                ) : (
                  <Text style={styles.empty}>Say hi to {otherName}.</Text>
                )
              }
              renderItem={({ item }) => {
                if (item.type === 'day') {
                  return <Text style={styles.day}>{item.label}</Text>;
                }
                const message = item.message;
                const mine = message.senderId === user?.id;
                const link = message.goalId ? goalLinks.get(message.goalId) : undefined;
                const about =
                  message.goalId && goalsReady
                    ? link
                      ? `Goal: ${link.title}`
                      : 'Goal: no longer shared'
                    : null;
                return (
                  <Pressable
                    onLongPress={() => onMessageLongPress(message)}
                    delayLongPress={350}
                    style={[styles.group, mine ? styles.groupMine : styles.groupTheirs]}
                    accessibilityHint={mine ? 'Delete this message' : 'Report this message'}
                  >
                    <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                      {about ? (
                        link && message.goalId ? (
                          <Pressable
                            onPress={() => openGoal(message.goalId as string)}
                            onLongPress={() => onMessageLongPress(message)}
                            delayLongPress={350}
                            accessibilityRole="button"
                            accessibilityLabel={about}
                          >
                            <Text style={[styles.about, mine ? styles.aboutMine : styles.aboutTheirs]}>
                              {about}
                            </Text>
                          </Pressable>
                        ) : (
                          <Text style={[styles.about, mine ? styles.aboutMine : styles.aboutTheirs]}>
                            {about}
                          </Text>
                        )
                      ) : null}
                      <Text style={[styles.body, mine && styles.bodyMine]}>{message.body}</Text>
                    </View>
                    {item.showTime ? (
                      <Text style={styles.time}>{clockTime(message.createdAt)}</Text>
                    ) : null}
                  </Pressable>
                );
              }}
            />
            {hasNew ? (
              <Pressable
                onPress={jumpToNewest}
                style={({ pressed }) => [styles.newPill, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="New messages"
              >
                <Text style={styles.newPillText}>New messages ↓</Text>
              </Pressable>
            ) : null}
            {notice ? (
              <View pointerEvents="none" style={styles.toastWrap}>
                <View style={styles.toast}>
                  <Text style={styles.toastText}>{notice}</Text>
                </View>
              </View>
            ) : null}
          </View>
          {sendError ? <Text style={styles.sendError}>{sendError}</Text> : null}
          {tagGoalId ? (
            <View style={styles.tagBar}>
              <Text style={styles.tagText} numberOfLines={1}>
                {goalLinks.get(tagGoalId)?.title
                  ? `Goal: ${goalLinks.get(tagGoalId)?.title}`
                  : 'Goal: …'}
              </Text>
              <Pressable
                onPress={clearTag}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Remove goal"
              >
                <Text style={styles.tagRemove}>×</Text>
              </Pressable>
            </View>
          ) : null}
          <View
            style={[
              styles.composer,
              { paddingBottom: keyboardOpen ? 8 : Math.max(insets.bottom, 8) },
            ]}
          >
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={(value) => {
                setDraft(value);
                if (sendError) {
                  setSendError(null);
                }
              }}
              placeholder={`Message ${otherName}`}
              placeholderTextColor="#8e8e93"
              maxLength={1000}
              multiline
            />
            <Pressable
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
        </KeyboardSafe>
      )}

      <Modal
        visible={shareOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShareOpen(false)}
      >
        <View style={styles.shareScreen}>
          <View style={[styles.shareHeader, { paddingTop: Math.max(insets.top, 12) }]}>
            <Text style={styles.shareTitle}>What I share</Text>
            <Pressable
              onPress={() => setShareOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Done"
              hitSlop={8}
            >
              <Text style={styles.shareDone}>Done</Text>
            </Pressable>
          </View>
          <PartnerGoalsView
            partnerId={otherId}
            name={otherName}
            mode="share"
            onOpenGoal={openSharedGoal}
          />
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
  titleBlock: {
    alignItems: 'center',
    maxWidth: 220,
  },
  titleName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  titleRole: {
    fontSize: 11,
    color: '#6B6B70',
  },
  menuButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastWrap: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 12,
    alignItems: 'center',
  },
  toast: {
    backgroundColor: '#1c1c1e',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  toastText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  segmentBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: '#f2f2f7',
  },
  segments: {
    flexDirection: 'row',
    backgroundColor: '#e5e5ea',
    borderRadius: 9,
    padding: 2,
  },
  segment: {
    flex: 1,
    minHeight: 32,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentOn: {
    backgroundColor: '#fff',
  },
  segmentText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
  },
  segmentTextOn: {
    color: '#111',
  },
  messages: {
    flex: 1,
  },
  list: {
    flexGrow: 1,
    padding: 16,
    gap: 8,
  },
  listEmpty: {
    justifyContent: 'center',
  },
  newPill: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 8,
    backgroundColor: '#007aff',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  newPillText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  loading: {
    marginTop: 24,
  },
  empty: {
    color: '#8e8e93',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 24,
  },
  earlier: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  earlierText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#007aff',
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
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  groupTheirs: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
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
  about: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  aboutMine: {
    color: 'rgba(255,255,255,0.85)',
  },
  aboutTheirs: {
    color: '#6B6B70',
  },
  body: {
    fontSize: 16,
    lineHeight: 22,
    color: '#1c1c1e',
  },
  bodyMine: {
    color: '#fff',
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
  tagBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#d1d1d6',
  },
  tagText: {
    flex: 1,
    fontSize: 15,
    color: '#111',
  },
  tagRemove: {
    fontSize: 22,
    lineHeight: 24,
    color: '#8e8e93',
    paddingHorizontal: 4,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#d1d1d6',
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
  pressed: {
    opacity: 0.55,
  },
  shareScreen: {
    flex: 1,
    backgroundColor: '#f2f2f7',
  },
  shareHeader: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f2f2f7',
  },
  shareTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111',
  },
  shareDone: {
    fontSize: 17,
    fontWeight: '600',
    color: '#007aff',
  },
});
