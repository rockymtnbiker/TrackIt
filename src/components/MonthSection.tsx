import { StyleSheet, Text, View } from 'react-native';
import { useSettings } from '../context/SettingsContext';
import { parseLocalDate, todayLocal } from '../lib/localDate';
import { dailyAmounts, goalStartDate, monthlyPlanned, planSources } from '../lib/metrics';
import type { Goal, GoalEntry } from '../types/goal';

function formatMetricAmount(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function MonthSection({
  node,
  nodes,
  entries,
}: {
  node: Goal;
  nodes: Goal[];
  entries: GoalEntry[];
}) {
  const sources = planSources(node, nodes);
  const { settings } = useSettings();
  const weekStartsOn = settings.weekStart;
  if (node.unit == null || sources.length === 0) {
    return null;
  }

  const today = todayLocal();
  const startDate = goalStartDate(node);
  const month = parseLocalDate(today);
  const monthStart = `${today.slice(0, 7)}-01`;
  const monthEndDate = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const monthEnd = `${today.slice(0, 7)}-${String(monthEndDate.getDate()).padStart(2, '0')}`;
  const monthFrom = startDate > monthStart ? startDate : monthStart;
  const monthAmounts = dailyAmounts(node, nodes, entries, monthFrom, monthEnd);
  let completed = 0;
  for (const value of monthAmounts.values()) {
    completed += value;
  }
  const planned = monthlyPlanned(sources, today, startDate, weekStartsOn);
  const monthPct = planned > 0 ? Math.round((completed / planned) * 100) : null;
  const monthName = month.toLocaleDateString(undefined, { month: 'long' });

  return (
    <View style={styles.metricsCard}>
      <Text style={styles.metricsTitle}>{monthName}</Text>
      <View style={styles.metricsLabelRow}>
        <Text style={styles.progress}>
          {formatMetricAmount(completed)} / {formatMetricAmount(planned)} {node.unit}
        </Text>
        <Text style={styles.progress}>{monthPct == null ? '—' : `${monthPct}%`}</Text>
      </View>
      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            {
              width: `${Math.max(0, Math.min(100, monthPct ?? 0))}%`,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  metricsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 10,
    gap: 6,
  },
  metricsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
  },
  metricsLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  progress: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e5e5ea',
    overflow: 'visible',
    position: 'relative',
  },
  barFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#007aff',
  },
});
