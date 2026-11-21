-- Group goals. Run after the groups and group goal share migrations.
-- A group goal is a template. Each member gets a normal goals row linked by group_goal_id.

create table public.group_goals (
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

create index group_goals_group_id_idx on public.group_goals (group_id);

alter table public.group_goals enable row level security;

revoke all on public.group_goals from public, anon, authenticated;
grant select on public.group_goals to authenticated;

create policy group_goals_select_member
  on public.group_goals
  for select
  to authenticated
  using (public.is_group_member(group_id));

-- A member who deletes their copy is not given that template again.
create table public.group_goal_skips (
  group_goal_id uuid not null references public.group_goals (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_goal_id, user_id)
);

alter table public.group_goal_skips enable row level security;

revoke all on public.group_goal_skips from public, anon, authenticated;

alter table public.goals
  add column if not exists group_goal_id uuid references public.group_goals (id) on delete set null;

create index if not exists goals_group_goal_id_idx
  on public.goals (group_goal_id)
  where group_goal_id is not null;

create unique index if not exists goals_one_live_group_copy_idx
  on public.goals (user_id, group_goal_id)
  where group_goal_id is not null and deleted_at is null;

-- Writes to a copy's locked fields go through the group-goal functions.
-- Those functions set this flag for the rest of the transaction.
create or replace function public.guard_group_goal_copy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
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
    ) then
      raise exception 'Group goals can''t have steps.';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and old.group_goal_id is not null then
    if new.parent_id is not null then
      raise exception 'Group goals can''t have steps.';
    end if;
    if new.group_goal_id is distinct from old.group_goal_id
      or new.title is distinct from old.title
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

revoke all on function public.guard_group_goal_copy() from public, anon, authenticated;
revoke all on function public.remember_removed_group_goal() from public, anon, authenticated;

create or replace function public.copy_group_goal_to_user(p_group_goal_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_goal public.group_goals%rowtype;
  v_sort int;
  v_id uuid;
  v_today date := (timezone('utc', now()))::date;
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
    group_goal_id
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
    v_goal.id
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

revoke all on function public.copy_group_goal_to_user(uuid, uuid) from public, anon, authenticated;

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

revoke all on function public.copy_group_goals_on_join() from public, anon, authenticated;

-- Current week or month takes the new target. Older periods keep the previous row.
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

revoke all on function public.push_copy_target(uuid, uuid, date, numeric, text, smallint[], numeric, numeric, text, smallint[], numeric)
  from public, anon, authenticated;

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
    p_target_end_date
  )
  returning id into v_id;

  for v_member in
    select user_id from public.group_members where group_id = p_group_id
  loop
    perform public.copy_group_goal_to_user(v_id, v_member);
  end loop;
  return v_id;
end;
$$;

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
      coalesce(actual_start_date, created_date::date) as started
    from public.goals
    where group_goal_id = p_group_goal_id
      and deleted_at is null
  loop
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
  set group_goal_id = null
  where group_goal_id = p_group_goal_id
    and deleted_at is null;
end;
$$;

revoke all on function public.create_group_goal(uuid, text, text, text, numeric, text, smallint[], numeric, date) from public, anon;
revoke all on function public.update_group_goal(uuid, text, text, text, numeric, text, smallint[], numeric, date) from public, anon;
revoke all on function public.archive_group_goal(uuid) from public, anon;

grant execute on function public.create_group_goal(uuid, text, text, text, numeric, text, smallint[], numeric, date) to authenticated;
grant execute on function public.update_group_goal(uuid, text, text, text, numeric, text, smallint[], numeric, date) to authenticated;
grant execute on function public.archive_group_goal(uuid) to authenticated;
