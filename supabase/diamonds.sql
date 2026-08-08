-- Diamonds: a rewarded-ad currency redeemable for time-limited Premium passes.
-- Balance and the daily earn cap are server-authoritative so a device clock
-- change cannot mint diamonds. Run in Supabase → SQL Editor after
-- app_settings.sql and admin_premium_users.sql.

-- ─── Profile balance + pass expiry ──────────────────────────────────────────
alter table public.profiles
  add column if not exists diamonds integer not null default 0;

alter table public.profiles
  add column if not exists premium_pass_until timestamptz;

comment on column public.profiles.diamonds is
  'Diamond balance; only the diamond_* RPCs may change it';

comment on column public.profiles.premium_pass_until is
  'Premium earned with diamonds, kept apart from paid premium_until so a pass never overwrites a purchase';

-- ─── Tunable economy (admins can retune without a release) ──────────────────
-- `store` prices each unlock in diamonds. `cost` is charged; `listCost` is the
-- struck-through "was" price and is display-only (0 hides it). Entries with
-- `perItem` sell one avatar / one theme at a time and never expire; the rest
-- grant a whole feature for `days`.
alter table public.app_settings
  add column if not exists diamond_economy jsonb not null default '{
    "enabled": true,
    "perAd": 1,
    "dailyAdCap": 5,
    "timezone": "Asia/Kolkata",
    "passes": [
      { "days": 7, "cost": 60 }
    ],
    "store": {
      "avatars":  { "enabled": true,  "perItem": true,  "cost": 5,  "listCost": 10 },
      "themes":   { "enabled": true,  "perItem": true,  "cost": 10, "listCost": 20 },
      "insights": { "enabled": true,  "perItem": false, "cost": 25, "listCost": 40, "days": 7 },
      "cloud":    { "enabled": false, "perItem": false, "cost": 40, "listCost": 0,  "days": 7 },
      "backup":   { "enabled": false, "perItem": false, "cost": 30, "listCost": 0,  "days": 7 },
      "splitExpense": { "enabled": false, "perItem": false, "cost": 40, "listCost": 0, "days": 7 }
    }
  }'::jsonb;

comment on column public.app_settings.diamond_economy is
  'Diamonds per rewarded ad, daily cap, cap reset timezone, redeemable passes, and the diamond store prices';

create or replace function public.diamond_economy_default()
returns jsonb
language sql
immutable
as $$
  select '{
    "enabled": true,
    "perAd": 1,
    "dailyAdCap": 5,
    "timezone": "Asia/Kolkata",
    "passes": [{ "days": 7, "cost": 60 }],
    "store": {
      "avatars":  { "enabled": true,  "perItem": true,  "cost": 5,  "listCost": 10 },
      "themes":   { "enabled": true,  "perItem": true,  "cost": 10, "listCost": 20 },
      "insights": { "enabled": true,  "perItem": false, "cost": 25, "listCost": 40, "days": 7 },
      "cloud":    { "enabled": false, "perItem": false, "cost": 40, "listCost": 0,  "days": 7 },
      "backup":   { "enabled": false, "perItem": false, "cost": 30, "listCost": 0,  "days": 7 },
      "splitExpense": { "enabled": false, "perItem": false, "cost": 40, "listCost": 0, "days": 7 }
    }
  }'::jsonb;
$$;

grant execute on function public.diamond_economy_default() to anon, authenticated;

create or replace function public.diamond_economy()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  -- Merge over the default so an economy row saved before `store` existed still
  -- resolves every key.
  select public.diamond_economy_default() || coalesce(
    (select diamond_economy from public.app_settings where id = 'global'),
    '{}'::jsonb
  );
$$;

revoke all on function public.diamond_economy() from public;
grant execute on function public.diamond_economy() to anon, authenticated;

-- ─── Admin: retune prices without a release ─────────────────────────────────
create or replace function public.set_diamond_economy(econ jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_profile_admin() then
    raise exception 'not authorized';
  end if;
  if econ is null or jsonb_typeof(econ) <> 'object' then
    raise exception 'invalid economy';
  end if;

  insert into public.app_settings (id, diamond_economy, updated_at, updated_by)
  values ('global', econ, now(), auth.uid())
  on conflict (id) do update
    set diamond_economy = excluded.diamond_economy,
        updated_at = now(),
        updated_by = auth.uid();

  return public.diamond_economy();
end;
$$;

revoke all on function public.set_diamond_economy(jsonb) from public;
grant execute on function public.set_diamond_economy(jsonb) to authenticated;

-- ─── Ledger ─────────────────────────────────────────────────────────────────
create table if not exists public.diamond_events (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('rewarded_ad', 'pass_redeem', 'admin_grant')),
  -- Positive when earned, negative when spent.
  amount integer not null,
  pass_days integer,
  created_at timestamptz not null default now()
);

-- Older installs predate store purchases, so widen the allowed kinds in place.
alter table public.diamond_events
  drop constraint if exists diamond_events_kind_check;

alter table public.diamond_events
  add constraint diamond_events_kind_check
  check (kind in ('rewarded_ad', 'pass_redeem', 'admin_grant', 'item_unlock'));

