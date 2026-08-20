-- Admin: set any user's Premium + list premium fields + shared feature gates.
-- Run after admin_list_users.sql and app_settings.sql.
-- Re-run this whole file if Users → Details shows Disabled after a successful Premium save
-- (fixes list_signed_in_profiles PL/pgSQL column shadowing).

alter table public.profiles
  add column if not exists premium_until timestamptz;

alter table public.profiles
  add column if not exists premium_billing text;

comment on column public.profiles.premium_until is
  'When Premium access ends; null means no end date while is_premium is true';

comment on column public.profiles.premium_billing is
  'Subscription bucket for admin filters: month | year | null (free / unset)';

alter table public.app_settings
  add column if not exists premium_features jsonb not null default '{
    "themes": "premium",
    "avatars": "premium",
    "cloud": "premium",
    "backup": "premium"
  }'::jsonb;

-- Drop older signatures so we can add billing.
drop function if exists public.admin_set_user_premium(uuid, boolean, timestamptz, timestamptz);
drop function if exists public.admin_set_user_premium(uuid, boolean, timestamptz, timestamptz, text);

-- ─── Admin set Premium for a user ───────────────────────────────────────────
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
    'premium_since', row.premium_since,
    'premium_until', row.premium_until,
    'premium_billing', row.premium_billing,
    'premium_ended_at', row.premium_ended_at
  );
end;
$$;

revoke all on function public.admin_set_user_premium(uuid, boolean, timestamptz, timestamptz, text) from public;
grant execute on function public.admin_set_user_premium(uuid, boolean, timestamptz, timestamptz, text) to authenticated;

-- ─── List users includes Premium status ─────────────────────────────────────
drop function if exists public.list_signed_in_profiles();

create function public.list_signed_in_profiles()
returns table (
  id uuid,
  email text,
  full_name text,
  role text,
  created_at timestamptz,
  is_premium boolean,
  premium_since timestamptz,
  premium_until timestamptz,
  premium_billing text
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_profile_admin() then
    raise exception 'not authorized';
  end if;

  insert into public.profiles (id, email, full_name, role)
  select
    u.id,
    u.email,
    coalesce(
      nullif(u.raw_user_meta_data->>'full_name', ''),
      nullif(u.raw_user_meta_data->>'name', ''),
      split_part(coalesce(u.email, 'user'), '@', 1)
    ),
    case
      when lower(coalesce(u.email, '')) in (
        'g.ramkumar3127@gmail.com',
        'lakshmankumar586@gmail.com'
      ) then 'admin'
      else 'user'
    end
  from auth.users u
  on conflict (id) do update
    set
      email = coalesce(excluded.email, public.profiles.email),
      full_name = coalesce(
        nullif(public.profiles.full_name, ''),
        excluded.full_name
      ),
      role = case
        when public.profiles.role = 'admin' then 'admin'
        when lower(coalesce(excluded.email, public.profiles.email, '')) in (
          'g.ramkumar3127@gmail.com',
          'lakshmankumar586@gmail.com'
        ) then 'admin'
        else public.profiles.role
      end,
      updated_at = now();

  -- EXECUTE avoids PL/pgSQL RETURNS TABLE name shadowing
  return query execute $q$
    select
      u.id,
      coalesce(p.email, u.email)::text,
      coalesce(
        nullif(p.full_name, ''),
        nullif(u.raw_user_meta_data->>'full_name', ''),
        nullif(u.raw_user_meta_data->>'name', ''),
        split_part(coalesce(u.email, 'user'), '@', 1)
      )::text,
      coalesce(p.role, 'user')::text,
      coalesce(p.created_at, u.created_at),
      coalesce(p.is_premium, false),
      p.premium_since,
      p.premium_until,
      p.premium_billing
    from auth.users u
    left join public.profiles p on p.id = u.id
    order by coalesce(p.created_at, u.created_at) desc nulls last
  $q$;
end;
$$;

revoke all on function public.list_signed_in_profiles() from public;
grant execute on function public.list_signed_in_profiles() to authenticated;


-- ─── Shared settings: plan + feature gates ──────────────────────────────────
create or replace function public.get_app_settings()
returns json
language sql
security definer
stable
set search_path = public
as $$
  select json_build_object(
    'premium_plan', coalesce(
      (select premium_plan from public.app_settings where id = 'global'),
      '{"priceLabel":"₹399/year","amountInr":399,"upiId":"","payeeName":"Kashio Premium"}'::jsonb
    ),
    'premium_features', coalesce(
      (select premium_features from public.app_settings where id = 'global'),
      '{"themes":"premium","avatars":"premium","cloud":"premium","backup":"premium"}'::jsonb
    )
  );
$$;

create or replace function public.set_app_settings(
  plan jsonb default null,
  features jsonb default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.app_settings;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_profile_admin() then
    raise exception 'Admin only';
  end if;

  insert into public.app_settings (id, updated_at, updated_by)
  values ('global', now(), auth.uid())
  on conflict (id) do nothing;

  update public.app_settings
  set
    premium_plan = coalesce(plan, premium_plan),
    premium_features = coalesce(features, premium_features),
    updated_at = now(),
    updated_by = auth.uid()
  where id = 'global'
  returning * into row;

  return json_build_object(
    'premium_plan', row.premium_plan,
    'premium_features', row.premium_features
  );
end;
$$;

revoke all on function public.get_app_settings() from public;
grant execute on function public.get_app_settings() to anon, authenticated;

revoke all on function public.set_app_settings(jsonb, jsonb) from public;
grant execute on function public.set_app_settings(jsonb, jsonb) to authenticated;
