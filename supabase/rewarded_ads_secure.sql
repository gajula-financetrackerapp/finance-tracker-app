-- Verified AdMob rewarded-ad claims.
-- Run after diamonds.sql and split_expense_free_quota.sql.

create table if not exists public.rewarded_ad_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  purpose text not null check (purpose in ('standard', 'split_save')),
  status text not null default 'pending'
    check (status in ('pending', 'awarded', 'rejected')),
  transaction_id text unique,
  awarded_amount integer not null default 0 check (awarded_amount >= 0),
  rejection_reason text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  awarded_at timestamptz
);

create index if not exists rewarded_ad_claims_user_created_idx
  on public.rewarded_ad_claims (user_id, created_at desc);

alter table public.rewarded_ad_claims enable row level security;
alter table public.rewarded_ad_claims
  add column if not exists remaining_amount integer not null default 0
    check (remaining_amount >= 0);
revoke all on table public.rewarded_ad_claims from public, anon, authenticated;

drop policy if exists "rewarded_ad_claims_select_own" on public.rewarded_ad_claims;
create policy "rewarded_ad_claims_select_own"
  on public.rewarded_ad_claims for select
  using (auth.uid() = user_id);
grant select on table public.rewarded_ad_claims to authenticated;

create or replace function public.create_rewarded_ad_claim(
  p_purpose text default 'standard'
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  purpose_norm text := lower(coalesce(nullif(trim(p_purpose), ''), 'standard'));
  econ jsonb := public.diamond_economy();
  tz text;
  cap integer;
  per_ad integer;
  earned_today integer;
  state jsonb;
  claim public.rewarded_ad_claims;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if purpose_norm not in ('standard', 'split_save') then
    raise exception 'Unknown reward purpose';
  end if;
  if not coalesce((econ->>'enabled')::boolean, true) then
    return json_build_object(
      'ok', false,
      'reason', 'disabled',
      'state', public.diamond_state_json(uid)
    );
  end if;

  tz := coalesce(nullif(econ->>'timezone', ''), 'Asia/Kolkata');
  cap := greatest(coalesce((econ->>'dailyAdCap')::int, 5), 0);
  per_ad := greatest(coalesce((econ->>'perAd')::int, 1), 0);

  if purpose_norm = 'split_save' then
    state := public.diamond_state_json(uid);
    if coalesce((state->>'splitUnlimited')::boolean, false)
      or coalesce((state->>'splitCreatesToday')::int, 0)
        < coalesce((state->>'splitFreePerDay')::int, 0)
      or coalesce((state->>'splitExtraCost')::int, 0) <= 0
      or coalesce((state->>'balance')::int, 0)
        + coalesce((state->>'splitAdCredits')::int, 0)
        >= coalesce((state->>'splitExtraCost')::int, 0)
    then
      return json_build_object(
        'ok', false,
        'reason', 'not_needed',
        'state', state
      );
    end if;
  else
    select coalesce(sum(e.amount), 0)
      into earned_today
    from public.diamond_events e
    where e.user_id = uid
      and e.kind = 'rewarded_ad'
      and (e.created_at at time zone tz)::date = (now() at time zone tz)::date;

    if earned_today + per_ad > cap then
      return json_build_object(
        'ok', false,
        'reason', 'cap',
        'state', public.diamond_state_json(uid)
      );
    end if;
  end if;

  insert into public.rewarded_ad_claims (user_id, purpose)
  values (uid, purpose_norm)
  returning * into claim;

  return json_build_object(
    'ok', true,
    'claimId', claim.id,
    'userId', uid,
    'expiresAt', claim.expires_at
  );
end;
$$;

revoke all on function public.create_rewarded_ad_claim(text) from public, anon;
grant execute on function public.create_rewarded_ad_claim(text) to authenticated;

create or replace function public.get_rewarded_ad_claim(p_claim_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  claim public.rewarded_ad_claims;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into claim
  from public.rewarded_ad_claims c
  where c.id = p_claim_id
    and c.user_id = uid;

  if claim.id is null then
    raise exception 'Reward claim not found';
  end if;

  return json_build_object(
    'ok', claim.status = 'awarded',
    'status', claim.status,
    'reason', claim.rejection_reason,
    'awarded', claim.awarded_amount,
    'state', public.diamond_state_json(uid)
  );
end;
$$;

revoke all on function public.get_rewarded_ad_claim(uuid) from public, anon;
grant execute on function public.get_rewarded_ad_claim(uuid) to authenticated;

create or replace function public.apply_verified_admob_reward(
  p_claim_id uuid,
  p_user_id uuid,
  p_transaction_id text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  claim public.rewarded_ad_claims;
  claim_user uuid;
  econ jsonb := public.diamond_economy();
  tz text;
  cap integer;
  per_ad integer;
  earned_today integer;
  locked_balance integer;
  state jsonb;
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_transaction_id is null or length(trim(p_transaction_id)) < 8 then
    raise exception 'Invalid AdMob transaction';
  end if;

  select c.user_id into claim_user
  from public.rewarded_ad_claims c
  where c.id = p_claim_id;
  if claim_user is null or claim_user is distinct from p_user_id then
    raise exception 'Reward claim not found';
  end if;

  select coalesce(p.diamonds, 0)
    into locked_balance
  from public.profiles p
  where p.id = claim_user
  for update;
  if not found then
    raise exception 'Profile not found';
  end if;

  select * into claim
  from public.rewarded_ad_claims c
  where c.id = p_claim_id
  for update;

  if claim.status = 'awarded' then
    return json_build_object('ok', true, 'duplicate', true, 'awarded', claim.awarded_amount);
  end if;
  if claim.status <> 'pending' then
    return json_build_object('ok', false, 'reason', coalesce(claim.rejection_reason, 'rejected'));
  end if;
  if claim.expires_at <= now() then
    update public.rewarded_ad_claims
    set status = 'rejected', rejection_reason = 'expired'
    where id = claim.id;
    return json_build_object('ok', false, 'reason', 'expired');
  end if;
  if exists (
    select 1 from public.rewarded_ad_claims c
    where c.transaction_id = trim(p_transaction_id)
      and c.id is distinct from claim.id
  ) then
    update public.rewarded_ad_claims
    set status = 'rejected', rejection_reason = 'duplicate'
    where id = claim.id;
    return json_build_object('ok', false, 'reason', 'duplicate');
  end if;

  tz := coalesce(nullif(econ->>'timezone', ''), 'Asia/Kolkata');
  cap := greatest(coalesce((econ->>'dailyAdCap')::int, 5), 0);
  per_ad := greatest(coalesce((econ->>'perAd')::int, 1), 0);

  if not coalesce((econ->>'enabled')::boolean, true) then
    update public.rewarded_ad_claims
    set
      status = 'rejected',
      rejection_reason = 'disabled',
      transaction_id = trim(p_transaction_id)
    where id = claim.id;
    return json_build_object('ok', false, 'reason', 'disabled');
  end if;

  if claim.purpose = 'split_save' then
    state := public.diamond_state_json(claim.user_id);
    if coalesce((state->>'splitUnlimited')::boolean, false)
      or coalesce((state->>'splitCreatesToday')::int, 0)
        < coalesce((state->>'splitFreePerDay')::int, 0)
      or coalesce((state->>'splitExtraCost')::int, 0) <= 0
      or locked_balance + coalesce((state->>'splitAdCredits')::int, 0)
        >= coalesce((state->>'splitExtraCost')::int, 0)
    then
      update public.rewarded_ad_claims
      set
        status = 'rejected',
        rejection_reason = 'not_needed',
        transaction_id = trim(p_transaction_id)
      where id = claim.id;
      return json_build_object('ok', false, 'reason', 'not_needed');
    end if;
  end if;

  select coalesce(sum(e.amount), 0)
    into earned_today
  from public.diamond_events e
  where e.user_id = claim.user_id
    and e.kind = 'rewarded_ad'
    and (e.created_at at time zone tz)::date = (now() at time zone tz)::date;

  if claim.purpose = 'standard' and earned_today + per_ad > cap then
    update public.rewarded_ad_claims
    set
      status = 'rejected',
      rejection_reason = 'cap',
      transaction_id = trim(p_transaction_id)
    where id = claim.id;
    return json_build_object('ok', false, 'reason', 'cap');
  end if;

  if claim.purpose = 'split_save' then
    update public.rewarded_ad_claims
    set
      status = 'awarded',
      transaction_id = trim(p_transaction_id),
      awarded_amount = per_ad,
      remaining_amount = per_ad,
      awarded_at = now()
    where id = claim.id;
    return json_build_object('ok', true, 'awarded', per_ad);
  end if;

  insert into public.diamond_events (user_id, kind, amount)
  values (claim.user_id, 'rewarded_ad', per_ad);

  update public.profiles
  set
    diamonds = coalesce(diamonds, 0) + per_ad,
    updated_at = now()
  where id = claim.user_id;

  update public.rewarded_ad_claims
  set
    status = 'awarded',
    transaction_id = trim(p_transaction_id),
    awarded_amount = per_ad,
    awarded_at = now()
  where id = claim.id;

  return json_build_object('ok', true, 'awarded', per_ad);
end;
$$;

revoke all on function public.apply_verified_admob_reward(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.apply_verified_admob_reward(uuid, uuid, text)
  to service_role;

-- Split-save ads create reserved credits, not spendable diamonds. Only the
-- over-quota split-create RPC can consume them.
create or replace function public.split_consume_create_quota()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  econ jsonb := public.diamond_economy();
  tz text := coalesce(nullif(econ->>'timezone', ''), 'Asia/Kolkata');
  free_n integer := greatest(coalesce((econ->>'splitFreePerDay')::int, 2), 0);
  cost integer := greatest(coalesce((econ->>'splitExtraCost')::int, 1), 0);
  created_today integer := 0;
  locked integer;
  credit record;
  credit_used integer := 0;
  take_amount integer;
  diamond_cost integer;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if public.split_user_has_unlimited_split(uid) then
    return;
  end if;

  select p.diamonds into locked
  from public.profiles p
  where p.id = uid
  for update;
  if not found then
    raise exception 'Profile not found';
  end if;

  select count(*)::int
    into created_today
  from public.split_expenses e
  where e.created_by = uid
    and (e.created_at at time zone tz)::date = (now() at time zone tz)::date;

  if created_today < free_n or cost <= 0 then
    return;
  end if;

  for credit in
    select c.id, c.remaining_amount
    from public.rewarded_ad_claims c
    where c.user_id = uid
      and c.purpose = 'split_save'
      and c.status = 'awarded'
      and c.remaining_amount > 0
    order by c.awarded_at, c.created_at
    for update
  loop
    exit when credit_used >= cost;
    take_amount := least(credit.remaining_amount, cost - credit_used);
    update public.rewarded_ad_claims
    set remaining_amount = remaining_amount - take_amount
    where id = credit.id;
    credit_used := credit_used + take_amount;
  end loop;

  diamond_cost := cost - credit_used;
  if coalesce(locked, 0) < diamond_cost then
    raise exception 'SPLIT_NEED_DIAMONDS';
  end if;
  if diamond_cost > 0 then
    update public.profiles
    set
      diamonds = coalesce(diamonds, 0) - diamond_cost,
      updated_at = now()
    where id = uid;

    insert into public.diamond_events (user_id, kind, amount)
    values (uid, 'split_extra', -diamond_cost);
  end if;
end;
$$;

revoke all on function public.split_consume_create_quota() from public, anon;

create or replace function public.diamond_state_json(uid uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  econ jsonb := public.diamond_economy();
  tz text := coalesce(nullif(econ->>'timezone', ''), 'Asia/Kolkata');
  cap integer := greatest(coalesce((econ->>'dailyAdCap')::int, 5), 0);
  balance integer := 0;
  split_credits integer := 0;
  pass_until timestamptz;
  earned_today integer := 0;
  created_today integer := 0;
  unlocks json;
begin
  select p.diamonds, p.premium_pass_until
    into balance, pass_until
  from public.profiles p
  where p.id = uid;

  select coalesce(sum(e.amount), 0)
    into earned_today
  from public.diamond_events e
  where e.user_id = uid
    and e.kind = 'rewarded_ad'
    and (e.created_at at time zone tz)::date = (now() at time zone tz)::date;

  select coalesce(sum(c.remaining_amount), 0)::int
    into split_credits
  from public.rewarded_ad_claims c
  where c.user_id = uid
    and c.purpose = 'split_save'
    and c.status = 'awarded'
    and c.remaining_amount > 0;

  select count(*)::int
    into created_today
  from public.split_expenses s
  where s.created_by = uid
    and (s.created_at at time zone tz)::date = (now() at time zone tz)::date;

  select coalesce(
    json_agg(json_build_object('kind', u.kind, 'itemId', u.item_id, 'expiresAt', u.expires_at)),
    '[]'::json
  )
    into unlocks
  from public.diamond_unlocks u
  where u.user_id = uid
    and (u.expires_at is null or u.expires_at > now());

  return json_build_object(
    'balance', coalesce(balance, 0),
    'earnedToday', earned_today,
    'dailyAdCap', cap,
    'perAd', greatest(coalesce((econ->>'perAd')::int, 1), 0),
    'enabled', coalesce((econ->>'enabled')::boolean, true),
    'passes', coalesce(econ->'passes', '[]'::jsonb),
    'store', coalesce(econ->'store', '{}'::jsonb),
    'unlocks', unlocks,
    'passUntil', pass_until,
    'passActive', pass_until is not null and pass_until > now(),
    'serverNow', now(),
    'splitFreePerDay', greatest(coalesce((econ->>'splitFreePerDay')::int, 2), 0),
    'splitExtraCost', greatest(coalesce((econ->>'splitExtraCost')::int, 1), 0),
    'splitCreatesToday', created_today,
    'splitAdCredits', split_credits,
    'splitUnlimited', public.split_user_has_unlimited_split(uid)
  );
end;
$$;

revoke all on function public.diamond_state_json(uuid) from public, anon;

-- Legacy clients could invoke these without proof that an ad was watched.
revoke all on function public.earn_diamonds_for_ad(boolean) from public, anon, authenticated;
