-- Run the FULL script in Supabase → SQL Editor.
-- Lets either allowlisted admin list users and delete other accounts (including other admins).

create or replace function public.is_profile_admin()
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  jwt_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then
    return false;
  end if;

  -- Prefer profiles.role; also accept JWT / profile email allowlist.
  return exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'admin'
        or lower(coalesce(p.email, '')) in (
          'g.ramkumar3127@gmail.com',
          'lakshmankumar586@gmail.com'
        )
      )
  )
  or jwt_email in (
    'g.ramkumar3127@gmail.com',
    'lakshmankumar586@gmail.com'
  );
end;
$$;

revoke all on function public.is_profile_admin() from public;
grant execute on function public.is_profile_admin() to authenticated;

drop policy if exists "Admins can view all profiles" on public.profiles;
create policy "Admins can view all profiles"
  on public.profiles for select
  using (public.is_profile_admin());

-- Count remaining admins (role or allowlisted email).
create or replace function public.count_admin_profiles()
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::int
  from public.profiles p
  where p.role = 'admin'
     or lower(coalesce(p.email, '')) in (
       'g.ramkumar3127@gmail.com',
       'lakshmankumar586@gmail.com'
     );
$$;

revoke all on function public.count_admin_profiles() from public;
grant execute on function public.count_admin_profiles() to authenticated;

create or replace function public.list_signed_in_profiles()
returns table (
  id uuid,
  email text,
  full_name text,
  role text,
  created_at timestamptz
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

  return query
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
    coalesce(p.created_at, u.created_at)
  from auth.users u
  left join public.profiles p on p.id = u.id
  order by coalesce(p.created_at, u.created_at) desc nulls last;
end;
$$;

revoke all on function public.list_signed_in_profiles() from public;
grant execute on function public.list_signed_in_profiles() to authenticated;

-- Admin deletes any other account (users OR other admins). Not yourself. Not the last admin.
create or replace function public.admin_delete_user(target_id uuid)
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_is_admin boolean := false;
  admin_count int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_profile_admin() then
    raise exception 'not authorized';
  end if;
  if target_id is null then
    raise exception 'missing user id';
  end if;
  if target_id = auth.uid() then
    raise exception 'cannot delete your own account from here';
  end if;

  select
    (
      coalesce(p.role, 'user') = 'admin'
      or lower(coalesce(p.email, u.email, '')) in (
        'g.ramkumar3127@gmail.com',
        'lakshmankumar586@gmail.com'
      )
    )
  into target_is_admin
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = target_id;

  if not found then
    select
      (
        coalesce(p.role, 'user') = 'admin'
        or lower(coalesce(p.email, '')) in (
          'g.ramkumar3127@gmail.com',
          'lakshmankumar586@gmail.com'
        )
      )
    into target_is_admin
    from public.profiles p
    where p.id = target_id;

    if not found then
      raise exception 'user not found';
    end if;
  end if;

  if coalesce(target_is_admin, false) then
    admin_count := public.count_admin_profiles();
    if admin_count <= 1 then
      raise exception 'cannot delete the last admin';
    end if;
  end if;

  -- Auth row first (cascades public tables that reference auth.users).
  begin
    delete from auth.users where id = target_id;
  exception
    when insufficient_privilege then
      raise exception 'server cannot delete auth users — re-run this SQL as project owner, or delete the user in Supabase → Authentication → Users';
    when others then
      raise exception 'delete failed: %', SQLERRM;
  end;

  delete from public.profiles where id = target_id;

  return json_build_object('ok', true, 'id', target_id);
end;
$$;

revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- Ensure both allowlisted accounts are admins in profiles.
update public.profiles
set role = 'admin', updated_at = now()
where lower(coalesce(email, '')) in (
  'g.ramkumar3127@gmail.com',
  'lakshmankumar586@gmail.com'
);
