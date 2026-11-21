import { Share } from 'react-native';
import { APP_DOWNLOAD_LINK } from '../constants/appLinks';
import { todayLocal } from './localDate';
import { supabase } from './supabase';

export const GROUP_BAD_CODE = "That code didn't work. Check it and try again.";
export const GROUP_LAST_ADMIN = 'Make someone else an admin before you leave.';
export const GROUP_UNDER_13 = 'Groups are for ages 13 and up.';

export type MyGroup = {
  id: string;
  name: string;
  memberCount: number;
};

export type GroupRole = 'admin' | 'member';

export type GroupDetail = {
  id: string;
  name: string;
  description: string | null;
  everyoneAdmin: boolean;
  showMemberProgress: boolean;
  inviteCode: string | null;
  role: GroupRole;
  memberCount: number;
};

export type GroupProgressMember = {
  userId: string;
  displayName: string;
  progress: number;
  target: number | null;
  pct: number;
};

export type GroupGoalProgress = {
  groupGoalId: string;
  collectivePct: number;
  tracking: number;
  hit: number;
  members: GroupProgressMember[] | null;
};

export type GroupWeekProgress = {
  showMemberProgress: boolean;
  overallPct: number;
  activeMembers: number;
  goals: GroupGoalProgress[];
};

export type GroupMember = {
  userId: string;
  displayName: string;
  role: GroupRole;
  joinedAt: string;
};

export type GroupPreview = {
  groupId: string;
  name: string;
  memberCount: number;
  alreadyMember: boolean;
};

export type CreatedGroup = {
  id: string;
  name: string;
  description: string | null;
  inviteCode: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asRole(value: unknown): GroupRole {
  return value === 'admin' ? 'admin' : 'member';
}

function asCount(value: unknown): number {
  const count = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(count) ? count : 0;
}

export function groupErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message
  ) {
    return error.message;
  }
  return fallback;
}

export function groupShareMessage(name: string, code: string): string {
  const message = `Join my group ${name} on TrackIt with code ${code}.`;
  const link = APP_DOWNLOAD_LINK.trim();
  return link ? `${message} ${link}` : message;
}

export async function shareGroupInvite(name: string, code: string): Promise<void> {
  try {
    await Share.share({ message: groupShareMessage(name, code) });
  } catch {
    // The share sheet was dismissed.
  }
}

export async function listMyGroups(): Promise<MyGroup[]> {
  const { data, error } = await supabase.rpc('list_my_groups');
  if (error) {
    throw error;
  }
  if (!Array.isArray(data)) {
    return [];
  }
  const groups: MyGroup[] = [];
  for (const item of data) {
    const row = asRecord(item);
    if (!row || typeof row.id !== 'string' || typeof row.name !== 'string') {
      continue;
    }
    groups.push({ id: row.id, name: row.name, memberCount: asCount(row.member_count) });
  }
  return groups;
}

export async function getGroup(groupId: string): Promise<GroupDetail> {
  const { data, error } = await supabase.rpc('get_group', { p_group_id: groupId });
  if (error) {
    throw error;
  }
  const row = asRecord(data);
  if (!row || typeof row.id !== 'string' || typeof row.name !== 'string') {
    throw new Error('You are not in this group.');
  }
  return {
    id: row.id,
    name: row.name,
    description: typeof row.description === 'string' ? row.description : null,
    everyoneAdmin: row.everyone_admin === true,
    showMemberProgress: row.show_member_progress === true,
    inviteCode: typeof row.invite_code === 'string' ? row.invite_code : null,
    role: asRole(row.role),
    memberCount: asCount(row.member_count),
  };
}

export async function listGroupMembers(groupId: string): Promise<GroupMember[]> {
  const { data, error } = await supabase.rpc('list_group_members', { p_group_id: groupId });
  if (error) {
    throw error;
  }
  if (!Array.isArray(data)) {
    return [];
  }
  const members: GroupMember[] = [];
  for (const item of data) {
    const row = asRecord(item);
    if (!row || typeof row.user_id !== 'string') {
      continue;
    }
    members.push({
      userId: row.user_id,
      displayName: typeof row.display_name === 'string' && row.display_name.trim()
        ? row.display_name
        : 'Member',
      role: asRole(row.role),
      joinedAt: typeof row.joined_at === 'string' ? row.joined_at : '',
    });
  }
  return members;
}

