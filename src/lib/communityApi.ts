import type { Connection, GoalComment, GoalShare } from '../types/community';
import type { Goal, GoalEntry, GoalStatus, RepeatPeriod } from '../types/goal';
import { localCalendarDay, normalizeDateOnly } from './localDate';
import { ENTRIES_TABLE, GOALS_TABLE, amountToNumber } from './goalTables';
import { buildChildrenMap, storedTimesPerDay } from './goalTree';
import { awardBadges } from './badgeCelebration';
import { supabase } from './supabase';

export type SharedGoals = {
  goals: Goal[];
  entries: GoalEntry[];
};

type ConnectionRow = {
  id: string;
  /** Partner user id from my_connections. */
  other_id?: string | null;
  /** Partner display name from my_connections. */
  other_name?: string | null;
  partner_id?: string | null;
  other_user_id?: string | null;
  email?: string | null;
  partner_email?: string | null;
  recipient_email?: string | null;
  display_name?: string | null;
  partner_display_name?: string | null;
  partner_name?: string | null;
  name?: string | null;
  status?: string | null;
  incoming?: boolean | null;
  is_incoming?: boolean | null;
  direction?: string | null;
  role?: string | null;
  blocked_by_me?: boolean | null;
  i_blocked?: boolean | null;
  is_blocker?: boolean | null;
  created_at?: string | null;
};

type GoalShareRow = {
  owner_id: string;
  viewer_id: string;
  goal_id: string;
  created_at: string | null;
};

type GoalRow = {
  id: string;
  user_id: string;
  parent_id: string | null;
  title: string;
  description: string | null;
  why: string | null;
  category: string | null;
  sort_order: number | null;
  status: string;
  target_start_date: string | null;
  target_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  created_date: string | null;
  unit: string | null;
  target_amount: number | string | null;
  repeat_period: string | null;
  planned_days: number[] | null;
  times_per_day?: number | string | null;
};

type EntryRow = {
  id: string;
  goal_id: string;
  entry_date: string;
  value: number | string | null;
  created_at?: string | null;
};

const SHARE_COLUMNS = 'goal_id, owner_id, viewer_id, created_at';
const COMMENT_COLUMNS =
  'id, goal_id, owner_id, partner_id, author_id, body, created_at';

type CommentRow = {
  id: string;
  goal_id: string;
  owner_id: string;
  partner_id: string;
  author_id: string;
  body: string | null;
  created_at: string | null;
};

function blankToNull(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function dateOrNull(value: string | null | undefined): string | null {
  return normalizeDateOnly(value);
}

function mapRepeatPeriod(value: string | null | undefined): RepeatPeriod | null {
  const period = value?.toLowerCase();
  if (period === 'day') {
    return 'week';
  }
  if (period === 'week' || period === 'month') {
    return period;
  }
  return null;
}

function mapGoal(row: GoalRow): Goal {
  const status: GoalStatus =
    row.status === 'pending' || row.status === 'active' || row.status === 'done'
      ? row.status
      : 'pending';

  return {
    id: row.id,
    userId: row.user_id,
    parentId: row.parent_id,
    title: row.title,
    description: row.description,
    why: blankToNull(row.why),
    category: row.category,
    sortOrder: row.sort_order ?? 0,
    status,
    targetStartDate: dateOrNull(row.target_start_date),
    targetEndDate: dateOrNull(row.target_end_date),
    actualStartDate: dateOrNull(row.actual_start_date),
    actualEndDate: dateOrNull(row.actual_end_date),
    createdDate: localCalendarDay(row.created_date),
    unit: row.unit,
    targetAmount: amountToNumber(row.target_amount) ?? null,
    repeatPeriod: mapRepeatPeriod(row.repeat_period),
    plannedDays: row.planned_days,
    timesPerDay: storedTimesPerDay(amountToNumber(row.times_per_day) ?? null),
    reminderTime: null,
    starterKey: null,
  };
}

function mapEntry(row: EntryRow): GoalEntry {
  return {
    id: row.id,
    goalId: row.goal_id,
    entryDate: normalizeDateOnly(row.entry_date) ?? row.entry_date.slice(0, 10),
    value: amountToNumber(row.value) ?? null,
    createdAt: row.created_at ?? '',
  };
}

function textOrNull(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function mapConnection(row: ConnectionRow): Connection {
  const direction = (row.direction ?? row.role ?? '').toLowerCase();
  const incomingFlag = row.incoming ?? row.is_incoming;
  const incoming =
    typeof incomingFlag === 'boolean'
      ? incomingFlag
      : direction === 'incoming' ||
          direction === 'in' ||
          direction === 'recipient' ||
          direction === 'invitee'
        ? true
        : direction === 'outgoing' ||
            direction === 'out' ||
            direction === 'requester' ||
            direction === 'inviter'
          ? false
          : null;

  return {
    id: row.id,
    partnerId: row.other_id ?? row.partner_id ?? row.other_user_id ?? null,
    email: textOrNull(row.email ?? row.partner_email ?? row.recipient_email),
    displayName: textOrNull(
      row.other_name ??
        row.display_name ??
        row.partner_display_name ??
        row.partner_name ??
        row.name,
    ),
    status: row.status ?? '',
    incoming,
    blockedByMe:
      typeof row.blocked_by_me === 'boolean'
        ? row.blocked_by_me
        : typeof row.i_blocked === 'boolean'
          ? row.i_blocked
          : typeof row.is_blocker === 'boolean'
            ? row.is_blocker
            : null,
    createdAt: row.created_at ?? '',
  };
}

function mapShare(row: GoalShareRow): GoalShare {
  return {
    ownerId: row.owner_id,
    viewerId: row.viewer_id,
    goalId: row.goal_id,
    createdAt: row.created_at ?? '',
  };
}

function asConnection(data: unknown): Connection | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') {
    return null;
  }
  return mapConnection(row as ConnectionRow);
}

