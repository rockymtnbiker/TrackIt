import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputInstance,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Svg, { Circle, Path } from 'react-native-svg';
import { CommentsEntry } from '../components/CommentsEntry';
import { DEFAULT_DRAGGABLE_ITEM_HEIGHT, DraggableItem } from '../components/DraggableItem';
import GoalDetailCards from '../components/GoalDetailCards';
import GoalEditForm, { type GoalEditFormHandle } from '../components/GoalEditForm';
import { NEXT_STEP_MESSAGE, NextStepActions } from '../components/NextStepPrompt';
import ProgressSheet from '../components/ProgressSheet';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { KeyboardSafe } from '../components/KeyboardSafe';
import { showActionSheet } from '../components/showActionSheet';
import { PendingStatusCircle } from '../components/PendingStatusCircle';
import {
  bigDealSummary,
  goalAnalysis,
  goalStreaks,
  stepTree,
  type AnalysisTone,
  type StepTreeRow,
} from '../lib/goalAnalysis';
import { periodTotalAsOf } from '../lib/asOfDate';
import {
  createGoal,
  convertRepeatingToParent,
  deleteEntry,
  deleteEntryById,
  getAllGoals,
  getEntries,
  insertEntry,
  reorderGoals,
  saveGoalProgress,
  setGoalStatus,
  type UpsertedEntry,
} from '../lib/goalTreeApi';
import {
  buildChildrenMap,
  canSetProgress,
  dayCount,
  dayFill,
  dayProgress,
  daySessionMark,
  dayTotal,
  effectivePct,
  goalStartDate,
  isEstimate,
  needsNextStep,
  isDaily,
  isDayComplete,
  isRepeating,
  isTracked,
  latestDayEntry,
  periodTarget,
  rollupTotal,
  timesPerDay,
  weekTargetFor,
  weeklyTarget,
  yesNoLogAction,
} from '../lib/goalTree';
import type { GoalsStackParamList } from '../navigation/GoalsStackNavigator';
import type { Goal, GoalEntry, GoalStatus } from '../types/goal';
import type { WeekStart } from '../lib/settingsApi';
import { startOfWeek, weekDays } from '../lib/week';
import { toLocalDateString, todayLocal } from '../lib/localDate';
import { formatDate, formatShortDate, isPastDate } from '../utils/date';
import { GoalReadout } from './StepDetailScreen';

type Props = NativeStackScreenProps<GoalsStackParamList, 'Goal'>;

const STATUS_LABEL: Record<GoalStatus, string> = {
  active: 'Active',
  pending: 'Pending',
  done: 'Done',
};

const TONE_COLOR: Record<AnalysisTone, string> = {
  good: '#248A3D',
  warn: '#C2410C',
  neutral: '#1C1C1E',
};

const RING_SIZE = 56;
const RING_CENTER = 28;
const RING_RADIUS = 22.75;
const RING_STROKE = 5.25;
const SEGMENT_GAP = 5.25;

