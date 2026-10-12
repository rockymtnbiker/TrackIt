import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import {
  DEFAULT_SETTINGS,
  getSettings,
  setActiveSettings,
  upsertSettings,
  type UserSettings,
} from '../lib/settingsApi';

type SettingsContextValue = {
  settings: UserSettings;
  loading: boolean;
  updateSettings: (patch: Partial<UserSettings>) => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const settingsRef = useRef(settings);
  const userIdRef = useRef(user?.id ?? null);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  settingsRef.current = settings;
  userIdRef.current = user?.id ?? null;

  const apply = useCallback((next: UserSettings) => {
    settingsRef.current = next;
    setSettings(next);
    setActiveSettings(next);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      apply(DEFAULT_SETTINGS);
      setLoading(false);
      return;
    }

    setLoading(true);
    getSettings()
      .then((next) => {
        if (!cancelled) {
          apply(next);
        }
      })
      .catch(() => {
        if (!cancelled) {
          apply(DEFAULT_SETTINGS);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user, apply]);

  const updateSettings = useCallback(
    async (patch: Partial<UserSettings>) => {
      const next = { ...settingsRef.current, ...patch };
      apply(next);

      if (savingRef.current) {
        pendingRef.current = true;
        return;
      }

      savingRef.current = true;
      try {
        do {
          pendingRef.current = false;
          const saved = await upsertSettings(settingsRef.current);
          if (userIdRef.current == null) {
            apply(DEFAULT_SETTINGS);
            return;
          }
          if (!pendingRef.current) {
            apply(saved);
          }
        } while (pendingRef.current);
      } catch (error) {
        try {
          apply(await getSettings());
        } catch {
          apply(DEFAULT_SETTINGS);
        }
        throw error;
      } finally {
        savingRef.current = false;
      }
    },
    [apply],
  );

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      loading,
      updateSettings,
    }),
    [settings, loading, updateSettings],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return context;
}