export async function createGroup(name: string, description: string): Promise<CreatedGroup> {
  const { data, error } = await supabase.rpc('create_group', {
    p_name: name,
    p_description: description,
  });
  if (error) {
    throw error;
  }
  const row = asRecord(data);
  if (!row || typeof row.id !== 'string' || typeof row.invite_code !== 'string') {
    throw new Error('Could not create the group.');
  }
  return {
    id: row.id,
    name: typeof row.name === 'string' ? row.name : name.trim(),
    description: typeof row.description === 'string' ? row.description : null,
    inviteCode: row.invite_code,
  };
}

export async function previewGroupCode(code: string): Promise<GroupPreview> {
  return lookupGroupCode(code, false);
}

export async function joinGroupByCode(code: string): Promise<GroupPreview> {
  return lookupGroupCode(code, true);
}

async function lookupGroupCode(code: string, join: boolean): Promise<GroupPreview> {
  const { data, error } = await supabase.rpc('join_group_by_code', {
    p_code: code,
    p_join: join,
  });
  if (error) {
    throw error;
  }
  const row = asRecord(data);
  if (!row || typeof row.group_id !== 'string' || typeof row.name !== 'string') {
    throw new Error(GROUP_BAD_CODE);
  }
  return {
    groupId: row.group_id,
    name: row.name,
    memberCount: asCount(row.member_count),
    alreadyMember: row.already_member === true,
  };
}

export async function leaveGroup(groupId: string, keepCopies = true): Promise<boolean> {
  const { data, error } = await supabase.rpc('leave_group', {
    p_group_id: groupId,
    p_keep_copies: keepCopies,
  });
  if (error) {
    throw error;
  }
  const row = asRecord(data);
  return row?.deleted === true;
}

export async function setMemberRole(
  groupId: string,
  userId: string,
  role: GroupRole,
): Promise<void> {
  const { error } = await supabase.rpc('set_member_role', {
    p_group_id: groupId,
    p_user_id: userId,
    p_role: role,
  });
  if (error) {
    throw error;
  }
}

export async function removeMember(groupId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_member', {
    p_group_id: groupId,
    p_user_id: userId,
  });
  if (error) {
    throw error;
  }
}

export async function resetInviteCode(groupId: string): Promise<string> {
  const { data, error } = await supabase.rpc('reset_invite_code', { p_group_id: groupId });
  if (error) {
    throw error;
  }
  if (typeof data !== 'string' || !data.trim()) {
    throw new Error('Could not reset the invite code.');
  }
  return data;
}

export async function renameGroup(groupId: string, name: string): Promise<string> {
  const { data, error } = await supabase.rpc('rename_group', {
    p_group_id: groupId,
    p_name: name,
  });
  if (error) {
    throw error;
  }
  if (typeof data !== 'string' || !data.trim()) {
    throw new Error('Could not rename the group.');
  }
  return data;
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return 0;
}

function parseProgressMember(value: unknown): GroupProgressMember | null {
  const row = asRecord(value);
  if (!row || typeof row.user_id !== 'string') {
    return null;
  }
  const name = typeof row.display_name === 'string' ? row.display_name.trim() : '';
  return {
    userId: row.user_id,
    displayName: name || 'Member',
    progress: asNumber(row.progress),
    target: row.target == null ? null : asNumber(row.target),
    pct: Math.round(asNumber(row.pct)),
  };
}

export async function getGroupProgress(groupId: string, weekStart: string): Promise<GroupWeekProgress> {
  const { data, error } = await supabase.rpc('get_group_progress', {
    p_group_id: groupId,
    p_week_start: weekStart,
  });
  if (error) {
    throw error;
  }
  const row = asRecord(data);
  const goals: GroupGoalProgress[] = [];
  if (row && Array.isArray(row.goals)) {
    for (const item of row.goals) {
      const goal = asRecord(item);
      if (!goal || typeof goal.group_goal_id !== 'string') {
        continue;
      }
      const members = Array.isArray(goal.members)
        ? goal.members
            .map(parseProgressMember)
            .filter((member): member is GroupProgressMember => member != null)
        : null;
      goals.push({
        groupGoalId: goal.group_goal_id,
        collectivePct: Math.round(asNumber(goal.collective_pct)),
        tracking: asCount(goal.tracking),
        hit: asCount(goal.hit),
        members,
      });
    }
  }
  return {
    showMemberProgress: row?.show_member_progress === true,
    overallPct: Math.round(asNumber(row?.overall_pct)),
    activeMembers: asCount(row?.active_members),
    goals,
  };
}

export async function setShowMemberProgress(groupId: string, on: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_show_member_progress', {
    p_group_id: groupId,
    p_on: on,
  });
  if (error) {
    throw error;
  }
}

