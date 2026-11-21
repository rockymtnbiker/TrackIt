import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ReflectExchange } from '../lib/reflectMayaPrompt';

type Session = {
  /** The Reflect tab is showing the reflection hub. */
  active: boolean;
  /** False for Reflect on my own. Hides Maya's card, chat, and coach line. */
  maya: boolean;
  /** Changes each time Reflect with Maya starts, so a restart drops the wrap-up. */
  startedAt: number;
  /** Week the Reflect tab was showing when this reflection started. */
  weekStart: string;
  exchanges: Record<string, ReflectExchange>;
  /** Goals marked with Done with this goal. */
  reflected: string[];
  /** Target amount first seen for a goal, and whether it changed. */
  targets: Record<string, { initial: number | null; changed: boolean }>;
  /** A coach request was sent from this reflection. */
  coachRequested: boolean;
  /** The recap coach line is on screen for this reflection. */
  coachLineShown: boolean;
};

type ReflectMayaApi = {
  session: Session | null;
  /** Week the Reflect tab is currently showing, used when a reflection starts. */
  visibleWeek: string | null;
  noteWeek: (weekStart: string) => void;
  begin: (weekStart: string, maya: boolean) => void;
  saveExchange: (goalId: string, exchange: ReflectExchange) => void;
  markReflected: (goalId: string) => void;
  /** Remember the target, then flag it once the amount changes. */
  noteTarget: (goalId: string, amount: number | null) => void;
  markCoachRequested: () => void;
  markCoachLineShown: () => void;
  /** Leave the hub and keep answers for the wrap-up. */
  end: () => void;
  /** Leave the hub and drop this reflection's answers. */
  clear: () => void;
};

const ReflectMayaContext = createContext<ReflectMayaApi | null>(null);

export function ReflectMayaProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [visibleWeek, setVisibleWeek] = useState<string | null>(null);

  const noteWeek = useCallback((weekStart: string) => {
    setVisibleWeek(weekStart);
  }, []);

  const begin = useCallback((weekStart: string, maya: boolean) => {
    setSession({
      active: true,
      maya,
      startedAt: Date.now(),
      weekStart,
      exchanges: {},
      reflected: [],
      targets: {},
      coachRequested: false,
      coachLineShown: false,
    });
  }, []);

  const saveExchange = useCallback((goalId: string, exchange: ReflectExchange) => {
    setSession((current) => {
      if (!current) {
        return current;
      }
      return { ...current, exchanges: { ...current.exchanges, [goalId]: exchange } };
    });
  }, []);

  const markReflected = useCallback((goalId: string) => {
    setSession((current) => {
      if (!current || current.reflected.includes(goalId)) {
        return current;
      }
      return { ...current, reflected: [...current.reflected, goalId] };
    });
  }, []);

  const noteTarget = useCallback((goalId: string, amount: number | null) => {
    setSession((current) => {
      if (!current) {
        return current;
      }
      const known = current.targets[goalId];
      if (!known) {
        return {
          ...current,
          targets: { ...current.targets, [goalId]: { initial: amount, changed: false } },
        };
      }
      if (known.changed || known.initial === amount) {
        return current;
      }
      return {
        ...current,
        targets: { ...current.targets, [goalId]: { initial: known.initial, changed: true } },
      };
    });
  }, []);

  const markCoachRequested = useCallback(() => {
    setSession((current) => (current && !current.coachRequested ? { ...current, coachRequested: true } : current));
  }, []);

  const markCoachLineShown = useCallback(() => {
    setSession((current) =>
      current && !current.coachLineShown ? { ...current, coachLineShown: true } : current,
    );
  }, []);

  const end = useCallback(() => {
    setSession((current) => (current?.active ? { ...current, active: false } : current));
  }, []);

  const clear = useCallback(() => {
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({
      session,
      visibleWeek,
      noteWeek,
      begin,
      saveExchange,
      markReflected,
      noteTarget,
      markCoachRequested,
      markCoachLineShown,
      end,
      clear,
    }),
    [
      begin,
      clear,
      end,
      markCoachLineShown,
      markCoachRequested,
      markReflected,
      noteTarget,
      noteWeek,
      saveExchange,
      session,
      visibleWeek,
    ],
  );

  return <ReflectMayaContext.Provider value={value}>{children}</ReflectMayaContext.Provider>;
}

export function useReflectMaya(): ReflectMayaApi | null {
  return useContext(ReflectMayaContext);
}
