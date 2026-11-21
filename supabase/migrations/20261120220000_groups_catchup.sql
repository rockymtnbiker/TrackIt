-- Catch-up for groups slices 2, 3, 4, and 5.
-- Safe to re-run. Tables and columns first, then functions, then policies.
-- The two restrictive select policies are last, after goals.group_goal_id exists.

-- Slice 2
create table if not exists public.group_goal_shares (
  goal_id uuid not null references public.goals (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (goal_id, group_id)
);

create index if not exists group_goal_shares_group_owner_idx
  on public.group_goal_shares (group_id, owner_id);

-- Slice 3
create table if not exists public.group_goals (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  title text not null,
  why text,
  category text,
  unit text,
  target_amount numeric,
  repeat_period text check (repeat_period is null or repeat_period in ('week', 'month')),
  planned_days smallint[],
  times_per_day numeric not null default 1 check (times_per_day >= 1 and times_per_day <= 12),
  target_end_date date,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  check (
    (repeat_period is null and planned_days is null)
    or (repeat_period is not null and planned_days is not null)
  )
);

create index if not exists group_goals_group_id_idx on public.group_goals (group_id);

create table if not exists public.group_goal_skips (
  group_goal_id uuid not null references public.group_goals (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_goal_id, user_id)
);

alter table public.goals
  add column if not exists group_goal_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'goals_group_goal_id_fkey'
      and conrelid = 'public.goals'::regclass
  ) then
    alter table public.goals
      add constraint goals_group_goal_id_fkey
      foreign key (group_goal_id) references public.group_goals (id) on delete set null;
  end if;
end
$$;

create index if not exists goals_group_goal_id_idx
  on public.goals (group_goal_id)
  where group_goal_id is not null;

create unique index if not exists goals_one_live_group_copy_idx
  on public.goals (user_id, group_goal_id)
  where group_goal_id is not null and deleted_at is null;

-- Slice 4
alter table public.goals
  add column if not exists connected_at timestamptz;

alter table public.goals
  add column if not exists group_link text;

alter table public.goals
  drop constraint if exists goals_group_link_check;

alter table public.goals
  add constraint goals_group_link_check
  check (group_link is null or group_link in ('copy', 'connected'));

-- Slice 5
alter table public.goals
  add column if not exists connected_on date;

alter table public.groups
  add column if not exists show_member_progress boolean not null default false;

update public.goals
set group_link = 'copy',
    connected_at = coalesce(connected_at, created_date, now())
where group_goal_id is not null
  and group_link is null;

update public.goals
set connected_on = (connected_at at time zone 'America/Denver')::date
where connected_at is not null
  and connected_on is null;

-- Functions

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

