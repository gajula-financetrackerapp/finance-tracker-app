-- Apply only after every administrator has enrolled a verified TOTP factor.
-- This augments security_phase3.sql's PostgREST pre-request hook.

create or replace function public.admin_has_recent_mfa(max_age_seconds integer default 900)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    and exists (
      select 1
      from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) factor
      where factor ->> 'method' in ('totp', 'mfa')
        and coalesce((factor ->> 'timestamp')::bigint, 0)
          >= extract(epoch from now())::bigint - greatest(max_age_seconds, 60)
    );
$$;

revoke all on function public.admin_has_recent_mfa(integer) from public, anon;
grant execute on function public.admin_has_recent_mfa(integer) to authenticated;

create or replace function public.enforce_active_account_request()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  request_path text := coalesce(current_setting('request.path', true), '');
  sensitive_admin_paths text[] := array[
    '/rpc/admin_delete_user',
    '/rpc/admin_restore_account',
    '/rpc/admin_set_user_premium',
    '/rpc/admin_grant_diamonds',
    '/rpc/admin_set_feedback_status',
    '/rpc/admin_delete_feedback',
    '/rpc/set_app_settings',
    '/rpc/set_app_shared_config',
    '/rpc/set_app_google_ads',
    '/rpc/set_app_import_rules',
    '/rpc/set_app_premium_plan',
    '/rpc/set_diamond_economy'
  ];
begin
  if auth.role() = 'authenticated'
    and request_path <> '/rpc/my_account_disabled'
    and not public.account_is_active_for(auth.uid())
  then
    raise exception 'Account disabled' using errcode = '42501';
  end if;

  if request_path = any(sensitive_admin_paths)
    and (
      not public.is_profile_admin()
      or not public.admin_has_recent_mfa(900)
    )
  then
    raise exception 'Recent administrator MFA required' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.enforce_active_account_request() from public;
grant execute on function public.enforce_active_account_request()
  to authenticator, anon, authenticated, service_role;
alter role authenticator set pgrst.db_pre_request = 'public.enforce_active_account_request';
notify pgrst, 'reload config';

-- Do not rely only on RPC paths: direct Data API writes must meet the same
-- requirement, and security-definer settings RPCs are covered by this trigger.
create or replace function public.guard_admin_settings_mfa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'authenticated'
    and (
      not public.is_profile_admin()
      or not public.admin_has_recent_mfa(900)
    )
  then
    raise exception 'Recent administrator MFA required' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_admin_settings_mfa() from public, anon, authenticated;

drop trigger if exists guard_admin_settings_mfa on public.app_settings;
create trigger guard_admin_settings_mfa
before insert or update or delete on public.app_settings
for each row execute function public.guard_admin_settings_mfa();

drop policy if exists "Admins can upsert app settings" on public.app_settings;
create policy "Admins can upsert app settings"
  on public.app_settings for insert to authenticated
  with check (public.is_profile_admin() and public.admin_has_recent_mfa(900));

drop policy if exists "Admins can update app settings" on public.app_settings;
create policy "Admins can update app settings"
  on public.app_settings for update to authenticated
  using (public.is_profile_admin() and public.admin_has_recent_mfa(900))
  with check (public.is_profile_admin() and public.admin_has_recent_mfa(900));

-- Storage bypasses PostgREST's pre-request hook, so protect administrator
-- receipt access and ad-media mutations directly in Storage RLS.
drop policy if exists "Admins read all bill images" on storage.objects;
create policy "Admins read all bill images"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'bill-images'
    and public.is_profile_admin()
    and public.admin_has_recent_mfa(900)
  );

drop policy if exists "Admins delete all bill images" on storage.objects;
create policy "Admins delete all bill images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'bill-images'
    and public.is_profile_admin()
    and public.admin_has_recent_mfa(900)
  );

drop policy if exists "Admins upload ad media" on storage.objects;
create policy "Admins upload ad media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'ad-media'
    and public.is_profile_admin()
    and public.admin_has_recent_mfa(900)
  );

drop policy if exists "Admins update ad media" on storage.objects;
create policy "Admins update ad media"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'ad-media'
    and public.is_profile_admin()
    and public.admin_has_recent_mfa(900)
  )
  with check (
    bucket_id = 'ad-media'
    and public.is_profile_admin()
    and public.admin_has_recent_mfa(900)
  );

drop policy if exists "Admins delete ad media" on storage.objects;
create policy "Admins delete ad media"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'ad-media'
    and public.is_profile_admin()
    and public.admin_has_recent_mfa(900)
  );
