import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendSafetyAlert } from '../_shared/safetyAlert.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const REPORT_REASONS = [
  'Harassment or bullying',
  'Inappropriate content',
  'Spam',
  'Makes me feel unsafe',
  'Other',
] as const;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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

  let payload: { message_id?: unknown; reason?: unknown };
  try {
    payload = (await request.json()) as { message_id?: unknown; reason?: unknown };
  } catch {
    return json({ error: 'The report was not saved.' }, 400);
  }

  const messageId = typeof payload.message_id === 'string' ? payload.message_id : '';
  const reason = typeof payload.reason === 'string' ? payload.reason : '';
  if (!messageId || !(REPORT_REASONS as readonly string[]).includes(reason)) {
    return json({ error: 'The report was not saved.' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const message = await admin
    .from('group_messages')
    .select('id, group_id, sender_id, body, deleted_at')
    .eq('id', messageId)
    .maybeSingle();
  if (message.error || !message.data || message.data.deleted_at) {
    return json({ error: 'That message is no longer available.' }, 404);
  }
  if (message.data.sender_id === userId) {
    return json({ error: 'You can report someone else\'s message.' }, 400);
  }

  const member = await admin
    .from('group_members')
    .select('user_id')
    .eq('group_id', message.data.group_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (member.error || !member.data) {
    return json({ error: 'You are not in this group.' }, 403);
  }

  const inserted = await admin
    .from('moderation_flags')
    .insert({
      group_id: message.data.group_id,
      message_id: message.data.id,
      sender_id: message.data.sender_id,
      body_snapshot: message.data.body,
      source: 'report',
      reason,
      categories: [],
      reporter_id: userId,
      urgent: false,
      status: 'open',
    })
    .select('id')
    .maybeSingle();
  if (inserted.error || !inserted.data?.id) {
    return json({ error: 'The report was not saved.' }, 500);
  }

  const group = await admin.from('groups').select('name').eq('id', message.data.group_id).maybeSingle();
  const sender = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', message.data.sender_id)
    .maybeSingle();
  const groupName = (group.data?.name as string | undefined)?.trim() || 'Group';
  const senderName = (sender.data?.display_name as string | undefined)?.trim() || 'Member';

  await sendSafetyAlert({
    kind: 'new report',
    groupName,
    senderName,
    senderId: message.data.sender_id,
    reason,
    categories: [],
    message: message.data.body,
    flagId: inserted.data.id,
  });

  return json({ ok: true }, 200);
});
