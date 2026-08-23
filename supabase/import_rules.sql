-- SMS import rules, shared across all devices.
--
-- Import rules used to live only in each phone's local storage, so a rule an
-- admin wrote reached that one phone and nobody else. The only way to teach
-- every install about a new bank or merchant was to add it to
-- src/lib/importRules/builtinRules.ts and ship a release. Keeping the admin's
-- rules here lets one edit reach everyone without one.
--
-- Only the admin's own rules belong in this column: custom rules, plus the
-- built-ins whose switch, category or priority an admin moved. The client
-- merges them over whatever built-ins its own build ships, so a phone on a
-- newer version keeps its newer matching (see mergeImportRules).
--
-- Run in Supabase → SQL Editor, after app_settings.sql, admin_premium_users.sql
-- and google_ads.sql. This replaces get_app_settings again to add the import
-- payload, so run this one last, and re-run it if you ever re-run those.

alter table public.app_settings
  add column if not exists import_rules jsonb;

-- Deliberately no default: null means "never configured", and clients keep the
-- built-in rules from their own build rather than being reset by an empty row.
comment on column public.app_settings.import_rules is
  'Admin SMS import rules for every client. Null until an admin saves once.';

-- ─── Read: plan + feature gates + ads + import rules ────────────────────────
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
    'import_rules', (select import_rules from public.app_settings where id = 'global')
  );
$$;

-- ─── Write: import rules only ───────────────────────────────────────────────
-- Its own function for the same reason ads have one: adding an argument with a
-- default to set_app_settings would leave two overloads a named call could not
-- tell apart.
create or replace function public.set_app_import_rules(rules jsonb)
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
  if rules is null or jsonb_typeof(rules) <> 'object' then
    raise exception 'Import rules must be a JSON object';
  end if;
  -- A malformed list would stop every phone importing anything, so refuse it
  -- here rather than let each client discover it separately.
  if jsonb_typeof(rules -> 'rules') <> 'array' then
    raise exception 'Import rules must carry a rules array';
  end if;

  insert into public.app_settings (id, import_rules, updated_at, updated_by)
  values ('global', rules, now(), auth.uid())
  on conflict (id) do update
    set
      import_rules = excluded.import_rules,
      updated_at = now(),
      updated_by = excluded.updated_by
  returning import_rules into saved;

  return saved;
end;
$$;

revoke all on function public.get_app_settings() from public;
grant execute on function public.get_app_settings() to anon, authenticated;

revoke all on function public.set_app_import_rules(jsonb) from public;
grant execute on function public.set_app_import_rules(jsonb) to authenticated;