export async function setEveryoneAdmin(groupId: string, on: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_everyone_admin', {
    p_group_id: groupId,
    p_on: on,
  });
  if (error) {
    throw error;
  }
}

export async function deleteGroup(groupId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_group', { p_group_id: groupId });
  if (error) {
    throw error;
  }
}

export type GroupGoalShare = {
  goalId: string;
  ownerId: string;
  groupId: string;
};

export async function listGroupGoalShares(groupId: string): Promise<GroupGoalShare[]> {
  const { data, error } = await supabase
    .from('group_goal_shares')
    .select('goal_id, owner_id, group_id')
    .eq('group_id', groupId);

  if (error) {
    throw error;
  }

  const shares: GroupGoalShare[] = [];
  for (const item of (data ?? []) as { goal_id?: string; owner_id?: string; group_id?: string }[]) {
    if (!item.goal_id || !item.owner_id || !item.group_id) {
      continue;
    }
    shares.push({ goalId: item.goal_id, ownerId: item.owner_id, groupId: item.group_id });
  }
  return shares;
}

export async function listGroupsSharingGoal(goalId: string): Promise<string[]> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) {
    throw new Error('You must be signed in.');
  }
  const { data, error } = await supabase
    .from('group_goal_shares')
    .select('group_id')
    .eq('goal_id', goalId)
    .eq('owner_id', userId);

  if (error) {
    throw error;
  }

  return ((data ?? []) as { group_id?: string }[])
    .map((row) => row.group_id)
    .filter((id): id is string => typeof id === 'string');
}

export async function shareGoalWithGroup(goalId: string, groupId: string): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) {
    throw new Error('You must be signed in.');
  }
  const { error } = await supabase.from('group_goal_shares').insert({
    goal_id: goalId,
    owner_id: userId,
    group_id: groupId,
  });
  if (error) {
    throw error;
  }
}

export type GroupGoalInput = {
  title: string;
  why: string | null;
  unit: string | null;
  targetAmount: number | null;
  repeatPeriod: 'week' | 'month' | null;
  plannedDays: number[] | null;
  timesPerDay: number;
  targetEndDate: string | null;
};

export type GroupGoalTemplate = GroupGoalInput & {
  id: string;
  groupId: string;
};

export type GroupGoalLabel = {
  groupId: string;
  name: string;
};

type GroupGoalRow = {
  id?: string;
  group_id?: string;
  title?: string;
  why?: string | null;
  unit?: string | null;
  target_amount?: number | string | null;
  repeat_period?: string | null;
  planned_days?: number[] | null;
  times_per_day?: number | string | null;
  target_end_date?: string | null;
};

