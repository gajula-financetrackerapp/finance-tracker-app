-- Read-only production security inventory.
-- Run in Supabase SQL Editor before and after security_phase3.sql and save both
-- result sets. This file changes no data or configuration.

select
  n.nspname as schema_name,
  c.relname as relation_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'storage')
  and c.relkind in ('r', 'p')
order by n.nspname, c.relname;

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;

select
  table_schema,
  table_name,
  grantee,
  string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema in ('public', 'storage')
  and grantee in ('anon', 'authenticated', 'service_role')
group by table_schema, table_name, grantee
order by table_schema, table_name, grantee;

select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  coalesce(array_to_string(p.proacl, ', '), '') as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    p.prosecdef
    or coalesce(array_to_string(p.proacl, ','), '') ~ '(anon|authenticated|service_role)'
  )
order by p.proname, arguments;

select
  id,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id in ('bill-images', 'ad-media')
order by id;

-- High-risk invariants. Every row returned is a finding to investigate.
select 'public table without RLS' as finding, c.relname as object_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and not c.relrowsecurity
  and c.relname not like 'spatial_ref_sys'
union all
select 'authenticated direct write grant', table_name
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'authenticated'
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  and table_name in (
    'play_subscription_grants',
    'rewarded_ad_claims',
    'split_expenses',
    'split_expense_shares',
    'split_settlements'
  )
order by finding, object_name;
