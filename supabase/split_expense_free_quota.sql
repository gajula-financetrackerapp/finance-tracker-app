-- Free Split for signed-in users: 2 creates per calendar day, then diamonds.
-- Edits, being added by a friend, groups, invites, and settlements do not
-- spend the quota. Premium / Plus / admin / diamond Premium pass (and a
-- diamond store unlock of splitExpense) stay unlimited.
--
-- Run in Supabase → SQL Editor after diamonds.sql, split_expense.sql,
-- split_expense_invite_fix.sql, split_expense_groups_fix.sql,
-- split_expense_group_edit.sql, split_expense_finance_category.sql, and
-- admin_list_users.sql (is_profile_admin). Safe to re-run.

-- ─── Economy defaults (merge-on-read fills missing keys on older rows) ──────
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
    "splitFreePerDay": 2,
    "splitExtraCost": 1,
    "passes": [
      { "days": 1, "cost": 15, "listCost": 0 },
      { "days": 7, "cost": 60, "listCost": 90 }
    ],
    "store": {
      "avatars":  { "enabled": true,  "perItem": true,  "cost": 5,  "listCost": 10, "days": 30 },
      "themes":   { "enabled": true,  "perItem": true,  "cost": 10, "listCost": 20, "days": 30 },
      "insights": { "enabled": true,  "perItem": false, "cost": 25, "listCost": 40, "days": 7 },
      "cloud":    { "enabled": false, "perItem": false, "cost": 40, "listCost": 0,  "days": 7 },
      "backup":   { "enabled": false, "perItem": false, "cost": 30, "listCost": 0,  "days": 7 },
      "splitExpense": { "enabled": false, "perItem": false, "cost": 40, "listCost": 0, "days": 7 }
    }
  }'::jsonb;
$$;

-- ─── Ledger: spending diamonds on an extra split create ─────────────────────
alter table public.diamond_events
  drop constraint if exists diamond_events_kind_check;

alter table public.diamond_events
  add constraint diamond_events_kind_check
  check (kind in (
    'rewarded_ad', 'pass_redeem', 'admin_grant', 'item_unlock',
    'referral_bonus', 'referral_join', 'split_extra'
  ));

create index if not exists split_expenses_created_by_created_at_idx
  on public.split_expenses (created_by, created_at desc);

-- Paid Premium/Plus, diamond Premium pass, admin, or a bought split unlock.
create or replace function public.split_user_has_unlimited_split(uid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.profiles;
begin
  if uid is null then
    return false;
  end if;

  select * into p from public.profiles where id = uid;
  if not found then
    return false;
  end if;

  if p.role = 'admin' then
    return true;
  end if;
  if uid = auth.uid() and public.is_profile_admin() then
    return true;
  end if;
  if p.is_premium = true and (p.premium_until is null or p.premium_until > now()) then
    return true;
  end if;
  if p.premium_pass_until is not null and p.premium_pass_until > now() then
    return true;
  end if;
  if exists (
    select 1
    from public.diamond_unlocks u
    where u.user_id = uid
      and u.kind = 'feature'
      and u.item_id = 'splitExpense'
      and (u.expires_at is null or u.expires_at > now())
  ) then
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.split_user_has_unlimited_split(uuid) from public;

-- Lock the profile, count today's creates, spend diamonds when over the free quota.
-- Raises SPLIT_NEED_DIAMONDS when the balance cannot cover an extra create.
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

  if created_today < free_n then
    return;
  end if;
  if cost <= 0 then
    return;
  end if;
  if coalesce(locked, 0) < cost then
    raise exception 'SPLIT_NEED_DIAMONDS';
  end if;

  update public.profiles
  set diamonds = coalesce(diamonds, 0) - cost,
      updated_at = now()
  where id = uid;

  insert into public.diamond_events (user_id, kind, amount)
  values (uid, 'split_extra', -cost);
end;
$$;

revoke all on function public.split_consume_create_quota() from public;

-- ─── Diamond state: quota fields the app uses on Save ───────────────────────
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
    'splitUnlimited', public.split_user_has_unlimited_split(uid)
  );
end;
$$;

revoke all on function public.diamond_state_json(uuid) from public;

-- Split-save videos ignore the daily cap (p_ignore_cap). The Diamonds screen
-- still calls this with the default false.
drop function if exists public.earn_diamonds_for_ad();
drop function if exists public.earn_diamonds_for_ad(boolean);

create function public.earn_diamonds_for_ad(p_ignore_cap boolean default false)
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

  if not coalesce(p_ignore_cap, false) and earned_today + per_ad > cap then
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

revoke all on function public.earn_diamonds_for_ad(boolean) from public;
grant execute on function public.earn_diamonds_for_ad(boolean) to authenticated;

-- ─── Friends: any signed-in account, not only Premium ───────────────────────
drop function if exists public.split_friend_profiles();

