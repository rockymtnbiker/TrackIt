import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type DbError = { code?: string; message?: string };

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isMissingRelation(error: DbError | null): boolean {
  if (!error) {
    return false;
  }
  const message = error.message ?? '';
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    /schema cache|does not exist/i.test(message)
  );
}

function isMissingColumn(error: DbError | null): boolean {
  if (!error) {
    return false;
  }
  return error.code === '42703' || error.code === 'PGRST204';
}

async function deleteByUserId(
  admin: SupabaseClient,
  table: string,
  userId: string,
): Promise<void> {
  const { error } = await admin.from(table).delete().eq('user_id', userId);
  if (error && !isMissingRelation(error)) {
    throw new Error(error.message);
  }
}

/**
 * Deletes one user's goals, leaves first, so a RESTRICT parent_id still succeeds.
 * ON DELETE CASCADE also succeeds with this order.
 */
async function deleteGoals(
  admin: SupabaseClient,
  table: string,
  userId: string,
): Promise<void> {
  let previousCount = Number.POSITIVE_INFINITY;
  for (;;) {
    const selected = await admin.from(table).select('id, parent_id').eq('user_id', userId);
    if (selected.error) {
      if (isMissingRelation(selected.error)) {
        return;
      }
      if (isMissingColumn(selected.error)) {
        await deleteByUserId(admin, table, userId);
        return;
      }
      throw new Error(selected.error.message);
    }

    const rows = selected.data ?? [];
    if (rows.length === 0) {
      return;
    }
    if (rows.length >= previousCount) {
      throw new Error(`Could not delete ${table}.`);
    }
    previousCount = rows.length;

    const ids = new Set(rows.map((row) => row.id as string));
    const parentIds = new Set(
      rows
        .map((row) => row.parent_id as string | null)
        .filter((id): id is string => id != null && ids.has(id)),
    );
    const leaves = rows
      .map((row) => row.id as string)
      .filter((id) => !parentIds.has(id));
    const targets = leaves.length > 0 ? leaves : [...ids];

    for (let index = 0; index < targets.length; index += 100) {
      const chunk = targets.slice(index, index + 100);
      const { error } = await admin.from(table).delete().in('id', chunk);
      if (error) {
        throw new Error(error.message);
      }
    }

    if (leaves.length === 0) {
      return;
    }
  }
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
    return json({ error: 'Account deletion is not configured.' }, 500);
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.toLowerCase().startsWith('bearer ')) {
    return json({ error: 'Missing authorization.' }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(
    authHeader.slice(7).trim(),
  );
  const userId = userData.user?.id;
  if (userError || !userId) {
    return json({ error: 'Invalid session.' }, 401);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    await deleteByUserId(admin, 'goal_entries', userId);
    await deleteGoals(admin, 'goals', userId);
    await deleteByUserId(admin, 'user_settings', userId);
    await deleteByUserId(admin, 'coaching_interest', userId);
    await deleteGoals(admin, 'goals_v2', userId);
    await deleteByUserId(admin, 'habit_completions', userId);
    await deleteByUserId(admin, 'habits', userId);
    await deleteByUserId(admin, 'milestones', userId);

    const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
    if (deleteUserError) {
      throw new Error(deleteUserError.message);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not delete the account.';
    return json({ error: message }, 500);
  }

  return json({ ok: true }, 200);
});
