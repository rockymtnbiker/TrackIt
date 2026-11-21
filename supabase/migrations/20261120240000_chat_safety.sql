-- Chat safety. Run this in Supabase with slice 6 before using reports, blocks, or deletes.
-- Safe to re-run. App users cannot read or write moderation_flags.

alter table public.groups
  add column if not exists chat_admins_only boolean not null default false;

alter table public.profiles
  add column if not exists chat_banned_at timestamptz,
  add column if not exists guidelines_agreed_at timestamptz;

-- A signed-in user can update their own profile, but not their ban.
create or replace function public.keep_chat_banned_at()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    new.chat_banned_at := old.chat_banned_at;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_keep_chat_banned_at on public.profiles;
create trigger profiles_keep_chat_banned_at
  before update on public.profiles
  for each row
  execute function public.keep_chat_banned_at();

create table if not exists public.moderation_flags (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  message_id uuid references public.group_messages (id) on delete set null,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body_snapshot text not null,
  source text not null,
  reason text not null,
  categories jsonb not null default '[]'::jsonb,
  reporter_id uuid references auth.users (id) on delete set null,
  urgent boolean not null default false,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  constraint moderation_flags_source check (source in ('auto', 'report')),
  constraint moderation_flags_status check (status in ('open', 'resolved')),
  constraint moderation_flags_body_len check (char_length(body_snapshot) between 1 and 1000)
);

create index if not exists moderation_flags_created_idx
  on public.moderation_flags (created_at desc);

create index if not exists moderation_flags_open_idx
  on public.moderation_flags (status, created_at desc);

alter table public.moderation_flags enable row level security;

revoke all on public.moderation_flags from public, anon, authenticated;

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

alter table public.user_blocks enable row level security;

revoke all on public.user_blocks from public, anon, authenticated;
grant select, insert, delete on public.user_blocks to authenticated;

drop policy if exists user_blocks_select_own on public.user_blocks;
create policy user_blocks_select_own
  on public.user_blocks
  for select
  to authenticated
  using (blocker_id = auth.uid());

drop policy if exists user_blocks_insert_own on public.user_blocks;
create policy user_blocks_insert_own
  on public.user_blocks
  for insert
  to authenticated
  with check (blocker_id = auth.uid() and blocked_id <> auth.uid());

drop policy if exists user_blocks_delete_own on public.user_blocks;
create policy user_blocks_delete_own
  on public.user_blocks
  for delete
  to authenticated
  using (blocker_id = auth.uid());

-- Deleted messages stay in the thread. The delete function clears the body first.
drop policy if exists group_messages_select_member on public.group_messages;
create policy group_messages_select_member
  on public.group_messages
  for select
  to authenticated
  using (public.is_group_member(group_id));

create or replace function public.delete_group_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message public.group_messages%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  select * into v_message
  from public.group_messages
  where id = p_message_id;
  if v_message.id is null then
    raise exception 'That message is no longer available.';
  end if;
  if not public.is_group_member(v_message.group_id) then
    raise exception 'You are not in this group.';
  end if;
  if v_message.sender_id is distinct from auth.uid() and not public.is_group_admin(v_message.group_id) then
    raise exception 'You can only delete your own messages.';
  end if;
  if v_message.deleted_at is not null then
    return;
  end if;
  update public.group_messages
  set
    deleted_at = now(),
    deleted_by = auth.uid(),
    body = 'Message deleted'
  where id = p_message_id;
  delete from public.message_reactions
  where message_id = p_message_id;
end;
$$;

revoke all on function public.delete_group_message(uuid) from public, anon;
grant execute on function public.delete_group_message(uuid) to authenticated;

create or replace function public.agree_to_community_guidelines()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  update public.profiles
  set guidelines_agreed_at = coalesce(guidelines_agreed_at, now())
  where id = auth.uid()
  returning guidelines_agreed_at into v_at;
  if v_at is null then
    raise exception 'You must be signed in.';
  end if;
  return v_at;
end;
$$;

revoke all on function public.agree_to_community_guidelines() from public, anon;
grant execute on function public.agree_to_community_guidelines() to authenticated;

create or replace function public.list_blocked_members()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', b.blocked_id,
        'display_name', coalesce(nullif(btrim(p.display_name), ''), 'Member'),
        'created_at', b.created_at
      )
      order by b.created_at desc
    ),
    '[]'::jsonb
  )
  from public.user_blocks b
  left join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid();
$$;

revoke all on function public.list_blocked_members() from public, anon;
grant execute on function public.list_blocked_members() to authenticated;

create or replace function public.set_chat_admins_only(p_group_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if not public.is_group_admin(p_group_id) then
    raise exception 'Only an admin can do that.';
  end if;
  update public.groups
  set chat_admins_only = coalesce(p_on, false)
  where id = p_group_id;
end;
$$;

revoke all on function public.set_chat_admins_only(uuid, boolean) from public, anon;
grant execute on function public.set_chat_admins_only(uuid, boolean) to authenticated;

create or replace function public.get_group(p_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_group public.groups%rowtype;
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  select role into v_role
  from public.group_members
  where group_id = p_group_id and user_id = auth.uid();
  if v_role is null then
    raise exception 'You are not in this group.';
  end if;
  select * into v_group from public.groups where id = p_group_id;
  select count(*)::int into v_count
  from public.group_members
  where group_id = p_group_id;
  return jsonb_build_object(
    'id', v_group.id,
    'name', v_group.name,
    'description', v_group.description,
    'everyone_admin', v_group.everyone_admin,
    'show_member_progress', v_group.show_member_progress,
    'chat_admins_only', v_group.chat_admins_only,
    'invite_code', case when v_role = 'admin' then v_group.invite_code else null end,
    'role', v_role,
    'member_count', v_count
  );
end;
$$;
