-- Google Play subscriptions for Plus / Premium.
-- Run in Supabase → SQL Editor after premium_sync.sql and admin_premium_users.sql.
--
-- Product IDs must match the app (src/lib/playBilling.ts) and Play Console exactly:
--   moneylit_plus_monthly     Plus, billed every month
--   moneylit_plus_yearly      Plus, billed every year
--   moneylit_premium_monthly  Premium, billed every month
--   moneylit_premium_yearly   Premium, billed every year
--
-- This RPC records the Play purchase token (one token → one MoneyLit user) and
-- writes the plan onto profiles. Plus sets plan_kind = plus and leaves
-- is_premium false. Premium sets plan_kind = premium and is_premium true.
-- Google Play Developer API verification can be added later.

alter table public.profiles
  add column if not exists plan_kind text;

alter table public.profiles
  drop constraint if exists profiles_plan_kind_chk;

alter table public.profiles
  add constraint profiles_plan_kind_chk
  check (plan_kind is null or plan_kind in ('plus', 'premium'));

comment on column public.profiles.plan_kind is
  'Play plan for this account: plus, premium, or null when Premium was granted without a Play product';

create table if not exists public.play_subscription_grants (
  purchase_token text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  product_id text not null,
  plan_kind text not null,
  billing text not null,
  transaction_id text,
  granted_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint play_subscription_grants_plan_kind_chk
    check (plan_kind in ('plus', 'premium')),
  constraint play_subscription_grants_billing_chk
    check (billing in ('month', 'year'))
);

create index if not exists play_subscription_grants_user_id_idx
  on public.play_subscription_grants (user_id);

comment on table public.play_subscription_grants is
  'Play Billing purchase tokens already applied to a MoneyLit account';

alter table public.play_subscription_grants enable row level security;

drop function if exists public.apply_play_subscription(text, text, text);

create or replace function public.apply_play_subscription(
  p_purchase_token text,
  p_product_id text,
  p_transaction_id text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  token text;
  sku text;
  grant_plan text;
  billing_norm text;
  until_at timestamptz;
  existing_user uuid;
  row public.profiles;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not authenticated';
  end if;

  token := nullif(trim(p_purchase_token), '');
  sku := lower(nullif(trim(p_product_id), ''));
  if token is null or length(token) < 20 then
    raise exception 'missing play purchase token';
  end if;
  if sku is null then
    raise exception 'missing play product';
  end if;

  if sku not in (
    'moneylit_plus_monthly',
    'moneylit_plus_yearly',
    'moneylit_premium_monthly',
    'moneylit_premium_yearly'
  ) then
    raise exception 'unknown play product';
  end if;

  if sku like 'moneylit_plus_%' then
    grant_plan := 'plus';
  else
    grant_plan := 'premium';
  end if;

  if sku like '%_monthly' then
    billing_norm := 'month';
    until_at := now() + interval '40 days';
  else
    billing_norm := 'year';
    until_at := now() + interval '400 days';
  end if;

  select g.user_id into existing_user
  from public.play_subscription_grants g
  where g.purchase_token = token;

  if existing_user is not null and existing_user is distinct from uid then
    raise exception 'play purchase already linked' using errcode = '42501';
  end if;

  insert into public.play_subscription_grants (
    purchase_token,
    user_id,
    product_id,
    plan_kind,
    billing,
    transaction_id,
    granted_at,
    last_seen_at
  )
  values (
    token,
    uid,
    sku,
    grant_plan,
    billing_norm,
    nullif(trim(p_transaction_id), ''),
    now(),
    now()
  )
  on conflict (purchase_token) do update
  set
    product_id = excluded.product_id,
    plan_kind = excluded.plan_kind,
    billing = excluded.billing,
    transaction_id = coalesce(excluded.transaction_id, public.play_subscription_grants.transaction_id),
    last_seen_at = now();

  -- A Plus receipt must not replace a Premium Play plan that is still running.
  if grant_plan = 'plus' and exists (
    select 1
    from public.play_subscription_grants g
    where g.user_id = uid
      and g.plan_kind = 'premium'
      and g.purchase_token is distinct from token
  ) and exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.is_premium = true
      and coalesce(p.plan_kind, 'premium') = 'premium'
      and p.premium_until is not null
      and p.premium_until >= now() + interval '10 days'
  ) then
    select * into row from public.profiles where id = uid;
  else
    update public.profiles
    set
      plan_kind = grant_plan,
      is_premium = (grant_plan = 'premium'),
      premium_since = coalesce(premium_since, now()),
      premium_until = case
        -- First Play grant, or an expired / almost-expired period (renewal).
        when premium_until is null then until_at
        when premium_until < now() + interval '10 days' then greatest(premium_until, until_at)
        else premium_until
      end,
      premium_billing = billing_norm,
      premium_ended_at = null,
      cloud_purge_at = null,
      updated_at = now()
    where id = uid
    returning * into row;
  end if;

  if row.id is null then
    raise exception 'user profile not found';
  end if;

  return json_build_object(
    'id', row.id,
    'email', row.email,
    'full_name', row.full_name,
    'role', row.role,
    'is_premium', row.is_premium,
    'plan_kind', row.plan_kind,
    'premium_since', row.premium_since,
    'premium_until', row.premium_until,
    'premium_billing', row.premium_billing,
    'premium_ended_at', row.premium_ended_at
  );
