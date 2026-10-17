import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Pressable, ScrollView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DraggableItem } from '../components/DraggableItem';
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

  const childrenMap = useMemo(() => buildChildrenMap(nodes), [nodes]);
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
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        // The gesture-handler scroll view otherwise cancels the long-press
        // drag as soon as the finger moves.
        disallowInterruption={false}
      >
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => navigation.navigate('Profile')}
            style={({ pressed }) => [
              styles.addButton,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Profile"
          >
            <Ionicons name="person-circle" size={28} color="#111" />
          </Pressable>
          <Pressable
            onPress={openCreate}
            style={({ pressed }) => [
              styles.addButton,
              pressed && styles.pressed,
            ]}
            accessibilityLabel="Add goal"
          >
            <Ionicons name="add" size={32} color="#111" />
          </Pressable>
        </View>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f2f2f7',
  },
  content: {
    padding: 12,
    paddingBottom: 28,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  addButton: {
    padding: 4,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