function subtreeIds(rootId: string, nodes: Goal[]): string[] {
  const childrenMap = buildChildrenMap(nodes);
  const ids: string[] = [];
  const seen = new Set<string>();
  const stack = [rootId];

  while (stack.length > 0) {
    const id = stack.pop();
    if (id == null || seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
    for (const child of childrenMap.get(id) ?? []) {
      stack.push(child.id);
    }
  }

  return ids;
}

function timesLabel(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function summaryLine(node: Goal, weekStartsOn: WeekStart): string | null {
  if (isRepeating(node)) {
    const since = formatShortDate(goalStartDate(node));
    if (isDaily(node)) {
      return `Daily · since ${since}`;
    }
    const perMonth = node.repeatPeriod === 'month';
    const count = perMonth ? node.targetAmount : weeklyTarget(node, weekStartsOn);
    const period = perMonth ? 'month' : 'week';
    if (count == null) {
      return `Since ${since}`;
    }
    return `${timesLabel(count)}× per ${period} · since ${since}`;
  }

  const start = node.targetStartDate?.slice(0, 10) || null;
  const end = node.targetEndDate?.slice(0, 10) || null;
  if (start && end) {
    return `${formatShortDate(start)} → ${formatDate(end)}`;
  }
  if (end) {
    return formatDate(end);
  }
  if (start) {
    return formatShortDate(start);
  }
  return null;
}

function overdueLine(step: Goal, today: string): string | null {
  const end = step.targetEndDate?.slice(0, 10);
  if (!end || step.status === 'done' || !isPastDate(end, today)) {
    return null;
  }
  return `Overdue · ${formatShortDate(end)}`;
}

function reorderErrorMessage(error: unknown): string {
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
  return 'Could not save the new order.';
}

function siblingDropIndex(from: number, dy: number, heights: number[], count: number): number {
  if (count <= 1) {
    return 0;
  }
  const heightAt = (index: number) => {
    const height = heights[index];
    return height > 0 ? height : DEFAULT_DRAGGABLE_ITEM_HEIGHT;
  };
  let to = Math.max(0, Math.min(count - 1, from));
  let offset = dy;
  if (offset > 0) {
    while (to < count - 1) {
      const span = (heightAt(to) + heightAt(to + 1)) / 2;
      if (offset < span / 2) {
        break;
      }
      offset -= span;
      to += 1;
    }
  } else if (offset < 0) {
    while (to > 0) {
      const span = (heightAt(to) + heightAt(to - 1)) / 2;
      if (-offset < span / 2) {
        break;
      }
      offset += span;
      to -= 1;
    }
  }
  return to;
}

function StatusMark({ status }: { status: GoalStatus }) {
  if (status === 'pending') {
    return <PendingStatusCircle size={22} color="#b0b0b5" />;
  }
  return (
    <Ionicons
      name={status === 'done' ? 'radio-button-on' : 'radio-button-off'}
      size={24}
      color={status === 'done' ? '#34c759' : '#c7c7cc'}
    />
  );
}

type StepSiblingListProps = {
  parentId: string;
  depth: number;
  rowById: Map<string, StepTreeRow>;
  childrenMap: Map<string | null, Goal[]>;
  nodes: Goal[];
  entries: GoalEntry[];
  today: string;
  readOnly: boolean;
  onOpen: (id: string) => void;
  onReorder: (parentId: string, from: number, to: number) => void;
};

function StepSiblingList({
  parentId,
  depth,
  rowById,
  childrenMap,
  nodes,
  entries,
  today,
  readOnly,
  onOpen,
  onReorder,
}: StepSiblingListProps) {
  const siblings = childrenMap.get(parentId) ?? [];
  const heightsRef = useRef<number[]>([]);

  return (
    <>
      {siblings.map((goal, index) => {
        const row = rowById.get(goal.id);
        if (!row) {
          return null;
        }
        const overdue = row.leaf ? overdueLine(goal, today) : null;
        const nested = childrenMap.get(goal.id) ?? [];
        const rowBody = (
          <View
            style={[
              styles.treeRow,
              { paddingLeft: 16 + depth * 36 },
              (depth > 0 || index > 0) && styles.stepBorder,
            ]}
          >
            {row.leaf ? (
              goal.status === 'done' ? (
                <Ionicons name="checkmark-circle" size={24} color="#248A3D" />
              ) : (
                <StatusMark status={goal.status} />
              )
            ) : (
              <Ionicons name="folder-outline" size={22} color="#6B6B70" />
            )}
            <View style={styles.stepBody}>
              <Text
                style={[
                  row.leaf ? styles.stepTitle : styles.treeParentTitle,
                  row.leaf && goal.status === 'done' && styles.treeTitleDone,
                ]}
                numberOfLines={2}
              >
                {goal.title || 'Untitled'}
              </Text>
              {row.leaf ? (
                overdue ? <Text style={styles.overdue}>{overdue}</Text> : null
              ) : (
                <Text style={styles.treeCount}>
                  {row.done} of {row.total} steps
                </Text>
              )}
              {row.leaf ? (
                <LeafAmountBar node={goal} nodes={nodes} entries={entries} today={today} />
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color="#c7c7cc" />
          </View>
        );
        const nestedList =
          nested.length > 0 ? (
            <StepSiblingList
              parentId={goal.id}
              depth={depth + 1}
              rowById={rowById}
              childrenMap={childrenMap}
              nodes={nodes}
              entries={entries}
              today={today}
              readOnly={readOnly}
              onOpen={onOpen}
              onReorder={onReorder}
            />
          ) : null;

        if (readOnly) {
          return (
            <View key={goal.id}>
              <Pressable
                onPress={() => onOpen(goal.id)}
                style={({ pressed }) => [pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={goal.title || 'Untitled'}
              >
                {rowBody}
              </Pressable>
              {nestedList}
            </View>
          );
        }

        return (
          <DraggableItem
            key={goal.id}
            index={index}
            itemHeight={heightsRef.current[index] || DEFAULT_DRAGGABLE_ITEM_HEIGHT}
            onPress={() => onOpen(goal.id)}
            onDragStart={() => {}}
            onDragMove={() => {}}
            onDragEnd={(from, _to, dy) => {
              const to = siblingDropIndex(from, dy, heightsRef.current, siblings.length);
              onReorder(parentId, from, to);
            }}
          >
            <View
              onLayout={(event) => {
                heightsRef.current[index] = event.nativeEvent.layout.height;
              }}
            >
              {rowBody}
              {nestedList}
            </View>
          </DraggableItem>
        );
      })}
    </>
  );
}

function ProgressReadout({
  pct,
  caption,
  readOnly,
  onPress,
}: {
  pct: number | null;
  caption: string | null;
  readOnly: boolean;
  onPress: () => void;
}) {
  const body = (
    <View style={styles.progressRow}>
      <View style={styles.progressCopy}>
        <Text style={styles.progressTitle}>Progress</Text>
        <Text style={styles.progressValue}>{pct == null ? '—' : `${Math.round(pct)}%`}</Text>
        {caption ? <Text style={styles.analysisDetail}>{caption}</Text> : null}
      </View>
      {readOnly ? null : <Ionicons name="chevron-forward" size={18} color="#c7c7cc" />}
    </View>
  );
  if (readOnly) {
    return body;
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Progress"
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

export default function GoalScreen({ navigation, route }: Props) {
  const { goalId, readOnly = false, sharedByName } = route.params;
  const { user } = useAuth();
  const ownerId = readOnly ? route.params.ownerId : user?.id;
  const { settings } = useSettings();
  const weekStartsOn = settings.weekStart;
  const today = todayLocal();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [node, setNode] = useState<Goal | null>(null);
  const [nodes, setNodes] = useState<Goal[]>([]);
  const [entries, setEntries] = useState<GoalEntry[]>([]);
  const [children, setChildren] = useState<Goal[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [logAmount, setLogAmount] = useState('');
  const [logError, setLogError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const entryBusy = useRef(false);
  const addInputRef = useRef<TextInputInstance>(null);
  const focusAddRef = useRef(false);
  const editRef = useRef<GoalEditFormHandle>(null);
  const allowLeaveRef = useRef(false);
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const orderVersionRef = useRef(0);

  const load = useCallback(async () => {
    if (!ownerId) {
      if (readOnly) {
        setLoadError('This shared goal could not be opened.');
        setNode(null);
        setLoading(false);
      }
      return;
    }
    setLoadError(null);
    try {
      const nextNodes = await getAllGoals(ownerId);
      const found = nextNodes.find((item) => item.id === goalId) ?? null;
      const ids = found ? subtreeIds(found.id, nextNodes) : [];
      const nextEntries = ids.length > 0 ? await getEntries(ids, undefined, undefined, ownerId) : [];
      setNodes(nextNodes);
      setNode(found);
      setEntries(nextEntries);
      setChildren(buildChildrenMap(nextNodes).get(goalId) ?? []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load goal.');
      setNode(null);
    } finally {
      setLoading(false);
    }
  }, [goalId, ownerId, readOnly]);

  const openGoal = useCallback(
    (id: string) => {
      if (readOnly && ownerId) {
        navigation.push('Goal', {
          goalId: id,
          readOnly: true,
          ownerId,
          sharedByName,
        });
        return;
      }
      navigation.push('Goal', { goalId: id });
    },
    [navigation, ownerId, readOnly, sharedByName],
  );

  const reorderSiblings = useCallback(
    (parentId: string, from: number, to: number) => {
      if (readOnly || from === to) {
        return;
      }
      const currentNodes = nodesRef.current;
      const siblings = currentNodes
        .filter((item) => item.parentId === parentId)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      if (from < 0 || from >= siblings.length) {
        return;
      }
      const clamped = Math.max(0, Math.min(siblings.length - 1, to));
      if (from === clamped) {
        return;
      }
      const next = [...siblings];
      const [moved] = next.splice(from, 1);
      if (!moved) {
        return;
      }
      next.splice(clamped, 0, moved);
      const ordered = next.map((item, index) => ({ ...item, sortOrder: index }));
      const byId = new Map(ordered.map((item) => [item.id, item]));
      const previous = currentNodes;
      const version = ++orderVersionRef.current;
      setNodes(currentNodes.map((item) => byId.get(item.id) ?? item));
      if (parentId === goalId) {
        setChildren(ordered);
      }
      void reorderGoals(ordered.map((item) => item.id)).catch((error) => {
        if (orderVersionRef.current !== version) {
          return;
        }
        setNodes(previous);
        setChildren(
          previous
            .filter((item) => item.parentId === goalId)
            .sort((a, b) => a.sortOrder - b.sortOrder),
        );
        Alert.alert('Could not reorder steps', reorderErrorMessage(error));
      });
    },
    [goalId, readOnly],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      title: '',
      headerRight: () => null,
    });
  }, [navigation]);

  useEffect(() => {
    if (!focusAddRef.current || !node || isRepeating(node) || children.length === 0) {
      return;
    }
    focusAddRef.current = false;
    requestAnimationFrame(() => addInputRef.current?.focus());
  }, [node, children]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (allowLeaveRef.current) {
        return;
      }
      if (!editingRef.current || !editRef.current?.isDirty()) {
        return;
      }
      event.preventDefault();
      Alert.alert('Discard changes?', undefined, [
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            allowLeaveRef.current = true;
            navigation.dispatch(event.data.action);
          },
        },
        { text: 'Keep editing', style: 'cancel' },
      ]);
    });
    return unsubscribe;
  }, [navigation]);

  const addStep = () => {
    const trimmed = newTitle.trim();
    if (!trimmed || !node || adding || isRepeating(node)) {
      return;
    }
    setAdding(true);
    void createGoal({ title: trimmed, parentId: node.id })
      .then((created) => {
        setNewTitle('');
        setNodes((current) => [...current, created]);
        setChildren((current) =>
          [...current, created].sort((a, b) => a.sortOrder - b.sortOrder),
        );
      })
      .catch((error) => {
        console.warn('Failed to add step', error);
        Alert.alert(
          'Could not add step',
          error instanceof Error ? error.message : 'Could not add a step.',
        );
      })
      .finally(() => {
        setAdding(false);
      });
  };

  const confirmBreakIntoSteps = () => {
    if (!node || adding || readOnly || !isRepeating(node) || children.length > 0) {
      return;
    }
    const title = node.title.trim() || 'Untitled';
    Alert.alert(
      'Break this into steps?',
      `Your repeat (e.g. 3× a week) and its history will move into a step called '${title}'. Then you can add more steps.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: () => {
            void (async () => {
              setAdding(true);
              try {
                await convertRepeatingToParent(node.id);
                focusAddRef.current = true;
                await load();
              } catch (error) {
                focusAddRef.current = false;
                const message =
                  error instanceof Error && error.message
                    ? error.message
                    : error &&
                        typeof error === 'object' &&
                        'message' in error &&
                        typeof error.message === 'string' &&
                        error.message
                      ? error.message
                      : 'Could not break this into steps.';
                Alert.alert('Could not break this into steps', message);
              } finally {
                setAdding(false);
              }
            })();
          },
        },
      ],
    );
  };

  const applySavedGoals = (goals: Goal[]) => {
    if (goals.length === 0) {
      return;
    }
    const byId = new Map(goals.map((goal) => [goal.id, goal]));
    setNode((current) => (current ? (byId.get(current.id) ?? current) : current));
    setNodes((current) => current.map((item) => byId.get(item.id) ?? item));
  };

  const commitEntries = (
    nextEntries: GoalEntry[],
    persist: Promise<UpsertedEntry | void>,
    localId?: string,
  ) => {
    if (!node || entryBusy.current) {
      return;
    }
    const previous = entries;
    entryBusy.current = true;
    setEntries(nextEntries);
    void persist
      .then((saved) => {
        if (!saved) {
          return;
        }
        applySavedGoals(saved.goals);
        setEntries((current) =>
          current.map((entry) => (entry.id === localId ? saved.entry : entry)),
        );
      })
      .catch((error) => {
        console.warn('Failed to update log', error);
        setEntries(previous);
        Alert.alert(
          'Could not log',
          error instanceof Error ? error.message : 'Could not save this log.',
        );
      })
      .finally(() => {
        entryBusy.current = false;
      });
  };

  const insertLog = (value: number | null) => {
    if (!node) {
      return;
    }
    const local: GoalEntry = {
      id: `local-${node.id}-${today}-${Date.now()}`,
      goalId: node.id,
      entryDate: today,
      value,
      createdAt: new Date().toISOString(),
    };
    commitEntries([...entries, local], insertEntry(node.id, today, value), local.id);
  };

  const undoLastLog = () => {
    if (!node) {
      return;
    }
    const latest = latestDayEntry(entries, node.id, today);
    if (!latest) {
      return;
    }
    const next = entries.filter((entry) => entry.id !== latest.id);
    const persist = latest.id.startsWith('local-')
      ? Promise.resolve()
      : deleteEntryById(latest.id).then(() => undefined);
    commitEntries(next, persist);
  };

  const clearDayLogs = () => {
    if (!node) {
      return;
    }
    commitEntries(
      entries.filter(
        (entry) =>
          !(entry.goalId === node.id && entry.entryDate.slice(0, 10) === today),
      ),
      deleteEntry(node.id, today).then(() => undefined),
    );
  };

  const logYesNo = () => {
    if (!node) {
      return;
    }
    const action = yesNoLogAction(node, entries, today);
    if (action === 'insert') {
      insertLog(null);
      return;
    }
    if (action === 'remove-day') {
      clearDayLogs();
      return;
    }
    if (action === 'full-sheet') {
      showActionSheet('Today', ['Undo one', 'Clear today'], (index) => {
        if (index === 0) {
          undoLastLog();
        } else if (index === 1) {
          clearDayLogs();
        }
      });
      return;
    }
    showActionSheet('Today', ['Log another', 'Undo last'], (index) => {
      if (index === 0) {
        insertLog(null);
      } else if (index === 1) {
        undoLastLog();
      }
    });
  };

  const openLog = () => {
    setLogAmount('');
    setLogError(null);
    setLogOpen(true);
  };

  const closeLog = () => {
    setLogOpen(false);
    setLogAmount('');
    setLogError(null);
  };

  const saveLog = () => {
    if (!node || entryBusy.current) {
      return;
    }
    const trimmed = logAmount.trim();
    const amount = Number(trimmed);
    if (!trimmed || !Number.isFinite(amount) || amount <= 0) {
      setLogError('Enter a number greater than zero.');
      return;
    }
    closeLog();
    insertLog(amount);
  };

  const undoAmount = () => {
    undoLastLog();
  };

  const completeOneTime = () => {
    if (!node || entryBusy.current || isRepeating(node)) {
      return;
    }
    const markingDone = node.status !== 'done';
    const previous = node;
    const nextStatus: GoalStatus = markingDone ? 'done' : 'active';
    const optimistic: Goal = markingDone
      ? { ...node, status: 'done', actualEndDate: today, progressPct: 100 }
      : { ...node, status: 'active', actualEndDate: null };
    setNode(optimistic);
    setNodes((current) =>
      current.map((item) => (item.id === node.id ? optimistic : item)),
    );
    entryBusy.current = true;
    void setGoalStatus(node.id, nextStatus, markingDone ? today : undefined)
      .then((updated) => {
        setNode(updated);
        setNodes((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        );
      })
      .catch((error) => {
        console.warn('Failed to update status', error);
        setNode(previous);
        setNodes((current) =>
          current.map((item) => (item.id === previous.id ? previous : item)),
        );
      })
      .finally(() => {
        entryBusy.current = false;
      });
  };

  if (loading && !node) {
    return (
      <View style={styles.missing}>
        <ActivityIndicator color="#007aff" />
      </View>
    );
  }

  if (loadError && !node) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>{loadError}</Text>
      </View>
    );
  }

  if (!node) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>This goal is no longer available.</Text>
      </View>
    );
  }

  const saveEdit = async () => {
    if (!editRef.current || saving || editTitle.trim().length === 0) {
      return;
    }
    setSaving(true);
    try {
      const updated = await editRef.current.save();
      setNode(updated);
      setNodes((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setEditing(false);
      await load();
    } catch (error) {
      Alert.alert(
        'Save failed',
        error instanceof Error ? error.message : 'Could not save.',
      );
    } finally {
      setSaving(false);
    }
  };

  const parent =
    node.parentId != null
      ? (nodes.find((item) => item.id === node.parentId) ?? null)
      : null;
  const line = summaryLine(node, weekStartsOn);
  const analysis = goalAnalysis(node, nodes, entries, today, weekStartsOn);
  const childrenMap = buildChildrenMap(nodes);
  const deal = bigDealSummary(node, nodes, today);
  const tree = deal ? stepTree(node, nodes) : [];
  const stepRows = new Map(tree.map((row) => [row.id, row]));
  const nextUp =
    deal?.nextUpId != null
      ? (nodes.find((item) => item.id === deal.nextUpId) ?? null)
      : null;
  const streaks = goalStreaks(node, entries, today, weekStartsOn);
  const whyText = node.why?.trim() ?? '';
  const loggedToday = isDayComplete(node, entries, today);
  const doses = timesPerDay(node);
  const doseProgress = dayProgress(node, entries, today);
  const sessionsToday = dayCount(entries, node.id, today);
  const showProgress = !editing && canSetProgress(node);
  const progressValue = showProgress ? effectivePct(node, { nodes, entries }) : null;
  const progressCaption =
    showProgress && children.length > 0 && node.status !== 'done'
      ? isEstimate(node, nodes)
        ? 'your estimate'
        : 'from steps'
      : null;
  const progressControl = showProgress ? (
    <ProgressReadout
      pct={progressValue}
      caption={progressCaption}
      readOnly={readOnly}
      onPress={() => setProgressOpen(true)}
    />
  ) : null;

  const persistProgress = (pct: number | null) => {
    const previousNode = node;
    const previousNodes = nodes;
    const activating = pct != null && pct > 0 && node.status === 'pending';
    const optimistic: Goal = {
      ...node,
      progressPct: pct,
      status: activating ? 'active' : node.status,
      actualStartDate:
        activating && node.actualStartDate == null ? today : node.actualStartDate,
    };
    setNode(optimistic);
    setNodes((current) => current.map((item) => (item.id === node.id ? optimistic : item)));
    void saveGoalProgress(node.id, pct)
      .then((goals) => {
        const byId = new Map(goals.map((goal) => [goal.id, goal]));
        setNodes((current) => current.map((item) => byId.get(item.id) ?? item));
        setNode((current) => (current ? (byId.get(current.id) ?? current) : current));
      })
      .catch((error) => {
        console.warn('Failed to save progress', error);
        setNode(previousNode);
        setNodes(previousNodes);
        Alert.alert(
          'Could not save',
          error instanceof Error ? error.message : 'Progress was not saved.',
        );
      });
  };

  const canAddStep = !readOnly && !isRepeating(node);
  const breakIntoSteps = !readOnly && isRepeating(node) && children.length === 0;
  const addPlaceholder =
    children.length === 0
      ? node.parentId == null
        ? 'Break this goal into smaller steps'
        : 'Break this step into smaller steps'
      : 'Add another step';
  const stepAddField = (
    <TextInput
      ref={addInputRef}
      value={newTitle}
      onChangeText={setNewTitle}
      placeholder={addPlaceholder}
      placeholderTextColor="#8e8e93"
      style={[styles.addInput, children.length === 0 && styles.addInputSolo]}
      returnKeyType="done"
      editable={!adding}
      onSubmitEditing={addStep}
      accessibilityLabel={addPlaceholder}
    />
  );
  const breakStepButton = (
    <Pressable
      onPress={confirmBreakIntoSteps}
      disabled={adding}
      style={styles.breakStep}
      accessibilityRole="button"
      accessibilityLabel={addPlaceholder}
      accessibilityState={{ disabled: adding }}
    >
      <Text style={styles.breakStepLabel}>{addPlaceholder}</Text>
    </Pressable>
  );

  return (
    <KeyboardSafe style={styles.container}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        // The gesture-handler scroll view otherwise cancels the long-press
        // drag as soon as the finger moves.
        disallowInterruption={false}
      >
        <View style={styles.titleBlock}>
          {!editing && parent ? (
            <Pressable
              onPress={() => openGoal(parent.id)}
              hitSlop={6}
              accessibilityRole="link"
              accessibilityLabel={`Open ${parent.title}`}
              style={({ pressed }) => [styles.parentLink, pressed && styles.pressed]}
            >
              <Ionicons name="chevron-up" size={14} color="#007aff" />
              <Text style={styles.parentTitle} numberOfLines={1}>
                {parent.title || 'Untitled'}
              </Text>
            </Pressable>
          ) : null}
          <View style={styles.titleLine}>
            {editing ? (
              <TextInput
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="Untitled"
                placeholderTextColor="#c7c7cc"
                style={styles.title}
                multiline
                accessibilityLabel="Title"
              />
            ) : (
              <Text style={styles.title}>{node.title || 'Untitled'}</Text>
            )}
            {readOnly ? null : (
            <View style={styles.titleActions}>
              {editing ? (
                <>
                  <Pressable
                    onPress={() => setEditing(false)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel"
                    style={styles.titleAction}
                  >
                    <Ionicons name="close" size={26} color="#111" />
                  </Pressable>
                  <Pressable
                    onPress={() => void saveEdit()}
                    disabled={saving || editTitle.trim().length === 0}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Save"
                    accessibilityState={{ disabled: saving || editTitle.trim().length === 0 }}
                    style={styles.titleAction}
                  >
                    <Ionicons
                      name="checkmark"
                      size={28}
                      color={saving || editTitle.trim().length === 0 ? '#b0b0b5' : '#007aff'}
                    />
                  </Pressable>
                </>
              ) : (
                <Pressable
                  onPress={() => {
                    setEditTitle(node.title);
                    setEditing(true);
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Edit"
                  style={styles.titleAction}
                >
                  <Ionicons name="pencil" size={22} color="#007aff" />
                </Pressable>
              )}
            </View>
            )}
          </View>
          {readOnly && sharedByName ? (
            <Text style={styles.sharedBy}>Shared by {sharedByName}</Text>
          ) : null}
          {editing ? null : (
          <View style={styles.metaRow}>
            <View style={[styles.pill, styles[`pill_${node.status}`]]}>
              <Text style={[styles.pillText, styles[`pillText_${node.status}`]]}>
                {STATUS_LABEL[node.status]}
              </Text>
            </View>
            {line ? <Text style={styles.metaLine}>{line}</Text> : null}
          </View>
          )}
        </View>

        {editing ? (
          <GoalEditForm
            key={node.id}
            ref={editRef}
            goal={node}
            nodes={nodes}
            title={editTitle}
            onDeleted={() => {
              allowLeaveRef.current = true;
              navigation.goBack();
            }}
          />
        ) : null}

        {showProgress && children.length === 0 ? (
          <View style={styles.paddedCard}>{progressControl}</View>
        ) : null}

        {!editing && deal ? (
          <View style={styles.analysisCard}>
            {showProgress ? progressControl : null}
            <Text style={styles.dealHeadline}>{deal.headline}</Text>
            <Text style={[styles.analysisDetail, { color: TONE_COLOR[deal.tone] }]}>
              {deal.detail}
            </Text>
            <View style={styles.dealTrack}>
              <View
                style={[
                  styles.dealFill,
                  {
                    width: `${deal.total > 0 ? (deal.done / deal.total) * 100 : 0}%`,
                  },
                ]}
              />
            </View>
            {needsNextStep(node, nodes) ? (
              <View style={styles.nextUp}>
                <Text style={styles.stepTitle}>{NEXT_STEP_MESSAGE}</Text>
                {readOnly ? null : (
                  <NextStepActions
                    onAddStep={() => addInputRef.current?.focus()}
                    onMarkDone={() => {
                      if (node.status !== 'done') {
                        completeOneTime();
                      }
                    }}
                  />
                )}
              </View>
            ) : nextUp ? (
              <Pressable
                onPress={() => openGoal(nextUp.id)}
                style={({ pressed }) => [styles.nextUp, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`Next up ${nextUp.title || 'Untitled'}`}
              >
                <Text style={styles.sectionLabel}>Next up</Text>
                <View style={styles.nextUpRow}>
                  <Text style={styles.stepTitle} numberOfLines={2}>
                    {nextUp.title || 'Untitled'}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color="#c7c7cc" />
                </View>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {!editing && analysis && isRepeating(node) ? (
          <WeeklyAnalysis
            node={node}
            entries={entries}
            today={today}
            analysis={analysis}
            loggedToday={loggedToday}
            doseLabel={
              isTracked(node)
                ? loggedToday
                  ? '✓ Logged today'
                  : 'Log today'
                : doses > 1
                  ? doseProgress.count >= doseProgress.needed
                    ? '✓ Done today · tap to undo'
                    : `Log dose · ${doseProgress.count} of ${doseProgress.needed} today`
                  : sessionsToday >= 1
                    ? isDaily(node)
                      ? '✓ Logged today · tap to undo'
                      : '✓ Logged today'
                    : null
            }
            canLog={!readOnly}
            onPress={() => {
              if (isTracked(node)) {
                openLog();
                return;
              }
              logYesNo();
            }}
          />
        ) : null}

        {!editing && analysis && !isRepeating(node) ? (
          <View style={styles.analysisCard}>
            <View style={styles.analysisRow}>
              {readOnly ? (
                <OneTimeMark status={node.status} />
              ) : (
                <Pressable
                  onPress={completeOneTime}
                  accessibilityRole="button"
                  accessibilityLabel={
                    node.status === 'done' ? 'Mark not done' : 'Mark done'
                  }
                  hitSlop={4}
                >
                  <OneTimeMark status={node.status} />
                </Pressable>
              )}
              <AnalysisCopy analysis={analysis} />
            </View>
          </View>
        ) : null}

        {!editing && node.parentId == null && whyText ? (
          <View style={styles.paddedCard}>
            <Text style={styles.sectionLabel}>Why it matters</Text>
            <Text style={styles.whyQuote}>{`“${whyText}”`}</Text>
          </View>
        ) : null}

        {!editing && streaks ? (
          <View style={styles.streakRow}>
            <StreakTile
              label="Current streak"
              value={streaks.current}
              unit={streaks.unit}
            />
            <StreakTile label="Best streak" value={streaks.best} unit={streaks.unit} />
          </View>
        ) : null}

        {!editing ? <GoalReadout node={node} nodes={nodes} entries={entries} /> : null}

        {!editing && tree.length > 0 ? (
          <View style={styles.treeCard}>
            <StepSiblingList
              parentId={node.id}
              depth={0}
              rowById={stepRows}
              childrenMap={childrenMap}
              nodes={nodes}
              entries={entries}
              today={today}
              readOnly={readOnly}
              onOpen={openGoal}
              onReorder={reorderSiblings}
            />
            {canAddStep ? <View style={styles.treeAdd}>{stepAddField}</View> : null}
          </View>
        ) : !editing && (canAddStep || breakIntoSteps) ? (
          <View style={styles.treeCard}>
            <View style={styles.treeAdd}>{breakIntoSteps ? breakStepButton : stepAddField}</View>
          </View>
        ) : null}

        {!editing ? <GoalDetailCards goal={node} /> : null}

        {!editing && node.parentId == null && ownerId ? (
          <CommentsEntry
            goalId={node.id}
            goalTitle={node.title}
            ownerId={ownerId}
            readOnly={readOnly}
            sharedByName={sharedByName}
          />
        ) : null}
      </ScrollView>

      <ProgressSheet
        visible={progressOpen && !readOnly}
        title={node.title}
        initialPct={node.progressPct ?? 0}
        showClearEstimate={children.length > 0 && node.progressPct != null}
        onSave={(pct) => {
          setProgressOpen(false);
          persistProgress(pct);
        }}
        onMarkDone={() => {
          setProgressOpen(false);
          if (node.status !== 'done') {
            completeOneTime();
          }
        }}
        onClearEstimate={() => {
          setProgressOpen(false);
          persistProgress(null);
        }}
        onCancel={() => setProgressOpen(false)}
      />

      <Modal visible={logOpen} animationType="fade" transparent onRequestClose={closeLog}>
        <KeyboardSafe style={styles.modalOverlay} keyboardVerticalOffset={0}>
          <Pressable style={styles.modalBackdrop} onPress={closeLog}>
            <Pressable style={styles.logCard} onPress={() => {}}>
              <Text style={styles.logTitle}>{node.title || 'Log amount'}</Text>
              <Text style={styles.logDate}>
                Today: {formatQty(dayTotal(entries, node.id, today))} {node.unit ?? ''}
              </Text>
              <View style={styles.logInputRow}>
                <TextInput
                  style={styles.logInput}
                  value={logAmount}
                  onChangeText={(value) => {
                    setLogAmount(value);
                    setLogError(null);
                  }}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={saveLog}
                  autoFocus
                />
                <Text style={styles.logUnit}>{node.unit ?? ''}</Text>
                <Pressable
                  onPress={saveLog}
                  style={({ pressed }) => [styles.logAdd, pressed && styles.pressed]}
                >
                  <Text style={styles.logAddText}>Add</Text>
                </Pressable>
              </View>
              {logError ? <Text style={styles.logError}>{logError}</Text> : null}
              <Pressable
                onPress={undoAmount}
                style={({ pressed }) => [styles.logClear, pressed && styles.pressed]}
              >
                <Text style={styles.logClearText}>Undo last</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  closeLog();
                  clearDayLogs();
                }}
                style={({ pressed }) => [styles.logClear, pressed && styles.pressed]}
              >
                <Text style={styles.logClearText}>Clear</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </KeyboardSafe>
      </Modal>
    </KeyboardSafe>
  );
}

function formatQty(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function segmentArcPath(index: number, count: number): string {
  const gap = SEGMENT_GAP / RING_RADIUS;
  const sweep = (2 * Math.PI - count * gap) / count;
  const start = -Math.PI / 2 + index * (sweep + gap);
  const end = start + sweep;
  const x1 = RING_CENTER + RING_RADIUS * Math.cos(start);
  const y1 = RING_CENTER + RING_RADIUS * Math.sin(start);
  const x2 = RING_CENTER + RING_RADIUS * Math.cos(end);
  const y2 = RING_CENTER + RING_RADIUS * Math.sin(end);
  const large = sweep > Math.PI ? 1 : 0;
  return `M ${x1} ${y1} A ${RING_RADIUS} ${RING_RADIUS} 0 ${large} 1 ${x2} ${y2}`;
}

function WeekRing({
  total,
  target,
  tracked,
  loggedToday,
}: {
  total: number;
  target: number | null;
  tracked: boolean;
  loggedToday: boolean;
}) {
  const progress =
    target != null && target > 0 ? Math.max(0, Math.min(1, total / target)) : 0;
  const complete = target != null && target > 0 && total >= target;
  const segmented = !tracked && target != null && target <= 7;

  if (complete) {
    return (
      <View style={styles.ringBox}>
        <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
          <Circle
            cx={RING_CENTER}
            cy={RING_CENTER}
            r={RING_RADIUS + RING_STROKE / 2}
            fill="#248A3D"
          />
        </Svg>
        <View style={styles.ringOverlay} pointerEvents="none">
          <Ionicons name="checkmark" size={28} color="#FFFFFF" />
        </View>
      </View>
    );
  }

  if (segmented && target != null) {
    const count = Math.max(1, Math.round(target));
    const filled = Math.max(0, Math.min(count, Math.round(total)));
    return (
      <View style={styles.ringBox}>
        <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
          {Array.from({ length: count }, (_, index) => (
            <Path
              key={index}
              d={segmentArcPath(index, count)}
              stroke={index < filled ? '#248A3D' : '#E3E3E8'}
              strokeWidth={RING_STROKE}
              fill="none"
            />
          ))}
        </Svg>
        {loggedToday ? (
          <View style={styles.ringOverlay} pointerEvents="none">
            <Ionicons name="checkmark" size={20} color="#248A3D" />
          </View>
        ) : null}
      </View>
    );
  }

  const circumference = 2 * Math.PI * RING_RADIUS;
  return (
    <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
      <Circle
        cx={RING_CENTER}
        cy={RING_CENTER}
        r={RING_RADIUS}
        stroke="#E3E3E8"
        strokeWidth={RING_STROKE}
        fill="none"
      />
      {progress > 0 ? (
        <Circle
          cx={RING_CENTER}
          cy={RING_CENTER}
          r={RING_RADIUS}
          stroke="#248A3D"
          strokeWidth={RING_STROKE}
          fill="none"
          strokeDasharray={`${circumference * progress} ${circumference}`}
          rotation={-90}
          origin={`${RING_CENTER}, ${RING_CENTER}`}
        />
      ) : null}
    </Svg>
  );
}

function OneTimeMark({ status }: { status: GoalStatus }) {
  if (status === 'done') {
    return (
      <View style={styles.ringBox}>
        <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
          <Circle
            cx={RING_CENTER}
            cy={RING_CENTER}
            r={RING_RADIUS + RING_STROKE / 2}
            fill="#248A3D"
          />
        </Svg>
        <View style={styles.ringOverlay} pointerEvents="none">
          <Ionicons name="checkmark" size={28} color="#FFFFFF" />
        </View>
      </View>
    );
  }
  if (status === 'pending') {
    return <PendingStatusCircle size={RING_SIZE} color="#b0b0b5" />;
  }
  return (
    <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
      <Circle
        cx={RING_CENTER}
        cy={RING_CENTER}
        r={RING_RADIUS}
        stroke="#C7C7CC"
        strokeWidth={4}
        fill="none"
      />
    </Svg>
  );
}

function AnalysisCopy({
  analysis,
}: {
  analysis: { headline: string; detail: string; tone: AnalysisTone };
}) {
  return (
    <View style={styles.analysisCopy}>
      <Text style={[styles.headline, { color: TONE_COLOR[analysis.tone] }]}>
        {analysis.headline}
      </Text>
      {analysis.detail ? <Text style={styles.analysisDetail}>{analysis.detail}</Text> : null}
    </View>
  );
}

function dateKey(date: Date): string {
  return toLocalDateString(date);
}

function WeekStrip({
  node,
  entries,
  today,
}: {
  node: Goal;
  entries: GoalEntry[];
  today: string;
}) {
  const { settings } = useSettings();
  const weekStartsOn = settings.weekStart;
  const start = goalStartDate(node);
  const startWeek = startOfWeek(start, weekStartsOn);
  const available = new Set(
    weekTargetFor(node, today, weekStartsOn).availableDays.map(dateKey),
  );
  const visibleEntries = entries.filter((entry) => {
    const date = entry.entryDate.slice(0, 10);
    return entry.goalId === node.id && date <= today && date >= start;
  });

  return (
    <View style={styles.weekStrip}>
      {weekDays(today, weekStartsOn).map((day) => {
        if (startOfWeek(day, weekStartsOn) < startWeek) {
          return <View key={day} style={styles.dotSlot} />;
        }
        if (!available.has(day)) {
          return (
            <View
              key={day}
              style={styles.dotSlot}
              accessible={false}
              accessibilityState={{ disabled: true }}
            >
              <View style={[styles.dot, styles.dotDisabled]} />
            </View>
          );
        }
        const isToday = day === today;
        const after = day > today;
        const fill = dayFill(node, visibleEntries, day);
        const sessions = after ? null : daySessionMark(node, visibleEntries, day);
        return (
          <View key={day} style={styles.dotSlot}>
            <View style={styles.dotBox}>
              {isToday ? <View style={styles.dotRing} /> : null}
              {after ? (
                <View style={[styles.dot, styles.dotHollow]} />
              ) : fill === 'complete' ? (
                <View style={[styles.dot, styles.dotDone]} />
              ) : fill === 'partial' ? (
                <View style={[styles.dot, styles.dotPartial]}>
                  <View style={styles.dotPartialFill} />
                </View>
              ) : (
                <View style={[styles.dot, styles.dotMissed]} />
              )}
            </View>
            {sessions != null ? (
              <Text style={styles.dotSessions}>{`×${sessions}`}</Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function WeeklyAnalysis({
  node,
  entries,
  today,
  analysis,
  loggedToday,
  doseLabel = null,
  canLog = true,
  onPress,
}: {
  node: Goal;
  entries: GoalEntry[];
  today: string;
  analysis: { headline: string; detail: string; tone: AnalysisTone };
  loggedToday: boolean;
  doseLabel?: string | null;
  canLog?: boolean;
  onPress: () => void;
}) {
  const { settings } = useSettings();
  const { target } = weekTargetFor(node, today, settings.weekStart);
  const total = periodTotalAsOf(node, entries, today, settings.weekStart);
  return (
    <View style={styles.analysisCard}>
      <View style={styles.analysisRow}>
        <WeekRing
          total={total}
          target={target}
          tracked={isTracked(node)}
          loggedToday={loggedToday}
        />
        <AnalysisCopy analysis={analysis} />
      </View>
      <WeekStrip node={node} entries={entries} today={today} />
      {canLog ? (
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [styles.todayButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={
            doseLabel ?? (loggedToday ? 'Logged today. Tap to undo' : 'Log today')
          }
        >
          <Text style={styles.todayButtonText}>
            {doseLabel ?? (loggedToday ? '✓ Logged today · tap to undo' : 'Log today')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function LeafAmountBar({
  node,
  nodes,
  entries,
  today,
}: {
  node: Goal;
  nodes: Goal[];
  entries: GoalEntry[];
  today: string;
}) {
  const { settings } = useSettings();
  const amountTarget = isRepeating(node)
    ? periodTarget(node, today, settings.weekStart)
    : node.targetAmount;
  if (!isTracked(node) || amountTarget == null || amountTarget <= 0) {
    return null;
  }
  const total = isRepeating(node)
    ? periodTotalAsOf(node, entries, today, settings.weekStart)
    : (rollupTotal(node, nodes, entries) ?? 0);
  const ratio = Math.max(0, Math.min(1, total / amountTarget));
  return (
    <View style={styles.miniTrack}>
      <View style={[styles.miniFill, { width: `${ratio * 100}%` }]} />
    </View>
  );
}

function StreakTile({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit: 'day' | 'week';
}) {
  const unitLabel =
    value === 1 ? unit : unit === 'day' ? 'days' : 'weeks';
  return (
    <View style={styles.streakTile}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.streakValueRow}>
        {value > 0 ? <Ionicons name="flame" size={22} color="#C2410C" /> : null}
        <Text style={styles.streakValue}>{value}</Text>
      </View>
      <Text style={styles.streakUnit}>{unitLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f2f2f7',
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 32,
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f2f2f7',
    padding: 24,
  },
  missingText: {
    fontSize: 16,
    color: '#6b6b70',
    textAlign: 'center',
  },
  titleBlock: {
    gap: 6,
    paddingHorizontal: 4,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  titleActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleAction: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  parentLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    gap: 2,
  },
  parentTitle: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#007aff',
  },
  title: {
    flex: 1,
    fontSize: 28,
    fontWeight: '700',
    color: '#111',
    padding: 0,
  },
  sharedBy: {
    fontSize: 13,
    color: '#6b6b70',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  pill_active: {
    backgroundColor: '#e5f8ea',
  },
  pillText_active: {
    color: '#248a3d',
  },
  pill_pending: {
    backgroundColor: '#ececf0',
  },
  pillText_pending: {
    color: '#6b6b70',
  },
  pill_done: {
    backgroundColor: '#e5f8ea',
  },
  pillText_done: {
    color: '#248a3d',
  },
  metaLine: {
    fontSize: 15,
    color: '#6b6b70',
    flexShrink: 1,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  stepBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5ea',
  },
  stepBody: {
    flex: 1,
    gap: 2,
  },
  stepTitle: {
    fontSize: 17,
    color: '#111',
  },
  overdue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#c2410c',
  },
  addInput: {
    fontSize: 17,
    color: '#111',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5ea',
  },
  addInputSolo: {
    borderTopWidth: 0,
  },
  breakStep: {
    paddingVertical: 12,
  },
  breakStepLabel: {
    fontSize: 17,
    color: '#007aff',
  },
  pressed: {
    opacity: 0.55,
  },
  analysisCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    gap: 16,
  },
  analysisRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  analysisCopy: {
    flex: 1,
    gap: 4,
  },
  headline: {
    fontSize: 17,
    fontWeight: '700',
  },
  analysisDetail: {
    fontSize: 15,
    lineHeight: 20,
    color: '#6B6B70',
  },
  dealHeadline: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  dealTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5E5EA',
    overflow: 'hidden',
  },
  dealFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#248A3D',
  },
  nextUp: {
    gap: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5ea',
    paddingTop: 12,
  },
  nextUpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  treeCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 4,
    overflow: 'visible',
  },
  treeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingRight: 16,
  },
  treeParentTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111',
  },
  treeTitleDone: {
    color: '#6B6B70',
  },
  treeCount: {
    fontSize: 14,
    color: '#6B6B70',
  },
  treeAdd: {
    paddingHorizontal: 16,
  },
  miniTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E5EA',
    overflow: 'hidden',
    marginTop: 4,
  },
  miniFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#248A3D',
  },
  ringBox: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dotSlot: {
    width: 36,
    alignItems: 'center',
  },
  dotBox: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotSessions: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: '#248A3D',
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  dotDone: {
    backgroundColor: '#248A3D',
  },
  dotPartial: {
    backgroundColor: '#D1D1D6',
    overflow: 'hidden',
  },
  dotPartialFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '50%',
    backgroundColor: '#248A3D',
  },
  dotMissed: {
    backgroundColor: '#D1D1D6',
  },
  dotDisabled: {
    backgroundColor: '#E5E5EA',
  },
  dotHollow: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#D1D1D6',
  },
  dotRing: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#1C1C1E',
  },
  todayButton: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#007aff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  todayButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  paddedCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressCopy: {
    flex: 1,
    gap: 2,
  },
  progressTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  progressValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B6B70',
    textTransform: 'uppercase',
  },
  whyQuote: {
    fontSize: 17,
    fontStyle: 'italic',
    color: '#1C1C1E',
    lineHeight: 24,
  },
  streakRow: {
    flexDirection: 'row',
    gap: 12,
  },
  streakTile: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    gap: 6,
  },
  streakValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  streakValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  streakUnit: {
    fontSize: 15,
    color: '#6B6B70',
  },
  modalOverlay: {
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  logCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  logTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
  },
  logDate: {
    fontSize: 15,
    color: '#555',
  },
  logInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 17,
    minHeight: 44,
  },
  logUnit: {
    fontSize: 15,
    color: '#555',
  },
  logAdd: {
    backgroundColor: '#007aff',
    borderRadius: 8,
    paddingHorizontal: 14,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logAddText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  logError: {
    fontSize: 13,
    color: '#c62828',
  },
  logClear: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logClearText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#007aff',
  },
});
