import { getMyConnections, getSharesForGoal } from './communityApi';
import { GOALS_TABLE } from './goalTables';
import { supabase } from './supabase';

export type LastMessage = {
  body: string;
  senderId: string;
  createdAt: string;
};

export type ConnectionSummary = {
  connectionId: string;
  lastMessage: LastMessage | null;
  unread: boolean;
};

type MessageRow = {
  connection_id?: string | null;
  sender_id?: string | null;
  body?: string | null;
  created_at?: string | null;
};

type ReadRow = {
  connection_id?: string | null;
  last_read_at?: string | null;
};

export type ChatMessage = {
  id: string;
  connectionId: string;
  senderId: string;
  body: string;
  goalId: string | null;
  createdAt: string;
};

type ChatMessageRow = {
  id?: string | null;
  connection_id?: string | null;
  sender_id?: string | null;
  body?: string | null;
  goal_id?: string | null;
  created_at?: string | null;
};

const MESSAGE_COLUMNS = 'id, connection_id, sender_id, body, goal_id, created_at';

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    throw error;
  }
  const userId = data.user?.id;
  if (!userId) {
    throw new Error('You must be signed in.');
  }
  return userId;
}

function mapMessage(row: ChatMessageRow): ChatMessage | null {
  if (!row.id || !row.connection_id || !row.sender_id || !row.created_at) {
    return null;
  }
  return {
    id: row.id,
    connectionId: row.connection_id,
    senderId: row.sender_id,
    body: row.body ?? '',
    goalId: row.goal_id ?? null,
    createdAt: row.created_at,
  };
}

function byCreatedAt(a: ChatMessage, b: ChatMessage): number {
  const diff = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  if (diff !== 0 && Number.isFinite(diff)) {
    return diff;
  }
  return a.id.localeCompare(b.id);
}

/** Newest last. `before` is a created_at; that message and anything newer are left out. */
export async function getMessages(
  connectionId: string,
  options?: { before?: string; limit?: number },
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  const limit = options?.limit ?? 50;
  let query = supabase
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq('connection_id', connectionId)
    .order('created_at', { ascending: false })
    .limit(limit + 1);
  if (options?.before) {
    query = query.lt('created_at', options.before);
  }
  const { data, error } = await query;
  if (error) {
    throw error;
  }
  const rows = ((data ?? []) as ChatMessageRow[])
    .map(mapMessage)
    .filter((message): message is ChatMessage => message != null);
  const hasMore = rows.length > limit;
  return {
    messages: rows.slice(0, limit).reverse(),
    hasMore,
  };
}

export async function sendMessage(
  connectionId: string,
  body: string,
  goalId?: string | null,
): Promise<ChatMessage> {
  const userId = await requireUserId();
  const trimmed = body.trim();
  if (!trimmed) {
    throw new Error('Write a message first.');
  }
  if (trimmed.length > 1000) {
    throw new Error('Keep it under 1000 characters.');
  }
  const insert: {
    connection_id: string;
    sender_id: string;
    body: string;
    goal_id?: string;
  } = {
    connection_id: connectionId,
    sender_id: userId,
    body: trimmed,
  };
  if (goalId) {
    insert.goal_id = goalId;
  }
  const { data, error } = await supabase
    .from('messages')
    .insert(insert)
    .select(MESSAGE_COLUMNS)
    .single();
  if (error) {
    throw error;
  }
  const message = mapMessage(data as ChatMessageRow);
  if (!message) {
    throw new Error('The message was not saved.');
  }
  return message;
}

export async function deleteMessage(id: string): Promise<void> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('messages')
    .delete()
    .eq('id', id)
    .eq('sender_id', userId)
    .select('id');
  if (error) {
    throw error;
  }
  if (!data || data.length === 0) {
    throw new Error('You can only delete your own messages.');
  }
}

/** Same insert as a comment report, with message_id set and no comment id. */
export async function reportMessage(id: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase.from('comment_reports').insert({
    message_id: id,
    reporter_id: userId,
    reason: null,
  });
  if (error) {
    throw error;
  }
}

export type ConnectionWith = {
  id: string;
  role: 'partner' | 'coach';
  otherName: string;
};

export type GoalShareTarget = ConnectionWith & {
  otherId: string;
};

/** The accepted connection with this person, if there is one. */
export async function getConnectionWith(otherId: string): Promise<ConnectionWith | null> {
  const connections = await getMyConnections();
  const match = connections.find(
    (connection) =>
      connection.partnerId === otherId && connection.status.toLowerCase() === 'accepted',
  );
  if (!match) {
    return null;
  }
  return {
    id: match.id,
    role: match.role === 'coach' ? 'coach' : 'partner',
    otherName: match.displayName?.trim() || match.email?.trim() || 'Someone',
  };
}

type GoalOwnerRow = {
  id?: string | null;
  parent_id?: string | null;
  user_id?: string | null;
};

