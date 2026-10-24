import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardSafe } from '../components/KeyboardSafe';
import { showActionSheet } from '../components/showActionSheet';
import { useAuth } from '../context/AuthContext';
import {
  blockPartner,
  deleteComment,
  getMyConnections,
  getThread,
  postComment,
  reportComment,
} from '../lib/communityApi';
import type { GoalsStackParamList } from '../navigation/GoalsStackNavigator';
import type { GoalComment } from '../types/community';

type Props = NativeStackScreenProps<GoalsStackParamList, 'Comments'>;

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

export default function CommentThreadScreen({ navigation, route }: Props) {
  const { goalId, ownerId, partnerId, goalTitle, partnerName } = route.params;
  const title = goalTitle.trim() || 'Untitled';
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<GoalComment>>(null);
  const scrollMode = useRef<'open' | 'send' | 'none'>('open');
  const request = useRef(0);
  const [comments, setComments] = useState<GoalComment[]>([]);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<GoalComment | null>(null);
  const [reason, setReason] = useState('');
  const [reporting, setReporting] = useState(false);

  const scrollToLatest = useCallback((animated: boolean) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }, []);

  useEffect(() => {
    if (loading) {
      return;
    }
    const mode = scrollMode.current;
    if (mode === 'none') {
      return;
    }
    scrollMode.current = 'none';
    scrollToLatest(mode === 'send');
  }, [comments, loading, scrollToLatest]);

  const load = useCallback(
    async (mode: 'open' | 'none') => {
      const id = ++request.current;
      scrollMode.current = mode;
      setLoadError(null);
      try {
        const [thread, connections] = await Promise.all([
          getThread(goalId, ownerId, partnerId),
          getMyConnections(),
        ]);
        if (id !== request.current) {
          return;
        }
        const me = user?.id;
        const otherId =
          me === ownerId ? partnerId : me === partnerId ? ownerId : null;
        const connection = otherId
          ? connections.find((item) => item.partnerId === otherId)
          : undefined;
        setComments(thread);
        setConnectionId(connection?.id ?? null);
        setBlockedByMe(connection?.blockedByMe === true);
      } catch (error) {
        if (id !== request.current) {
          return;
        }
        setLoadError(errorMessage(error, 'Comments could not be loaded.'));
      } finally {
        if (id === request.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [goalId, ownerId, partnerId, user?.id],
  );

  useFocusEffect(
    useCallback(() => {
      const mode = scrollMode.current === 'open' ? 'open' : 'none';
      void load(mode);
    }, [load]),
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <View style={styles.header}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            with {partnerName}
          </Text>
        </View>
      ),
    });
  }, [navigation, partnerName, title]);

  const onRefresh = () => {
    setRefreshing(true);
    void load('none');
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) {
      return;
    }
    setSending(true);
    request.current += 1;
    try {
      const comment = await postComment(goalId, ownerId, partnerId, body);
      scrollMode.current = 'send';
      setComments((current) => [...current, comment]);
      setDraft('');
    } catch (error) {
      Alert.alert('Could not send', errorMessage(error, 'Could not send that comment.'));
    } finally {
      setSending(false);
      setLoading(false);
      setRefreshing(false);
    }
  };

  const remove = async (comment: GoalComment) => {
    try {
      await deleteComment(comment.id);
      setComments((current) => current.filter((item) => item.id !== comment.id));
    } catch (error) {
      Alert.alert('Could not delete', errorMessage(error, 'Could not delete that comment.'));
    }
  };

  const confirmDelete = (comment: GoalComment) => {
    Alert.alert('Delete this comment?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void remove(comment);
        },
      },
    ]);
  };

  const confirmBlock = () => {
    if (!connectionId) {
      return;
    }
    Alert.alert(
      `Block ${partnerName}?`,
      "You'll stop seeing each other's goals and they can't invite you again.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await blockPartner(connectionId);
                navigation.goBack();
              } catch (error) {
                Alert.alert(
                  'Could not block partner',
                  errorMessage(error, 'Could not block partner.'),
                );
              }
            })();
          },
        },
      ],
    );
  };

  const onLongPress = (comment: GoalComment) => {
    if (comment.mine) {
      confirmDelete(comment);
      return;
    }
    const options = ['Report'];
    if (connectionId && !blockedByMe) {
      options.push(`Block ${partnerName}`);
    }
    showActionSheet('Comment', options, (index) => {
      if (index === 0) {
        setReason('');
        setReportTarget(comment);
        return;
      }
      confirmBlock();
    });
  };

  const submitReport = async () => {
    if (!reportTarget || reporting) {
      return;
    }
    setReporting(true);
    try {
      await reportComment(reportTarget.id, reason);
      setReportTarget(null);
      setReason('');
      Alert.alert("Thanks. We'll review it.");
    } catch (error) {
      Alert.alert('Could not report', errorMessage(error, 'Could not report that comment.'));
    } finally {
      setReporting(false);
    }
  };

  const canSend = draft.trim().length > 0 && !sending;

  return (
    <View style={styles.fill}>
      <KeyboardSafe style={styles.fill}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={comments}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            onContentSizeChange={() => {
              if (scrollMode.current === 'open') {
                listRef.current?.scrollToEnd({ animated: false });
              }
            }}
            ListHeaderComponent={
              loadError ? <Text style={styles.error}>{loadError}</Text> : undefined
            }
            ListEmptyComponent={
              loadError ? undefined : (
                <Text style={styles.empty}>Say something encouraging</Text>
              )
            }
            renderItem={({ item }) => {
              const when = relativeTime(item.createdAt);
              return (
                <View style={[styles.message, item.mine ? styles.messageMine : styles.messageTheirs]}>
                  <Text style={styles.meta}>
                    {item.authorName}
                    {when ? ` · ${when}` : ''}
                  </Text>
                  <Pressable
                    onLongPress={() => onLongPress(item)}
                    style={[styles.bubble, item.mine ? styles.bubbleMine : styles.bubbleTheirs]}
                    accessibilityRole="button"
                    accessibilityHint={item.mine ? 'Deletes this comment' : 'Reports this comment'}
                  >
                    <Text style={styles.body}>{item.body}</Text>
                  </Pressable>
                </View>
              );
            }}
          />
        )}
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Say something encouraging"
            placeholderTextColor="#8e8e93"
            maxLength={1000}
            multiline
            editable={!sending}
          />
          <Pressable
            onPress={() => {
              void send();
            }}
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

      <Modal
        visible={reportTarget != null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!reporting) {
            setReportTarget(null);
          }
        }}
      >
        <KeyboardSafe style={styles.modalOverlay} keyboardVerticalOffset={0}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => {
              if (!reporting) {
                setReportTarget(null);
              }
            }}
          >
            <Pressable style={styles.reportCard} onPress={() => {}}>
              <Text style={styles.reportTitle}>Report this comment?</Text>
              <TextInput
                style={styles.reasonInput}
                value={reason}
                onChangeText={setReason}
                placeholder="Reason (optional)"
                placeholderTextColor="#8e8e93"
                maxLength={500}
                multiline
                editable={!reporting}
              />
              <View style={styles.reportActions}>
                <Pressable
                  onPress={() => setReportTarget(null)}
                  disabled={reporting}
                  accessibilityRole="button"
                >
                  <Text style={styles.cancelLabel}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    void submitReport();
                  }}
                  disabled={reporting}
                  accessibilityRole="button"
                >
                  <Text style={styles.reportLabel}>Report</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardSafe>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: '#f2f2f7',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    maxWidth: 220,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#6b6b70',
  },
  list: {
    padding: 16,
    gap: 12,
    flexGrow: 1,
  },
  error: {
    color: '#c2410c',
    fontSize: 15,
    marginBottom: 8,
  },
  empty: {
    color: '#8e8e93',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 24,
  },
  message: {
    maxWidth: '82%',
    gap: 4,
  },
  messageMine: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  messageTheirs: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  meta: {
    fontSize: 12,
    color: '#6b6b70',
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleMine: {
    backgroundColor: '#d6e8ff',
  },
  bubbleTheirs: {
    backgroundColor: '#e5e5ea',
  },
  body: {
    fontSize: 16,
    color: '#1c1c1e',
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
    maxHeight: 100,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  reportCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  reportTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1c1c1e',
  },
  reasonInput: {
    minHeight: 72,
    borderRadius: 10,
    backgroundColor: '#f2f2f7',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#1c1c1e',
  },
  reportActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 20,
  },
  cancelLabel: {
    fontSize: 17,
    color: '#007aff',
  },
  reportLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: '#c2410c',
  },
});
