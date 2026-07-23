-- Optional: run in Supabase → SQL Editor to sync multiple cash books to the cloud.
-- Until this runs, cash books still work on-device; cloud sync keeps the active book only.

alter table public.user_finance
  add column if not exists books jsonb,
  add column if not exists active_book_id text;
