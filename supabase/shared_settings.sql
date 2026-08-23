-- The rest of the Admin settings, shared across all devices.
--
-- Premium, ads and import rules already reached every phone. These did not:
-- the feature kill switches, the theme catalog, the support address, the app
-- name and the profile ad banner all lived in one phone's local storage, so an
-- admin switching a broken feature off changed their own install and nobody
-- else's — the very case a kill switch exists for.
--
-- One column rather than five: each of these is a self-contained blob with no
-- server-side meaning, and a column apiece would mean five more setters, five
-- more reads and a fifth redefinition of get_app_settings every time another
-- setting joins them. A missing key means "no admin ever saved this", and the
-- client keeps its own value — which is not the same as an empty object, since
-- empty feature flags would read as "every feature off".
--
-- Run in Supabase → SQL Editor, after app_settings.sql, admin_premium_users.sql,
-- google_ads.sql and import_rules.sql. This carries every payload, so run it
-- last, and run it again if you ever re-run any of those.

alter table public.app_settings
  add column if not exists shared_config jsonb;

comment on column public.app_settings.shared_config is
  'Admin settings shared with every client: appName, features, themeCatalog, defaultTheme, feedback, adBanner. Keys absent until an admin saves them.';

-- ─── Read: everything a client needs from Admin ─────────────────────────────
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
    'google_ads', (select google_ads from public.app_settings where id = 'global'),
    'import_rules', (select import_rules from public.app_settings where id = 'global'),
    'shared_config', (select shared_config from public.app_settings where id = 'global')
  );
$$;

-- ─── Write: merge one or more blobs ─────────────────────────────────────────
-- Merged rather than replaced so saving the theme catalog cannot wipe the
-- feature switches. The merge is deliberately one level deep: callers send a
-- whole blob per key, so a half-sent blob is never a thing to reconcile.
create or replace function public.set_app_shared_config(patch jsonb)
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
  if patch is null or jsonb_typeof(patch) <> 'object' then
    raise exception 'Shared settings must be a JSON object';
  end if;

  insert into public.app_settings (id, shared_config, updated_at, updated_by)
  values ('global', patch, now(), auth.uid())
  on conflict (id) do update
    set
      shared_config = coalesce(public.app_settings.shared_config, '{}'::jsonb) || excluded.shared_config,
      updated_at = now(),
      updated_by = excluded.updated_by
  returning shared_config into saved;

  return saved;
end;
$$;

revoke all on function public.get_app_settings() from public;
grant execute on function public.get_app_settings() to anon, authenticated;

revoke all on function public.set_app_shared_config(jsonb) from public;
grant execute on function public.set_app_shared_config(jsonb) to authenticated;

-- ─── Ad banner media ────────────────────────────────────────────────────────
-- The banner's videos and images were copied into the admin phone's own
-- documentDirectory, so sharing the banner's JSON alone would hand every other
-- phone a path to a file it does not have. They live here instead.
--
-- Public, unlike bill-images: a promo plays for signed-out users too, and there
-- is nothing private in it. Writing is still admins only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ad-media',
  'ad-media',
  true,
  26214400,
  array[
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone reads ad media" on storage.objects;
drop policy if exists "Admins upload ad media" on storage.objects;
drop policy if exists "Admins update ad media" on storage.objects;
drop policy if exists "Admins delete ad media" on storage.objects;

create policy "Anyone reads ad media"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'ad-media');

create policy "Admins upload ad media"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'ad-media' and public.is_profile_admin());

create policy "Admins update ad media"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'ad-media' and public.is_profile_admin())
  with check (bucket_id = 'ad-media' and public.is_profile_admin());

create policy "Admins delete ad media"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'ad-media' and public.is_profile_admin());
