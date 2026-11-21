-- Group chat. Run this in Supabase before using the Chat tab.
-- Safe to re-run. Sending is not allowed from the app; send-group-message inserts.

create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id),
  constraint group_messages_body_len check (char_length(btrim(body)) between 1 and 1000)
);

create index if not exists group_messages_group_created_idx
  on public.group_messages (group_id, created_at desc);

create index if not exists group_messages_sender_created_idx
  on public.group_messages (sender_id, created_at desc);

create table if not exists public.message_reactions (
  message_id uuid not null references public.group_messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  emoji text not null,
  primary key (message_id, user_id, emoji),
  constraint message_reactions_emoji check (emoji in ('👏', '🔥', '💪', '❤️', '😂'))
);

create index if not exists message_reactions_message_idx
  on public.message_reactions (message_id);

create table if not exists public.group_reads (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.group_messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.group_reads enable row level security;

revoke all on public.group_messages from public, anon, authenticated;
revoke all on public.message_reactions from public, anon, authenticated;
revoke all on public.group_reads from public, anon, authenticated;

grant select on public.group_messages to authenticated;
grant select, insert, delete on public.message_reactions to authenticated;
grant select, insert, update on public.group_reads to authenticated;

-- Members can read live messages. A deleted row drops out of this policy,
-- so Realtime delivers it as a removal and the body is never readable.
drop policy if exists group_messages_select_member on public.group_messages;
create policy group_messages_select_member
  on public.group_messages
  for select
  to authenticated
  using (deleted_at is null and public.is_group_member(group_id));

drop policy if exists message_reactions_select_member on public.message_reactions;
create policy message_reactions_select_member
  on public.message_reactions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.group_messages m
      where m.id = message_id
        and m.deleted_at is null
        and public.is_group_member(m.group_id)
    )
  );

drop policy if exists message_reactions_insert_own on public.message_reactions;
create policy message_reactions_insert_own
  on public.message_reactions
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.group_messages m
      where m.id = message_id
        and m.deleted_at is null
        and public.is_group_member(m.group_id)
    )
  );

drop policy if exists message_reactions_delete_own on public.message_reactions;
create policy message_reactions_delete_own
  on public.message_reactions
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.group_messages m
      where m.id = message_id
        and public.is_group_member(m.group_id)
    )
  );

drop policy if exists group_reads_select_own on public.group_reads;
create policy group_reads_select_own
  on public.group_reads
  for select
  to authenticated
  using (user_id = auth.uid() and public.is_group_member(group_id));

drop policy if exists group_reads_insert_own on public.group_reads;
create policy group_reads_insert_own
  on public.group_reads
  for insert
  to authenticated
  with check (user_id = auth.uid() and public.is_group_member(group_id));

drop policy if exists group_reads_update_own on public.group_reads;
create policy group_reads_update_own
  on public.group_reads
  for update
  to authenticated
  using (user_id = auth.uid() and public.is_group_member(group_id))
  with check (user_id = auth.uid() and public.is_group_member(group_id));

-- Server clock, so a message's created_at and last_read_at compare the same way.
create or replace function public.mark_group_read(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if not public.is_group_member(p_group_id) then
    raise exception 'You are not in this group.';
  end if;
  insert into public.group_reads (group_id, user_id, last_read_at)
  values (p_group_id, auth.uid(), now())
  on conflict (group_id, user_id)
  do update set last_read_at = excluded.last_read_at;
end;
$$;

revoke all on function public.mark_group_read(uuid) from public, anon;
grant execute on function public.mark_group_read(uuid) to authenticated;

create or replace function public.group_unread_count(p_group_id uuid)
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::int
  from public.group_messages m
  where m.group_id = p_group_id
    and m.deleted_at is null
    and m.sender_id is distinct from auth.uid()
    and m.created_at > coalesce(
      (
        select r.last_read_at
        from public.group_reads r
        where r.group_id = p_group_id
          and r.user_id = auth.uid()
      ),
      '-infinity'::timestamptz
    );
$$;

revoke all on function public.group_unread_count(uuid) from public, anon;
grant execute on function public.group_unread_count(uuid) to authenticated;

create or replace function public.list_my_groups()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', g.id,
        'name', g.name,
        'member_count', (
          select count(*)::int from public.group_members m where m.group_id = g.id
        ),
        'unread_count', (
          select count(*)::int
          from public.group_messages msg
          where msg.group_id = g.id
            and msg.deleted_at is null
            and msg.sender_id is distinct from auth.uid()
            and msg.created_at > coalesce(
              (
                select r.last_read_at
                from public.group_reads r
                where r.group_id = g.id
                  and r.user_id = auth.uid()
              ),
              '-infinity'::timestamptz
            )
        )
      )
      order by g.name
    ),
    '[]'::jsonb
  )
  from public.groups g
  join public.group_members me on me.group_id = g.id and me.user_id = auth.uid();
$$;

alter table public.group_messages replica identity full;
alter table public.message_reactions replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'group_messages'
  ) then
    alter publication supabase_realtime add table public.group_messages;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end $$;
