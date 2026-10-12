create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  week_start smallint not null default 0 check (week_start in (0,1)), -- 0=Sun, 1=Mon
  time_format text not null default 'system' check (time_format in ('system','12h','24h')),
  updated_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
create policy "own settings select" on public.user_settings for select using (auth.uid() = user_id);
create policy "own settings insert" on public.user_settings for insert with check (auth.uid() = user_id);
create policy "own settings update" on public.user_settings for update using (auth.uid() = user_id);
