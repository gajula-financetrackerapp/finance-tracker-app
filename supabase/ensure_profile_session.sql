-- Ensure profile row + safer claim_session. Run in Supabase → SQL Editor.

-- Owner policies (idempotent)
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

-- Create/update the caller's profile (security definer — avoids insert RLS races)
create or replace function public.ensure_my_profile(
  full_name text default null,
  email text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  jwt_email text := nullif(trim(coalesce(email, auth.jwt() ->> 'email', '')), '');
  cleaned_name text := nullif(trim(coalesce(full_name, '')), '');
  row public.profiles;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if cleaned_name is null then
    cleaned_name := split_part(coalesce(jwt_email, 'user'), '@', 1);
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (uid, coalesce(jwt_email, ''), cleaned_name, 'user')
  on conflict (id) do update
    set
      email = coalesce(nullif(excluded.email, ''), public.profiles.email),
      full_name = case
        when nullif(public.profiles.full_name, '') is null then excluded.full_name
        else public.profiles.full_name
      end,
      updated_at = now()
  returning * into row;

  return row;
end;
$$;

alter function public.ensure_my_profile(text, text) owner to postgres;
revoke all on function public.ensure_my_profile(text, text) from public;
grant execute on function public.ensure_my_profile(text, text) to authenticated;
grant execute on function public.ensure_my_profile(text, text) to service_role;

-- claim_session: create profile if missing, then set active_session_id
create or replace function public.claim_session(session_id text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if session_id is null or length(trim(session_id)) < 8 then
    raise exception 'Invalid session id';
  end if;

  update public.profiles
  set
    active_session_id = session_id,
    updated_at = now()
  where id = auth.uid()
  returning * into row;

  if not found then
    insert into public.profiles (id, email, full_name, role, active_session_id)
    values (
      auth.uid(),
      coalesce(nullif(trim(coalesce(auth.jwt() ->> 'email', '')), ''), ''),
      split_part(coalesce(auth.jwt() ->> 'email', 'user'), '@', 1),
      'user',
      session_id
    )
    on conflict (id) do update
      set active_session_id = excluded.active_session_id,
          updated_at = now()
    returning * into row;
  end if;

  return row;
end;
$$;

revoke all on function public.claim_session(text) from public;
grant execute on function public.claim_session(text) to authenticated;
