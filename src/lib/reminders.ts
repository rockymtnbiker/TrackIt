import AsyncStorage from '@react-native-async-storage/async-storage';
import { CommonActions } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { entriesOnOrBefore, periodTotalAsOf, startedOnOrBefore } from './asOfDate';
import { clockParts } from './clock';
import { getAllGoals, getEntries } from './goalTreeApi';
import {
  buildChildrenMap,
  isDayComplete,
  isLeaf,
  isRepeating,
  weekTargetFor,
} from './goalTree';
import { getSettings } from './settingsApi';
import type { WeekStart } from './settingsApi';
import { supabase } from './supabase';
import type { Goal, GoalEntry } from '../types/goal';
import { navigationRef } from '../navigation/navigationRef';
import { normalizeDateOnly, parseLocalDate, todayLocal } from './localDate';
import { addDays } from '../utils/date';

export const DEFAULT_CHECKIN = '19:00:00';
export const DEFAULT_REMINDER = '08:00:00';
export const NOTIFICATION_DENIED_MESSAGE =
  'Turn on notifications for this app in iPhone Settings to get reminders.';

const PROMPT_KEY = 'trackit.evening-checkin-prompted';
const HANDLED_RESPONSE_KEY = 'trackit.last-reminder-response';
const HORIZON_DAYS = 14;
const MAX_PENDING = 60;
const LOOKBACK_DAYS = 62;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

type Permission = 'granted' | 'denied' | 'undetermined';

type Note = {
  at: number;
  title: string;
  body: string;
};

let ticket = 0;

function iosStatus(
  settings: Notifications.NotificationPermissionsStatus,
): Notifications.IosAuthorizationStatus | null {
  return settings.ios?.status ?? null;
}

function permissionFrom(
  settings: Notifications.NotificationPermissionsStatus,
): Permission {
  const ios = iosStatus(settings);
  if (ios != null) {
    if (ios === Notifications.IosAuthorizationStatus.NOT_DETERMINED) {
      return 'undetermined';
    }
    if (
      ios === Notifications.IosAuthorizationStatus.AUTHORIZED ||
      ios === Notifications.IosAuthorizationStatus.PROVISIONAL ||
      ios === Notifications.IosAuthorizationStatus.EPHEMERAL
    ) {
      return 'granted';
    }
    return 'denied';
  }
  if (settings.granted || settings.status === 'granted') {
    return 'granted';
  }
  if (settings.status === 'undetermined') {
    return 'undetermined';
  }
  return 'denied';
}

export async function notificationPermission(): Promise<Permission> {
  return permissionFrom(await Notifications.getPermissionsAsync());
}

/** Asks iOS when the choice is still open. Returns whether reminders may be scheduled. */
export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await notificationPermission();
  if (current === 'granted') {
    return true;
  }
  if (current === 'denied') {
    return false;
  }
  const next = permissionFrom(
    await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: true },
    }),
  );
  return next === 'granted';
}

export async function shouldOfferEveningPrompt(): Promise<boolean> {
  const seen = await AsyncStorage.getItem(PROMPT_KEY);
  if (seen) {
    return false;
  }
  const status = await notificationPermission();
  if (status !== 'undetermined') {
    await AsyncStorage.setItem(PROMPT_KEY, '1');
    return false;
  }
  return true;
}

export async function markEveningPromptAsked(): Promise<void> {
  await AsyncStorage.setItem(PROMPT_KEY, '1');
}

