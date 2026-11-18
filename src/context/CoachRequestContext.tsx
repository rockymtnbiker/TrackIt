import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { SupportRequestSheet } from '../components/SupportRequestSheet';
import type { SupportRequest } from '../lib/supportApi';

type CoachRequestOptions = {
  onSent?: (request: SupportRequest) => void;
  onClose?: () => void;
};

type CoachRequestContextValue = {
  openCoachRequest: (options?: CoachRequestOptions) => void;
};

const CoachRequestContext = createContext<CoachRequestContextValue | null>(null);

export function CoachRequestProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const optionsRef = useRef<CoachRequestOptions>({});

  const openCoachRequest = useCallback((options?: CoachRequestOptions) => {
    optionsRef.current = options ?? {};
    setOpen(true);
  }, []);

  const value = useMemo(() => ({ openCoachRequest }), [openCoachRequest]);

  return (
    <CoachRequestContext.Provider value={value}>
      {children}
      {open ? (
        <SupportRequestSheet
          onClose={() => {
            setOpen(false);
            const onClose = optionsRef.current.onClose;
            optionsRef.current = {};
            onClose?.();
          }}
          onSent={(request) => {
            setOpen(false);
            const onSent = optionsRef.current.onSent;
            optionsRef.current = {};
            onSent?.(request);
          }}
        />
      ) : null}
    </CoachRequestContext.Provider>
  );
}

export function useCoachRequest(): CoachRequestContextValue {
  const context = useContext(CoachRequestContext);
  if (!context) {
    throw new Error('useCoachRequest must be used within CoachRequestProvider');
  }
  return context;
}