/** Walk to the top-level goal when this user can read the row. */
async function readableRoot(goalId: string): Promise<{ id: string; userId: string } | null> {
  let current = goalId;
  for (let hop = 0; hop < 12; hop += 1) {
    const { data, error } = await supabase
      .from(GOALS_TABLE)
      .select('id, parent_id, user_id')
      .eq('id', current)
      .maybeSingle();
    if (error) {
      throw error;
    }
    const row = data as GoalOwnerRow | null;
    if (!row?.id || !row.user_id) {
      return null;
    }
    if (!row.parent_id) {
      return { id: row.id, userId: row.user_id };
    }
    current = row.parent_id;
  }
  return null;
}

/**
 * People this goal can be messaged about.
 * A goal I own returns the accepted people it is shared with.
 * A goal I am viewing returns its owner.
 */
export async function getGoalShareTargets(goalId: string): Promise<GoalShareTarget[]> {
  const userId = await requireUserId();
  const root = await readableRoot(goalId);
  if (root && root.userId === userId) {
    const shares = await getSharesForGoal(root.id);
    const targets: GoalShareTarget[] = [];
    for (const share of shares) {
      const connection = await getConnectionWith(share.viewerId);
      if (!connection) {
        continue;
      }
      targets.push({ ...connection, otherId: share.viewerId });
    }
    targets.sort((a, b) => a.otherName.localeCompare(b.otherName));
    return targets;
  }
  if (root && root.userId !== userId) {
    const connection = await getConnectionWith(root.userId);
    return connection ? [{ ...connection, otherId: root.userId }] : [];
  }

  const { data, error } = await supabase
    .from('goal_shares')
    .select('owner_id')
    .eq('goal_id', goalId)
    .eq('viewer_id', userId);
  if (error) {
    throw error;
  }
  const ownerId = ((data ?? []) as { owner_id?: string | null }[]).find((row) => row.owner_id)?.owner_id;
  if (!ownerId) {
    return [];
  }
  const connection = await getConnectionWith(ownerId);
  return connection ? [{ ...connection, otherId: ownerId }] : [];
}

export async function markRead(connectionId: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase.from('connection_reads').upsert(
    {
      connection_id: connectionId,
      user_id: userId,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: 'connection_id,user_id' },
  );
  if (error) {
    throw error;
  }
}

export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const message of current) {
    byId.set(message.id, message);
  }
  for (const message of incoming) {
    byId.set(message.id, message);
  }
  return [...byId.values()].sort(byCreatedAt);
}

function isNewer(messageAt: string, readAt: string): boolean {
  const messageTime = Date.parse(messageAt);
  const readTime = Date.parse(readAt);
  if (Number.isFinite(messageTime) && Number.isFinite(readTime)) {
    return messageTime > readTime;
  }
  return messageAt > readAt;
}

/**
 * Latest message and unread flag for each accepted connection.
 * Unread means the last message is from the other person and is newer than
 * this user's connection_reads row, or they have no read row yet.
 */
export async function getConnectionSummaries(
  connectionIds: string[],
): Promise<Map<string, ConnectionSummary>> {
  const summaries = new Map<string, ConnectionSummary>();
  const ids = [...new Set(connectionIds)];
  for (const id of ids) {
    summaries.set(id, { connectionId: id, lastMessage: null, unread: false });
  }
  if (ids.length === 0) {
    return summaries;
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) {
    throw userError;
  }
  const userId = userData.user?.id;
  if (!userId) {
    throw new Error('You must be signed in.');
  }

  const [messageResults, readsResult] = await Promise.all([
    Promise.all(
      ids.map((id) =>
        supabase
          .from('messages')
          .select('connection_id, sender_id, body, created_at')
          .eq('connection_id', id)
          .order('created_at', { ascending: false })
          .limit(1),
      ),
    ),
    supabase
      .from('connection_reads')
      .select('connection_id, last_read_at')
      .eq('user_id', userId)
      .in('connection_id', ids),
  ]);

  for (const result of messageResults) {
    if (result.error) {
      throw result.error;
    }
    const row = ((result.data ?? []) as MessageRow[])[0];
    if (!row?.connection_id || !row.created_at || !row.sender_id) {
      continue;
    }
    const summary = summaries.get(row.connection_id);
    if (!summary) {
      continue;
    }
    summary.lastMessage = {
      body: (row.body ?? '').trim(),
      senderId: row.sender_id,
      createdAt: row.created_at,
    };
  }
  if (readsResult.error) {
    throw readsResult.error;
  }

  const reads = new Map<string, string>();
  for (const row of (readsResult.data ?? []) as ReadRow[]) {
    if (row.connection_id && row.last_read_at) {
      reads.set(row.connection_id, row.last_read_at);
    }
  }

  for (const summary of summaries.values()) {
    const last = summary.lastMessage;
    if (!last || last.senderId === userId) {
      summary.unread = false;
      continue;
    }
    const readAt = reads.get(summary.connectionId);
    summary.unread = readAt == null || isNewer(last.createdAt, readAt);
  }

  return summaries;
}
