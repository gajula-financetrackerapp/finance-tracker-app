-- Referrals: invite a friend, both sides get diamonds.
--
-- Attribution and the reward are server-side for the same reason the daily ad
-- cap is: a client that could write its own referral rows could mint diamonds.
-- Codes are minted on first read and never recycled. Run in Supabase → SQL
-- Editor after diamonds.sql.

-- ─── Code + who invited whom ────────────────────────────────────────────────
alter table public.profiles
  add column if not exists referral_code text;

alter table public.profiles
  add column if not exists referred_by uuid references auth.users (id) on delete set null;

alter table public.profiles
  add column if not exists referral_applied_at timestamptz;

create unique index if not exists profiles_referral_code_key
  on public.profiles (referral_code)
  where referral_code is not null;

comment on column public.profiles.referral_code is
  'This user''s share code, minted on first read by get_referral_state';

comment on column public.profiles.referred_by is
  'Who invited this user. Set once by apply_referral_code and never changed.';

-- ─── Reward amounts live with the rest of the economy ───────────────────────
-- Kept in diamond_economy so admins retune referrals in the same place as ad
-- rewards and store prices, with no app release.
update public.app_settings
set diamond_economy = diamond_economy || jsonb_build_object(
  'referral',
  coalesce(
    diamond_economy->'referral',
    '{ "enabled": true, "rewardPerInvite": 10, "joinReward": 5, "maxInvites": 50 }'::jsonb
  )
)
where diamond_economy is not null
  and diamond_economy->'referral' is null;

create or replace function public.referral_config()
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select diamond_economy->'referral' from public.app_settings limit 1),
    '{ "enabled": true, "rewardPerInvite": 10, "joinReward": 5, "maxInvites": 50 }'::jsonb
  );
$$;

revoke all on function public.referral_config() from public;
grant execute on function public.referral_config() to authenticated;

-- ─── Ledger widening ────────────────────────────────────────────────────────
-- Referral grants ride the existing diamond ledger so every balance change has
-- exactly one audit trail.
alter table public.diamond_events
  drop constraint if exists diamond_events_kind_check;

alter table public.diamond_events
  add constraint diamond_events_kind_check
  check (kind in (
    'rewarded_ad', 'pass_redeem', 'admin_grant', 'item_unlock',
    'referral_bonus', 'referral_join'
  ));

-- ─── Accepted invites ───────────────────────────────────────────────────────
-- One row per friend who used a code. The unique constraint on invitee_id is
-- what stops a user redeeming a second code later.
create table if not exists public.referral_claims (
  id bigserial primary key,
  referrer_id uuid not null references auth.users (id) on delete cascade,
  invitee_id uuid not null unique references auth.users (id) on delete cascade,
  referrer_reward integer not null default 0,
  invitee_reward integer not null default 0,
  created_at timestamptz not null default now(),
  check (referrer_id <> invitee_id)
);

create index if not exists referral_claims_referrer_idx
  on public.referral_claims (referrer_id, created_at desc);

comment on table public.referral_claims is
  'Accepted referrals. Written only by apply_referral_code; one row per invitee, ever.';

alter table public.referral_claims enable row level security;

grant select on table public.referral_claims to authenticated;

-- No insert/update/delete grant: the RPC is the only writer.
drop policy if exists "Users read own referral claims" on public.referral_claims;
create policy "Users read own referral claims"
  on public.referral_claims for select
  to authenticated
  using (referrer_id = auth.uid() or invitee_id = auth.uid());

-- ─── Code minting ───────────────────────────────────────────────────────────
-- Ambiguous characters (0/O, 1/I) are left out because codes get typed by hand
-- and read off screenshots.
create or replace function public.referral_new_code()
returns text
language plpgsql
set search_path = public
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i integer;
  tries integer := 0;
begin
  loop
    candidate := '';
    for i in 1..7 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    exit when not exists (
      select 1 from public.profiles where referral_code = candidate
    );

    tries := tries + 1;
    if tries > 40 then
      -- Astronomically unlikely; fall back to something guaranteed unique.
      candidate := 'R' || to_char(nextval('public.referral_claims_id_seq'), 'FM000000');
      exit;
    end if;
  end loop;

  return candidate;
