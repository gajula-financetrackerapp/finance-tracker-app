-- Run in Supabase → SQL Editor (after profiles schema)
-- Stores each user's finance + reminders in the cloud (bill images stay local for now).

create table if not exists public.user_finance (
  user_id uuid primary key references auth.users (id) on delete cascade,
  accounts jsonb not null default '[]'::jsonb,
  transactions jsonb not null default '[]'::jsonb,
  budget numeric not null default 0,
  category_budgets jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_finance enable row level security;

drop policy if exists "Users manage own finance" on public.user_finance;
create policy "Users manage own finance"
  on public.user_finance
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.user_reminders (
  user_id uuid primary key references auth.users (id) on delete cascade,
  expense jsonb not null default '[]'::jsonb,
  medicine jsonb not null default '[]'::jsonb,
  grocery jsonb not null default '[]'::jsonb,
  general jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_reminders enable row level security;

drop policy if exists "Users manage own reminders" on public.user_reminders;
create policy "Users manage own reminders"
  on public.user_reminders
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
