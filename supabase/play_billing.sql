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
-- turns Premium on. Google Play Developer API verification can be added later.

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
  plan_kind text;
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
    plan_kind := 'plus';
  else
    plan_kind := 'premium';
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
    plan_kind,
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

  update public.profiles
  set
    is_premium = true,
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

  if row.id is null then
    raise exception 'user profile not found';
  end if;

  return json_build_object(
    'id', row.id,
    'email', row.email,
    'full_name', row.full_name,
    'role', row.role,
    'is_premium', row.is_premium,
    'premium_since', row.premium_since,
    'premium_until', row.premium_until,
    'premium_billing', row.premium_billing,
    'premium_ended_at', row.premium_ended_at
  );
end;
$$;

revoke all on function public.apply_play_subscription(text, text, text) from public;
grant execute on function public.apply_play_subscription(text, text, text) to authenticated;
