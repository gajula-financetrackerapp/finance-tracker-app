-- Fix infinite recursion in split_groups / split_group_members RLS
-- Run in Supabase → SQL Editor (safe to re-run)

-- Helper: bypasses RLS so policies don't recurse
create or replace function public.split_is_group_owner(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.split_groups g
    where g.id = p_group_id
      and g.owner_id = p_user_id
  );
$$;

create or replace function public.split_is_group_member(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.split_is_group_owner(p_group_id, p_user_id)
    or exists (
      select 1
      from public.split_group_members m
      where m.group_id = p_group_id
        and m.user_id = p_user_id
    );
$$;

revoke all on function public.split_is_group_owner(uuid, uuid) from public;
revoke all on function public.split_is_group_member(uuid, uuid) from public;
grant execute on function public.split_is_group_owner(uuid, uuid) to authenticated;
grant execute on function public.split_is_group_member(uuid, uuid) to authenticated;

-- Recreate policies without cross-table subqueries
drop policy if exists "split_groups_select" on public.split_groups;
create policy "split_groups_select"
  on public.split_groups for select
  using (public.split_is_group_member(id, auth.uid()));

drop policy if exists "split_groups_insert" on public.split_groups;
create policy "split_groups_insert"
  on public.split_groups for insert
  with check (auth.uid() = owner_id);

drop policy if exists "split_groups_update" on public.split_groups;
create policy "split_groups_update"
  on public.split_groups for update
  using (auth.uid() = owner_id);

drop policy if exists "split_groups_delete" on public.split_groups;
create policy "split_groups_delete"
  on public.split_groups for delete
  using (auth.uid() = owner_id);

drop policy if exists "split_group_members_select" on public.split_group_members;
create policy "split_group_members_select"
  on public.split_group_members for select
  using (public.split_is_group_member(group_id, auth.uid()));

drop policy if exists "split_group_members_write" on public.split_group_members;
create policy "split_group_members_insert"
  on public.split_group_members for insert
  with check (public.split_is_group_owner(group_id, auth.uid()));

create policy "split_group_members_update"
  on public.split_group_members for update
  using (public.split_is_group_owner(group_id, auth.uid()));

create policy "split_group_members_delete"
  on public.split_group_members for delete
  using (public.split_is_group_owner(group_id, auth.uid()));

-- Atomic create group + members (preferred by app)
create or replace function public.split_create_group(p_name text, p_member_ids uuid[])
returns public.split_groups
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.split_groups;
  mid uuid;
  members uuid[];
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.split_user_is_premium(auth.uid()) then
    raise exception 'Split Expense requires Premium or Plus';
  end if;
  if trim(coalesce(p_name, '')) = '' then
    raise exception 'Enter a group name';
  end if;

  insert into public.split_groups (owner_id, name)
  values (auth.uid(), trim(p_name))
  returning * into g;

  members := array(
    select distinct x
    from unnest(array_append(coalesce(p_member_ids, '{}'::uuid[]), auth.uid())) as x
    where x is not null
  );

  foreach mid in array members loop
    -- Only allow accepted friends (or self)
    if mid <> auth.uid() and not exists (
      select 1 from public.split_friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = mid)
          or (f.addressee_id = auth.uid() and f.requester_id = mid)
        )
    ) then
      raise exception 'All members must be accepted friends';
    end if;

    insert into public.split_group_members (group_id, user_id)
    values (g.id, mid)
    on conflict do nothing;
  end loop;

  return g;
end;
$$;

revoke all on function public.split_create_group(text, uuid[]) from public;
grant execute on function public.split_create_group(text, uuid[]) to authenticated;

-- List groups for current user without recursive RLS pain
create or replace function public.split_list_groups()
returns table (
  id uuid,
  owner_id uuid,
  name text,
  created_at timestamptz,
  member_ids uuid[]
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  return query
  select
    g.id,
    g.owner_id,
    g.name,
    g.created_at,
    coalesce(
      (
        select array_agg(m.user_id order by m.user_id)
        from public.split_group_members m
        where m.group_id = g.id
      ),
      '{}'::uuid[]
    ) as member_ids
  from public.split_groups g
  where public.split_is_group_member(g.id, auth.uid())
  order by g.created_at desc;
end;
$$;

revoke all on function public.split_list_groups() from public;
grant execute on function public.split_list_groups() to authenticated;
