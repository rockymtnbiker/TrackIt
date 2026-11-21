-- Group progress. Members see totals from get_group_progress only.
-- Another member's group-goal rows stay hidden from normal selects.

alter table public.groups
  add column if not exists show_member_progress boolean not null default false;

-- True when this row is not someone else's group goal, or the caller owns it,
-- or an accountability partner share covers the top-level goal.
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
  return false;
end;
$$;

revoke all on function public.can_read_group_goal_row(uuid) from public, anon;
grant execute on function public.can_read_group_goal_row(uuid) to authenticated;

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

-- Week score for one linked goal. Not granted to clients.
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
  v_cutoff := coalesce((v_goal.connected_at at time zone 'utc')::date, p_week_start);
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

  v_start := coalesce(v_goal.actual_start_date, (v_goal.created_date at time zone 'utc')::date);
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

revoke all on function public.member_week_score(uuid, date) from public, anon, authenticated;

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
    v_sum := v_sum + v_collective;
    v_count := v_count + 1;

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
    and entry.entry_date >= coalesce((g.connected_at at time zone 'utc')::date, p_week_start);

  return jsonb_build_object(
    'show_member_progress', v_show,
    'overall_pct', case when v_count = 0 then 0 else round(v_sum::numeric / v_count)::int end,
    'active_members', coalesce(v_active, 0),
    'goals', v_goals
  );
end;
$$;

revoke all on function public.get_group_progress(uuid, date) from public, anon;
grant execute on function public.get_group_progress(uuid, date) to authenticated;

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
