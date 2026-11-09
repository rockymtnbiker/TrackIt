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
import { getMyConnections } from '../lib/communityApi';
import { getConnectionSummaries, type ConnectionSummary } from '../lib/messagesApi';
import type { Connection } from '../types/community';

type CommunityContextValue = {
  hasAttention: boolean;
  summaries: Map<string, ConnectionSummary>;
  refreshConnections: () => Promise<Connection[]>;
  /** Drop this connection's unread dot after it has been marked read. */
  clearUnread: (connectionId: string) => void;
};

const CommunityContext = createContext<CommunityContextValue | null>(null);

function incomingInviteCount(connections: Connection[]): number {
  return connections.filter(
    (connection) =>
      connection.status.toLowerCase() === 'pending' && connection.incoming === true,
  ).length;
}

function acceptedIds(connections: Connection[]): string[] {
  return connections
    .filter((connection) => connection.status.toLowerCase() === 'accepted')
    .map((connection) => connection.id);
}

function seenLocally(summary: ConnectionSummary, markedAt: number | undefined): ConnectionSummary {
  if (markedAt == null || !summary.unread || !summary.lastMessage) {
    return summary;
  }
  const last = Date.parse(summary.lastMessage.createdAt);
  if (Number.isFinite(last) && last <= markedAt) {
    return { ...summary, unread: false };
  }
  return summary;
}

export function CommunityProvider({ children }: { children: ReactNode }) {
  const [hasAttention, setHasAttention] = useState(false);
  const [summaries, setSummaries] = useState<Map<string, ConnectionSummary>>(() => new Map());
  const summariesRef = useRef(summaries);
  const incomingRef = useRef(0);
  const localReads = useRef(new Map<string, number>());
  summariesRef.current = summaries;

  const publish = useCallback((next: Map<string, ConnectionSummary>, incoming: number) => {
    summariesRef.current = next;
    incomingRef.current = incoming;
    const unread = [...next.values()].some((summary) => summary.unread);
    setSummaries(next);
    setHasAttention(incoming > 0 || unread);
  }, []);

  const refreshConnections = useCallback(async () => {
    const connections = await getMyConnections();
    const incoming = incomingInviteCount(connections);
    incomingRef.current = incoming;
    try {
      const loaded = await getConnectionSummaries(acceptedIds(connections));
      const next = new Map<string, ConnectionSummary>();
      for (const [id, summary] of loaded) {
        next.set(id, seenLocally(summary, localReads.current.get(id)));
      }
      publish(next, incoming);
    } catch {
      setHasAttention(incoming > 0);
    }
    return connections;
  }, [publish]);

  const clearUnread = useCallback((connectionId: string) => {
    localReads.current.set(connectionId, Date.now());
    const next = new Map(summariesRef.current);
    const summary = next.get(connectionId);
    if (summary?.unread) {
      next.set(connectionId, { ...summary, unread: false });
    }
    publish(next, incomingRef.current);
  }, [publish]);

  useEffect(() => {
    let cancelled = false;
    void refreshConnections().catch(() => {
      if (!cancelled) {
        setHasAttention(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [refreshConnections]);

  const value = useMemo(
    () => ({ hasAttention, summaries, refreshConnections, clearUnread }),
    [hasAttention, summaries, refreshConnections, clearUnread],
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
