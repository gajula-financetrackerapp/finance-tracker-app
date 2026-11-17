-- MoneyLit Phase 3 security enforcement.
-- Run AFTER account_deletion.sql, rewarded_ads_secure.sql and every
-- split_expense*.sql file (including split_expense_security.sql).

create or replace function public.account_is_active_for(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null
    and exists (
      select 1
      from public.profiles p
      where p.id = p_user_id
        and p.disabled_at is null
    );
$$;

revoke all on function public.account_is_active_for(uuid) from public, anon, authenticated;
grant execute on function public.account_is_active_for(uuid) to service_role;

create or replace function public.account_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.account_is_active_for(auth.uid());
$$;

revoke all on function public.account_is_active() from public, anon;
grant execute on function public.account_is_active() to authenticated;

-- PostgREST runs this before table and RPC requests, including requests made
-- with a JWT issued before the account was disabled.
create or replace function public.enforce_active_account_request()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  request_path text := coalesce(current_setting('request.path', true), '');
begin
  if auth.role() = 'authenticated'
    and request_path <> '/rpc/my_account_disabled'
    and not public.account_is_active_for(auth.uid())
  then
    raise exception 'Account disabled' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.enforce_active_account_request() from public;
grant execute on function public.enforce_active_account_request()
  to authenticator, anon, authenticated, service_role;
alter role authenticator set pgrst.db_pre_request = 'public.enforce_active_account_request';
notify pgrst, 'reload config';

-- Older billing/reward/split migrations grant table writes before introducing
-- constrained RPCs. This final migration always removes those direct paths.
revoke insert, update, delete on table public.play_subscription_grants
  from anon, authenticated;
revoke insert, update, delete on table public.rewarded_ad_claims
  from anon, authenticated;
revoke insert, update, delete on table public.split_expenses
  from anon, authenticated;
revoke insert, update, delete on table public.split_expense_shares
  from anon, authenticated;
revoke insert, update, delete on table public.split_settlements
  from anon, authenticated;

create table if not exists public.security_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  bucket_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, action, bucket_start)
);

alter table public.security_rate_limits enable row level security;
revoke all on public.security_rate_limits from public, anon, authenticated;
grant all on public.security_rate_limits to service_role;

create table if not exists public.security_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  outcome text not null,
  created_at timestamptz not null default now()
);

alter table public.security_events enable row level security;
revoke all on public.security_events from public, anon, authenticated;
grant all on public.security_events to service_role;
create index if not exists security_events_type_created_idx
  on public.security_events (event_type, created_at desc);

create or replace function public.consume_security_rate_limit_for_user(
  p_user_id uuid,
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  bucket timestamptz;
  next_count integer;
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_user_id is null
    or trim(coalesce(p_action, '')) = ''
    or p_limit < 1
    or p_window_seconds < 1
  then
    return false;
  end if;

  bucket := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );
  insert into public.security_rate_limits (user_id, action, bucket_start, request_count)
  values (p_user_id, left(trim(p_action), 80), bucket, 1)
  on conflict (user_id, action, bucket_start) do update
    set request_count = public.security_rate_limits.request_count + 1,
        updated_at = now()
  returning request_count into next_count;

  delete from public.security_rate_limits
  where bucket_start < now() - interval '7 days';
  if next_count > p_limit then
    insert into public.security_events (user_id, event_type, outcome)
    values (p_user_id, left(trim(p_action), 80), 'rate_limited');
  end if;
  return next_count <= p_limit;
end;
$$;

