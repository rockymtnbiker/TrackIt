-- Counts contact-info refusals in groups with a possible minor.
-- App users cannot read or write this table. Safe to re-run.

create table if not exists public.contact_info_attempts (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  body_snapshot text not null,
  created_at timestamptz not null default now(),
  constraint contact_info_attempts_body_len check (char_length(body_snapshot) between 1 and 1000)
);

create index if not exists contact_info_attempts_sender_created_idx
  on public.contact_info_attempts (sender_id, created_at desc);

alter table public.contact_info_attempts enable row level security;

revoke all on public.contact_info_attempts from public, anon, authenticated;