create function public.split_friend_profiles()
returns table (id uuid, email text, full_name text, can_split boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  return query
  select distinct
    p.id,
    p.email,
    p.full_name,
    true as can_split
  from public.profiles p
  where p.id = auth.uid()
     or exists (
       select 1 from public.split_friendships f
       where f.status in ('pending', 'accepted')
         and (
           (f.requester_id = auth.uid() and f.addressee_id = p.id)
           or (f.addressee_id = auth.uid() and f.requester_id = p.id)
         )
     )
     or exists (
       select 1 from public.split_expense_shares s1
       join public.split_expense_shares s2 on s1.expense_id = s2.expense_id
       where s1.user_id = auth.uid() and s2.user_id = p.id
     )
     or exists (
       select 1 from public.split_group_members gm1
       join public.split_group_members gm2 on gm1.group_id = gm2.group_id
       where gm1.user_id = auth.uid() and gm2.user_id = p.id
     )
     or exists (
       select 1 from public.split_settlements st
       where (st.from_user_id = auth.uid() and st.to_user_id = p.id)
          or (st.to_user_id = auth.uid() and st.from_user_id = p.id)
     );
end;
$$;

revoke all on function public.split_friend_profiles() from public;
grant execute on function public.split_friend_profiles() to authenticated;

create or replace function public.split_lookup_invitee(p_email text)
returns table (id uuid, email text, full_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned text := lower(trim(coalesce(p_email, '')));
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if cleaned = '' or position('@' in cleaned) = 0 then
    return;
  end if;

  return query
  select p.id, p.email, p.full_name
  from public.profiles p
  where lower(trim(p.email)) = cleaned
  limit 1;
end;
$$;

revoke all on function public.split_lookup_invitee(text) from public;
grant execute on function public.split_lookup_invitee(text) to authenticated;

create or replace function public.split_invite_friend(p_email text)
returns public.split_friendships
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
  target_email text;
  target_name text;
  row public.split_friendships;
  reverse public.split_friendships;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select t.id, t.email, t.full_name
    into target_id, target_email, target_name
  from public.split_lookup_invitee(p_email) as t
  limit 1;

  if target_id is null then
    raise exception 'No account found for that email';
  end if;
  if target_id = auth.uid() then
    raise exception 'You cannot invite yourself';
  end if;

  select * into reverse
  from public.split_friendships
  where requester_id = target_id and addressee_id = auth.uid();

  if reverse.id is not null then
    if reverse.status = 'accepted' then
      return reverse;
    end if;
    update public.split_friendships
    set status = 'accepted', updated_at = now()
    where id = reverse.id
    returning * into row;
    return row;
  end if;

  insert into public.split_friendships (requester_id, addressee_id, status)
  values (auth.uid(), target_id, 'pending')
  on conflict (requester_id, addressee_id) do update
    set status = 'pending',
        updated_at = now()
  returning * into row;

  return row;
end;
$$;

revoke all on function public.split_invite_friend(text) from public;
grant execute on function public.split_invite_friend(text) to authenticated;

-- ─── Groups: signed-in owner, accepted friends (no Premium gate) ────────────
create or replace function public.split_create_group(p_name text, p_member_ids uuid[])
returns public.split_groups
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.split_groups;
  mid uuid;
  members uuid[];
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if trim(coalesce(p_name, '')) = '' then
    raise exception 'Enter a group name';
  end if;

  insert into public.split_groups (owner_id, name)
  values (auth.uid(), trim(p_name))
  returning * into g;

  members := array(
    select distinct x
    from unnest(array_append(coalesce(p_member_ids, '{}'::uuid[]), auth.uid())) as x
    where x is not null
  );

  foreach mid in array members loop
    if mid <> auth.uid() and not exists (
      select 1 from public.split_friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = mid)
          or (f.addressee_id = auth.uid() and f.requester_id = mid)
        )
    ) then
      raise exception 'All members must be accepted friends';
    end if;

    insert into public.split_group_members (group_id, user_id)
    values (g.id, mid)
    on conflict do nothing;
  end loop;

  return g;
end;
$$;

revoke all on function public.split_create_group(text, uuid[]) from public;
grant execute on function public.split_create_group(text, uuid[]) to authenticated;

