import { supabase } from './supabase';

export type BlockedMember = {
  userId: string;
  displayName: string;
};

export async function listBlockedMembers(): Promise<BlockedMember[]> {
  const { data, error } = await supabase.rpc('list_blocked_members');
  if (error) {
    throw error;
  }
  if (!Array.isArray(data)) {
    return [];
  }
  const members: BlockedMember[] = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const row = item as { user_id?: string; display_name?: string };
    if (!row.user_id) {
      continue;
    }
    members.push({
      userId: row.user_id,
      displayName: row.display_name?.trim() || 'Member',
    });
  }
  return members;
}

export async function blockMember(blockedId: string): Promise<void> {
  const { data, error: userError } = await supabase.auth.getUser();
  if (userError) {
    throw userError;
  }
  const userId = data.user?.id;
  if (!userId) {
    throw new Error('You must be signed in.');
  }
  const { error } = await supabase.from('user_blocks').insert({
    blocker_id: userId,
    blocked_id: blockedId,
  });
  if (error && error.code !== '23505') {
    throw error;
  }
}

export async function unblockMember(blockedId: string): Promise<void> {
  const { data, error: userError } = await supabase.auth.getUser();
  if (userError) {
    throw userError;
  }
  const userId = data.user?.id;
  if (!userId) {
    throw new Error('You must be signed in.');
  }
  const { error } = await supabase
    .from('user_blocks')
    .delete()
    .eq('blocker_id', userId)
    .eq('blocked_id', blockedId);
  if (error) {
    throw error;
  }
}