function amountOrNull(value: number | string | null | undefined): number | null {
  if (value == null || value === '') {
    return null;
  }
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function mapGroupGoal(row: GroupGoalRow): GroupGoalTemplate | null {
  if (!row.id || !row.group_id || !row.title) {
    return null;
  }
  const period = row.repeat_period === 'week' || row.repeat_period === 'month' ? row.repeat_period : null;
  const times = amountOrNull(row.times_per_day);
  return {
    id: row.id,
    groupId: row.group_id,
    title: row.title,
    why: row.why?.trim() ? row.why.trim() : null,
    unit: row.unit?.trim() ? row.unit.trim() : null,
    targetAmount: amountOrNull(row.target_amount),
    repeatPeriod: period,
    plannedDays: period ? (row.planned_days ?? []) : null,
    timesPerDay: times == null ? 1 : Math.min(12, Math.max(1, Math.round(times))),
    targetEndDate: row.target_end_date?.slice(0, 10) ?? null,
  };
}

function groupGoalArgs(input: GroupGoalInput) {
  return {
    p_title: input.title,
    p_why: input.why,
    p_unit: input.unit,
    p_target_amount: input.targetAmount,
    p_repeat_period: input.repeatPeriod,
    p_planned_days: input.plannedDays,
    p_times_per_day: input.timesPerDay,
    p_target_end_date: input.targetEndDate,
  };
}

export async function listGroupGoals(groupId: string): Promise<GroupGoalTemplate[]> {
  const { data, error } = await supabase
    .from('group_goals')
    .select(
      'id, group_id, title, why, unit, target_amount, repeat_period, planned_days, times_per_day, target_end_date',
    )
    .eq('group_id', groupId)
    .is('archived_at', null)
    .order('created_at', { ascending: true });
  if (error) {
    throw error;
  }
  const goals: GroupGoalTemplate[] = [];
  for (const row of (data ?? []) as GroupGoalRow[]) {
    const goal = mapGroupGoal(row);
    if (goal) {
      goals.push(goal);
    }
  }
  return goals;
}

export async function createGroupGoal(groupId: string, input: GroupGoalInput): Promise<void> {
  const { error } = await supabase.rpc('create_group_goal', {
    p_group_id: groupId,
    ...groupGoalArgs(input),
    p_connected_on: todayLocal(),
  });
  if (error) {
    throw error;
  }
}

export async function updateGroupGoal(groupGoalId: string, input: GroupGoalInput): Promise<void> {
  const { error } = await supabase.rpc('update_group_goal', {
    p_group_goal_id: groupGoalId,
    ...groupGoalArgs(input),
  });
  if (error) {
    throw error;
  }
}

export async function archiveGroupGoal(groupGoalId: string): Promise<void> {
  const { error } = await supabase.rpc('archive_group_goal', { p_group_goal_id: groupGoalId });
  if (error) {
    throw error;
  }
}

export async function connectGoalToGroupGoal(personalGoalId: string, groupGoalId: string): Promise<void> {
  const { error } = await supabase.rpc('connect_goal_to_group_goal', {
    p_personal_goal_id: personalGoalId,
    p_group_goal_id: groupGoalId,
    p_connected_on: todayLocal(),
  });
  if (error) {
    throw error;
  }
}

export async function disconnectGoal(goalId: string): Promise<void> {
  const { error } = await supabase.rpc('disconnect_goal', { p_goal_id: goalId });
  if (error) {
    throw error;
  }
}

export async function addGroupGoalToMyGoals(groupGoalId: string): Promise<void> {
  const { error } = await supabase.rpc('add_group_goal_to_my_goals', {
    p_group_goal_id: groupGoalId,
    p_connected_on: todayLocal(),
  });
  if (error) {
    throw error;
  }
}

export async function countMyGroupCopies(groupId: string): Promise<number> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) {
    return 0;
  }
  const templates = await listGroupGoals(groupId);
  const ids = templates.map((goal) => goal.id);
  if (ids.length === 0) {
    return 0;
  }
  const { data, error } = await supabase
    .from('goals')
    .select('group_link')
    .eq('user_id', userId)
    .in('group_goal_id', ids)
    .is('deleted_at', null);
  if (error) {
    throw error;
  }
  return ((data ?? []) as { group_link?: string | null }[]).filter((row) => row.group_link !== 'connected')
    .length;
}

export async function listMyLinkedGroupGoalIds(): Promise<Set<string>> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  const linked = new Set<string>();
  if (!userId) {
    return linked;
  }
  const { data, error } = await supabase
    .from('goals')
    .select('group_goal_id')
    .eq('user_id', userId)
    .not('group_goal_id', 'is', null)
    .is('deleted_at', null);
  if (error) {
    throw error;
  }
  for (const row of (data ?? []) as { group_goal_id?: string | null }[]) {
    if (row.group_goal_id) {
      linked.add(row.group_goal_id);
    }
  }
  return linked;
}

export async function loadGroupGoalLabels(ids: string[]): Promise<Map<string, GroupGoalLabel>> {
  const labels = new Map<string, GroupGoalLabel>();
  if (ids.length === 0) {
    return labels;
  }
  const { data, error } = await supabase
    .from('group_goals')
    .select('id, group_id')
    .in('id', ids);
  if (error || !data) {
    return labels;
  }
  const rows = (data as { id?: string; group_id?: string }[]).filter(
    (row): row is { id: string; group_id: string } => Boolean(row.id && row.group_id),
  );
  const groupIds = [...new Set(rows.map((row) => row.group_id))];
  if (groupIds.length === 0) {
    return labels;
  }
  const groups = await supabase.from('groups').select('id, name').in('id', groupIds);
  if (groups.error || !groups.data) {
    return labels;
  }
  const names = new Map(
    (groups.data as { id?: string; name?: string }[])
      .filter((row): row is { id: string; name: string } => Boolean(row.id && row.name))
      .map((row) => [row.id, row.name]),
  );
  for (const row of rows) {
    const name = names.get(row.group_id);
    if (name) {
      labels.set(row.id, { groupId: row.group_id, name });
    }
  }
  return labels;
}

export async function unshareGoalWithGroup(goalId: string, groupId: string): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) {
    throw new Error('You must be signed in.');
  }
  const { error } = await supabase
    .from('group_goal_shares')
    .delete()
    .eq('goal_id', goalId)
    .eq('owner_id', userId)
    .eq('group_id', groupId);
  if (error) {
    throw error;
  }
}