alter table public.diamond_events
  add column if not exists item_kind text;

alter table public.diamond_events
  add column if not exists item_id text;

create index if not exists diamond_events_user_created_idx
  on public.diamond_events (user_id, created_at desc);

comment on table public.diamond_events is
  'Append-only diamond ledger. Written only by security-definer RPCs; the daily cap is counted from here.';

alter table public.diamond_events enable row level security;

grant select on table public.diamond_events to authenticated;

-- Deliberately no insert/update/delete grant: the RPCs are the only writers.
drop policy if exists "Users read own diamond events" on public.diamond_events;
create policy "Users read own diamond events"
  on public.diamond_events for select
  to authenticated
  using (user_id = auth.uid());

-- ─── Owned unlocks ──────────────────────────────────────────────────────────
-- One row per thing the user bought. `expires_at` null means it is theirs for
-- good, which is how avatars and themes are sold; timed feature unlocks carry
-- an expiry that later purchases extend.
create table if not exists public.diamond_unlocks (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('avatar', 'theme', 'feature')),
  item_id text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, kind, item_id)
);

create index if not exists diamond_unlocks_user_idx
  on public.diamond_unlocks (user_id);

comment on table public.diamond_unlocks is
  'What a user bought with diamonds. Written only by purchase_diamond_item.';

alter table public.diamond_unlocks enable row level security;

grant select on table public.diamond_unlocks to authenticated;

drop policy if exists "Users read own diamond unlocks" on public.diamond_unlocks;
create policy "Users read own diamond unlocks"
  on public.diamond_unlocks for select
  to authenticated
  using (user_id = auth.uid());

-- ─── Shared state shape ─────────────────────────────────────────────────────
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
  pass_until timestamptz;
  earned_today integer := 0;
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

  -- Expired timed unlocks are dropped here rather than deleted, so the purchase
  -- history stays intact and re-buying simply extends the row.
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
    'serverNow', now()
  );
end;
$$;

revoke all on function public.diamond_state_json(uuid) from public;

-- Readable while signed out so guests can see the offer before creating an
-- account; the balance is simply zero until they sign in.
create or replace function public.get_diamond_state()
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.diamond_state_json(auth.uid());
end;
$$;

revoke all on function public.get_diamond_state() from public;
grant execute on function public.get_diamond_state() to anon, authenticated;

-- ─── Earn: called only after a rewarded ad reports EARNED_REWARD ────────────
create or replace function public.earn_diamonds_for_ad()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  econ jsonb := public.diamond_economy();
  tz text := coalesce(nullif(econ->>'timezone', ''), 'Asia/Kolkata');
  cap integer := greatest(coalesce((econ->>'dailyAdCap')::int, 5), 0);
  per_ad integer := greatest(coalesce((econ->>'perAd')::int, 1), 0);
  earned_today integer := 0;
  locked integer;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if not coalesce((econ->>'enabled')::boolean, true) then
    return json_build_object('ok', false, 'reason', 'disabled', 'state', public.diamond_state_json(uid));
  end if;

  -- Serialize concurrent grants for this user so a double-tap cannot double-credit.
  select p.diamonds into locked
  from public.profiles p
  where p.id = uid
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  select coalesce(sum(e.amount), 0)
    into earned_today
  from public.diamond_events e
  where e.user_id = uid
    and e.kind = 'rewarded_ad'
    and (e.created_at at time zone tz)::date = (now() at time zone tz)::date;

  if earned_today + per_ad > cap then
    return json_build_object('ok', false, 'reason', 'cap', 'state', public.diamond_state_json(uid));
  end if;

  insert into public.diamond_events (user_id, kind, amount)
  values (uid, 'rewarded_ad', per_ad);

  update public.profiles
  set diamonds = coalesce(diamonds, 0) + per_ad,
      updated_at = now()
  where id = uid;

  return json_build_object(
    'ok', true,
    'awarded', per_ad,
    'state', public.diamond_state_json(uid)
  );
end;
$$;

revoke all on function public.earn_diamonds_for_ad() from public;
grant execute on function public.earn_diamonds_for_ad() to authenticated;

-- ─── Spend: extend the diamond pass ─────────────────────────────────────────
create or replace function public.redeem_premium_pass(pass_days integer)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  econ jsonb := public.diamond_economy();
  cost integer;
  balance integer;
  base timestamptz;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if pass_days is null or pass_days <= 0 then
    raise exception 'Invalid pass';
  end if;

  select (p->>'cost')::int
    into cost
  from jsonb_array_elements(coalesce(econ->'passes', '[]'::jsonb)) p
  where (p->>'days')::int = pass_days
  limit 1;

  if cost is null then
    raise exception 'Unknown pass';
  end if;

  select p.diamonds, p.premium_pass_until
    into balance, base
  from public.profiles p
  where p.id = uid
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  if coalesce(balance, 0) < cost then
    return json_build_object('ok', false, 'reason', 'insufficient', 'state', public.diamond_state_json(uid));
  end if;

  -- Stack onto an unexpired pass instead of truncating it.
  base := greatest(coalesce(base, now()), now());

  update public.profiles
  set diamonds = coalesce(diamonds, 0) - cost,
      premium_pass_until = base + make_interval(days => pass_days),
      updated_at = now()
  where id = uid;

  insert into public.diamond_events (user_id, kind, amount, pass_days)
  values (uid, 'pass_redeem', -cost, pass_days);

  return json_build_object(
    'ok', true,
    'spent', cost,
    'state', public.diamond_state_json(uid)
  );
