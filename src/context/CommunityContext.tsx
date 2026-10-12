import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getMyConnections } from '../lib/communityApi';
import type { Connection } from '../types/community';

type CommunityContextValue = {
  incomingCount: number;
  refreshConnections: () => Promise<Connection[]>;
};

const CommunityContext = createContext<CommunityContextValue | null>(null);

function incomingInviteCount(connections: Connection[]): number {
  return connections.filter(
    (connection) =>
      connection.status.toLowerCase() === 'pending' && connection.incoming === true,
  ).length;
}

export function CommunityProvider({ children }: { children: ReactNode }) {
  const [incomingCount, setIncomingCount] = useState(0);

  const refreshConnections = useCallback(async () => {
    const connections = await getMyConnections();
    setIncomingCount(incomingInviteCount(connections));
    return connections;
  }, []);

  useEffect(() => {
    let cancelled = false;
    getMyConnections()
      .then((connections) => {
        if (!cancelled) {
          setIncomingCount(incomingInviteCount(connections));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({ incomingCount, refreshConnections }),
    [incomingCount, refreshConnections],
  );

  return (
    <CommunityContext.Provider value={value}>{children}</CommunityContext.Provider>
  );
}

export function useCommunity(): CommunityContextValue {
  const value = useContext(CommunityContext);
  if (!value) {
    throw new Error('useCommunity must be used within CommunityProvider.');
  }
  return value;
}