function asConnections(data: unknown): Connection[] {
  if (data == null) {
    return [];
  }
  const rows = Array.isArray(data) ? data : [data];
  return rows.map((row) => mapConnection(row as ConnectionRow));
}

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

function treeFromRoots(all: Goal[], rootIds: Set<string>): Goal[] {
  const roots = all.filter((goal) => goal.parentId == null && rootIds.has(goal.id));
  const children = buildChildrenMap(all);
  const included = new Set<string>();
  const stack = roots.map((goal) => goal.id);
  while (stack.length > 0) {
    const id = stack.pop();
    if (id == null || included.has(id)) {
      continue;
    }
    included.add(id);
    for (const child of children.get(id) ?? []) {
      stack.push(child.id);
    }
  }
  return all.filter((goal) => included.has(goal.id));
}

export async function sendPartnerInvite(email: string): Promise<Connection | null> {
  const { data, error } = await supabase.rpc('send_partner_invite', { p_email: email });
  if (error) {
    throw error;
  }
  return asConnection(data);
}

export async function respondToInvite(
  id: string,
  accept: boolean,
): Promise<Connection | null> {
  const { data, error } = await supabase.rpc('respond_to_invite', { p_id: id, p_accept: accept });
  if (error) {
    throw error;
  }
  if (accept) {
    awardBadges();
  }
  return asConnection(data);
}

export async function cancelInvite(id: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_invite', { p_id: id });
  if (error) {
    throw error;
  }
}

export async function removePartner(id: string): Promise<void> {
  const { error } = await supabase.rpc('remove_partner', { p_id: id });
  if (error) {
    throw error;
  }
}

export async function blockPartner(id: string): Promise<void> {
  const { error } = await supabase.rpc('block_partner', { p_id: id });
  if (error) {
    throw error;
  }
}

export async function getMyConnections(): Promise<Connection[]> {
  const { data, error } = await supabase.rpc('my_connections');
  if (error) {
    throw error;
  }
  return asConnections(data);
}

export async function getMySharesWith(partnerId: string): Promise<GoalShare[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('goal_shares')
    .select(SHARE_COLUMNS)
    .eq('owner_id', userId)
    .eq('viewer_id', partnerId);

  if (error) {
    throw error;
  }

  return ((data as GoalShareRow[] | null) ?? []).map(mapShare);
}

export async function shareGoal(goalId: string, partnerId: string): Promise<GoalShare> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('goal_shares')
    .insert({
      owner_id: userId,
      viewer_id: partnerId,
      goal_id: goalId,
    })
    .select(SHARE_COLUMNS)
    .single();

  if (error) {
    throw error;
  }

  return mapShare(data as GoalShareRow);
}

export async function unshareGoal(goalId: string, partnerId: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('goal_shares')
    .delete()
    .eq('owner_id', userId)
    .eq('viewer_id', partnerId)
    .eq('goal_id', goalId);

  if (error) {
    throw error;
  }
}

