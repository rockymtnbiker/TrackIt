import AsyncStorage from '@react-native-async-storage/async-storage';
import { CommonActions } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { entriesOnOrBefore, periodTotalAsOf, startedOnOrBefore } from './asOfDate';
import { clockParts } from './clock';
import { getAllGoals, getEntries } from './goalTreeApi';
import {
  buildChildrenMap,
  isDayComplete,
  isDoneForDay,
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
import { reflectionDateInWeek } from './week';
import { addDays } from '../utils/date';

export const DEFAULT_CHECKIN = '19:00:00';
export const DEFAULT_REMINDER = '09:00:00';
export const NOTIFICATION_DENIED_MESSAGE =
  'Turn on notifications for this app in iPhone Settings to get reminders.';

const PROMPT_KEY = 'trackit.evening-checkin-prompted';
const HANDLED_RESPONSE_KEY = 'trackit.last-reminder-response';
const HORIZON_DAYS = 14;
const PER_GOAL_HORIZON = 7;
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
  identifier?: string;
  open?: 'do' | 'reflect';
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

export function openReflect(): void {
  if (!navigationRef.isReady()) {
    return;
  }
  navigationRef.dispatch(
    CommonActions.navigate({
      name: 'Dashboard',
      params: { screen: 'DashboardMain' },
    }),
  );
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
  const open = response?.notification.request.content.data?.open;
  if (!response || (open !== 'do' && open !== 'reflect')) {
    return;
  }
  const id = response.notification.request.identifier;
  const seen = await AsyncStorage.getItem(HANDLED_RESPONSE_KEY);
  if (seen === id) {
    return;
  }
  await AsyncStorage.setItem(HANDLED_RESPONSE_KEY, id);
  if (open === 'reflect') {
    openReflect();
    return;
  }
  openDoToday();
}

function reflectionReminderId(day: string): string {
  return `reflection-${day}`;
}

/** Drops the reflection reminder for the week that contains today. The save flow will call this. */
export async function cancelThisWeeksReflectionReminder(): Promise<void> {
  try {
    const settings = await getSettings();
    const day = reflectionDateInWeek(todayLocal(), settings.weekStart, settings.reflectionDay);
    await Notifications.cancelScheduledNotificationAsync(reflectionReminderId(day));
  } catch (error) {
    console.warn('Failed to cancel reflection reminder', error);
  }
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

function goalReminderIdentifier(goalId: string, day: string): string {
  return `goal-${goalId}-${day}`;
}

/** One notification on each upcoming reflection weekday, at the reflection time. */
function reflectionNotes(
  reflectionTime: string,
  reflectionDay: number,
  today: string,
): Note[] {
  const notes: Note[] = [];
  for (let offset = 0; offset < HORIZON_DAYS; offset += 1) {
    const day = addDays(today, offset);
    if (parseLocalDate(day).getDay() !== reflectionDay) {
      continue;
    }
    const when = atLocal(day, reflectionTime);
    if (!when || when.getTime() <= Date.now()) {
      continue;
    }
    notes.push({
      at: when.getTime(),
      title: 'Ready for your weekly reflection?',
      body: 'Take a few minutes to look back and plan your week.',
      identifier: reflectionReminderId(day),
      open: 'reflect',
    });
  }
  return notes;
}

/** Repeating steps with planned days fire only then. Everything else fires every day. */
function remindOnDay(goal: Goal, day: string): boolean {
  if (!isRepeating(goal)) {
    return true;
  }
  return (goal.plannedDays ?? []).includes(parseLocalDate(day).getDay());
}

function perGoalNotes(
  nodes: Goal[],
  loaded: GoalEntry[],
  today: string,
  days: number,
  weekStartsOn: WeekStart,
): Note[] {
  const notes: Note[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const day = addDays(today, offset);
    for (const goal of nodes) {
      if (!goal.reminderTime || goal.status === 'done') {
        continue;
      }
      if (!remindOnDay(goal, day)) {
        continue;
      }
      if (day === today && isDoneForDay(goal, loaded, day, nodes, weekStartsOn)) {
        continue;
      }
      const when = atLocal(day, goal.reminderTime);
      if (!when || when.getTime() <= Date.now()) {
        continue;
      }
      notes.push({
        at: when.getTime(),
        title: goal.title.trim() || 'Untitled',
        body: 'Ready for today?',
        identifier: goalReminderIdentifier(goal.id, day),
      });
    }
  }
  notes.sort((a, b) => a.at - b.at);
  return notes;
}

/** Fewer days, then a hard cap, so the pending list stays under 60. */
function cappedPerGoalNotes(
  nodes: Goal[],
  loaded: GoalEntry[],
  today: string,
  weekStartsOn: WeekStart,
): Note[] {
  let days = PER_GOAL_HORIZON;
  let notes = perGoalNotes(nodes, loaded, today, days, weekStartsOn);
  while (notes.length >= MAX_PENDING && days > 1) {
    days -= 1;
    notes = perGoalNotes(nodes, loaded, today, days, weekStartsOn);
  }
  return notes.length >= MAX_PENDING ? notes.slice(0, MAX_PENDING - 1) : notes;
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

  const reflection = reflectionNotes(settings.reflectionTime, settings.reflectionDay, today);
  if (settings.reminderMode === 'per_goal') {
    const room = Math.max(0, MAX_PENDING - reflection.length);
    const goalNotes = cappedPerGoalNotes(nodes, loaded, today, settings.weekStart).slice(0, room);
    return [...goalNotes, ...reflection].sort((a, b) => a.at - b.at);
  }

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
  }

  notes.push(...reflection);
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
        ...(note.identifier ? { identifier: note.identifier } : {}),
        content: {
          title: note.title,
          body: note.body,
          data: { open: note.open ?? 'do' },
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

/** Drop today's per-goal notification for this goal and its ancestors once the day is done. */
export async function cancelTodayIfDone(goalId: string): Promise<void> {
  try {
    const settings = await getSettings();
    if (settings.reminderMode !== 'per_goal') {
      return;
    }
    const nodes = await getAllGoals();
    const byId = new Map(nodes.map((goal) => [goal.id, goal]));
    const chain: Goal[] = [];
    const seen = new Set<string>();
    let currentId: string | null = goalId;
    while (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      const goal = byId.get(currentId);
      if (!goal) {
        break;
      }
      chain.push(goal);
      currentId = goal.parentId;
    }
    if (chain.length === 0) {
      return;
    }

    const today = todayLocal();
    const ids = new Set<string>();
    const childrenMap = buildChildrenMap(nodes);
    const collect = (id: string) => {
      if (ids.has(id)) {
        return;
      }
      ids.add(id);
      for (const child of childrenMap.get(id) ?? []) {
        collect(child.id);
      }
    };
    for (const goal of chain) {
      collect(goal.id);
    }
    const entries = await getEntries([...ids], addDays(today, -LOOKBACK_DAYS), today);
    for (const goal of chain) {
      if (!isDoneForDay(goal, entries, today, nodes, settings.weekStart)) {
        continue;
      }
      await Notifications.cancelScheduledNotificationAsync(
        goalReminderIdentifier(goal.id, today),
      );
    }
  } catch (error) {
    console.warn('Failed to cancel done reminders', error);
  }
}
