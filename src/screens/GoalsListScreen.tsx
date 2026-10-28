import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LegacyScrollView as ScrollView, Pressable } from 'react-native-gesture-handler';
import { AREA_ICONS } from '../constants/areaIcons';
import { DraggableItem } from '../components/DraggableItem';
import {
  FLOATING_ADD_BUTTON_CLEARANCE,
  FloatingAddButton,
} from '../components/FloatingAddButton';
import { PageHeader } from '../components/PageHeader';
import { useSettings } from '../context/SettingsContext';
import {
  getAllGoals,
  getEntries,
  reorderGoals,
} from '../lib/goalTreeApi';
import {
  buildChildrenMap,
  isDaily,
  isRepeating,
  isTracked,
  rollupTotal,
  weeklyTarget,
} from '../lib/goalTree';
import { todayLocal } from '../lib/localDate';
import { planSummaryLine } from '../lib/planSummary';
import type { WeekStart } from '../lib/settingsApi';
import type { GoalsStackParamList } from '../navigation/GoalsStackNavigator';
import type { GoalEntry, Goal } from '../types/goal';

type Props = NativeStackScreenProps<GoalsStackParamList, 'GoalsList'>;

/** Approximate goal card height (padding + title + meta + margin). */
const LIST_CARD_HEIGHT = 72;

function cardSubtitle(
  node: Goal,
  nodes: Goal[],
  entries: GoalEntry[],
  childrenMap: Map<string | null, Goal[]>,
  weekStartsOn: WeekStart,
): string {
  if (isRepeating(node)) {
    const unit = node.unit ?? 'times';
    if (node.repeatPeriod === 'month') {
      const amount = node.targetAmount != null ? String(node.targetAmount) : '—';
      return `${amount} ${unit} / month`;
    }
    const weekly = weeklyTarget(node, weekStartsOn);
    const amount =
      weekly == null
        ? '—'
        : Number.isInteger(weekly)
          ? String(weekly)
          : String(Math.round(weekly * 100) / 100);
    const cadence = isDaily(node) ? 'Daily' : 'Weekly';
    return `${amount} ${unit} / week · ${cadence}`;
  }

  if (isTracked(node)) {
    const total = rollupTotal(node, nodes, entries) ?? 0;
    const amount = node.targetAmount != null ? String(node.targetAmount) : '—';
    return `${total} / ${amount} ${node.unit}`;
  }

  const children = childrenMap.get(node.id) ?? [];
  if (children.length === 0) {
    return '';
  }

  const doneCount = children.filter((child) => child.status === 'done').length;
  const activeCount = children.filter((child) => child.status === 'active').length;
  return `${doneCount} done · ${activeCount} active`;
}

export default function GoalsListScreen({ navigation }: Props) {
  const { settings } = useSettings();
  const [nodes, setNodes] = useState<Goal[]>([]);
  const [entries, setEntries] = useState<GoalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const nextNodes = await getAllGoals();
      const ids = nextNodes.map((node) => node.id);
      const nextEntries = ids.length > 0 ? await getEntries(ids) : [];
      setNodes(nextNodes);
      setEntries(nextEntries);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load goals.';
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const today = todayLocal();
  const childrenMap = useMemo(() => buildChildrenMap(nodes), [nodes]);
  const summary = useMemo(
    () => planSummaryLine(nodes, settings.weekStart, today),
    [nodes, settings.weekStart, today],
  );
  const visibleNodes = useMemo(
    () =>
      nodes
        .filter((node) => node.parentId == null)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [nodes],
  );
  const listRef = useRef(visibleNodes);
  listRef.current = visibleNodes;

  const openCreate = () => {
    navigation.navigate('GoalSetup');
  };

  const reorderNodes = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) {
      return;
    }
    const ordered = [...visibleNodes];
    const [moved] = ordered.splice(fromIndex, 1);
    if (!moved) {
      return;
    }
    ordered.splice(toIndex, 0, moved);
    const withOrder = ordered.map((node, index) => ({
      ...node,
      sortOrder: index,
    }));
    const byId = new Map(withOrder.map((node) => [node.id, node]));
    setNodes((current) =>
      current.map((node) => byId.get(node.id) ?? node),
    );
    void reorderGoals(withOrder.map((node) => node.id)).catch((error) => {
      console.warn('Failed to persist goal order', error);
      void load();
    });
  };

  return (
    <View style={styles.safe}>
      <PageHeader
        title="Plan"
        subtitle="Your goals and the steps to get there"
      />
      {summary ? <Text style={styles.summary}>{summary}</Text> : null}
      <View style={styles.listHost}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        // Legacy scroll view, not the v3 one. The v3 ScrollView attaches an
        // intercepting detector that aborts on iOS when this page is shown
        // inside the tab pager. disallowInterruption lets the long-press
        // drag take over once it activates.
        disallowInterruption={false}
      >
        {loading && visibleNodes.length === 0 ? (
          <View style={styles.goalsStatus}>
            <ActivityIndicator color="#007aff" />
          </View>
        ) : loadError && visibleNodes.length === 0 ? (
          <View style={styles.goalsStatus}>
            <Text style={styles.errorText}>{loadError}</Text>
            <Pressable
              onPress={() => void load()}
              style={({ pressed }) => [
                styles.retryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : visibleNodes.length === 0 ? (
          <Text style={styles.emptyText}>
            No goals yet. Tap + to create one.
          </Text>
        ) : (
          visibleNodes.map((node, index) => (
              <DraggableItem
                key={node.id}
                index={index}
                itemHeight={LIST_CARD_HEIGHT}
                onPress={() =>
                  navigation.navigate('Goal', { goalId: node.id })
                }
                onDragStart={() => {}}
                onDragMove={() => {}}
                onDragEnd={(from, to) => {
                  const clampedTo = Math.max(
                    0,
                    Math.min(listRef.current.length - 1, to),
                  );
                  reorderNodes(from, clampedTo);
                }}
                style={styles.dragHost}
              >
                <View style={styles.card}>
                  <View style={styles.titleRow}>
                    {node.category && AREA_ICONS[node.category] ? (
                      <MaterialCommunityIcons
                        name={AREA_ICONS[node.category]}
                        size={18}
                        color="#8e8e93"
                      />
                    ) : null}
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {node.title || 'Untitled'}
                    </Text>
                    {isRepeating(node) ? (
                      <Ionicons
                        name="repeat"
                        size={16}
                        color="#8e8e93"
                        accessibilityLabel="Repeats"
                      />
                    ) : null}
                  </View>
                  <Text style={styles.cardMeta}>
                    {cardSubtitle(node, nodes, entries, childrenMap, settings.weekStart)}
                  </Text>
                </View>
              </DraggableItem>
          ))
        )}
      </ScrollView>
      <FloatingAddButton onPress={openCreate} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f2f2f7',
  },
  listHost: {
    flex: 1,
  },
  summary: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    fontSize: 15,
    lineHeight: 20,
    color: '#3a3a3c',
  },
  content: {
    padding: 12,
    paddingBottom: 12 + FLOATING_ADD_BUTTON_CLEARANCE,
  },
  emptyText: {
    fontSize: 15,
    color: '#888',
  },
  goalsStatus: {
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#c62828',
    marginTop: 8,
  },
  retryButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#007aff',
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  dragHost: {
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardTitle: {
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
    marginBottom: 2,
  },
  cardMeta: {
    fontSize: 13,
    color: '#666',
    minHeight: 16,
  },
  pressed: {
    opacity: 0.7,
  },
});
