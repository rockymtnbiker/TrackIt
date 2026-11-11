import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSettings } from '../context/SettingsContext';
import {
  goalStartDate,
  targetFor,
  timesPerDay,
  weekTargetFor,
  weeklyTarget as weeklyCountTarget,
} from '../lib/goalTree';
import { parseLocalDate, todayLocal } from '../lib/localDate';
import { dailyAmounts, planSources, weeklyTarget } from '../lib/metrics';
import type { WeekStart } from '../lib/settingsApi';
import { endOfWeek, startOfWeek, weekdayLabels } from '../lib/week';
import type { Goal, GoalEntry } from '../types/goal';
import { addDays } from '../utils/date';

const WEEK_WINDOW = 6;

type Props = {
  node: Goal;
  nodes: Goal[];
  entries: GoalEntry[];
};

function formatMetricAmount(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function daysFrom(start: string, end: string): number {
  const ms =
    parseLocalDate(end.slice(0, 10)).getTime() -
    parseLocalDate(start.slice(0, 10)).getTime();
  return Math.round(ms / 86_400_000);
}

function visibleWeekStarts(
  bottom: string,
  startWeek: string,
  currentWeek: string,
): string[] {
  const weeks: string[] = [];
  for (let index = WEEK_WINDOW - 1; index >= 0; index -= 1) {
    const start = addDays(bottom, -7 * index);
    if (start >= startWeek && start <= currentWeek) {
      weeks.push(start);
    }
  }
  return weeks;
}

function countedDays(weekStart: string, startDate: string, today: string): number {
  let count = 0;
  for (let index = 0; index < 7; index += 1) {
    const date = addDays(weekStart, index);
    if (date < startDate || date > today) {
      continue;
    }
    count += 1;
  }
  return count;
}

function isYesNoRepeat(node: Goal): boolean {
  return node.unit == null && node.plannedDays !== null;
}

/** One row per log. Matches dayCount for this step only. */
function sessionCounts(
  entries: GoalEntry[],
  goalId: string,
  from: string,
  to: string,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    if (entry.goalId !== goalId) {
      continue;
    }
    const date = entry.entryDate.slice(0, 10);
    if (date < from || date > to) {
      continue;
    }
    totals.set(date, (totals.get(date) ?? 0) + 1);
  }
  return totals;
}

function yesNoWeekTarget(node: Goal, weekStart: string, weekStartsOn: WeekStart): number {
  const prorated = weekTargetFor(node, weekStart, weekStartsOn).target;
  if (prorated != null) {
    return prorated;
  }
  return weeklyCountTarget(node, weekStartsOn, weekStart) ?? 0;
}

function weekTimesPerDay(node: Goal, weekStart: string, weekStartsOn: WeekStart): number {
  const effective = targetFor(node, weekStart, endOfWeek(weekStart, weekStartsOn));
  return timesPerDay({
    repeatPeriod: effective.repeatPeriod,
    plannedDays: effective.plannedDays,
    unit: null,
    targetAmount: effective.targetAmount,
    timesPerDay: effective.timesPerDay,
  });
}

const SUPERSCRIPT_DIGITS = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

function superscript(value: number): string {
  return String(value).replace(/[0-9]/g, (digit) => SUPERSCRIPT_DIGITS[Number(digit)] ?? digit);
}

function rowMonth(weekStart: string): { id: string; label: string; crosses: boolean } {
  const start = parseLocalDate(weekStart);
  const end = parseLocalDate(addDays(weekStart, 6));
  const startLabel = start.toLocaleDateString(undefined, { month: 'short' });
  const endLabel = end.toLocaleDateString(undefined, { month: 'short' });
  const crosses =
    start.getFullYear() !== end.getFullYear() || start.getMonth() !== end.getMonth();
  return {
    id: `${start.getFullYear()}-${start.getMonth()}`,
    label: crosses ? `${startLabel}–${endLabel}` : startLabel,
    crosses,
  };
}

function weekAmount(
  weekStart: string,
  amounts: Map<string, number>,
  startDate: string,
  today: string,
): number {
  let total = 0;
  for (let index = 0; index < 7; index += 1) {
    const date = addDays(weekStart, index);
    if (date < startDate || date > today) {
      continue;
    }
    total += amounts.get(date) ?? 0;
  }
  return total;
}