export async function cancelReminders(): Promise<void> {
  ticket += 1;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export function openDoToday(freshGoalId?: string): void {
  if (!navigationRef.isReady()) {
    return;
  }
  navigationRef.dispatch(
    CommonActions.navigate({
      name: 'Today',
      params: {
        screen: 'TodayMain',
        params: {
          focusToday: Date.now(),
          ...(freshGoalId ? { freshGoalId } : {}),
        },
      },
    }),
  );
}

export async function handleReminderResponse(
  response: Notifications.NotificationResponse | null,
): Promise<void> {
  if (!response || response.notification.request.content.data?.open !== 'do') {
    return;
  }
  const id = response.notification.request.identifier;
  const seen = await AsyncStorage.getItem(HANDLED_RESPONSE_KEY);
  if (seen === id) {
    return;
  }
  await AsyncStorage.setItem(HANDLED_RESPONSE_KEY, id);
  openDoToday();
}

function atLocal(day: string, clock: string): Date | null {
  const parts = clockParts(clock);
  if (!parts) {
    return null;
  }
  const date = parseLocalDate(day);
  date.setHours(parts.hour, parts.minute, 0, 0);
  return date;
}

function plannedOn(goal: Goal, day: string): boolean {
  const weekday = parseLocalDate(day).getDay();
  return (goal.plannedDays ?? []).includes(weekday);
}

function monthTarget(goal: Goal): number | null {
  if (goal.targetAmount != null && goal.targetAmount > 0) {
    return goal.targetAmount;
  }
  const planned = goal.plannedDays?.length ?? 0;
  return planned > 0 ? planned : null;
}

function periodMet(
  goal: Goal,
  entries: GoalEntry[],
  day: string,
  weekStartsOn: WeekStart,
): boolean {
  const total = periodTotalAsOf(goal, entries, day, weekStartsOn);
  if (goal.repeatPeriod === 'month') {
    const target = monthTarget(goal);
    return target != null && total >= target;
  }
  const target = weekTargetFor(goal, day, weekStartsOn).target;
  return target != null && target > 0 && total >= target;
}

function repeatingStillLeft(
  goal: Goal,
  entries: GoalEntry[],
  day: string,
  weekStartsOn: WeekStart,
): boolean {
  return (
    isRepeating(goal) &&
    goal.status !== 'done' &&
    startedOnOrBefore(goal, day) &&
    plannedOn(goal, day) &&
    !isDayComplete(goal, entries, day) &&
    !periodMet(goal, entries, day, weekStartsOn)
  );
}

function oneTimeOpen(goal: Goal, day: string, due: 'on-or-before' | 'on'): boolean {
  if (isRepeating(goal) || goal.status === 'done' || !startedOnOrBefore(goal, day)) {
    return false;
  }
  const end = normalizeDateOnly(goal.targetEndDate);
  if (!end) {
    return false;
  }
  return due === 'on' ? end === day : end <= day;
}

function formatCount(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return String(Math.round(value * 10) / 10);
}

function progressBody(
  goal: Goal,
  entries: GoalEntry[],
  day: string,
  weekStartsOn: WeekStart,
): string {
  if (!isRepeating(goal)) {
    return 'Due today';
  }
  const month = goal.repeatPeriod === 'month';
  const total = periodTotalAsOf(goal, entries, day, weekStartsOn);
  const target = month ? monthTarget(goal) : weekTargetFor(goal, day, weekStartsOn).target;
  const period = month ? 'this month' : 'this week';
  if (target == null) {
    return `${formatCount(total)} ${period}`;
  }
  return `${formatCount(total)} of ${formatCount(target)} ${period}`;
}

function checkInBody(titles: string[]): string {
  const shown = titles.slice(0, 2);
  const extra = titles.length - shown.length;
  const list = shown.join(', ');
  return extra > 0 ? `${list} +${extra} more` : list;
}

function actionable(
  nodes: Goal[],
  childrenMap: Map<string | null, Goal[]>,
): Goal[] {
  const leaves = nodes.filter(
    (goal) => goal.status !== 'done' && isLeaf(goal, childrenMap),
  );
  const ids = new Set(leaves.map((goal) => goal.id));
  const ordered: Goal[] = [];
  const seen = new Set<string>();
  const walk = (goal: Goal) => {
    seen.add(goal.id);
    if (ids.has(goal.id)) {
      ordered.push(goal);
    }
    for (const child of childrenMap.get(goal.id) ?? []) {
      walk(child);
    }
  };
  for (const root of childrenMap.get(null) ?? []) {
    walk(root);
  }
  for (const goal of leaves) {
    if (!seen.has(goal.id)) {
      ordered.push(goal);
    }
  }
  return ordered;
}

async function collectNotes(): Promise<Note[]> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return [];
  }
  const settings = await getSettings();
  const nodes = await getAllGoals();
  const today = todayLocal();
  const ids = nodes.map((goal) => goal.id);
  const loaded =
    ids.length > 0 ? await getEntries(ids, addDays(today, -LOOKBACK_DAYS), today) : [];
  const childrenMap = buildChildrenMap(nodes);
  const steps = actionable(nodes, childrenMap);
  const notes: Note[] = [];

  for (let offset = 0; offset < HORIZON_DAYS; offset += 1) {
    const day = addDays(today, offset);
    const entries = entriesOnOrBefore(loaded, day);
    if (settings.checkinTime) {
      const left = steps.filter(
        (goal) =>
          repeatingStillLeft(goal, entries, day, settings.weekStart) ||
          oneTimeOpen(goal, day, 'on-or-before'),
      );
      const when = atLocal(day, settings.checkinTime);
      if (left.length > 0 && when && when.getTime() > Date.now()) {
        notes.push({
          at: when.getTime(),
          title: 'Still to do today',
          body: checkInBody(left.map((goal) => goal.title.trim() || 'Untitled')),
        });
      }
    }

    for (const goal of steps) {
      if (!goal.reminderTime) {
        continue;
      }
      const due = isRepeating(goal)
        ? repeatingStillLeft(goal, entries, day, settings.weekStart)
        : oneTimeOpen(goal, day, 'on');
      const when = due ? atLocal(day, goal.reminderTime) : null;
      if (!when || when.getTime() <= Date.now()) {
        continue;
      }
      notes.push({
        at: when.getTime(),
        title: goal.title.trim() || 'Untitled',
        body: progressBody(goal, entries, day, settings.weekStart),
      });
    }
  }

  notes.sort((a, b) => a.at - b.at);
  return notes.slice(0, MAX_PENDING);
}

export async function rebuildReminders(): Promise<void> {
  const mine = ++ticket;
  try {
    const permitted = (await notificationPermission()) === 'granted';
    if (mine !== ticket) {
      return;
    }
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (mine !== ticket || !permitted) {
      return;
    }
    const notes = await collectNotes();
    if (mine !== ticket) {
      return;
    }
    for (const note of notes) {
      if (mine !== ticket) {
        return;
      }
      await Notifications.scheduleNotificationAsync({
        content: {
          title: note.title,
          body: note.body,
          data: { open: 'do' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(note.at),
        },
      });
    }
  } catch (error) {
    console.warn('Failed to rebuild reminders', error);
  }
}