-- Argument stays named gid. The live function already uses that name, and
-- create or replace cannot rename an input argument.
create or replace function public.can_view_goal(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive chain as (
    select id, parent_id, user_id
    from public.goals
    where id = gid
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

create or replace function public.goal_period_kind(
  p_period text,
  p_days int[],
  p_unit text,
  p_amount numeric
)
returns text
language sql
immutable
as $$
  select case
    when p_days is null then 'once'
    when p_period = 'month' then 'month'
    when p_period = 'week'
      and p_days @> array[0, 1, 2, 3, 4, 5, 6]::int[]
      and p_days <@ array[0, 1, 2, 3, 4, 5, 6]::int[]
      and (p_unit is not null or p_amount is null or p_amount = 7)
      then 'daily'
    else 'week'
  end;
$$;

revoke all on function public.goal_period_kind(text, int[], text, numeric) from public, anon, authenticated;

create or replace function public.same_goal_shape(
  p_unit_a text,
  p_period_a text,
  p_days_a int[],
  p_amount_a numeric,
  p_unit_b text,
  p_period_b text,
  p_days_b int[],
  p_amount_b numeric
)
returns boolean
language sql
immutable
as $$
  select p_unit_a is not distinct from p_unit_b
    and public.goal_period_kind(p_period_a, p_days_a, p_unit_a, p_amount_a)
      = public.goal_period_kind(p_period_b, p_days_b, p_unit_b, p_amount_b);
$$;

revoke all on function public.same_goal_shape(text, text, int[], numeric, text, text, int[], numeric)
  from public, anon, authenticated;

create or replace function public.guard_group_goal_copy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_copy boolean;
begin
  if current_setting('trackit.group_goal_write', true) = 'on' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.group_goal_id is not null then
      raise exception 'Only an admin can do that.';
    end if;
    if new.parent_id is not null and exists (
      select 1
      from public.goals parent
      where parent.id = new.parent_id
        and parent.group_goal_id is not null
        and coalesce(parent.group_link, 'copy') = 'copy'
    ) then
      raise exception 'Group goals can''t have steps.';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.group_goal_id is distinct from old.group_goal_id
  then
    raise exception 'Only an admin can do that.';
  end if;

  v_copy := old.group_goal_id is not null and coalesce(old.group_link, 'copy') = 'copy';

  if tg_op = 'UPDATE' and v_copy then
    if new.parent_id is not null then
      raise exception 'Group goals can''t have steps.';
    end if;
    if new.title is distinct from old.title
      or new.why is distinct from old.why
      or new.category is distinct from old.category
      or new.unit is distinct from old.unit
      or new.target_amount is distinct from old.target_amount
      or new.repeat_period is distinct from old.repeat_period
      or new.planned_days is distinct from old.planned_days
      or new.times_per_day is distinct from old.times_per_day
      or new.target_end_date is distinct from old.target_end_date
    then
      select groups.name into v_name
      from public.group_goals
      join public.groups on groups.id = group_goals.group_id
      where group_goals.id = old.group_goal_id;
      raise exception 'Set by %. Only admins can change it.', coalesce(v_name, 'the group');
    end if;
  end if;

  if tg_op = 'UPDATE'
    and new.parent_id is not null
    and new.parent_id is distinct from old.parent_id
    and exists (
      select 1
      from public.goals parent
      where parent.id = new.parent_id
        and parent.group_goal_id is not null
        and coalesce(parent.group_link, 'copy') = 'copy'
    )
  then
    raise exception 'Group goals can''t have steps.';
  end if;

  return new;
end;
$$;

drop trigger if exists goals_guard_group_goal_copy on public.goals;
create trigger goals_guard_group_goal_copy
  before insert or update on public.goals
  for each row
  execute function public.guard_group_goal_copy();

create or replace function public.remember_removed_group_goal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.group_goal_id is not null then
    insert into public.group_goal_skips (group_goal_id, user_id)
    values (old.group_goal_id, old.user_id)
    on conflict do nothing;
  end if;
  return old;
end;
$$;

drop trigger if exists goals_remember_removed_group_goal on public.goals;
create trigger goals_remember_removed_group_goal
  before delete on public.goals
  for each row
  execute function public.remember_removed_group_goal();

create or replace function public.push_copy_target(
  p_goal_id uuid,
  p_user_id uuid,
  p_start date,
  p_old_amount numeric,
  p_old_period text,
  p_old_days smallint[],
  p_old_times numeric,
  p_new_amount numeric,
  p_new_period text,
  p_new_days smallint[],
  p_new_times numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (timezone('utc', now()))::date;
  v_week_start int := 0;
  v_offset int;
  v_from date;
  v_to date;
  v_row record;
begin
  if p_new_days is null then
    return;
  end if;
  if p_old_amount is not distinct from p_new_amount
    and p_old_period is not distinct from p_new_period
    and p_old_days is not distinct from p_new_days
    and p_old_times is not distinct from p_new_times
  then
    return;
  end if;

  if p_new_period = 'month' then
    v_from := date_trunc('month', v_today)::date;
    v_to := (date_trunc('month', v_today) + interval '1 month' - interval '1 day')::date;
  else
    select case when week_start = 1 then 1 else 0 end into v_week_start
    from public.user_settings
    where user_id = p_user_id;
    v_week_start := coalesce(v_week_start, 0);
    v_offset := (extract(dow from v_today)::int - v_week_start + 7) % 7;
    v_from := v_today - v_offset;
    v_to := v_from + 6;
  end if;

  if p_start is not null
    and p_start < v_from
    and not exists (
      select 1
      from public.goal_targets
      where goal_id = p_goal_id
        and user_id = p_user_id
        and effective_from < v_from
    )
  then
    begin
      insert into public.goal_targets (
        goal_id, user_id, effective_from, target_amount, repeat_period, planned_days, times_per_day
      ) values (
        p_goal_id, p_user_id, p_start, p_old_amount, p_old_period, p_old_days, coalesce(p_old_times, 1)
      );
    exception
      when unique_violation then
        null;
    end;
  end if;

  begin
    insert into public.goal_targets (
      goal_id, user_id, effective_from, target_amount, repeat_period, planned_days, times_per_day
    ) values (
      p_goal_id, p_user_id, v_from, p_new_amount, p_new_period, p_new_days, coalesce(p_new_times, 1)
    );
  exception
    when unique_violation then
      update public.goal_targets
      set target_amount = p_new_amount,
          repeat_period = p_new_period,
          planned_days = p_new_days,
          times_per_day = coalesce(p_new_times, 1)
      where goal_id = p_goal_id
        and user_id = p_user_id
        and effective_from = v_from;
  end;

  for v_row in
    select effective_from
    from public.goal_targets
    where goal_id = p_goal_id
      and user_id = p_user_id
      and effective_from > v_from
      and effective_from <= v_to
  loop
    update public.goal_targets
    set target_amount = p_new_amount,
        repeat_period = p_new_period,
        planned_days = p_new_days,
        times_per_day = coalesce(p_new_times, 1)
    where goal_id = p_goal_id
      and user_id = p_user_id
      and effective_from = v_row.effective_from;
  end loop;
end;
$$;

create or replace function public.copy_group_goal_to_user(
  p_group_goal_id uuid,
  p_user_id uuid,
  p_connected_on date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_goal public.group_goals%rowtype;
  v_sort int;
  v_id uuid;
  v_today date := coalesce(p_connected_on, (now() at time zone 'America/Denver')::date);
begin
  select * into v_goal
  from public.group_goals
  where id = p_group_goal_id
    and archived_at is null;
  if not found then
    return;
  end if;
  if not exists (
    select 1 from public.group_members
    where group_id = v_goal.group_id and user_id = p_user_id
  ) then
    return;
  end if;
  if exists (
    select 1 from public.group_goal_skips
    where group_goal_id = p_group_goal_id and user_id = p_user_id
  ) then
    return;
  end if;
  if exists (
    select 1 from public.goals
    where group_goal_id = p_group_goal_id
      and user_id = p_user_id
      and deleted_at is null
  ) then
    return;
  end if;

  select coalesce(max(sort_order), -1) + 1 into v_sort
  from public.goals
  where user_id = p_user_id
    and parent_id is null
    and deleted_at is null;

  perform set_config('trackit.group_goal_write', 'on', true);

  insert into public.goals (
    user_id,
    parent_id,
    title,
    why,
    category,
    sort_order,
    status,
    actual_start_date,
    target_end_date,
    created_date,
    unit,
    target_amount,
    repeat_period,
    planned_days,
    times_per_day,
    group_goal_id,
    group_link,
    connected_at,
    connected_on
  ) values (
    p_user_id,
    null,
    v_goal.title,
    v_goal.why,
    v_goal.category,
    v_sort,
    'active',
    v_today,
    v_goal.target_end_date,
    now(),
    v_goal.unit,
    v_goal.target_amount,
    v_goal.repeat_period,
    v_goal.planned_days,
    v_goal.times_per_day,
    v_goal.id,
    'copy',
    now(),
    v_today
  )
  returning id into v_id;

  if v_goal.planned_days is not null then
    begin
      insert into public.goal_targets (
        goal_id,
        user_id,
        effective_from,
        target_amount,
        repeat_period,
        planned_days,
        times_per_day
      ) values (
        v_id,
        p_user_id,
        v_today,
        v_goal.target_amount,
        v_goal.repeat_period,
        v_goal.planned_days,
        v_goal.times_per_day
      );
    exception
      when unique_violation then
        update public.goal_targets
        set target_amount = v_goal.target_amount,
            repeat_period = v_goal.repeat_period,
            planned_days = v_goal.planned_days,
            times_per_day = v_goal.times_per_day
        where goal_id = v_id
          and user_id = p_user_id
          and effective_from = v_today;
    end;
  end if;
end;
$$;

create or replace function public.copy_group_goal_to_user(p_group_goal_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.copy_group_goal_to_user(p_group_goal_id, p_user_id, null);
end;
$$;

create or replace function public.copy_group_goals_on_join()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_goal_id uuid;
begin
  for v_goal_id in
    select id
    from public.group_goals
    where group_id = new.group_id
      and archived_at is null
  loop
    perform public.copy_group_goal_to_user(v_goal_id, new.user_id);
  end loop;
  return new;
end;
$$;

drop trigger if exists group_members_copy_group_goals on public.group_members;
create trigger group_members_copy_group_goals
  after insert on public.group_members
  for each row
  execute function public.copy_group_goals_on_join();

create or replace function public.create_group_goal(
  p_group_id uuid,
  p_title text,
  p_why text,
  p_unit text,
  p_target_amount numeric,
  p_repeat_period text,
  p_planned_days smallint[],
  p_times_per_day numeric,
  p_target_end_date date,
  p_connected_on date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_why text := nullif(btrim(coalesce(p_why, '')), '');
  v_unit text := nullif(btrim(coalesce(p_unit, '')), '');
  v_period text := nullif(lower(btrim(coalesce(p_repeat_period, ''))), '');
  v_days smallint[];
  v_times numeric := coalesce(p_times_per_day, 1);
  v_id uuid;
  v_member uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if not public.is_group_admin(p_group_id) then
    raise exception 'Only an admin can do that.';
  end if;
  if v_title = '' then
    raise exception 'Enter a title.';
  end if;
  if v_period is not null and v_period not in ('week', 'month') then
    raise exception 'A repeating step needs a repeat period of week or month.';
  end if;
  if (v_period is null) <> (p_planned_days is null) then
    raise exception 'A repeating step needs a repeat period of week or month.';
  end if;
  if p_planned_days is not null then
    select coalesce(array_agg(distinct day order by day), '{}')
    into v_days
    from unnest(p_planned_days) as day
    where day between 0 and 6;
  end if;
  if v_times < 1 or v_times > 12 then
    v_times := least(12, greatest(1, round(v_times)));
  end if;

  insert into public.group_goals (
    group_id,
    title,
    why,
    unit,
    target_amount,
    repeat_period,
    planned_days,
    times_per_day,
    target_end_date,
    created_by
  ) values (
    p_group_id,
    v_title,
    v_why,
    v_unit,
    p_target_amount,
    v_period,
    v_days,
    v_times,
    p_target_end_date,
    auth.uid()
  )
  returning id into v_id;

  for v_member in
    select user_id from public.group_members where group_id = p_group_id
  loop
    perform public.copy_group_goal_to_user(v_id, v_member, p_connected_on);
  end loop;
  return v_id;
end;
$$;

create or replace function public.create_group_goal(
  p_group_id uuid,
  p_title text,
  p_why text,
  p_unit text,
  p_target_amount numeric,
  p_repeat_period text,
  p_planned_days smallint[],
  p_times_per_day numeric,
  p_target_end_date date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.create_group_goal(
    p_group_id,
    p_title,
    p_why,
    p_unit,
    p_target_amount,
    p_repeat_period,
    p_planned_days,
    p_times_per_day,
    p_target_end_date,
    null
  );
end;
$$;

revoke all on function public.create_group_goal(uuid, text, text, text, numeric, text, smallint[], numeric, date, date) from public, anon;
revoke all on function public.create_group_goal(uuid, text, text, text, numeric, text, smallint[], numeric, date) from public, anon;
grant execute on function public.create_group_goal(uuid, text, text, text, numeric, text, smallint[], numeric, date, date) to authenticated;
grant execute on function public.create_group_goal(uuid, text, text, text, numeric, text, smallint[], numeric, date) to authenticated;

create or replace function public.update_group_goal(
  p_group_goal_id uuid,
  p_title text,
  p_why text,
  p_unit text,
  p_target_amount numeric,
  p_repeat_period text,
  p_planned_days smallint[],
  p_times_per_day numeric,
  p_target_end_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_title text := btrim(coalesce(p_title, ''));
  v_why text := nullif(btrim(coalesce(p_why, '')), '');
  v_unit text := nullif(btrim(coalesce(p_unit, '')), '');
  v_period text := nullif(lower(btrim(coalesce(p_repeat_period, ''))), '');
  v_days smallint[];
  v_times numeric := coalesce(p_times_per_day, 1);
  v_copy record;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  select group_id into v_group_id
  from public.group_goals
  where id = p_group_goal_id
    and archived_at is null
  for update;
  if v_group_id is null then
    raise exception 'Only an admin can do that.';
  end if;
  if not public.is_group_admin(v_group_id) then
    raise exception 'Only an admin can do that.';
  end if;
  if v_title = '' then
    raise exception 'Enter a title.';
  end if;
  if v_period is not null and v_period not in ('week', 'month') then
    raise exception 'A repeating step needs a repeat period of week or month.';
  end if;
  if (v_period is null) <> (p_planned_days is null) then
    raise exception 'A repeating step needs a repeat period of week or month.';
  end if;
  if p_planned_days is not null then
    select coalesce(array_agg(distinct day order by day), '{}')
    into v_days
    from unnest(p_planned_days) as day
    where day between 0 and 6;
  end if;
  if v_times < 1 or v_times > 12 then
    v_times := least(12, greatest(1, round(v_times)));
  end if;

  update public.group_goals
  set title = v_title,
      why = v_why,
      unit = v_unit,
      target_amount = p_target_amount,
      repeat_period = v_period,
      planned_days = v_days,
      times_per_day = v_times,
      target_end_date = p_target_end_date
  where id = p_group_goal_id;

  perform set_config('trackit.group_goal_write', 'on', true);

  for v_copy in
    select
      id,
      user_id,
      target_amount,
      repeat_period,
      planned_days,
      times_per_day,
      coalesce(group_link, 'copy') as group_link,
      coalesce(actual_start_date, created_date::date) as started
    from public.goals
    where group_goal_id = p_group_goal_id
      and deleted_at is null
  loop
    if v_copy.group_link = 'connected' then
      update public.goals
      set unit = v_unit,
          target_amount = p_target_amount,
          repeat_period = v_period,
          planned_days = v_days,
          times_per_day = v_times,
          target_end_date = p_target_end_date
      where id = v_copy.id;
    else
      update public.goals
      set title = v_title,
          why = v_why,
          unit = v_unit,
          target_amount = p_target_amount,
          repeat_period = v_period,
          planned_days = v_days,
          times_per_day = v_times,
          target_end_date = p_target_end_date
      where id = v_copy.id;
    end if;

    perform public.push_copy_target(
      v_copy.id,
      v_copy.user_id,
      v_copy.started,
      v_copy.target_amount,
      v_copy.repeat_period,
      v_copy.planned_days::smallint[],
      v_copy.times_per_day,
      p_target_amount,
      v_period,
      v_days,
      v_times
    );
  end loop;
end;
$$;

create or replace function public.archive_group_goal(p_group_goal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  select group_id into v_group_id
  from public.group_goals
  where id = p_group_goal_id
    and archived_at is null
  for update;
  if v_group_id is null or not public.is_group_admin(v_group_id) then
    raise exception 'Only an admin can do that.';
  end if;
  update public.group_goals
  set archived_at = now()
  where id = p_group_goal_id;
  perform set_config('trackit.group_goal_write', 'on', true);
  update public.goals
  set group_goal_id = null,
      group_link = null,
      connected_at = null,
      connected_on = null
  where group_goal_id = p_group_goal_id
    and deleted_at is null;
end;
$$;

create or replace function public.connect_goal_to_group_goal(
  p_personal_goal_id uuid,
  p_group_goal_id uuid,
  p_connected_on date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_personal public.goals%rowtype;
  v_template public.group_goals%rowtype;
  v_copy_id uuid;
  v_on date := coalesce(p_connected_on, (now() at time zone 'America/Denver')::date);
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  select * into v_personal
  from public.goals
  where id = p_personal_goal_id
    and user_id = auth.uid()
    and deleted_at is null
  for update;
  if not found or v_personal.parent_id is not null or v_personal.status = 'done' or v_personal.group_goal_id is not null then
    raise exception 'That goal can''t be connected.';
  end if;
  select * into v_template
  from public.group_goals
  where id = p_group_goal_id
    and archived_at is null
  for update;
  if not found then
    raise exception 'That group goal is no longer active.';
  end if;
  if not public.is_group_member(v_template.group_id) then
    raise exception 'You are not in this group.';
  end if;
  if not public.same_goal_shape(
    v_personal.unit,
    v_personal.repeat_period,
    v_personal.planned_days::int[],
    v_personal.target_amount,
    v_template.unit,
    v_template.repeat_period,
    v_template.planned_days::int[],
    v_template.target_amount
  ) then
    raise exception 'That goal can''t be connected.';
  end if;

  select id into v_copy_id
  from public.goals
  where user_id = auth.uid()
    and group_goal_id = p_group_goal_id
    and deleted_at is null
    and id <> v_personal.id
  for update;

  perform public.push_copy_target(
    v_personal.id,
    v_personal.user_id,
    coalesce(v_personal.actual_start_date, (v_personal.created_date at time zone 'America/Denver')::date),
    v_personal.target_amount,
    v_personal.repeat_period,
    v_personal.planned_days::smallint[],
    v_personal.times_per_day,
    v_template.target_amount,
    v_template.repeat_period,
    v_template.planned_days,
    v_template.times_per_day
  );

  perform set_config('trackit.group_goal_write', 'on', true);

  if v_copy_id is not null then
    update public.goal_entries as incoming
    set goal_id = v_personal.id
    where incoming.goal_id = v_copy_id
      and not exists (
        select 1
        from public.goal_entries kept
        where kept.goal_id = v_personal.id
          and kept.entry_date = incoming.entry_date
      );
    delete from public.goal_entries where goal_id = v_copy_id;
    delete from public.goal_targets where goal_id = v_copy_id;
    delete from public.goal_shares where goal_id = v_copy_id;
    delete from public.group_goal_shares where goal_id = v_copy_id;
    delete from public.goals where id = v_copy_id;
    delete from public.group_goal_skips
    where group_goal_id = p_group_goal_id
      and user_id = auth.uid();
  end if;

  update public.goals
  set unit = v_template.unit,
      target_amount = v_template.target_amount,
      repeat_period = v_template.repeat_period,
      planned_days = v_template.planned_days,
      times_per_day = v_template.times_per_day,
      target_end_date = v_template.target_end_date,
      group_goal_id = v_template.id,
      group_link = 'connected',
      connected_at = now(),
      connected_on = v_on
  where id = v_personal.id;
end;
$$;

create or replace function public.connect_goal_to_group_goal(
  p_personal_goal_id uuid,
  p_group_goal_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.connect_goal_to_group_goal(p_personal_goal_id, p_group_goal_id, null);
end;
$$;

revoke all on function public.connect_goal_to_group_goal(uuid, uuid, date) from public, anon;
revoke all on function public.connect_goal_to_group_goal(uuid, uuid) from public, anon;
grant execute on function public.connect_goal_to_group_goal(uuid, uuid, date) to authenticated;
grant execute on function public.connect_goal_to_group_goal(uuid, uuid) to authenticated;

create or replace function public.disconnect_goal(p_goal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link text;
  v_group_goal uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  select group_link, group_goal_id into v_link, v_group_goal
  from public.goals
  where id = p_goal_id
    and user_id = auth.uid()
    and deleted_at is null
  for update;
  if v_group_goal is null or coalesce(v_link, 'copy') <> 'connected' then
    return;
  end if;
  perform set_config('trackit.group_goal_write', 'on', true);
  update public.goals
  set group_goal_id = null,
      group_link = null,
      connected_at = null,
      connected_on = null
  where id = p_goal_id;
end;
$$;

create or replace function public.add_group_goal_to_my_goals(
  p_group_goal_id uuid,
  p_connected_on date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  select group_id into v_group_id
  from public.group_goals
  where id = p_group_goal_id
    and archived_at is null;
  if v_group_id is null then
    raise exception 'That group goal is no longer active.';
  end if;
  if not public.is_group_member(v_group_id) then
    raise exception 'You are not in this group.';
  end if;
  if exists (
    select 1 from public.goals
    where user_id = auth.uid()
      and group_goal_id = p_group_goal_id
      and deleted_at is null
  ) then
    return;
  end if;
  delete from public.group_goal_skips
  where group_goal_id = p_group_goal_id
    and user_id = auth.uid();
  perform public.copy_group_goal_to_user(p_group_goal_id, auth.uid(), p_connected_on);
end;
$$;

create or replace function public.add_group_goal_to_my_goals(p_group_goal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.add_group_goal_to_my_goals(p_group_goal_id, null);
end;
$$;

revoke all on function public.add_group_goal_to_my_goals(uuid, date) from public, anon;
revoke all on function public.add_group_goal_to_my_goals(uuid) from public, anon;
grant execute on function public.add_group_goal_to_my_goals(uuid, date) to authenticated;
grant execute on function public.add_group_goal_to_my_goals(uuid) to authenticated;

create or replace function public.release_member_group_goals(
  p_group_id uuid,
  p_user_id uuid,
  p_remove_copies boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('trackit.group_goal_write', 'on', true);

  update public.goals as goal
  set group_goal_id = null,
      group_link = null,
      connected_at = null,
      connected_on = null
  from public.group_goals template
  where goal.group_goal_id = template.id
    and template.group_id = p_group_id
    and goal.user_id = p_user_id
    and goal.deleted_at is null
    and goal.group_link = 'connected';

  if p_remove_copies then
    delete from public.goals as goal
    using public.group_goals template
    where goal.group_goal_id = template.id
      and template.group_id = p_group_id
      and goal.user_id = p_user_id
      and coalesce(goal.group_link, 'copy') = 'copy';
  else
    update public.goals as goal
    set group_goal_id = null,
        group_link = null,
        connected_at = null,
        connected_on = null
    from public.group_goals template
    where goal.group_goal_id = template.id
      and template.group_id = p_group_id
      and goal.user_id = p_user_id
      and goal.deleted_at is null
      and coalesce(goal.group_link, 'copy') = 'copy';
  end if;

  delete from public.group_goal_skips as skip
  using public.group_goals template
  where skip.group_goal_id = template.id
    and template.group_id = p_group_id
    and skip.user_id = p_user_id;
end;
$$;

drop function if exists public.leave_group(uuid);

create or replace function public.leave_group(p_group_id uuid, p_keep_copies boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_count int;
  v_admins int;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  perform 1 from public.groups where id = p_group_id for update;
  select role into v_role
  from public.group_members
  where group_id = p_group_id and user_id = auth.uid();
  if v_role is null then
    raise exception 'You are not in this group.';
  end if;
  select count(*)::int into v_count
  from public.group_members
  where group_id = p_group_id;
  if v_count > 1 then
    select count(*)::int into v_admins
    from public.group_members
    where group_id = p_group_id and role = 'admin';
    if v_role = 'admin' and v_admins <= 1 then
      raise exception 'Make someone else an admin before you leave.';
    end if;
  end if;
  perform public.release_member_group_goals(p_group_id, auth.uid(), not coalesce(p_keep_copies, true));
  if v_count <= 1 then
    delete from public.groups where id = p_group_id;
    return jsonb_build_object('deleted', true);
  end if;
  delete from public.group_members
  where group_id = p_group_id and user_id = auth.uid();
  return jsonb_build_object('deleted', false);
end;
$$;

create or replace function public.remove_member(p_group_id uuid, p_user_id uuid)
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
  if p_user_id = auth.uid() then
    raise exception 'Use Leave group to leave.';
  end if;
  if not exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_user_id
  ) then
    raise exception 'That person is not in this group.';
  end if;
  perform public.release_member_group_goals(p_group_id, p_user_id, false);
  delete from public.group_members
  where group_id = p_group_id and user_id = p_user_id;
end;
$$;

create or replace function public.can_read_group_goal_row(p_goal_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_root_id uuid;
  v_owner uuid;
  v_linked uuid;
begin
  if p_goal_id is null then
    return true;
  end if;

  with recursive chain as (
    select id, parent_id, user_id, group_goal_id, 1 as depth
    from public.goals
    where id = p_goal_id
    union all
    select g.id, g.parent_id, g.user_id, g.group_goal_id, c.depth + 1
    from public.goals g
    join chain c on g.id = c.parent_id
    where c.parent_id is not null
      and c.depth < 20
  )
  select
    root.id,
    root.user_id,
    (
      select linked.group_goal_id
      from chain linked
      where linked.group_goal_id is not null
      limit 1
    )
  into v_root_id, v_owner, v_linked
  from chain root
  where root.parent_id is null
  limit 1;

  if v_root_id is null or v_linked is null then
    return true;
  end if;
  if auth.uid() is not null and v_owner = auth.uid() then
    return true;
  end if;
  if auth.uid() is not null and exists (
    select 1
    from public.goal_shares share
    where share.goal_id = v_root_id
      and share.viewer_id = auth.uid()
  ) then
    return true;
  end if;
  if auth.uid() is not null and exists (
    select 1
    from public.group_goal_shares shared
    join public.group_members member
      on member.group_id = shared.group_id
     and member.user_id = auth.uid()
    where shared.goal_id = v_root_id
  ) then
    return true;
  end if;
  return false;
end;
$$;

create or replace function public.member_week_score(
  p_goal_id uuid,
  p_week_start date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_goal public.goals%rowtype;
  v_week_end date;
  v_cutoff date;
  v_start date;
  v_start_week date;
  v_dow int;
  v_repeating boolean;
  v_amount numeric;
  v_repeat text;
  v_days integer[];
  v_times int;
  v_full numeric;
  v_target numeric;
  v_progress numeric;
  v_available int;
  v_cap int;
  v_planned int;
  v_daily boolean;
  v_pct int;
  v_hit boolean;
  v_found boolean;
begin
  select * into v_goal from public.goals where id = p_goal_id;
  if v_goal.id is null or p_week_start is null then
    return jsonb_build_object('progress', 0, 'target', null, 'pct', 0, 'hit', false);
  end if;

  v_week_end := p_week_start + 6;
  v_cutoff := coalesce(
    v_goal.connected_on,
    (v_goal.connected_at at time zone 'America/Denver')::date,
    p_week_start
  );
  v_repeating := v_goal.planned_days is not null;
  v_found := false;

  if v_repeating then
    select
      target_amount,
      repeat_period,
      planned_days::integer[],
      times_per_day
    into v_amount, v_repeat, v_days, v_times
    from public.goal_targets
    where goal_id = p_goal_id
      and effective_from <= v_week_end
    order by effective_from desc
    limit 1;
    v_found := found;
  end if;

  if not v_repeating or not v_found then
    v_amount := v_goal.target_amount;
    v_repeat := v_goal.repeat_period;
    v_days := v_goal.planned_days::integer[];
    v_times := v_goal.times_per_day;
  end if;

  if v_repeating and v_days is null then
    return jsonb_build_object('progress', 0, 'target', null, 'pct', 0, 'hit', false);
  end if;

  v_times := coalesce(v_times, 1);
  if v_times < 1 then
    v_times := 1;
  elsif v_times > 12 then
    v_times := 12;
  end if;

  v_daily :=
    v_repeat = 'week'
    and v_days is not null
    and cardinality(v_days) = 7
    and v_days @> array[0, 1, 2, 3, 4, 5, 6]::integer[]
    and (v_goal.unit is not null or v_amount is null or v_amount = 7);

  if v_repeat = 'month' then
    if v_amount is null then
      v_full := null;
    else
      v_full := v_amount * 7.0 / extract(
        day from (date_trunc('month', p_week_start::timestamp) + interval '1 month - 1 day')
      );
    end if;
  elsif v_goal.unit is not null then
    v_full := v_amount;
  elsif v_amount is not null and v_amount > 0 then
    v_full := v_amount;
  else
    v_full := greatest(coalesce(cardinality(v_days), 0), 1);
  end if;

  v_start := coalesce(
    v_goal.actual_start_date,
    (v_goal.created_date at time zone 'America/Denver')::date
  );
  v_dow := extract(dow from p_week_start)::int;
  if v_start is null then
    v_start_week := null;
  else
    v_start_week := v_start - ((extract(dow from v_start)::int - v_dow + 7) % 7);
  end if;

  if v_start is null or v_start_week is distinct from p_week_start then
    v_target := v_full;
  else
    select count(*)::int into v_available
    from generate_series(p_week_start, v_week_end, interval '1 day') day
    where day::date >= v_start;

    if v_goal.unit is not null then
      if v_full is null then
        v_target := null;
      else
        v_target := round(v_full * v_available / 7.0);
      end if;
    elsif v_daily then
      v_target := v_available;
    elsif v_full is null then
      v_target := null;
    else
      v_cap := v_available;
      if v_days is not null and cardinality(v_days) > 0 then
        select count(*)::int into v_planned
        from generate_series(p_week_start, v_week_end, interval '1 day') day
        where day::date >= v_start
          and extract(dow from day)::int = any (v_days::int[]);
        v_cap := least(v_available, v_planned);
      end if;
      v_target := least(v_full, v_cap);
    end if;
  end if;

  if v_goal.unit is not null then
    select coalesce(sum(value), 0) into v_progress
    from public.goal_entries
    where goal_id = p_goal_id
      and user_id = v_goal.user_id
      and entry_date between p_week_start and v_week_end
      and entry_date >= v_cutoff;
  elsif v_daily then
    select count(*)::numeric into v_progress
    from (
      select entry_date
      from public.goal_entries
      where goal_id = p_goal_id
        and user_id = v_goal.user_id
        and entry_date between p_week_start and v_week_end
        and entry_date >= v_cutoff
      group by entry_date
      having count(*) >= v_times
    ) complete_days;
  else
    select count(*)::numeric into v_progress
    from public.goal_entries
    where goal_id = p_goal_id
      and user_id = v_goal.user_id
      and entry_date between p_week_start and v_week_end
      and entry_date >= v_cutoff;
  end if;

  v_progress := coalesce(v_progress, 0);
  if v_target is null or v_target <= 0 then
    v_pct := 0;
    v_hit := false;
  else
    v_pct := least(100, round(v_progress / v_target * 100)::int);
    v_hit := v_progress >= v_target;
  end if;

  return jsonb_build_object(
    'progress', v_progress,
    'target', v_target,
    'pct', v_pct,
    'hit', v_hit
  );
end;
$$;

create or replace function public.get_group_progress(
  p_group_id uuid,
  p_week_start date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_show boolean;
  v_goals jsonb := '[]'::jsonb;
  v_template record;
  v_member record;
  v_score jsonb;
  v_track int;
  v_hit_count int;
  v_pct_sum int;
  v_members jsonb;
  v_collective int;
  v_sum int := 0;
  v_count int := 0;
  v_active int;
  v_goal jsonb;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if not public.is_group_member(p_group_id) then
    raise exception 'You are not in this group.';
  end if;
  if p_week_start is null then
    raise exception 'You are not in this group.';
  end if;

  select show_member_progress into v_show
  from public.groups
  where id = p_group_id;
  v_show := coalesce(v_show, false);

  for v_template in
    select id
    from public.group_goals
    where group_id = p_group_id
      and archived_at is null
    order by created_at
  loop
    v_track := 0;
    v_hit_count := 0;
    v_pct_sum := 0;
    v_members := '[]'::jsonb;

    for v_member in
      select
        g.id,
        g.user_id,
        coalesce(nullif(btrim(p.display_name), ''), 'Member') as display_name
      from public.goals g
      join public.group_members m
        on m.group_id = p_group_id
       and m.user_id = g.user_id
      left join public.profiles p on p.id = g.user_id
      where g.group_goal_id = v_template.id
        and g.deleted_at is null
      order by (g.user_id = auth.uid()) desc, display_name, g.user_id
    loop
      v_score := public.member_week_score(v_member.id, p_week_start);
      v_track := v_track + 1;
      v_pct_sum := v_pct_sum + coalesce((v_score ->> 'pct')::int, 0);
      if coalesce((v_score ->> 'hit')::boolean, false) then
        v_hit_count := v_hit_count + 1;
      end if;
      if v_show then
        v_members := v_members || jsonb_build_array(
          jsonb_build_object(
            'user_id', v_member.user_id,
            'display_name', v_member.display_name,
            'progress', v_score -> 'progress',
            'target', v_score -> 'target',
            'pct', v_score -> 'pct'
          )
        );
      end if;
    end loop;

    v_collective := case
      when v_track = 0 then 0
      else round(v_pct_sum::numeric / v_track)::int
    end;
    if v_track > 0 then
      v_sum := v_sum + v_collective;
      v_count := v_count + 1;
    end if;

    v_goal := jsonb_build_object(
      'group_goal_id', v_template.id,
      'collective_pct', v_collective,
      'tracking', v_track,
      'hit', v_hit_count
    );
    if v_show then
      v_goal := v_goal || jsonb_build_object('members', v_members);
    end if;
    v_goals := v_goals || jsonb_build_array(v_goal);
  end loop;

  select count(distinct g.user_id)::int into v_active
  from public.goal_entries entry
  join public.goals g on g.id = entry.goal_id
  join public.group_goals template on template.id = g.group_goal_id
  join public.group_members m
    on m.group_id = p_group_id
   and m.user_id = g.user_id
  where template.group_id = p_group_id
    and template.archived_at is null
    and g.deleted_at is null
    and entry.user_id = g.user_id
    and entry.entry_date between p_week_start and p_week_start + 6
    and entry.entry_date >= coalesce(
      g.connected_on,
      (g.connected_at at time zone 'America/Denver')::date,
      p_week_start
    );

  return jsonb_build_object(
    'show_member_progress', v_show,
    'overall_pct', case when v_count = 0 then 0 else round(v_sum::numeric / v_count)::int end,
    'active_members', coalesce(v_active, 0),
    'goals', v_goals
  );
end;
$$;

create or replace function public.set_show_member_progress(p_group_id uuid, p_on boolean)
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
  set show_member_progress = coalesce(p_on, false)
  where id = p_group_id;
end;
$$;

revoke all on function public.set_show_member_progress(uuid, boolean) from public, anon;
grant execute on function public.set_show_member_progress(uuid, boolean) to authenticated;

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
    'invite_code', case when v_role = 'admin' then v_group.invite_code else null end,
    'role', v_role,
    'member_count', v_count
  );
end;
$$;

-- Policies and grants
alter table public.group_goal_shares enable row level security;
alter table public.group_goals enable row level security;
alter table public.group_goal_skips enable row level security;

revoke all on public.group_goal_shares from public, anon, authenticated;
grant select, insert, delete on public.group_goal_shares to authenticated;

revoke all on public.group_goals from public, anon, authenticated;
grant select on public.group_goals to authenticated;

revoke all on public.group_goal_skips from public, anon, authenticated;

drop policy if exists group_goal_shares_select_member on public.group_goal_shares;
create policy group_goal_shares_select_member
  on public.group_goal_shares
  for select
  to authenticated
  using (public.is_group_member(group_id));

drop policy if exists group_goal_shares_insert_own on public.group_goal_shares;
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

drop policy if exists group_goal_shares_delete_own on public.group_goal_shares;
create policy group_goal_shares_delete_own
  on public.group_goal_shares
  for delete
  to authenticated
  using (owner_id = auth.uid() and public.is_group_member(group_id));

drop policy if exists group_goals_select_member on public.group_goals;
create policy group_goals_select_member
  on public.group_goals
  for select
  to authenticated
  using (public.is_group_member(group_id));

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

revoke all on function public.delete_member_group_shares() from public, anon, authenticated;
revoke all on function public.can_view_goal(uuid) from public, anon;
grant execute on function public.can_view_goal(uuid) to authenticated;

revoke all on function public.goal_period_kind(text, int[], text, numeric) from public, anon, authenticated;
revoke all on function public.same_goal_shape(text, text, int[], numeric, text, text, int[], numeric)
  from public, anon, authenticated;
revoke all on function public.guard_group_goal_copy() from public, anon, authenticated;
revoke all on function public.remember_removed_group_goal() from public, anon, authenticated;
revoke all on function public.push_copy_target(uuid, uuid, date, numeric, text, smallint[], numeric, numeric, text, smallint[], numeric)
  from public, anon, authenticated;
revoke all on function public.copy_group_goal_to_user(uuid, uuid, date) from public, anon, authenticated;
revoke all on function public.copy_group_goal_to_user(uuid, uuid) from public, anon, authenticated;
revoke all on function public.copy_group_goals_on_join() from public, anon, authenticated;

revoke all on function public.create_group_goal(uuid, text, text, text, numeric, text, smallint[], numeric, date, date) from public, anon;
revoke all on function public.create_group_goal(uuid, text, text, text, numeric, text, smallint[], numeric, date) from public, anon;
grant execute on function public.create_group_goal(uuid, text, text, text, numeric, text, smallint[], numeric, date, date) to authenticated;
grant execute on function public.create_group_goal(uuid, text, text, text, numeric, text, smallint[], numeric, date) to authenticated;

revoke all on function public.update_group_goal(uuid, text, text, text, numeric, text, smallint[], numeric, date) from public, anon;
grant execute on function public.update_group_goal(uuid, text, text, text, numeric, text, smallint[], numeric, date) to authenticated;
revoke all on function public.archive_group_goal(uuid) from public, anon;
grant execute on function public.archive_group_goal(uuid) to authenticated;

revoke all on function public.connect_goal_to_group_goal(uuid, uuid, date) from public, anon;
revoke all on function public.connect_goal_to_group_goal(uuid, uuid) from public, anon;
grant execute on function public.connect_goal_to_group_goal(uuid, uuid, date) to authenticated;
grant execute on function public.connect_goal_to_group_goal(uuid, uuid) to authenticated;

revoke all on function public.disconnect_goal(uuid) from public, anon;
grant execute on function public.disconnect_goal(uuid) to authenticated;

revoke all on function public.add_group_goal_to_my_goals(uuid, date) from public, anon;
revoke all on function public.add_group_goal_to_my_goals(uuid) from public, anon;
grant execute on function public.add_group_goal_to_my_goals(uuid, date) to authenticated;
grant execute on function public.add_group_goal_to_my_goals(uuid) to authenticated;

revoke all on function public.release_member_group_goals(uuid, uuid, boolean) from public, anon, authenticated;

revoke all on function public.leave_group(uuid, boolean) from public, anon;
grant execute on function public.leave_group(uuid, boolean) to authenticated;
revoke all on function public.remove_member(uuid, uuid) from public, anon;
grant execute on function public.remove_member(uuid, uuid) to authenticated;

revoke all on function public.member_week_score(uuid, date) from public, anon, authenticated;
revoke all on function public.get_group_progress(uuid, date) from public, anon;
grant execute on function public.get_group_progress(uuid, date) to authenticated;
revoke all on function public.can_read_group_goal_row(uuid) from public, anon;
grant execute on function public.can_read_group_goal_row(uuid) to authenticated;
revoke all on function public.set_show_member_progress(uuid, boolean) from public, anon;
grant execute on function public.set_show_member_progress(uuid, boolean) to authenticated;

-- Restrictive select policies last. They hide another member's group-goal rows
-- unless the caller owns the goal, has a partner share, or the member shared it with the group.
drop policy if exists goals_hide_other_group_goals on public.goals;
create policy goals_hide_other_group_goals
  on public.goals
  as restrictive
  for select
  using (public.can_read_group_goal_row(id));

drop policy if exists goal_entries_hide_other_group_goals on public.goal_entries;
create policy goal_entries_hide_other_group_goals
  on public.goal_entries
  as restrictive
  for select
  using (public.can_read_group_goal_row(goal_id));
