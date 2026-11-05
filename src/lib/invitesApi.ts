import { Share } from 'react-native';
import { APP_DOWNLOAD_LINK } from '../constants/appLinks';
import { supabase } from './supabase';

export type RedeemStatus = 'ok' | 'invalid' | 'used' | 'expired' | 'self';

export type RedeemResult = {
  status: RedeemStatus;
  inviterName?: string;
};

export type PartnerInvite = {
  id: string;
  code: string;
  inviteeName: string | null;
  goalId: string | null;
  expiresAt: string;
};

type InviteRow = {
  id: string;
  code: string;
  invitee_name: string | null;
  goal_id: string | null;
  expires_at: string;
};

const REDEEM_STATUSES: RedeemStatus[] = ['ok', 'invalid', 'used', 'expired', 'self'];

/** Uppercase, and insert the dash when the code was typed without one. */
export function normalizeInviteCode(raw: string): string {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  if (compact.length <= 3) {
    return compact;
  }
  return `${compact.slice(0, 3)}-${compact.slice(3)}`;
}

export function inviteShareMessage(input: {
  name: string;
  goalTitle: string | null;
  code: string;
}): string {
  const name = input.name.trim();
  const greeting = name ? `Hey ${name}, ` : 'Hey, ';
  const goalTitle = input.goalTitle?.trim() ?? '';
  const working = goalTitle
    ? `I'm working on a goal (${goalTitle}) and I'd love for you to be my accountability partner. You'd see my progress and can cheer me on.`
    : "I'm working on some goals and I'd love for you to be my accountability partner.";
  const link = APP_DOWNLOAD_LINK.trim();
  const download = link
    ? `Get TrackIt here: ${link}.`
    : "I'll send you the link to get the app.";
  return `${greeting}${working} ${download} After you sign up, go to Connect → Have an invite code? and enter ${input.code}.`;
}

export async function sharePartnerInvite(input: {
  name: string;
  goalTitle: string | null;
  code: string;
}): Promise<void> {
  try {
    await Share.share({ message: inviteShareMessage(input) });
  } catch {
    // The share sheet was dismissed.
  }
}

export async function createPartnerInvite(
  name: string,
  goalId?: string | null,
): Promise<string> {
  const { data, error } = await supabase.rpc('create_partner_invite', {
    p_name: name.trim(),
    p_goal_id: goalId ?? null,
  });
  if (error) {
    throw error;
  }
  if (typeof data !== 'string' || !data.trim()) {
    throw new Error('Could not create an invite code.');
  }
  return data.trim();
}

export async function redeemPartnerInvite(code: string): Promise<RedeemResult> {
  const { data, error } = await supabase.rpc('redeem_partner_invite', {
    p_code: normalizeInviteCode(code),
  });
  if (error) {
    throw error;
  }
  const payload = typeof data === 'string' ? JSON.parse(data) : data;
  const row = (payload ?? {}) as { status?: string; inviter_name?: string | null };
  const status = REDEEM_STATUSES.find((value) => value === row.status) ?? 'invalid';
  const inviterName = row.inviter_name?.trim();
  return inviterName ? { status, inviterName } : { status };
}

export async function listMyPendingInvites(): Promise<PartnerInvite[]> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('partner_invites')
    .select('id, code, invitee_name, goal_id, expires_at')
    .eq('status', 'pending')
    .gt('expires_at', now)
    .order('created_at', { ascending: false });
  if (error) {
    throw error;
  }
  return ((data as InviteRow[] | null) ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    inviteeName: row.invitee_name?.trim() || null,
    goalId: row.goal_id,
    expiresAt: row.expires_at,
  }));
}

export async function cancelInvite(id: string): Promise<void> {
  const { error } = await supabase
    .from('partner_invites')
    .update({ status: 'cancelled' })
    .eq('id', id);
  if (error) {
    throw error;
  }
}
