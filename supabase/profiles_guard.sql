-- Entitlements on public.profiles are decided by the server, never by the app.
-- RLS on profiles only proves the row belongs to the caller, so on its own it
-- lets a signed-in user PATCH role / is_premium / diamonds straight through the
-- REST API with the anon key that ships inside the published app. This trigger
-- is what stops that: direct client writes cannot touch the columns below,
-- while the security-definer RPCs (ensure_my_profile, set_premium_status,
-- claim_session, admin_set_user_premium, earn_diamonds_for_ad,
-- redeem_premium_pass, purchase_diamond_item) run as the table owner and pass
-- through untouched.
--
-- Run in Supabase → SQL Editor after schema.sql, premium_sync.sql,
-- admin_list_users.sql, admin_premium_users.sql and diamonds.sql.

-- Guarded columns, declared defensively so this file can run on its own.
alter table public.profiles
  add column if not exists is_premium boolean not null default false;

alter table public.profiles
  add column if not exists premium_since timestamptz;

alter table public.profiles
  add column if not exists premium_ended_at timestamptz;

alter table public.profiles
  add column if not exists cloud_purge_at timestamptz;

alter table public.profiles
  add column if not exists premium_until timestamptz;

alter table public.profiles
  add column if not exists premium_billing text;

alter table public.profiles
  add column if not exists premium_pass_until timestamptz;

alter table public.profiles
  add column if not exists diamonds integer not null default 0;

-- Security invoker on purpose: current_user has to keep naming the writer.
-- Inside a security-definer RPC it is the function owner, and only a direct
-- PostgREST call arrives as anon / authenticated.
create or replace function public.profiles_guard_entitlements()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  jwt_email text;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  -- is_profile_admin is granted to authenticated only, so ask it there.
  if current_user = 'authenticated' and public.is_profile_admin() then
    return new;
  end if;

  -- Profile email must match the JWT. Direct PATCH of email was an admin bypass.
  if current_user = 'authenticated' then
    jwt_email := nullif(trim(coalesce(auth.jwt() ->> 'email', '')), '');
    if jwt_email is not null then
      new.email := jwt_email;
    elsif tg_op = 'UPDATE' then
      new.email := old.email;
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.role := 'user';
    new.is_premium := false;
    new.premium_since := null;
    new.premium_ended_at := null;
    new.cloud_purge_at := null;
    new.premium_until := null;
    new.premium_billing := null;
    new.premium_pass_until := null;
    new.diamonds := 0;
    return new;
  end if;

  if new.role is distinct from old.role
    or new.is_premium is distinct from old.is_premium
    or new.premium_since is distinct from old.premium_since
    or new.premium_ended_at is distinct from old.premium_ended_at
    or new.cloud_purge_at is distinct from old.cloud_purge_at
    or new.premium_until is distinct from old.premium_until
    or new.premium_billing is distinct from old.premium_billing
    or new.premium_pass_until is distinct from old.premium_pass_until
    or new.diamonds is distinct from old.diamonds
  then
    raise exception 'Role, Premium and diamonds are server-managed'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_entitlements on public.profiles;
create trigger profiles_guard_entitlements
  before insert or update on public.profiles
  for each row execute function public.profiles_guard_entitlements();

comment on function public.profiles_guard_entitlements() is
  'Blocks client writes to role / Premium / diamond columns on profiles.';

-- Anyone self-promoted before this trigger existed keeps admin, so list the
-- admins and demote whoever should not be there:
--   select id, email, role, is_premium, diamonds from public.profiles
--   where role = 'admin' order by updated_at desc;
