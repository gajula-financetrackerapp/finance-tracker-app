-- Premium sync, single-session lock, and frozen-cloud purge.
-- Run in Supabase → SQL Editor after schema.sql / user_data.sql.

-- ─── Profile premium + session fields ───────────────────────────────────────
alter table public.profiles
  add column if not exists is_premium boolean not null default false;

alter table public.profiles
  add column if not exists premium_since timestamptz;

alter table public.profiles
  add column if not exists premium_ended_at timestamptz;

alter table public.profiles
  add column if not exists cloud_purge_at timestamptz;

alter table public.profiles
  add column if not exists active_session_id text;

comment on column public.profiles.is_premium is 'Premium cloud sync entitlement';
comment on column public.profiles.premium_since is 'Server time when current Premium period started; only data from this point syncs';
comment on column public.profiles.premium_ended_at is 'When Premium was turned off (cloud frozen)';
comment on column public.profiles.cloud_purge_at is 'Delete frozen cloud data after this time (ended_at + 3 months)';
comment on column public.profiles.active_session_id is 'Only one device session allowed; mismatch forces sign-out';

-- ─── Server-time Premium helpers (callable with user JWT) ───────────────────
create or replace function public.set_premium_status(enable boolean)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if enable then
    update public.profiles
    set
      is_premium = true,
      premium_since = now(),
      premium_ended_at = null,
      cloud_purge_at = null,
      updated_at = now()
    where id = auth.uid()
    returning * into row;
  else
    update public.profiles
    set
      is_premium = false,
      premium_ended_at = now(),
      cloud_purge_at = now() + interval '3 months',
      updated_at = now()
    where id = auth.uid()
    returning * into row;
  end if;

  return row;
end;
$$;

revoke all on function public.set_premium_status(boolean) from public;
grant execute on function public.set_premium_status(boolean) to authenticated;

create or replace function public.claim_session(session_id text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if session_id is null or length(trim(session_id)) < 8 then
    raise exception 'Invalid session id';
  end if;

  update public.profiles
  set
    active_session_id = session_id,
    updated_at = now()
  where id = auth.uid()
  returning * into row;

  return row;
end;
$$;

revoke all on function public.claim_session(text) from public;
grant execute on function public.claim_session(text) to authenticated;

-- ─── Purge frozen cloud rows (call from Edge Function with service role) ────
create or replace function public.purge_expired_cloud_data()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer := 0;
  r record;
begin
  for r in
    select id
    from public.profiles
    where is_premium = false
      and cloud_purge_at is not null
      and cloud_purge_at <= now()
  loop
    delete from public.user_finance where user_id = r.id;
    delete from public.user_reminders where user_id = r.id;
    delete from public.user_categories where user_id = r.id;
    -- Best-effort: remove storage objects if bucket exists (ignore errors).
    begin
      delete from storage.objects
      where bucket_id = 'bill-images'
        and name like r.id::text || '/%';
    exception when others then
      null;
    end;

    update public.profiles
    set
      cloud_purge_at = null,
      premium_since = null,
      premium_ended_at = null,
      updated_at = now()
    where id = r.id;

    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.purge_expired_cloud_data() from public;

-- ─── Bill images bucket (Premium) ───────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('bill-images', 'bill-images', false)
on conflict (id) do nothing;

drop policy if exists "Users read own bill images" on storage.objects;
create policy "Users read own bill images"
  on storage.objects for select
  using (
    bucket_id = 'bill-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users upload own bill images" on storage.objects;
create policy "Users upload own bill images"
  on storage.objects for insert
  with check (
    bucket_id = 'bill-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users update own bill images" on storage.objects;
create policy "Users update own bill images"
  on storage.objects for update
  using (
    bucket_id = 'bill-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users delete own bill images" on storage.objects;
create policy "Users delete own bill images"
  on storage.objects for delete
  using (
    bucket_id = 'bill-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