revoke all on function public.consume_security_rate_limit_for_user(uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_security_rate_limit_for_user(uuid, text, integer, integer)
  to service_role;

create or replace function public.consume_my_security_rate_limit(
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  bucket timestamptz;
  next_count integer;
begin
  if auth.uid() is null or not public.account_is_active_for(auth.uid()) then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if trim(coalesce(p_action, '')) = '' or p_limit < 1 or p_window_seconds < 1 then
    return false;
  end if;
  bucket := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );
  insert into public.security_rate_limits (user_id, action, bucket_start, request_count)
  values (auth.uid(), left(trim(p_action), 80), bucket, 1)
  on conflict (user_id, action, bucket_start) do update
    set request_count = public.security_rate_limits.request_count + 1,
        updated_at = now()
  returning request_count into next_count;
  if next_count > p_limit then
    insert into public.security_events (user_id, event_type, outcome)
    values (auth.uid(), left(trim(p_action), 80), 'rate_limited');
  end if;
  return next_count <= p_limit;
end;
$$;

revoke all on function public.consume_my_security_rate_limit(text, integer, integer)
  from public, anon, authenticated;

-- Direct lookup exposed ids, names and emails. Invitations now perform one
-- internal exact match, return the same null result for missing/disabled/self,
-- and are bounded against enumeration.
revoke all on function public.split_lookup_invitee(text) from public, anon, authenticated;

create or replace function public.split_invite_friend(p_email text)
returns public.split_friendships
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned text := lower(trim(coalesce(p_email, '')));
  target_id uuid;
  row public.split_friendships;
  reverse public.split_friendships;
begin
  if auth.uid() is null or not public.account_is_active_for(auth.uid()) then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not public.consume_my_security_rate_limit('split_invite_minute', 5, 60)
    or not public.consume_my_security_rate_limit('split_invite_day', 20, 86400)
  then
    raise exception 'Please wait before sending more invitations' using errcode = 'P0001';
  end if;
  if cleaned = '' or position('@' in cleaned) = 0 then
    return null;
  end if;

  select p.id into target_id
  from public.profiles p
  where lower(trim(p.email)) = cleaned
    and p.disabled_at is null
  limit 1;

  if target_id is null or target_id = auth.uid() then
    return null;
  end if;

  select * into reverse
  from public.split_friendships
  where requester_id = target_id and addressee_id = auth.uid();

  if reverse.id is not null then
    if reverse.status = 'accepted' then return reverse; end if;
    update public.split_friendships
      set status = 'accepted', updated_at = now()
      where id = reverse.id
      returning * into row;
    return row;
  end if;

  insert into public.split_friendships (requester_id, addressee_id, status)
  values (auth.uid(), target_id, 'pending')
  on conflict (requester_id, addressee_id) do update
    set status = 'pending', updated_at = now()
  returning * into row;
  return row;
end;
$$;

revoke all on function public.split_invite_friend(text) from public, anon;
grant execute on function public.split_invite_friend(text) to authenticated;

create or replace function public.guard_rewarded_ad_claim_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.account_is_active_for(new.user_id) then
    raise exception 'Account disabled' using errcode = '42501';
  end if;
  -- Serialize the count-and-insert decision per user. Without this lock,
  -- concurrent requests could all observe fewer than five pending claims.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  if (
    select count(*)
    from public.rewarded_ad_claims c
    where c.user_id = new.user_id
      and c.status = 'pending'
      and c.expires_at > now()
  ) >= 5 then
    raise exception 'Too many pending reward requests' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_rewarded_ad_claim_insert on public.rewarded_ad_claims;
create trigger guard_rewarded_ad_claim_insert
before insert on public.rewarded_ad_claims
for each row execute function public.guard_rewarded_ad_claim_insert();

-- A disabled user must not receive a delayed verified callback award.
create or replace function public.guard_disabled_profile_reward()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.diamonds is distinct from old.diamonds
    and not public.account_is_active_for(new.id)
  then
    raise exception 'Account disabled' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_disabled_profile_reward on public.profiles;
create trigger guard_disabled_profile_reward
before update of diamonds on public.profiles
for each row execute function public.guard_disabled_profile_reward();

-- Storage requests do not use the PostgREST pre-request hook, so enforce the
-- same active-account condition directly in every private receipt policy.
drop policy if exists "Users read own bill images" on storage.objects;
drop policy if exists "Users upload own bill images" on storage.objects;
drop policy if exists "Users update own bill images" on storage.objects;
drop policy if exists "Users delete own bill images" on storage.objects;

create policy "Users read own bill images"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'bill-images'
    and name like (auth.uid()::text || '/%')
    and public.account_is_active()
  );
create policy "Users upload own bill images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'bill-images'
    and name like (auth.uid()::text || '/%')
    and public.account_is_active()
  );
create policy "Users update own bill images"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'bill-images'
    and name like (auth.uid()::text || '/%')
    and public.account_is_active()
  )
  with check (
    bucket_id = 'bill-images'
    and name like (auth.uid()::text || '/%')
    and public.account_is_active()
  );
create policy "Users delete own bill images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'bill-images'
    and name like (auth.uid()::text || '/%')
    and public.account_is_active()
  );
