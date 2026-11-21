import { supabase } from './supabase';

export const GROUP_REACTION_EMOJIS = ['👏', '🔥', '💪', '❤️', '😂'] as const;
export type GroupReactionEmoji = (typeof GROUP_REACTION_EMOJIS)[number];

export type GroupChatMessage = {
  id: string;
  groupId: string;
  senderId: string;
  body: string;
  createdAt: string;
  deleted: boolean;
};

export const REPORT_REASONS = [
  'Harassment or bullying',
  'Inappropriate content',
  'Spam',
  'Makes me feel unsafe',
  'Other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export type GroupSendResult = { kind: 'sent'; message: GroupChatMessage } | { kind: 'support' };

export type GroupReaction = {
  messageId: string;
  userId: string;
  emoji: GroupReactionEmoji;
};

type MessageRow = {
  id?: string | null;
  group_id?: string | null;
  sender_id?: string | null;
  body?: string | null;
  created_at?: string | null;
  deleted_at?: string | null;
};

type ReactionRow = {
  message_id?: string | null;
  user_id?: string | null;
  emoji?: string | null;
};

const MESSAGE_COLUMNS = 'id, group_id, sender_id, body, created_at, deleted_at';
const PAGE_SIZE = 50;

function isEmoji(value: string): value is GroupReactionEmoji {
  return (GROUP_REACTION_EMOJIS as readonly string[]).includes(value);
}

export function mapMessage(row: MessageRow): GroupChatMessage | null {
  if (!row.id || !row.group_id || !row.sender_id || !row.created_at) {
    return null;
  }
  const deleted = Boolean(row.deleted_at);
  return {
    id: row.id,
    groupId: row.group_id,
    senderId: row.sender_id,
    body: deleted ? '' : (row.body ?? ''),
    createdAt: row.created_at,
    deleted,
  };
}

function mapReaction(row: ReactionRow): GroupReaction | null {
  if (!row.message_id || !row.user_id || !row.emoji || !isEmoji(row.emoji)) {
    return null;
  }
  return { messageId: row.message_id, userId: row.user_id, emoji: row.emoji };
}

async function invokeErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === 'function') {
      try {
        const body = (await context.json()) as { error?: string };
        if (body?.error) {
          return body.error;
        }
      } catch {
        // The response body was empty or not JSON.
      }
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export async function getGroupMessages(
  groupId: string,
  options?: { before?: string },
): Promise<{ messages: GroupChatMessage[]; hasMore: boolean }> {
  let query = supabase
    .from('group_messages')
    .select(MESSAGE_COLUMNS)
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1);
  if (options?.before) {
    query = query.lt('created_at', options.before);
  }
  const { data, error } = await query;
  if (error) {
    throw error;
  }
  const rows = ((data ?? []) as MessageRow[])
    .map(mapMessage)
    .filter((message): message is GroupChatMessage => message != null);
  const hasMore = rows.length > PAGE_SIZE;
  return {
    messages: rows.slice(0, PAGE_SIZE).reverse(),
    hasMore,
  };
}

export async function getGroupReactions(messageIds: string[]): Promise<GroupReaction[]> {
  if (messageIds.length === 0) {
    return [];
  }
  const { data, error } = await supabase
    .from('message_reactions')
    .select('message_id, user_id, emoji')
    .in('message_id', messageIds);
  if (error) {
    throw error;
  }
  return ((data ?? []) as ReactionRow[])
    .map(mapReaction)
    .filter((reaction): reaction is GroupReaction => reaction != null);
}

export async function sendGroupMessage(groupId: string, body: string): Promise<GroupSendResult> {
  const trimmed = body.trim();
  if (!trimmed) {
    throw new Error('Write a message first.');
  }
  if (trimmed.length > 1000) {
    throw new Error('Keep it under 1000 characters.');
  }
  const { data, error } = await supabase.functions.invoke('send-group-message', {
    body: { group_id: groupId, body: trimmed },
  });
  if (error) {
    throw new Error(await invokeErrorMessage(error, 'Could not send the message.'));
  }
  if (data && typeof data === 'object' && (data as { support?: boolean }).support === true) {
    return { kind: 'support' };
  }
  const message = mapMessage((data ?? {}) as MessageRow);
  if (!message || message.deleted) {
    throw new Error('The message was not saved.');
  }
  return { kind: 'sent', message };
}

export async function deleteGroupMessage(messageId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_group_message', { p_message_id: messageId });
  if (error) {
    throw error;
  }
}

export async function reportGroupMessage(messageId: string, reason: ReportReason): Promise<void> {
  const { error } = await supabase.functions.invoke('report-group-message', {
    body: { message_id: messageId, reason },
  });
  if (error) {
    throw new Error(await invokeErrorMessage(error, 'The report was not saved.'));
  }
}

export async function toggleGroupReaction(
  messageId: string,
  userId: string,
  emoji: GroupReactionEmoji,
  on: boolean,
): Promise<void> {
  if (on) {
    const { error } = await supabase.from('message_reactions').insert({
      message_id: messageId,
      user_id: userId,
      emoji,
    });
    if (error && error.code !== '23505') {
      throw error;
    }
    return;
  }
  const { error } = await supabase
    .from('message_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('user_id', userId)
    .eq('emoji', emoji);
  if (error) {
    throw error;
  }
}

export async function markGroupRead(groupId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_group_read', { p_group_id: groupId });
  if (error) {
    throw error;
  }
}

export async function groupUnreadCount(groupId: string): Promise<number> {
  const { data, error } = await supabase.rpc('group_unread_count', { p_group_id: groupId });
  if (error) {
    throw error;
  }
  const count = typeof data === 'number' ? data : Number(data);
  return Number.isFinite(count) ? count : 0;
}

export function mergeGroupMessages(
  current: GroupChatMessage[],
  incoming: GroupChatMessage[],
): GroupChatMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    byId.set(message.id, message);
  }
  return [...byId.values()].sort((a, b) => {
    const diff = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    if (diff !== 0 && Number.isFinite(diff)) {
      return diff;
    }
    return a.id.localeCompare(b.id);
  });
}
