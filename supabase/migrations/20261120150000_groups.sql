-- Groups. Run this in Supabase before using the Groups screens.
-- Does not alter existing tables.

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  invite_code text not null,
  everyone_admin boolean not null default false,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  constraint groups_name_len check (char_length(btrim(name)) between 1 and 40),
  constraint groups_description_len check (description is null or char_length(description) <= 200),
  constraint groups_invite_code_format check (invite_code ~ '^[A-Z0-9]{6}$')
);

create unique index groups_invite_code_key on public.groups (invite_code);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id),
  constraint group_members_role check (role in ('admin', 'member'))
);

create index group_members_user_id_idx on public.group_members (user_id);

alter table public.groups enable row level security;
alter table public.group_members enable row level security;

revoke all on public.groups from public, anon, authenticated;
revoke all on public.group_members from public, anon, authenticated;
grant select on public.groups to authenticated;
grant select on public.group_members to authenticated;

-- Security definer so the membership check can read rows without recursing through RLS.
create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = p_group_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_group_admin(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = p_group_id
      and user_id = auth.uid()
      and role = 'admin'
  );
$$;

create policy groups_select_member
  on public.groups
  for select
  to authenticated
  using (public.is_group_member(id));

create policy group_members_select_member
  on public.group_members
  for select
  to authenticated
  using (public.is_group_member(group_id));

create or replace function public.generate_group_code()
returns text
language plpgsql
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  i int;
  tries int := 0;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.groups where invite_code = code);
    tries := tries + 1;
    if tries > 20 then
      raise exception 'Could not create an invite code.';
    end if;
  end loop;
  return code;
end;
$$;

create or replace function public.assert_group_age()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_age text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  select age_range into v_age from public.profiles where id = auth.uid();
  if v_age is null or btrim(v_age) = '' then
    raise exception 'Tell us your age range first.';
  end if;
  if lower(btrim(v_age)) in ('under 13', 'under_13', 'under-13') then
    raise exception 'Groups are for ages 13 and up.';
  end if;
end;
$$;

create or replace function public.create_group(p_name text, p_description text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_id uuid;
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  perform public.assert_group_age();
  if v_name = '' then
    raise exception 'Enter a group name.';
  end if;
  if char_length(v_name) > 40 then
    raise exception 'Group name must be 40 characters or less.';
  end if;
  if v_description is not null and char_length(v_description) > 200 then
    raise exception 'Description must be 200 characters or less.';
  end if;
  v_code := public.generate_group_code();
  insert into public.groups (name, description, invite_code, created_by)
  values (v_name, v_description, v_code, auth.uid())
  returning id into v_id;
  insert into public.group_members (group_id, user_id, role)
  values (v_id, auth.uid(), 'admin');
  return jsonb_build_object(
    'id', v_id,
    'name', v_name,
    'description', v_description,
    'invite_code', v_code
  );
end;
$$;

create or replace function public.join_group_by_code(p_code text, p_join boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_group public.groups%rowtype;
  v_count int;
  v_role text;
  v_already boolean;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if char_length(v_code) <> 6 then
    raise exception 'That code didn''t work. Check it and try again.';
  end if;
  select * into v_group from public.groups where invite_code = v_code for update;
  if not found then
    raise exception 'That code didn''t work. Check it and try again.';
  end if;
  select count(*)::int into v_count
  from public.group_members
  where group_id = v_group.id;
  select exists (
    select 1 from public.group_members
    where group_id = v_group.id and user_id = auth.uid()
  ) into v_already;
  if p_join and not v_already then
    perform public.assert_group_age();
    if v_count >= 50 then
      raise exception 'This group is full.';
    end if;
    v_role := case when v_group.everyone_admin then 'admin' else 'member' end;
    insert into public.group_members (group_id, user_id, role)
    values (v_group.id, auth.uid(), v_role);
    v_count := v_count + 1;
  end if;
  return jsonb_build_object(
    'group_id', v_group.id,
    'name', v_group.name,
    'member_count', v_count,
    'already_member', v_already
  );
end;
$$;

create or replace function public.leave_group(p_group_id uuid)
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
  if v_count <= 1 then
    delete from public.groups where id = p_group_id;
    return jsonb_build_object('deleted', true);
  end if;
  select count(*)::int into v_admins
  from public.group_members
  where group_id = p_group_id and role = 'admin';
  if v_role = 'admin' and v_admins <= 1 then
    raise exception 'Make someone else an admin before you leave.';
  end if;
  delete from public.group_members
  where group_id = p_group_id and user_id = auth.uid();
  return jsonb_build_object('deleted', false);
end;
$$;

create or replace function public.set_member_role(p_group_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_everyone boolean;
  v_admins int;
  v_current text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if not public.is_group_admin(p_group_id) then
    raise exception 'Only an admin can do that.';
  end if;
  if p_role not in ('admin', 'member') then
    raise exception 'Only an admin can do that.';
  end if;
  perform 1 from public.groups where id = p_group_id for update;
  select everyone_admin into v_everyone from public.groups where id = p_group_id;
  select role into v_current
  from public.group_members
  where group_id = p_group_id and user_id = p_user_id;
  if v_current is null then
    raise exception 'That person is not in this group.';
  end if;
  if p_role = 'member' and v_everyone then
    raise exception 'Everyone in this group is an admin.';
  end if;
  if p_role = 'member' and v_current = 'admin' then
    select count(*)::int into v_admins
    from public.group_members
    where group_id = p_group_id and role = 'admin';
    if v_admins <= 1 then
      raise exception 'Make someone else an admin first.';
    end if;
  end if;
  update public.group_members
  set role = p_role
  where group_id = p_group_id and user_id = p_user_id;
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
  delete from public.group_members
  where group_id = p_group_id and user_id = p_user_id;
end;
$$;

create or replace function public.reset_invite_code(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if not public.is_group_admin(p_group_id) then
    raise exception 'Only an admin can do that.';
  end if;
  v_code := public.generate_group_code();
  update public.groups set invite_code = v_code where id = p_group_id;
  return v_code;
end;
$$;

create or replace function public.rename_group(p_group_id uuid, p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if not public.is_group_admin(p_group_id) then
    raise exception 'Only an admin can do that.';
  end if;
  if v_name = '' then
    raise exception 'Enter a group name.';
  end if;
  if char_length(v_name) > 40 then
    raise exception 'Group name must be 40 characters or less.';
  end if;
  update public.groups set name = v_name where id = p_group_id;
  return v_name;
end;
$$;

create or replace function public.set_everyone_admin(p_group_id uuid, p_on boolean)
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
  set everyone_admin = coalesce(p_on, false)
  where id = p_group_id;
  if coalesce(p_on, false) then
    update public.group_members
    set role = 'admin'
    where group_id = p_group_id;
  end if;
end;
$$;

create or replace function public.delete_group(p_group_id uuid)
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
  delete from public.groups where id = p_group_id;
end;
$$;

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
        )
      )
      order by g.name
    ),
    '[]'::jsonb
  )
  from public.groups g
  join public.group_members me on me.group_id = g.id and me.user_id = auth.uid();
$$;

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
    'invite_code', case when v_role = 'admin' then v_group.invite_code else null end,
    'role', v_role,
    'member_count', v_count
  );
