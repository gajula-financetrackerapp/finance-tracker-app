-- Run in Supabase → SQL Editor
-- Per-user expense/income category lists for Category Settings.

create table if not exists public.user_categories (
  user_id uuid primary key references auth.users (id) on delete cascade,
  expense jsonb not null default '[]'::jsonb,
  income jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_categories enable row level security;

drop policy if exists "Users manage own categories" on public.user_categories;
create policy "Users manage own categories"
  on public.user_categories
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
