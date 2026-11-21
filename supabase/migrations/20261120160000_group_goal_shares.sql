-- Group goal sharing. Run after the groups migration.
-- Does not change goal_shares. Partner sharing stays as it is.

create table public.group_goal_shares (
  goal_id uuid not null references public.goals (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (goal_id, group_id)
);

create index group_goal_shares_group_owner_idx
  on public.group_goal_shares (group_id, owner_id);

alter table public.group_goal_shares enable row level security;

revoke all on public.group_goal_shares from public, anon, authenticated;
grant select, insert, delete on public.group_goal_shares to authenticated;

create policy group_goal_shares_select_member
  on public.group_goal_shares
  for select
  to authenticated
  using (public.is_group_member(group_id));

create policy group_goal_shares_insert_own
  on public.group_goal_shares
  for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and public.is_group_member(group_id)
    and exists (
      select 1
      from public.goals g
      where g.id = goal_id
        and g.user_id = auth.uid()
        and g.parent_id is null
        and g.deleted_at is null
    )
  );

create policy group_goal_shares_delete_own
  on public.group_goal_shares
  for delete
  to authenticated
  using (owner_id = auth.uid() and public.is_group_member(group_id));

-- Leaving or being removed drops that person's shares in the group.
create or replace function public.delete_member_group_shares()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.group_goal_shares
  where group_id = old.group_id
    and owner_id = old.user_id;
  return old;
end;
$$;

drop trigger if exists group_members_delete_shares on public.group_members;
create trigger group_members_delete_shares
  before delete on public.group_members
  for each row
  execute function public.delete_member_group_shares();

revoke all on function public.delete_member_group_shares() from public, anon, authenticated;

-- Owner, a partner the goal is shared with, or a member of a group it is shared with.
-- A share is on the top-level goal and covers that goal's steps.
create or replace function public.can_view_goal(p_goal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive chain as (
    select id, parent_id, user_id
    from public.goals
    where id = p_goal_id
      and deleted_at is null
    union all
    select g.id, g.parent_id, g.user_id
    from public.goals g
    join chain c on g.id = c.parent_id
    where g.deleted_at is null
  )
  select
    auth.uid() is not null
    and exists (
      select 1
      from chain c
      where c.user_id = auth.uid()
        or (
          c.parent_id is null
          and exists (
            select 1
            from public.goal_shares s
            where s.goal_id = c.id
              and s.viewer_id = auth.uid()
          )
        )
        or (
          c.parent_id is null
          and exists (
            select 1
            from public.group_goal_shares gs
            join public.group_members m
              on m.group_id = gs.group_id
             and m.user_id = auth.uid()
            where gs.goal_id = c.id
          )
        )
    );
$$;

revoke all on function public.can_view_goal(uuid) from public, anon;
grant execute on function public.can_view_goal(uuid) to authenticated;

-- Viewers can read a shared goal and its entries. Writes stay with the owner.
-- Drop a FOR ALL policy that used can_view_goal for every command, then recreate
-- an owner write policy plus a read policy. Other policies are left in place.
do $$
declare
  pol record;
begin
  for pol in
    select p.polname as name
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'goals'
      and p.polcmd = '*'
      and pg_get_expr(p.polqual, p.polrelid) ilike '%can_view_goal%'
  loop
    execute format('drop policy %I on public.goals', pol.name);
  end loop;

  for pol in
    select p.polname as name
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'goal_entries'
      and p.polcmd = '*'
      and pg_get_expr(p.polqual, p.polrelid) ilike '%can_view_goal%'
  loop
    execute format('drop policy %I on public.goal_entries', pol.name);
  end loop;
end $$;

drop policy if exists goals_owner_write on public.goals;
create policy goals_owner_write
  on public.goals
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists goals_select_shared on public.goals;
create policy goals_select_shared
  on public.goals
  for select
  to authenticated
  using (public.can_view_goal(id));

drop policy if exists goal_entries_owner_write on public.goal_entries;
create policy goal_entries_owner_write
  on public.goal_entries
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists goal_entries_select_shared on public.goal_entries;
create policy goal_entries_select_shared
  on public.goal_entries
  for select
  to authenticated
  using (public.can_view_goal(goal_id));