end;
$$;

revoke all on function public.apply_play_subscription(text, text, text) from public;
grant execute on function public.apply_play_subscription(text, text, text) to authenticated;

-- Plus must not pass the Split server check. Premium (and a legacy is_premium
-- row with no plan) still does.
create or replace function public.split_user_is_premium(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select
        p.is_premium = true
        and coalesce(p.plan_kind, '') is distinct from 'plus'
        and (p.premium_until is null or p.premium_until > now())
      from public.profiles p
      where p.id = uid
    ),
    false
  );
$$;

-- Admin Premium is the full plan. Turning it off clears a Play plan tag too.
create or replace function public.admin_set_user_premium(
  target_id uuid,
  enable boolean,
  since_at timestamptz default null,
  until_at timestamptz default null,
  billing text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.profiles;
  billing_norm text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_profile_admin() then
    raise exception 'not authorized';
  end if;
  if target_id is null then
    raise exception 'missing target';
  end if;

  billing_norm := lower(nullif(trim(billing), ''));
  if billing_norm is not null and billing_norm not in ('month', 'year') then
    raise exception 'billing must be month or year';
  end if;

  if enable then
    update public.profiles
    set
      is_premium = true,
      plan_kind = 'premium',
      premium_since = coalesce(since_at, now()),
      premium_until = until_at,
      premium_billing = coalesce(billing_norm, premium_billing, 'year'),
      premium_ended_at = null,
      cloud_purge_at = null,
      updated_at = now()
    where id = target_id
    returning * into row;
  else
    update public.profiles
    set
      is_premium = false,
      plan_kind = null,
      premium_until = null,
      premium_billing = null,
      premium_ended_at = now(),
      cloud_purge_at = now() + interval '3 months',
      updated_at = now()
    where id = target_id
    returning * into row;
  end if;

  if row.id is null then
    raise exception 'user profile not found';
  end if;

  return json_build_object(
    'id', row.id,
    'email', row.email,
    'full_name', row.full_name,
    'role', row.role,
    'is_premium', row.is_premium,
    'plan_kind', row.plan_kind,
    'premium_since', row.premium_since,
    'premium_until', row.premium_until,
    'premium_billing', row.premium_billing,
    'premium_ended_at', row.premium_ended_at
  );
end;
$$;

-- Keep plan_kind server-managed. This matches the later guard (account status
-- plus the email lock) and adds the new column.
alter table public.profiles
  add column if not exists disabled_at timestamptz;

alter table public.profiles
  add column if not exists disabled_reason text;

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
  if current_user = 'authenticated' and public.is_profile_admin() then
    return new;
  end if;

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
    new.plan_kind := null;
    new.premium_since := null;
    new.premium_ended_at := null;
    new.cloud_purge_at := null;
    new.premium_until := null;
    new.premium_billing := null;
    new.premium_pass_until := null;
    new.diamonds := 0;
    new.disabled_at := null;
    new.disabled_reason := null;
    return new;
  end if;

  if new.role is distinct from old.role
    or new.is_premium is distinct from old.is_premium
    or new.plan_kind is distinct from old.plan_kind
    or new.premium_since is distinct from old.premium_since
    or new.premium_ended_at is distinct from old.premium_ended_at
    or new.cloud_purge_at is distinct from old.cloud_purge_at
    or new.premium_until is distinct from old.premium_until
    or new.premium_billing is distinct from old.premium_billing
    or new.premium_pass_until is distinct from old.premium_pass_until
    or new.diamonds is distinct from old.diamonds
    or new.disabled_at is distinct from old.disabled_at
    or new.disabled_reason is distinct from old.disabled_reason
  then
    raise exception 'Role, Premium, diamonds and account status are server-managed'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Accounts already granted from Play: follow the latest token, not is_premium.
update public.profiles p
set
  plan_kind = g.plan_kind,
  is_premium = (g.plan_kind = 'premium'),
  updated_at = now()
from (
  select distinct on (user_id) user_id, plan_kind
  from public.play_subscription_grants
  order by user_id, last_seen_at desc
) g
where p.id = g.user_id
  and (p.premium_until is null or p.premium_until > now());
