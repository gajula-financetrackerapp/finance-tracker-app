-- Ad settings, shared across all devices.
--
-- AdMob settings used to live only in each phone's local storage, so an admin
-- turning test ads off changed that one phone and nobody else — every other
-- install kept serving Google's test inventory, which earns nothing. Keeping
-- them here lets one admin edit reach everyone without shipping a release.
--
-- Run in Supabase → SQL Editor, after app_settings.sql and
-- admin_premium_users.sql (this replaces get_app_settings from that file to
-- add the ad payload, so re-run this one if you ever re-run that one).

alter table public.app_settings
  add column if not exists google_ads jsonb;

-- Deliberately no default: null means "never configured", and clients leave
-- their built-in defaults alone rather than being reset by an empty row.
comment on column public.app_settings.google_ads is
  'AdMob config for every client. Null until an admin saves it once.';

-- ─── Read: plan + feature gates + ads ───────────────────────────────────────
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
    ),
    'google_ads', (select google_ads from public.app_settings where id = 'global')
  );
$$;

-- ─── Write: ads only ────────────────────────────────────────────────────────
-- Its own function rather than a third argument on set_app_settings: adding an
-- argument with a default would leave two overloads in place, and a two-named-
-- argument call could no longer tell them apart.
create or replace function public.set_app_google_ads(ads jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  saved jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_profile_admin() then
    raise exception 'Admin only';
  end if;
  if ads is null or jsonb_typeof(ads) <> 'object' then
    raise exception 'Ad settings must be a JSON object';
  end if;

  insert into public.app_settings (id, google_ads, updated_at, updated_by)
  values ('global', ads, now(), auth.uid())
  on conflict (id) do update
    set
      google_ads = excluded.google_ads,
      updated_at = now(),
      updated_by = excluded.updated_by
  returning google_ads into saved;

  return saved;
end;
$$;

revoke all on function public.get_app_settings() from public;
grant execute on function public.get_app_settings() to anon, authenticated;

revoke all on function public.set_app_google_ads(jsonb) from public;
grant execute on function public.set_app_google_ads(jsonb) to authenticated;
