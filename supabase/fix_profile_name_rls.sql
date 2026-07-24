-- Fix profile name updates (RLS). Run all of this in Supabase → SQL Editor.

-- 1) Policies: owner can insert/update their own row
drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update own profile name" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Profiles are viewable by owner" on public.profiles;
create policy "Profiles are viewable by owner"
  on public.profiles for select
  using (auth.uid() = id);

-- 2) Drop old function first (return type changed from profiles → json)
drop function if exists public.set_my_full_name(text);

-- 3) Name-update RPC (security definer — trusted path from the app)
create function public.set_my_full_name(new_name text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cleaned text := nullif(trim(new_name), '');
  jwt_email text := nullif(trim(coalesce(auth.jwt() ->> 'email', '')), '');
  row public.profiles;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if cleaned is null then
    raise exception 'Name is required';
  end if;

  update public.profiles
  set
    full_name = cleaned,
    updated_at = now()
  where id = uid
  returning * into row;

  if not found then
    insert into public.profiles (id, email, full_name, role)
    values (uid, coalesce(jwt_email, ''), cleaned, 'user')
    on conflict (id) do update
      set full_name = excluded.full_name,
          updated_at = now()
    returning * into row;
  end if;

  return json_build_object(
    'id', row.id,
    'email', row.email,
    'full_name', row.full_name,
    'role', row.role
  );
end;
$$;

alter function public.set_my_full_name(text) owner to postgres;
revoke all on function public.set_my_full_name(text) from public;
grant execute on function public.set_my_full_name(text) to authenticated;
grant execute on function public.set_my_full_name(text) to service_role;