end;
$$;

create or replace function public.list_group_members(p_group_id uuid)
returns jsonb
language plpgsql
stable
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
  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'user_id', m.user_id,
          'display_name', coalesce(nullif(btrim(p.display_name), ''), 'Member'),
          'role', m.role,
          'joined_at', m.joined_at
        )
        order by case when m.role = 'admin' then 0 else 1 end, p.display_name
      )
      from public.group_members m
      left join public.profiles p on p.id = m.user_id
      where m.group_id = p_group_id
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.is_group_member(uuid) from public, anon;
revoke all on function public.is_group_admin(uuid) from public, anon;
revoke all on function public.generate_group_code() from public, anon, authenticated;
revoke all on function public.assert_group_age() from public, anon, authenticated;
revoke all on function public.create_group(text, text) from public, anon;
revoke all on function public.join_group_by_code(text, boolean) from public, anon;
revoke all on function public.leave_group(uuid) from public, anon;
revoke all on function public.set_member_role(uuid, uuid, text) from public, anon;
revoke all on function public.remove_member(uuid, uuid) from public, anon;
revoke all on function public.reset_invite_code(uuid) from public, anon;
revoke all on function public.rename_group(uuid, text) from public, anon;
revoke all on function public.set_everyone_admin(uuid, boolean) from public, anon;
revoke all on function public.delete_group(uuid) from public, anon;
revoke all on function public.list_my_groups() from public, anon;
revoke all on function public.get_group(uuid) from public, anon;
revoke all on function public.list_group_members(uuid) from public, anon;

grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.is_group_admin(uuid) to authenticated;
grant execute on function public.create_group(text, text) to authenticated;
grant execute on function public.join_group_by_code(text, boolean) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
grant execute on function public.reset_invite_code(uuid) to authenticated;
grant execute on function public.rename_group(uuid, text) to authenticated;
grant execute on function public.set_everyone_admin(uuid, boolean) to authenticated;
grant execute on function public.delete_group(uuid) to authenticated;
grant execute on function public.list_my_groups() to authenticated;
grant execute on function public.get_group(uuid) to authenticated;
grant execute on function public.list_group_members(uuid) to authenticated;