end;
$$;

revoke all on function public.referral_new_code() from public;

-- ─── Read state (mints the code on first call) ──────────────────────────────
create or replace function public.get_referral_state()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cfg jsonb := public.referral_config();
  code text;
  invited integer := 0;
  earned integer := 0;
  applied boolean := false;
begin
  if uid is null then
    return json_build_object(
      'code', '', 'invited_count', 0, 'diamonds_earned', 0,
      'reward_per_invite', 0, 'join_reward', 0,
      'has_applied_code', false, 'enabled', false
    );
  end if;

  select p.referral_code, p.referred_by is not null
    into code, applied
  from public.profiles p
  where p.id = uid;

  if code is null or code = '' then
    code := public.referral_new_code();
    update public.profiles set referral_code = code where id = uid;
  end if;

  select count(*), coalesce(sum(c.referrer_reward), 0)
    into invited, earned
  from public.referral_claims c
  where c.referrer_id = uid;

  return json_build_object(
    'code', code,
    'invited_count', invited,
    'diamonds_earned', earned,
    'reward_per_invite', greatest(coalesce((cfg->>'rewardPerInvite')::int, 0), 0),
    'join_reward', greatest(coalesce((cfg->>'joinReward')::int, 0), 0),
    'has_applied_code', coalesce(applied, false),
    'enabled', coalesce((cfg->>'enabled')::boolean, true)
  );
end;
$$;

revoke all on function public.get_referral_state() from public;
grant execute on function public.get_referral_state() to authenticated;

-- ─── Redeem a friend's code ─────────────────────────────────────────────────
create or replace function public.apply_referral_code(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cfg jsonb := public.referral_config();
  wanted text := upper(btrim(coalesce(p_code, '')));
  referrer uuid;
  referrer_reward integer := greatest(coalesce((cfg->>'rewardPerInvite')::int, 0), 0);
  invitee_reward integer := greatest(coalesce((cfg->>'joinReward')::int, 0), 0);
  max_invites integer := greatest(coalesce((cfg->>'maxInvites')::int, 0), 0);
  referrer_count integer := 0;
begin
  if uid is null then
    return json_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  if not coalesce((cfg->>'enabled')::boolean, true) then
    return json_build_object('ok', false, 'reason', 'disabled');
  end if;

  if wanted = '' then
    return json_build_object('ok', false, 'reason', 'unknown_code');
  end if;

  -- Lock this profile so two devices cannot both claim a first referral.
  perform 1 from public.profiles where id = uid for update;

  if exists (select 1 from public.referral_claims where invitee_id = uid) then
    return json_build_object('ok', false, 'reason', 'already');
  end if;

  select id into referrer from public.profiles where referral_code = wanted;

  if referrer is null then
    return json_build_object('ok', false, 'reason', 'unknown_code');
  end if;

  if referrer = uid then
    return json_build_object('ok', false, 'reason', 'self');
  end if;

  -- Past the cap the invite still counts, it just stops paying out.
  select count(*) into referrer_count
  from public.referral_claims
  where referrer_id = referrer;

  if max_invites > 0 and referrer_count >= max_invites then
    referrer_reward := 0;
  end if;

  insert into public.referral_claims (referrer_id, invitee_id, referrer_reward, invitee_reward)
  values (referrer, uid, referrer_reward, invitee_reward);

  update public.profiles
  set referred_by = referrer,
      referral_applied_at = now()
  where id = uid;

  if invitee_reward > 0 then
    update public.profiles set diamonds = diamonds + invitee_reward where id = uid;
    insert into public.diamond_events (user_id, kind, amount)
    values (uid, 'referral_join', invitee_reward);
  end if;

  if referrer_reward > 0 then
    update public.profiles set diamonds = diamonds + referrer_reward where id = referrer;
    insert into public.diamond_events (user_id, kind, amount)
    values (referrer, 'referral_bonus', referrer_reward);
  end if;

  return json_build_object('ok', true, 'granted', invitee_reward);
end;
$$;

revoke all on function public.apply_referral_code(text) from public;
grant execute on function public.apply_referral_code(text) to authenticated;
