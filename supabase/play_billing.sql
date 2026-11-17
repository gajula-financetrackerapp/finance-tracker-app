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
-- The app first verifies every token through verify-play-subscription; only
-- that Edge Function's service role can call the grant function below.

alter table public.profiles
  add column if not exists plan_kind text;
alter table public.profiles
  add column if not exists play_entitlement_managed boolean not null default false;

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

alter table public.play_subscription_grants
  add column if not exists expiry_time timestamptz,
  add column if not exists subscription_state text,
  add column if not exists verified_at timestamptz,
  add column if not exists latest_order_id text,
  add column if not exists obfuscated_account_id text,
  add column if not exists auto_renewing boolean;

create index if not exists play_subscription_grants_user_id_idx
  on public.play_subscription_grants (user_id);

comment on table public.play_subscription_grants is
  'Play Billing purchase tokens already applied to a MoneyLit account';

alter table public.play_subscription_grants enable row level security;

update public.profiles p
set play_entitlement_managed = true
where p.premium_until is not null
  and exists (
    select 1 from public.play_subscription_grants g where g.user_id = p.id
  );

drop function if exists public.sync_verified_play_subscription(
  uuid, text, text, text, timestamptz, text, text, boolean
);

create function public.sync_verified_play_subscription(
  p_user_id uuid,
  p_purchase_token text,
  p_product_id text,
  p_latest_order_id text,
  p_expiry_time timestamptz,
  p_subscription_state text,
  p_obfuscated_account_id text default null,
  p_auto_renewing boolean default false
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  token text;
  sku text;
  grant_plan text;
  billing_norm text;
  existing_user uuid;
  best record;
  row public.profiles;
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'missing user';
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
  billing_norm := case when sku like '%_monthly' then 'month' else 'year' end;

  if p_expiry_time is null then
    raise exception 'missing verified expiry';
  end if;
  if p_subscription_state not in (
    'SUBSCRIPTION_STATE_PENDING',
    'SUBSCRIPTION_STATE_ACTIVE',
    'SUBSCRIPTION_STATE_PAUSED',
    'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
    'SUBSCRIPTION_STATE_ON_HOLD',
    'SUBSCRIPTION_STATE_CANCELED',
    'SUBSCRIPTION_STATE_EXPIRED',
    'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED'
  ) then
    raise exception 'unknown subscription state';
  end if;

  select g.user_id into existing_user
  from public.play_subscription_grants g
  where g.purchase_token = token;

  if existing_user is not null and existing_user is distinct from p_user_id then
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
    last_seen_at,
    expiry_time,
    subscription_state,
    verified_at,
    latest_order_id,
    obfuscated_account_id,
    auto_renewing
  )
  values (
    token,
    p_user_id,
    sku,
    grant_plan,
    billing_norm,
    nullif(trim(p_latest_order_id), ''),
    now(),
    now(),
    p_expiry_time,
    p_subscription_state,
    now(),
    nullif(trim(p_latest_order_id), ''),
    nullif(trim(p_obfuscated_account_id), ''),
    coalesce(p_auto_renewing, false)
  )
  on conflict (purchase_token) do update
  set
    product_id = excluded.product_id,
    plan_kind = excluded.plan_kind,
    billing = excluded.billing,
    transaction_id = coalesce(excluded.transaction_id, public.play_subscription_grants.transaction_id),
    last_seen_at = now(),
    expiry_time = excluded.expiry_time,
    subscription_state = excluded.subscription_state,
    verified_at = now(),
    latest_order_id = coalesce(excluded.latest_order_id, public.play_subscription_grants.latest_order_id),
    obfuscated_account_id = coalesce(
      excluded.obfuscated_account_id,
      public.play_subscription_grants.obfuscated_account_id
    ),
    auto_renewing = excluded.auto_renewing;

  select
    g.plan_kind,
    g.billing,
    g.expiry_time
  into best
  from public.play_subscription_grants g
  where g.user_id = p_user_id
    and g.subscription_state in (
      'SUBSCRIPTION_STATE_ACTIVE',
      'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
      'SUBSCRIPTION_STATE_CANCELED'
    )
    and g.expiry_time > now()
  order by
    (g.plan_kind = 'premium') desc,
    g.expiry_time desc
  limit 1;

  if found then
    update public.profiles
    set
      plan_kind = best.plan_kind,
      is_premium = (best.plan_kind = 'premium'),
      premium_since = coalesce(premium_since, now()),
      premium_until = best.expiry_time,
      premium_billing = best.billing,
      play_entitlement_managed = true,
      premium_ended_at = null,
      cloud_purge_at = null,
      updated_at = now()
    where id = p_user_id
    returning * into row;
  else
    update public.profiles
    set
      plan_kind = null,
      is_premium = false,
      premium_until = null,
      premium_billing = null,
      premium_ended_at = coalesce(premium_ended_at, now()),
      cloud_purge_at = coalesce(cloud_purge_at, now() + interval '3 months'),
      updated_at = now()
    where id = p_user_id
      and play_entitlement_managed = true
    returning * into row;
    if not found then
      select * into row from public.profiles where id = p_user_id;
    end if;
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

revoke all on function public.sync_verified_play_subscription(
  uuid, text, text, text, timestamptz, text, text, boolean
) from public, anon, authenticated;
grant execute on function public.sync_verified_play_subscription(
  uuid, text, text, text, timestamptz, text, text, boolean
) to service_role;

-- Legacy builds called this function directly with an unverified token. Keep
-- the signature only to return a clear failure; current builds use the Edge
-- Function above, which verifies the token with Google first.
drop function if exists public.apply_play_subscription(text, text, text);
create function public.apply_play_subscription(
  p_purchase_token text,
  p_product_id text,
  p_transaction_id text default null
)
returns json
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'Update MoneyLit to verify this purchase securely';
end;
$$;

revoke all on function public.apply_play_subscription(text, text, text) from public;
revoke all on function public.apply_play_subscription(text, text, text) from anon, authenticated;

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
      play_entitlement_managed = false,
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
      play_entitlement_managed = false,
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
    new.play_entitlement_managed := false;
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
    or new.play_entitlement_managed is distinct from old.play_entitlement_managed
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
