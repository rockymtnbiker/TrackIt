import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { sendSafetyAlert } from '../_shared/safetyAlert.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RATE_LIMIT = 10;
const MODERATION_TIMEOUT_MS = 5000;
const ACCOUNT_LINK_WAIT_MS = 7 * 24 * 60 * 60 * 1000;
const ERROR_ALERT_GAP_MS = 60 * 60 * 1000;
const ERROR_REASON = 'moderation_unavailable';

const CONTACT_BLOCKED =
  "To keep everyone safe, contact info and links can't be shared in this group.";
const NEW_ACCOUNT_LINKS = 'Links can be shared after your account is a week old.';
const KIND_BLOCKED = "This message can't be sent. Keep it kind and respectful.";
const CHAT_TROUBLE = 'Chat is having trouble right now. Try again in a bit.';
const BANNED = "You can't send messages right now.";
const ADMINS_ONLY = 'Only admins can post in this group right now.';
const GUIDELINES = 'Agree to the community guidelines before you post.';

type ModerationResult =
  | { allow: true; body: string }
  | { allow: false; error: string; status: number }
  | { allow: false; support: true };

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function hasPhone(text: string): boolean {
  if (/(?:\+?\d{1,3}[\s.-]?)?\(\d{3}\)[\s.-]?\d{3}[\s.-]?\d{4}/.test(text)) {
    return true;
  }
  if (/\b\d{3}[\s.-]\d{3}[\s.-]\d{4}\b/.test(text)) {
    return true;
  }
  return /\b\d{10,11}\b/.test(text);
}

function hasEmail(text: string): boolean {
  return /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text);
}

function hasLink(text: string): boolean {
  if (/\bhttps?:\/\/\S+/i.test(text) || /\bwww\.\S+/i.test(text)) {
    return true;
  }
  return /\b[a-z0-9][a-z0-9-]{1,62}\.(?:com|net|org|io|co|app|dev|me|gg|tv|info|biz|us|uk|ca|edu|gov)\b/i.test(
    text,
  );
}

function hasHandle(text: string): boolean {
  const withoutEmail = text.replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, ' ');
  return /(^|[^\w@])@[a-z0-9_]{2,30}\b/i.test(withoutEmail);
}

