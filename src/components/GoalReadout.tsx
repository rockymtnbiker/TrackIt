import { StyleSheet, Text, View } from 'react-native';
import { useSettings } from '../context/SettingsContext';
import { MonthSection } from './MonthSection';
import { ProgressLineChart } from './ProgressLineChart';
import { StatusLine } from './StatusLine';
import { todayLocal } from '../lib/localDate';
import {
  paceInfo,
  periodTarget,
  periodTotal,
  rollupTotal,
  type PaceInfo,
} from '../lib/goalTree';
import { buildProgressSeries, dailyAmounts, goalStartDate } from '../lib/metrics';
import {
  aheadStatus,
  behindStatus,
  onTrackStatus,
  pastDueStatus,
  type StatusCopy,
} from '../lib/statusMessages';
import type { Goal, GoalEntry, RepeatPeriod } from '../types/goal';

function periodWord(period: RepeatPeriod | null): string {
  return period === 'month' ? 'month' : 'week';
}

/** Same-unit daily totals the progress bar rolls up, including days before the start. */
function rolledUpEntries(
  node: Goal,
  nodes: Goal[],
  entries: GoalEntry[],
  endDate: string,
  today: string,
): GoalEntry[] {
  const last = endDate.slice(0, 10) > today ? endDate.slice(0, 10) : today;
  const amounts = dailyAmounts(node, nodes, entries, '1970-01-01', last);
  return [...amounts].map(([date, value]) => ({
    id: date,
    goalId: node.id,
    entryDate: date,
    value,
    createdAt: date,
  }));
}

function paceMessageFor(
  node: Goal,
  total: number,
  pace: PaceInfo,
  today: string,
): StatusCopy {
  const deadline = node.targetEndDate?.slice(0, 10) || null;
  if (node.status !== 'done' && deadline && deadline < today.slice(0, 10)) {
    return pastDueStatus();
  }
  if (pace.onPace) {
    return onTrackStatus();
  }
  if (pace.delta > 0) {
    return aheadStatus(Math.round(pace.delta));
  }
  return behindStatus(total > 0, true);
}

export function GoalReadout({
  node,
  nodes,
  entries,
  onSetTargetDate,
}: {
  node: Goal;
  nodes: Goal[];
  entries: GoalEntry[];
  onSetTargetDate?: () => void;
}) {
  const { settings } = useSettings();
  const displayUnit = node.unit;
  const repeatOn = node.plannedDays !== null;
  const today = todayLocal();
  const total = displayUnit
    ? repeatOn
      ? periodTotal(node, entries, today, settings.weekStart)
      : (rollupTotal(node, nodes, entries) ?? 0)
    : null;
  const amountTarget = repeatOn
    ? periodTarget(node, today, settings.weekStart)
    : node.targetAmount;
  const pace = displayUnit && !repeatOn ? paceInfo(node, total ?? 0, today) : null;
  const paceCopy = pace ? paceMessageFor(node, total ?? 0, pace, today) : null;

  return (
    <>
      {displayUnit ? (
        <View style={styles.progressCard}>
          <Text style={styles.progress}>
            {total ?? 0} / {amountTarget ?? '—'} {displayUnit}
            {repeatOn ? ` this ${periodWord(node.repeatPeriod)}` : ''}
          </Text>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                {
                  width: `${Math.max(
                    0,
                    Math.min(100, amountTarget ? ((total ?? 0) / amountTarget) * 100 : 0),
                  )}%`,
                },
              ]}
            />
            {pace ? (
              <View
                style={[
                  styles.paceTick,
                  {
                    left: `${Math.max(0, Math.min(100, pace.pctExpected))}%`,
                  },
                ]}
              />
            ) : null}
          </View>
          {pace && node.targetAmount != null && node.targetEndDate ? (
            <ProgressLineChart
              series={buildProgressSeries({
                entries: rolledUpEntries(node, nodes, entries, node.targetEndDate, today),
                startDate: goalStartDate(node),
                endDate: node.targetEndDate,
                target: node.targetAmount,
                today,
              })}
            />
          ) : null}
          {!repeatOn && paceCopy ? (
            <StatusLine
              message={paceCopy.message}
              tone={paceCopy.tone}
              onSetTargetDate={onSetTargetDate}
              style={styles.paceLine}
            />
          ) : null}
          {!repeatOn && !node.targetEndDate ? (
            <Text style={styles.hint}>Add a target end date to see your pace.</Text>
          ) : null}
        </View>
      ) : null}
      <MonthSection node={node} nodes={nodes} entries={entries} />
    </>
  );
}

const styles = StyleSheet.create({
  progressCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
  paceTick: {
    position: 'absolute',
    top: -3,
    width: 2,
    height: 14,
    marginLeft: -1,
    borderRadius: 1,
    backgroundColor: '#111',
  },
  paceLine: {
    fontSize: 13,
    fontWeight: '600',
  },
  hint: {
    fontSize: 13,
    color: '#8e8e93',
    marginTop: -2,
  },
});