export async function getGoalsSharedWithMe(partnerId: string): Promise<SharedGoals> {
  const userId = await requireUserId();
  const { data: shareData, error: shareError } = await supabase
    .from('goal_shares')
    .select('goal_id')
    .eq('owner_id', partnerId)
    .eq('viewer_id', userId);

  if (shareError) {
    throw shareError;
  }

  const rootIds = new Set(
    ((shareData as { goal_id: string }[] | null) ?? []).map((row) => row.goal_id),
  );
  if (rootIds.size === 0) {
    return { goals: [], entries: [] };
  }

  const { data: goalData, error: goalError } = await supabase
    .from(GOALS_TABLE)
    .select('*')
    .eq('user_id', partnerId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });

  if (goalError) {
    throw goalError;
  }

  const goals = treeFromRoots(
    ((goalData as GoalRow[] | null) ?? []).map(mapGoal),
    rootIds,
  );
  if (goals.length === 0) {
    return { goals: [], entries: [] };
  }

  const { data: entryData, error: entryError } = await supabase
    .from(ENTRIES_TABLE)
    .select('id, goal_id, entry_date, value, created_at')
    .eq('user_id', partnerId)
    .in(
      'goal_id',
      goals.map((goal) => goal.id),
    )
    .order('entry_date', { ascending: true });

  if (entryError) {
    throw entryError;
  }

  return {
    goals,
    entries: ((entryData as EntryRow[] | null) ?? []).map(mapEntry),
  };
}

function commentAuthorName(
  authorId: string,
  userId: string,
  connections: Connection[],
): string {
  if (authorId === userId) {
    return 'You';
  }
  const match = connections.find((connection) => connection.partnerId === authorId);
  return match?.displayName?.trim() || match?.email?.trim() || 'Workout partner';
}

function mapComment(row: CommentRow, userId: string, connections: Connection[]): GoalComment {
  return {
    id: row.id,
    goalId: row.goal_id,
    ownerId: row.owner_id,
    partnerId: row.partner_id,
    authorId: row.author_id,
    authorName: commentAuthorName(row.author_id, userId, connections),
    body: row.body ?? '',
    createdAt: row.created_at ?? '',
    mine: row.author_id === userId,
  };
}

/** Shares of one of my goals. Each viewer is a comment thread partner. */
export async function getSharesForGoal(goalId: string): Promise<GoalShare[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('goal_shares')
    .select(SHARE_COLUMNS)
    .eq('owner_id', userId)
    .eq('goal_id', goalId);

  if (error) {
    throw error;
  }

  return ((data as GoalShareRow[] | null) ?? []).map(mapShare);
}

/** One goal shared with one partner, oldest comment first. */
export async function getThread(
  goalId: string,
  ownerId: string,
  partnerId: string,
): Promise<GoalComment[]> {
  const userId = await requireUserId();
  const [{ data, error }, connections] = await Promise.all([
    supabase
      .from('goal_comments')
      .select(COMMENT_COLUMNS)
      .eq('goal_id', goalId)
      .eq('owner_id', ownerId)
      .eq('partner_id', partnerId)
      .order('created_at', { ascending: true }),
    getMyConnections(),
  ]);

  if (error) {
    throw error;
  }

  return ((data as CommentRow[] | null) ?? []).map((row) =>
    mapComment(row, userId, connections),
  );
}

export async function postComment(
  goalId: string,
  ownerId: string,
  partnerId: string,
  body: string,
): Promise<GoalComment> {
  const userId = await requireUserId();
  const trimmed = body.trim();
  if (trimmed.length < 1 || trimmed.length > 1000) {
    throw new Error('Comment must be 1–1000 characters.');
  }

  const { data, error } = await supabase
    .from('goal_comments')
    .insert({
      goal_id: goalId,
      owner_id: ownerId,
      partner_id: partnerId,
      author_id: userId,
      body: trimmed,
    })
    .select(COMMENT_COLUMNS)
    .single();

  if (error) {
    throw error;
  }

  return mapComment(data as CommentRow, userId, []);
}

export async function deleteComment(id: string): Promise<void> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('goal_comments')
    .delete()
    .eq('id', id)
    .eq('author_id', userId)
    .select('id');

  if (error) {
    throw error;
  }
  if (!data || data.length === 0) {
    throw new Error('You can only delete your own comments.');
  }
}

export async function reportComment(id: string, reason?: string): Promise<void> {
  const userId = await requireUserId();
  const trimmed = reason?.trim() ?? '';
  const { error } = await supabase.from('comment_reports').insert({
    comment_id: id,
    reporter_id: userId,
    reason: trimmed.length > 0 ? trimmed : null,
  });

  if (error) {
    throw error;
  }
}