function hasStreet(text: string): boolean {
  return /\b\d{1,6}\s+(?:[a-z0-9.'-]+\s+){1,5}(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|place|pl|terrace|ter|way)\b/i.test(
    text,
  );
}

function hasContactInfo(text: string): boolean {
  return hasPhone(text) || hasEmail(text) || hasLink(text) || hasHandle(text) || hasStreet(text);
}

function needsContactBlock(age: string | null | undefined): boolean {
  const value = (age ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ');
  if (!value) {
    return true;
  }
  if (value === 'under 18' || value === 'under 13') {
    return true;
  }
  return value === 'prefer not' || value === 'prefer not to say';
}

const CONTACT_THRESHOLDS = [
  {
    reason: 'repeated contact-info attempts: 2 in a day',
    count: 2,
    windowMs: 24 * 60 * 60 * 1000,
    freeze: false,
  },
  {
    reason: 'repeated contact-info attempts: 3 in a week',
    count: 3,
    windowMs: 7 * 24 * 60 * 60 * 1000,
    freeze: false,
  },
  {
    reason: 'repeated contact-info attempts: 5 in a month — chat frozen',
    count: 5,
    windowMs: 30 * 24 * 60 * 60 * 1000,
    freeze: true,
  },
] as const;

async function recordContactAttempt(
  admin: SupabaseClient,
  input: { groupId: string; senderId: string; body: string },
): Promise<void> {
  const saved = await admin.from('contact_info_attempts').insert({
    sender_id: input.senderId,
    group_id: input.groupId,
    body_snapshot: input.body,
  });
  if (saved.error) {
    return;
  }

  const monthAgo = new Date(Date.now() - CONTACT_THRESHOLDS[2].windowMs).toISOString();
  const attempts = await admin
    .from('contact_info_attempts')
    .select('body_snapshot, created_at')
    .eq('sender_id', input.senderId)
    .gte('created_at', monthAgo)
    .order('created_at', { ascending: true });
  if (attempts.error || !attempts.data) {
    return;
  }

  const rows = attempts.data as { body_snapshot?: string; created_at?: string }[];
  const now = Date.now();
  for (const threshold of CONTACT_THRESHOLDS) {
    const windowStart = now - threshold.windowMs;
    const texts = rows
      .filter((row) => {
        const at = Date.parse(row.created_at ?? '');
        return Number.isFinite(at) && at >= windowStart && (row.body_snapshot ?? '').length > 0;
      })
      .map((row) => row.body_snapshot as string);
    if (texts.length < threshold.count) {
      continue;
    }
    if (threshold.freeze) {
      await admin
        .from('profiles')
        .update({ chat_banned_at: new Date().toISOString() })
        .eq('id', input.senderId)
        .is('chat_banned_at', null);
    }
    const already = await admin
      .from('moderation_flags')
      .select('id')
      .eq('sender_id', input.senderId)
      .eq('reason', threshold.reason)
      .gte('created_at', new Date(windowStart).toISOString())
      .limit(1);
    if (already.error || (already.data?.length ?? 0) > 0) {
      continue;
    }
    const flagId = await insertFlag(admin, {
      group_id: input.groupId,
      sender_id: input.senderId,
      body_snapshot: input.body,
      source: 'auto',
      reason: threshold.reason,
      categories: texts,
      urgent: true,
    });
    const [groupName, senderName] = await Promise.all([
      groupLabel(admin, input.groupId),
      senderLabel(admin, input.senderId),
    ]);
    await sendSafetyAlert({
      kind: 'urgent',
      groupName,
      senderName,
      senderId: input.senderId,
      reason: threshold.reason,
      categories: texts,
      message: texts.join('\n'),
      flagId,
    });
  }
}

async function groupLabel(admin: SupabaseClient, groupId: string): Promise<string> {
  const group = await admin.from('groups').select('name').eq('id', groupId).maybeSingle();
  const name = (group.data?.name as string | undefined)?.trim();
  return name || 'Group';
}

async function senderLabel(admin: SupabaseClient, userId: string): Promise<string> {
  const profile = await admin.from('profiles').select('display_name').eq('id', userId).maybeSingle();
  const name = (profile.data?.display_name as string | undefined)?.trim();
  return name || 'Member';
}

async function insertFlag(
  admin: SupabaseClient,
  row: {
    group_id: string;
    sender_id: string;
    body_snapshot: string;
    source: 'auto' | 'report';
    reason: string;
    categories: unknown;
    urgent: boolean;
  },
): Promise<string | null> {
  const inserted = await admin.from('moderation_flags').insert(row).select('id').maybeSingle();
  const id = inserted.data?.id;
  return typeof id === 'string' ? id : null;
}

async function alertModerationFailure(
  admin: SupabaseClient,
  input: { groupId: string; senderId: string; body: string },
): Promise<void> {
  const since = new Date(Date.now() - ERROR_ALERT_GAP_MS).toISOString();
  const recent = await admin
    .from('moderation_flags')
    .select('id')
    .eq('reason', ERROR_REASON)
    .gte('created_at', since)
    .limit(1);
  if (recent.error || (recent.data?.length ?? 0) > 0) {
    return;
  }
  const flagId = await insertFlag(admin, {
    group_id: input.groupId,
    sender_id: input.senderId,
    body_snapshot: input.body,
    source: 'auto',
    reason: ERROR_REASON,
    categories: [],
    urgent: false,
  });
  const [groupName, senderName] = await Promise.all([
    groupLabel(admin, input.groupId),
    senderLabel(admin, input.senderId),
  ]);
  await sendSafetyAlert({
    kind: 'chat error',
    groupName,
    senderName,
    senderId: input.senderId,
    reason: ERROR_REASON,
    categories: [],
    message: input.body,
    flagId,
  });
}

/**
 * Runs after the membership, length, and rate checks, and before the insert.
 * Only a clean message is returned with allow: true.
 */
async function moderateBeforeInsert(
  admin: SupabaseClient,
  input: { groupId: string; senderId: string; body: string },
): Promise<ModerationResult> {
  const { groupId, senderId, body } = input;

  const profile = await admin
    .from('profiles')
    .select('chat_banned_at, guidelines_agreed_at')
    .eq('id', senderId)
    .maybeSingle();
  if (profile.error) {
    await alertModerationFailure(admin, input);
    return { allow: false, error: CHAT_TROUBLE, status: 503 };
  }
  if (profile.data?.chat_banned_at) {
    return { allow: false, error: BANNED, status: 403 };
  }
  if (!profile.data?.guidelines_agreed_at) {
    return { allow: false, error: GUIDELINES, status: 403 };
  }

  const group = await admin
    .from('groups')
    .select('chat_admins_only')
    .eq('id', groupId)
    .maybeSingle();
  const membership = await admin
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', senderId)
    .maybeSingle();
  if (group.error || membership.error || !membership.data) {
    await alertModerationFailure(admin, input);
    return { allow: false, error: CHAT_TROUBLE, status: 503 };
  }
  if (group.data?.chat_admins_only === true && membership.data.role !== 'admin') {
    return { allow: false, error: ADMINS_ONLY, status: 403 };
  }

  const members = await admin.from('group_members').select('user_id').eq('group_id', groupId);
  let sensitive = true;
  if (!members.error && members.data) {
    const ids = members.data.map((row) => row.user_id).filter((id): id is string => typeof id === 'string');
    if (ids.length > 0) {
      const ages = await admin.from('profiles').select('age_range').in('id', ids);
      if (!ages.error) {
        sensitive = (ages.data ?? []).some((row) => needsContactBlock(row.age_range as string | null));
        if ((ages.data ?? []).length < ids.length) {
          sensitive = true;
        }
      }
    }
  }
  if (sensitive && hasContactInfo(body)) {
    await recordContactAttempt(admin, { groupId, senderId, body });
    return { allow: false, error: CONTACT_BLOCKED, status: 400 };
  }

  const account = await admin.auth.admin.getUserById(senderId);
  const createdAt = Date.parse(account.data.user?.created_at ?? '');
  if (Number.isFinite(createdAt) && Date.now() - createdAt < ACCOUNT_LINK_WAIT_MS && hasLink(body)) {
    return { allow: false, error: NEW_ACCOUNT_LINKS, status: 400 };
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    await alertModerationFailure(admin, input);
    return { allow: false, error: CHAT_TROUBLE, status: 503 };
  }

  let categories: Record<string, boolean> = {};
  let flagged = false;
  try {
    const response = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      signal: AbortSignal.timeout(MODERATION_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: body }),
    });
    if (!response.ok) {
      throw new Error('moderation');
    }
    const payload = (await response.json()) as {
      results?: { flagged?: boolean; categories?: Record<string, boolean> }[];
    };
    const result = payload.results?.[0];
    flagged = result?.flagged === true;
    categories = result?.categories ?? {};
  } catch {
    await alertModerationFailure(admin, input);
    return { allow: false, error: CHAT_TROUBLE, status: 503 };
  }

  if (!flagged) {
    return { allow: true, body };
  }

  const flaggedNames = Object.entries(categories)
    .filter(([, on]) => on)
    .map(([name]) => name);
  const sexualMinors = categories['sexual/minors'] === true;
  const selfHarm =
    categories['self-harm'] === true ||
    categories['self-harm/intent'] === true ||
    categories['self-harm/instructions'] === true;

  const reason = sexualMinors ? 'sexual/minors' : selfHarm ? 'self-harm' : 'flagged';
  const urgent = sexualMinors || selfHarm;
  const flagId = await insertFlag(admin, {
    group_id: groupId,
    sender_id: senderId,
    body_snapshot: body,
    source: 'auto',
    reason,
    categories: flaggedNames,
    urgent,
  });
  const [groupName, senderName] = await Promise.all([
    groupLabel(admin, groupId),
    senderLabel(admin, senderId),
  ]);
  await sendSafetyAlert({
    kind: sexualMinors ? 'urgent' : selfHarm ? 'urgent (self-harm)' : 'auto-flag',
    groupName,
    senderName,
    senderId,
    reason,
    categories: flaggedNames,
    message: body,
    flagId,
  });

  if (sexualMinors) {
    return { allow: false, error: KIND_BLOCKED, status: 400 };
  }
  if (selfHarm) {
    return { allow: false, support: true };
  }
  return { allow: false, error: KIND_BLOCKED, status: 400 };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: 'Group chat is not configured.' }, 500);
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.toLowerCase().startsWith('bearer ')) {
    return json({ error: 'You must be signed in.' }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(
    authHeader.slice(7).trim(),
  );
  const userId = userData.user?.id;
  if (userError || !userId) {
    return json({ error: 'You must be signed in.' }, 401);
  }

  let payload: { group_id?: unknown; body?: unknown };
  try {
    payload = (await request.json()) as { group_id?: unknown; body?: unknown };
  } catch {
    return json({ error: 'Write a message first.' }, 400);
  }

  const groupId = typeof payload.group_id === 'string' ? payload.group_id : '';
  const body = typeof payload.body === 'string' ? payload.body.trim() : '';
  if (!groupId) {
    return json({ error: 'You are not in this group.' }, 403);
  }
  if (!body) {
    return json({ error: 'Write a message first.' }, 400);
  }
  if (body.length > 1000) {
    return json({ error: 'Keep it under 1000 characters.' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const member = await admin
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();
  if (member.error) {
    return json({ error: member.error.message }, 500);
  }
  if (!member.data) {
    return json({ error: 'You are not in this group.' }, 403);
  }

  const since = new Date(Date.now() - 60_000).toISOString();
  const recent = await admin
    .from('group_messages')
    .select('id', { count: 'exact', head: true })
    .eq('sender_id', userId)
    .gte('created_at', since);
  if (recent.error) {
    return json({ error: recent.error.message }, 500);
  }
  if ((recent.count ?? 0) >= RATE_LIMIT) {
    return json({ error: "You're sending messages too fast. Try again in a moment." }, 429);
  }

  const moderated = await moderateBeforeInsert(admin, { groupId, senderId: userId, body });
  if (!moderated.allow) {
    if ('support' in moderated) {
      return json({ support: true }, 200);
    }
    return json({ error: moderated.error }, moderated.status);
  }

  const inserted = await admin
    .from('group_messages')
    .insert({
      group_id: groupId,
      sender_id: userId,
      body: moderated.body,
    })
    .select('id, group_id, sender_id, body, created_at, deleted_at')
    .single();
  if (inserted.error || !inserted.data) {
    return json({ error: inserted.error?.message ?? 'The message was not saved.' }, 500);
  }

  return json(inserted.data, 200);
});
