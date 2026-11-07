import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReflectionAnswerId } from '../constants/reflection';
import type { CoachCheckin, PartnerCheckin } from './reviewApi';

export type ReflectionSection = 'choice' | 'look' | 'adjust' | 'connect' | 'next' | 'summary';

export type ReflectionDraft = {
  section: ReflectionSection;
  path: 'maya' | 'own' | null;
  adjustIndex: number;
  adjustPhase: 'one' | 'others' | 'extra' | 'none';
  extraId: string | null;
  pickedIds: string[];
  viewedExtraIds: string[];
  answers: { goal_id: string; answer: ReflectionAnswerId }[];
  connectStep: 'partner' | 'partner-follow' | 'coach' | 'coach-follow';
  partnerCheckin: PartnerCheckin | null;
  coachCheckin: CoachCheckin | null;
  nextStepIds: { goalId: string; stepId: string }[];
  nextIndex: number;
  changes: string[];
  noteSentTo: string | null;
  noteAwaitingReturn: string | null;
  /** Furthest section reached. Older drafts omit it and resume from `section`. */
  reached?: ReflectionSection;
};

function storageKey(userId: string, weekStart: string): string {
  return `reflection-draft:${userId}:${weekStart}`;
}

const tails = new Map<string, Promise<unknown>>();

function enqueue<T>(userId: string, task: () => Promise<T>): Promise<T> {
  const previous = tails.get(userId) ?? Promise.resolve();
  const run = previous.then(task, task);
  tails.set(
    userId,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

function isDraft(value: unknown): value is ReflectionDraft {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const draft = value as ReflectionDraft;
  return typeof draft.section === 'string' && Array.isArray(draft.answers) && Array.isArray(draft.pickedIds);
}

export function getReflectionDraft(userId: string, weekStart: string): Promise<ReflectionDraft | null> {
  return enqueue(userId, async () => {
    try {
      const raw = await AsyncStorage.getItem(storageKey(userId, weekStart));
      if (!raw) {
        return null;
      }
      const parsed: unknown = JSON.parse(raw);
      return isDraft(parsed) ? parsed : null;
    } catch {
      return null;
    }
  });
}

export function saveReflectionDraft(
  userId: string,
  weekStart: string,
  draft: ReflectionDraft,
): Promise<void> {
  return enqueue(userId, async () => {
    try {
      await AsyncStorage.setItem(storageKey(userId, weekStart), JSON.stringify(draft));
    } catch {
      // The screen still continues if storage is unavailable.
    }
  });
}

export function clearReflectionDraft(userId: string, weekStart: string): Promise<void> {
  return enqueue(userId, async () => {
    try {
      await AsyncStorage.removeItem(storageKey(userId, weekStart));
    } catch {
      // Leaving the screen still returns to Reflect.
    }
  });
}