export default function SixWeekSection({ node, nodes, entries }: Props) {
  const [weekOffset, setWeekOffset] = useState(0);
  const sources = planSources(node, nodes);
  const { settings } = useSettings();
  const weekStartsOn = settings.weekStart;

  const today = todayLocal();
  const startDate = goalStartDate(node);
  const currentWeek = startOfWeek(today, weekStartsOn);
  const startWeek =
    startDate.length >= 10 ? startOfWeek(startDate, weekStartsOn) : '';
  const historyWeeks =
    startWeek !== '' && startWeek <= currentWeek
      ? Math.round(daysFrom(startWeek, currentWeek) / 7) + 1
      : 0;
  const maxOffset = Math.max(0, historyWeeks - WEEK_WINDOW);
  const offset = Math.min(weekOffset, maxOffset);

  useEffect(() => {
    setWeekOffset(0);
  }, [node.id]);

  useEffect(() => {
    setWeekOffset((value) => Math.min(value, maxOffset));
  }, [maxOffset]);

  const yesNo = isYesNoRepeat(node);
  const tracked = node.unit != null && sources.length > 0;
  if ((!tracked && !yesNo) || historyWeeks === 0) {
    return null;
  }

  const bottom = addDays(currentWeek, -7 * offset);
  const weeks = visibleWeekStarts(bottom, startWeek, currentWeek);
  if (weeks.length === 0) {
    return null;
  }

  const canGoBack = offset < maxOffset;
  const canGoForward = offset > 0;
  const windowTo = endOfWeek(weeks[weeks.length - 1], weekStartsOn);
  const amounts = yesNo
    ? sessionCounts(entries, node.id, weeks[0], windowTo)
    : dailyAmounts(node, nodes, entries, weeks[0], windowTo);

  let amountSum = 0;
  let targetWeighted = 0;
  let pctWeighted = 0;
  let pctWeight = 0;
  let yesPctSum = 0;
  let yesPctWeight = 0;
  let weightSum = 0;

  const weekRows = weeks.map((weekStart) => {
    const total = weekAmount(weekStart, amounts, startDate, today);
    const target = yesNo
      ? yesNoWeekTarget(node, weekStart, weekStartsOn)
      : weeklyTarget(sources, weekStart, weekStartsOn);
    const pct = target > 0 ? (total / target) * 100 : null;
    const weekEnd = endOfWeek(weekStart, weekStartsOn);
    const met = target > 0 && total >= target;
    const missed = target > 0 && !met && weekEnd < today;
    const weight =
      weekStart === currentWeek
        ? countedDays(weekStart, startDate, today) / 7
        : 1;
    amountSum += total;
    weightSum += weight;
    if (pct != null) {
      pctWeighted += pct * weight;
      pctWeight += weight;
    }
    if (yesNo) {
      targetWeighted += target * weight;
      if (pct != null) {
        yesPctSum += pct;
        yesPctWeight += weight;
      }
    }
    return {
      weekStart,
      total,
      pct,
      met,
      missed,
      perDay: yesNo ? weekTimesPerDay(node, weekStart, weekStartsOn) : 1,
    };
  });

  const avgAmount = weightSum > 0 ? amountSum / weightSum : 0;
  const avgTarget = weightSum > 0 ? targetWeighted / weightSum : 0;
  const avgPct = pctWeight > 0 ? pctWeighted / pctWeight : null;
  const yesAvgPct = yesPctWeight > 0 ? yesPctSum / yesPctWeight : null;

  return (
    <View style={styles.metricsCard}>
      <View style={styles.weekNav}>
        <Text style={styles.metricsTitle}>Weeks</Text>
        <View style={styles.weekNavButtons}>
          <Pressable
            onPress={() =>
              setWeekOffset((value) => Math.min(maxOffset, value + 1))
            }
            disabled={!canGoBack}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Earlier weeks"
            accessibilityState={{ disabled: !canGoBack }}
            style={({ pressed }) => [
              styles.weekNavButton,
              !canGoBack && styles.weekNavDisabled,
              pressed && canGoBack && styles.pressed,
            ]}
          >
            <Ionicons name="chevron-up" size={18} color="#007aff" />
          </Pressable>
          <Pressable
            onPress={() => setWeekOffset((value) => Math.max(0, value - 1))}
            disabled={!canGoForward}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Later weeks"
            accessibilityState={{ disabled: !canGoForward }}
            style={({ pressed }) => [
              styles.weekNavButton,
              !canGoForward && styles.weekNavDisabled,
              pressed && canGoForward && styles.pressed,
            ]}
          >
            <Ionicons name="chevron-down" size={18} color="#007aff" />
          </Pressable>
        </View>
      </View>

      <View style={styles.weekRow}>
        <View style={styles.monthCell} />
        {weekdayLabels(weekStartsOn).map((label, index) => (
          <View key={`${label}-${index}`} style={styles.dayCell}>
            <Text style={styles.dayHeaderText}>{label.slice(0, 1)}</Text>
          </View>
        ))}
        <View style={styles.totalCell}>
          <Text style={styles.dayHeaderText}>Total</Text>
        </View>
        <View style={styles.pctCell}>
          <Text style={styles.dayHeaderText}>%</Text>
        </View>
      </View>

      {weekRows.map((row, rowIndex) => {
        const month = rowMonth(row.weekStart);
        const previous = rowIndex > 0 ? rowMonth(weekRows[rowIndex - 1].weekStart) : null;
        const showMonth =
          previous == null || previous.id !== month.id || month.crosses;
        return (
        <View key={row.weekStart} style={styles.weekRow}>
          <View style={styles.monthCell}>
            {showMonth ? (
              <Text style={styles.monthLabel} numberOfLines={1}>
                {month.label}
              </Text>
            ) : null}
          </View>
          {weekdayLabels(weekStartsOn).map((_, index) => {
            const date = addDays(row.weekStart, index);
            const blank = date < startDate || date > today;
            const count = amounts.get(date) ?? 0;
            return (
              <View key={date} style={styles.dayCell}>
                {blank ? null : yesNo ? (
                  <YesNoDate
                    day={Number(date.slice(8, 10))}
                    count={count}
                    perDay={row.perDay}
                  />
                ) : (
                  <Text style={styles.dayAmount}>{formatMetricAmount(count)}</Text>
                )}
              </View>
            );
          })}
          <View style={styles.totalCell}>
            <Text style={styles.dayAmount}>{formatMetricAmount(row.total)}</Text>
          </View>
          <View style={styles.pctCell}>
            <Text style={styles.dayAmount}>
              {row.pct == null ? '—' : `${Math.round(row.pct)}%`}
            </Text>
            {row.met ? (
              <Text style={styles.markMet}>✓</Text>
            ) : row.missed ? (
              <Text style={styles.markMissed}>✗</Text>
            ) : (
              <Text style={styles.markSpacer}> </Text>
            )}
          </View>
        </View>
        );
      })}

      {yesNo ? (
        <Text style={styles.yesNoSummary}>
          {`Avg ${formatMetricAmount(avgAmount)} of ${formatMetricAmount(avgTarget)} a week · ${
            yesAvgPct == null ? '—' : `${Math.round(yesAvgPct)}%`
          }`}
        </Text>
      ) : (
        <View style={[styles.weekRow, styles.weekSummaryRow]}>
          <View style={styles.monthCell} />
          <View style={styles.avgLabelCell}>
            <Text style={styles.dayHeaderText}>Avg</Text>
          </View>
          <View style={styles.totalCell}>
            <Text style={styles.dayAmount}>{formatMetricAmount(avgAmount)}</Text>
          </View>
          <View style={styles.pctCell}>
            <Text style={styles.dayAmount}>
              {avgPct == null ? '—' : `${Math.round(avgPct)}%`}
            </Text>
            <Text style={styles.markSpacer}> </Text>
          </View>
        </View>
      )}
    </View>
  );
}