end;
$$;

revoke all on function public.redeem_premium_pass(integer) from public;
grant execute on function public.redeem_premium_pass(integer) to authenticated;

-- ─── Spend: buy one avatar / theme, or timed access to a feature ────────────
create or replace function public.purchase_diamond_item(p_kind text, p_item_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  econ jsonb := public.diamond_economy();
  entry jsonb;
  cost integer;
  days integer;
  per_item boolean;
  balance integer;
  base timestamptz;
  new_expiry timestamptz;
  existing_expiry timestamptz;
  found_row boolean;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_kind not in ('avatar', 'theme', 'feature') then
    raise exception 'Unknown kind';
  end if;
  if p_item_id is null or length(p_item_id) = 0 or length(p_item_id) > 64 then
    raise exception 'Unknown item';
  end if;
  if not coalesce((econ->>'enabled')::boolean, true) then
    return json_build_object('ok', false, 'reason', 'disabled', 'state', public.diamond_state_json(uid));
  end if;

  entry := case
    when p_kind = 'avatar' then econ->'store'->'avatars'
    when p_kind = 'theme' then econ->'store'->'themes'
    else econ->'store'->p_item_id
  end;

  if entry is null or jsonb_typeof(entry) <> 'object' then
    return json_build_object('ok', false, 'reason', 'unavailable', 'state', public.diamond_state_json(uid));
  end if;
  if not coalesce((entry->>'enabled')::boolean, false) then
    return json_build_object('ok', false, 'reason', 'unavailable', 'state', public.diamond_state_json(uid));
  end if;

  per_item := coalesce((entry->>'perItem')::boolean, false);
  if per_item <> (p_kind in ('avatar', 'theme')) then
    return json_build_object('ok', false, 'reason', 'unavailable', 'state', public.diamond_state_json(uid));
  end if;

  cost := greatest(coalesce((entry->>'cost')::int, 0), 0);
  days := greatest(coalesce((entry->>'days')::int, 0), 0);
  if not per_item and days <= 0 then
    return json_build_object('ok', false, 'reason', 'unavailable', 'state', public.diamond_state_json(uid));
  end if;

  -- Lock the balance so a double-tap cannot spend the same diamonds twice.
  select p.diamonds into balance
  from public.profiles p
  where p.id = uid
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  select u.expires_at, true
    into existing_expiry, found_row
  from public.diamond_unlocks u
  where u.user_id = uid and u.kind = p_kind and u.item_id = p_item_id;

  -- Permanent things are bought once; never charge for them again.
  if coalesce(found_row, false) and (per_item or existing_expiry is null) then
    return json_build_object('ok', false, 'reason', 'owned', 'state', public.diamond_state_json(uid));
  end if;

  if coalesce(balance, 0) < cost then
    return json_build_object('ok', false, 'reason', 'insufficient', 'state', public.diamond_state_json(uid));
  end if;

  if per_item then
    new_expiry := null;
  else
    -- Buying again stacks onto time that has not run out yet.
    base := greatest(coalesce(existing_expiry, now()), now());
    new_expiry := base + make_interval(days => days);
  end if;

  insert into public.diamond_unlocks (user_id, kind, item_id, expires_at)
  values (uid, p_kind, p_item_id, new_expiry)
  on conflict (user_id, kind, item_id) do update
    set expires_at = excluded.expires_at;

  update public.profiles
  set diamonds = coalesce(diamonds, 0) - cost,
      updated_at = now()
  where id = uid;

  insert into public.diamond_events (user_id, kind, amount, item_kind, item_id)
  values (uid, 'item_unlock', -cost, p_kind, p_item_id);

  return json_build_object(
    'ok', true,
    'spent', cost,
    'state', public.diamond_state_json(uid)
  );
end;
$$;

revoke all on function public.purchase_diamond_item(text, text) from public;
grant execute on function public.purchase_diamond_item(text, text) to authenticated;

-- ─── Admin grant (support + testing without watching ads) ───────────────────
create or replace function public.admin_grant_diamonds(target_id uuid, amount integer)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_profile_admin() then
    raise exception 'not authorized';
  end if;
  if target_id is null or amount is null or amount = 0 then
    raise exception 'missing target or amount';
  end if;

  update public.profiles
  set diamonds = greatest(coalesce(diamonds, 0) + amount, 0),
      updated_at = now()
  where id = target_id;

  if not found then
    raise exception 'user profile not found';
  end if;

  insert into public.diamond_events (user_id, kind, amount)
  values (target_id, 'admin_grant', amount);

  return public.diamond_state_json(target_id);
end;
$$;

revoke all on function public.admin_grant_diamonds(uuid, integer) from public;
grant execute on function public.admin_grant_diamonds(uuid, integer) to authenticated;
