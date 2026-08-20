-- Global app settings (Premium offer) — shared across all devices.
-- Run in Supabase → SQL Editor (needs is_profile_admin from admin_list_users.sql).

create table if not exists public.app_settings (
  id text primary key default 'global' check (id = 'global'),
  premium_plan jsonb not null default '{
    "priceLabel": "₹399/year",
    "amountInr": 399,
    "upiId": "",
    "payeeName": "Kashio Premium"
  }'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.app_settings (id)
values ('global')
on conflict (id) do nothing;

alter table public.app_settings enable row level security;

grant select on table public.app_settings to anon, authenticated;
grant insert, update on table public.app_settings to authenticated;

drop policy if exists "Authenticated can read app settings" on public.app_settings;
create policy "Authenticated can read app settings"
  on public.app_settings for select
  to authenticated
  using (true);

drop policy if exists "Anon can read app settings" on public.app_settings;
create policy "Anon can read app settings"
  on public.app_settings for select
  to anon
  using (true);

drop policy if exists "Admins can upsert app settings" on public.app_settings;
create policy "Admins can upsert app settings"
  on public.app_settings for insert
  to authenticated
  with check (public.is_profile_admin());

drop policy if exists "Admins can update app settings" on public.app_settings;
create policy "Admins can update app settings"
  on public.app_settings for update
  to authenticated
  using (public.is_profile_admin())
  with check (public.is_profile_admin());

-- RPCs (more reliable than raw table upsert from some clients)
create or replace function public.get_app_premium_plan()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select premium_plan from public.app_settings where id = 'global'),
    '{"priceLabel":"₹399/year","amountInr":399,"upiId":"","payeeName":"Kashio Premium"}'::jsonb
  );
$$;

create or replace function public.set_app_premium_plan(plan jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_profile_admin() then
    raise exception 'Admin only';
  end if;

  insert into public.app_settings (id, premium_plan, updated_at, updated_by)
  values ('global', plan, now(), auth.uid())
  on conflict (id) do update
    set
      premium_plan = excluded.premium_plan,
      updated_at = now(),
      updated_by = excluded.updated_by;

  return plan;
end;
$$;

revoke all on function public.get_app_premium_plan() from public;
grant execute on function public.get_app_premium_plan() to anon, authenticated;

revoke all on function public.set_app_premium_plan(jsonb) from public;
grant execute on function public.set_app_premium_plan(jsonb) to authenticated;

comment on table public.app_settings is
  'Singleton row (id=global). Admin edits Premium plan; all clients read it.';

-- Refresh default offer if still on the old monthly starter values.
update public.app_settings
set
  premium_plan = '{
    "priceLabel": "₹399/year",
    "amountInr": 399,
    "upiId": "",
    "payeeName": "Kashio Premium"
  }'::jsonb,
  updated_at = now()
where id = 'global'
  and (
    premium_plan->>'amountInr' in ('49', '49.0')
    or premium_plan->>'priceLabel' ilike '%/month%'
  );