function YesNoDate({
  day,
  count,
  perDay,
}: {
  day: number;
  count: number;
  perDay: number;
}) {
  const logged = count > 0;
  const partial = perDay > 1 && logged && count < perDay;
  return (
    <Text
      style={[
        styles.dateNum,
        logged ? styles.dateLogged : styles.dateOpen,
        partial && styles.datePartial,
      ]}
    >
      {day}
      {perDay > 1 && logged ? <Text style={styles.dateSup}>{superscript(count)}</Text> : null}
    </Text>
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
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weekNavButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weekNavButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekNavDisabled: {
    opacity: 0.3,
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 20,
  },
  weekSummaryRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5ea',
    marginTop: 2,
    paddingTop: 4,
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
  },
  totalCell: {
    flex: 1.45,
    alignItems: 'center',
  },
  pctCell: {
    flex: 1.85,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 1,
  },
  avgLabelCell: {
    flex: 7,
    alignItems: 'flex-end',
    paddingRight: 4,
  },
  dayHeaderText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8e8e93',
  },
  dayAmount: {
    fontSize: 10,
    color: '#111',
    fontVariant: ['tabular-nums'],
  },
  markMet: {
    width: 12,
    fontSize: 10,
    textAlign: 'center',
    color: '#34c759',
  },
  markMissed: {
    width: 12,
    fontSize: 10,
    textAlign: 'center',
    color: '#6B6B70',
  },
  markSpacer: {
    width: 12,
    fontSize: 10,
  },
  pressed: {
    opacity: 0.7,
  },
  monthCell: {
    width: 44,
    justifyContent: 'center',
  },
  monthLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#8e8e93',
  },
  dateNum: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  dateLogged: {
    fontWeight: '700',
    color: '#2E7D32',
  },
  dateOpen: {
    fontWeight: '400',
    color: '#8e8e93',
  },
  datePartial: {
    opacity: 0.45,
  },
  dateSup: {
    fontSize: 8,
    fontWeight: '700',
  },
  yesNoSummary: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5ea',
    marginTop: 2,
    paddingTop: 4,
    fontSize: 12,
    color: '#111',
    textAlign: 'right',
  },
});
