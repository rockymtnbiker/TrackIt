-- Connect a personal goal to a group goal, or keep the automatic copy.
-- Run after the group goals migration.
-- group_link tells a plain copy ('copy') from a personal goal the member connected ('connected').

alter table public.goals
  add column if not exists connected_at timestamptz;

alter table public.goals
  add column if not exists group_link text;

alter table public.goals
  drop constraint if exists goals_group_link_check;

alter table public.goals
  add constraint goals_group_link_check
  check (group_link is null or group_link in ('copy', 'connected'));

update public.goals
set group_link = 'copy',
    connected_at = coalesce(connected_at, created_date, now())
where group_goal_id is not null
  and group_link is null;

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
    group_goal_id,
    group_link,
    connected_at
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
    now()
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

create or replace function public.connect_goal_to_group_goal(
  p_personal_goal_id uuid,
  p_group_goal_id uuid
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
    coalesce(v_personal.actual_start_date, v_personal.created_date::date),
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
      connected_at = now()
  where id = v_personal.id;
end;
$$;

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
      connected_at = null
  where id = p_goal_id;
end;
$$;

create or replace function public.add_group_goal_to_my_goals(p_group_goal_id uuid)
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
  perform public.copy_group_goal_to_user(p_group_goal_id, auth.uid());
end;
$$;

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
      connected_at = null
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
        connected_at = null
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

revoke all on function public.release_member_group_goals(uuid, uuid, boolean) from public, anon, authenticated;

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

revoke all on function public.connect_goal_to_group_goal(uuid, uuid) from public, anon;
revoke all on function public.disconnect_goal(uuid) from public, anon;
revoke all on function public.add_group_goal_to_my_goals(uuid) from public, anon;
revoke all on function public.leave_group(uuid, boolean) from public, anon;

grant execute on function public.connect_goal_to_group_goal(uuid, uuid) to authenticated;
grant execute on function public.disconnect_goal(uuid) to authenticated;
grant execute on function public.add_group_goal_to_my_goals(uuid) to authenticated;
grant execute on function public.leave_group(uuid, boolean) to authenticated;