create or replace function public.split_update_group(
  p_group_id uuid,
  p_name text,
  p_member_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.split_groups;
  mid uuid;
  members uuid[];
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into g from public.split_groups where id = p_group_id;
  if not found then
    raise exception 'Group not found';
  end if;
  if g.owner_id <> auth.uid() then
    raise exception 'Only the group owner can edit';
  end if;
  if trim(coalesce(p_name, '')) = '' then
    raise exception 'Enter a group name';
  end if;

  update public.split_groups
  set name = trim(p_name)
  where id = p_group_id
  returning * into g;

  members := array(
    select distinct x
    from unnest(array_append(coalesce(p_member_ids, '{}'::uuid[]), auth.uid())) as x
    where x is not null
  );

  foreach mid in array members loop
    if mid <> auth.uid() and not exists (
      select 1 from public.split_friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = mid)
          or (f.addressee_id = auth.uid() and f.requester_id = mid)
        )
    ) then
      raise exception 'All members must be accepted friends';
    end if;

    insert into public.split_group_members (group_id, user_id)
    values (p_group_id, mid)
    on conflict do nothing;
  end loop;

  delete from public.split_group_members m
  where m.group_id = p_group_id
    and not (m.user_id = any (members));

  return jsonb_build_object(
    'id', g.id,
    'owner_id', g.owner_id,
    'name', g.name,
    'created_at', g.created_at,
    'member_ids', members
  );
end;
$$;

revoke all on function public.split_update_group(uuid, text, uuid[]) from public;
grant execute on function public.split_update_group(uuid, text, uuid[]) to authenticated;

-- ─── Create: consume quota after validation, no Premium on participants ─────
drop function if exists public.split_create_expense(text, numeric, text, uuid, text, date, jsonb);
drop function if exists public.split_create_expense(text, numeric, text, uuid, text, date, jsonb, text);

create function public.split_create_expense(
  p_description text,
  p_amount numeric,
  p_currency text,
  p_paid_by uuid,
  p_split_mode text,
  p_expense_date date,
  p_shares jsonb,
  p_finance_category text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.split_expenses;
  share jsonb;
  uid uuid;
  amt numeric;
  total numeric := 0;
  share_count int := 0;
  cat text := nullif(trim(coalesce(p_finance_category, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if trim(coalesce(p_description, '')) = '' then
    raise exception 'Enter a description';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter a valid amount';
  end if;
  if p_split_mode not in ('equal', 'custom', 'exact', 'percentage', 'shares', 'adjustment') then
    raise exception 'Invalid split mode';
  end if;
  if p_paid_by is null then
    raise exception 'Who paid is required';
  end if;

  for share in select * from jsonb_array_elements(coalesce(p_shares, '[]'::jsonb))
  loop
    uid := nullif(share->>'user_id', '')::uuid;
    amt := coalesce((share->>'share_amount')::numeric, 0);
    if uid is null then
      raise exception 'Invalid share participant';
    end if;
    if amt < 0 then
      raise exception 'Share amounts must be >= 0';
    end if;
    total := total + amt;
    share_count := share_count + 1;
  end loop;

  if share_count < 2 then
    raise exception 'Pick at least one friend (You + someone)';
  end if;
  if abs(total - p_amount) > 0.02 then
    raise exception 'Shares (%) must equal the bill (%)', total, p_amount;
  end if;

  if not exists (
    select 1 from jsonb_array_elements(p_shares) s
    where (s->>'user_id')::uuid = p_paid_by
  ) then
    raise exception 'Payer must be one of the participants';
  end if;

  for share in select * from jsonb_array_elements(p_shares)
  loop
    uid := (share->>'user_id')::uuid;
    if uid <> auth.uid() and not exists (
      select 1 from public.split_friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = uid)
          or (f.addressee_id = auth.uid() and f.requester_id = uid)
        )
    ) then
      raise exception 'All participants must be accepted friends';
    end if;
  end loop;

  perform public.split_consume_create_quota();

  insert into public.split_expenses (
    created_by, description, amount, currency, paid_by, split_mode, expense_date, finance_category
  ) values (
    auth.uid(),
    trim(p_description),
    round(p_amount::numeric, 2),
    coalesce(nullif(trim(p_currency), ''), 'INR'),
    p_paid_by,
    p_split_mode,
    coalesce(p_expense_date, current_date),
    cat
  )
  returning * into e;

  for share in select * from jsonb_array_elements(p_shares)
  loop
    insert into public.split_expense_shares (expense_id, user_id, share_amount, finance_txn_id)
    values (
      e.id,
      (share->>'user_id')::uuid,
      round((share->>'share_amount')::numeric, 2),
      null
    );
  end loop;

  return (
    select jsonb_build_object(
      'id', e.id,
      'created_by', e.created_by,
      'description', e.description,
      'amount', e.amount,
      'currency', e.currency,
      'paid_by', e.paid_by,
      'split_mode', e.split_mode,
      'expense_date', e.expense_date,
      'created_at', e.created_at,
      'finance_category', e.finance_category,
      'shares', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'expense_id', s.expense_id,
              'user_id', s.user_id,
              'share_amount', s.share_amount,
              'finance_txn_id', s.finance_txn_id
            )
          )
          from public.split_expense_shares s
          where s.expense_id = e.id
        ),
        '[]'::jsonb
      )
    )
  );
end;
$$;

revoke all on function public.split_create_expense(text, numeric, text, uuid, text, date, jsonb, text) from public;
grant execute on function public.split_create_expense(text, numeric, text, uuid, text, date, jsonb, text) to authenticated;

-- Edits are free (quota counts creates only). New participants need not be Premium.
drop function if exists public.split_update_expense(uuid, text, numeric, uuid, text, date, jsonb);
drop function if exists public.split_update_expense(uuid, text, numeric, uuid, text, date, jsonb, text);

create function public.split_update_expense(
  p_expense_id uuid,
  p_description text,
  p_amount numeric,
  p_paid_by uuid,
  p_split_mode text,
  p_expense_date date,
  p_shares jsonb,
  p_finance_category text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.split_expenses;
  share jsonb;
  uid uuid;
  amt numeric;
  total numeric := 0;
  share_count int := 0;
  old_txn text;
  cat text := nullif(trim(coalesce(p_finance_category, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into e from public.split_expenses where id = p_expense_id;
  if not found then
    raise exception 'Expense not found';
  end if;
  if e.created_by <> auth.uid() then
    raise exception 'Only the creator can edit this split';
  end if;
  if trim(coalesce(p_description, '')) = '' then
    raise exception 'Enter a description';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter a valid amount';
  end if;
  if p_split_mode not in ('equal', 'custom', 'exact', 'percentage', 'shares', 'adjustment') then
    raise exception 'Invalid split mode';
  end if;
  if p_paid_by is null then
    raise exception 'Who paid is required';
  end if;

  for share in select * from jsonb_array_elements(coalesce(p_shares, '[]'::jsonb))
  loop
    uid := nullif(share->>'user_id', '')::uuid;
    amt := coalesce((share->>'share_amount')::numeric, 0);
    if uid is null then
      raise exception 'Invalid share participant';
    end if;
    if amt < 0 then
      raise exception 'Share amounts must be >= 0';
    end if;
    total := total + amt;
    share_count := share_count + 1;
  end loop;

  if share_count < 2 then
    raise exception 'Pick at least one friend (You + someone)';
  end if;
  if abs(total - p_amount) > 0.02 then
    raise exception 'Shares (%) must equal the bill (%)', total, p_amount;
  end if;

  if not exists (
    select 1 from jsonb_array_elements(p_shares) s
    where (s->>'user_id')::uuid = p_paid_by
  ) then
    raise exception 'Payer must be one of the participants';
  end if;

  for share in select * from jsonb_array_elements(p_shares)
  loop
    uid := (share->>'user_id')::uuid;
    if uid <> auth.uid() and not exists (
      select 1 from public.split_friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = uid)
          or (f.addressee_id = auth.uid() and f.requester_id = uid)
        )
    ) then
      raise exception 'All participants must be accepted friends';
    end if;
  end loop;

  update public.split_expenses
  set
    description = trim(p_description),
    amount = round(p_amount::numeric, 2),
    paid_by = p_paid_by,
    split_mode = p_split_mode,
    expense_date = coalesce(p_expense_date, expense_date),
    finance_category = cat
  where id = p_expense_id
  returning * into e;

  for share in select * from jsonb_array_elements(p_shares)
  loop
    uid := (share->>'user_id')::uuid;
    amt := round((share->>'share_amount')::numeric, 2);
    select finance_txn_id into old_txn
    from public.split_expense_shares
    where expense_id = p_expense_id and user_id = uid;

    insert into public.split_expense_shares (expense_id, user_id, share_amount, finance_txn_id)
    values (p_expense_id, uid, amt, old_txn)
    on conflict (expense_id, user_id) do update
      set share_amount = excluded.share_amount;
  end loop;

  delete from public.split_expense_shares s
  where s.expense_id = p_expense_id
    and not exists (
      select 1
      from jsonb_array_elements(p_shares) x
      where (x->>'user_id')::uuid = s.user_id
    );

  return (
    select jsonb_build_object(
      'id', e.id,
      'created_by', e.created_by,
      'description', e.description,
      'amount', e.amount,
      'currency', e.currency,
      'paid_by', e.paid_by,
      'split_mode', e.split_mode,
      'expense_date', e.expense_date,
      'created_at', e.created_at,
      'finance_category', e.finance_category,
      'shares', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'expense_id', s.expense_id,
              'user_id', s.user_id,
              'share_amount', s.share_amount,
              'finance_txn_id', s.finance_txn_id
            )
          )
          from public.split_expense_shares s
          where s.expense_id = e.id
        ),
        '[]'::jsonb
      )
    )
  );
end;
$$;

revoke all on function public.split_update_expense(uuid, text, numeric, uuid, text, date, jsonb, text) from public;
grant execute on function public.split_update_expense(uuid, text, numeric, uuid, text, date, jsonb, text) to authenticated;

notify pgrst, 'reload schema';
