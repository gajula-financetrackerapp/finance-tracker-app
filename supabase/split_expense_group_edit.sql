-- Update / delete split groups (owner only). Run after split_expense_groups_fix.sql.

create or replace function public.split_update_group(
  p_group_id uuid,
  p_name text,
  p_member_ids uuid[]
)
returns jsonb
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

  select * into g from public.split_groups where id = p_group_id;
  if not found then
    raise exception 'Group not found';
  end if;
  if g.owner_id <> auth.uid() then
    raise exception 'Only the group owner can edit';
  end if;
  if trim(coalesce(p_name, '')) = '' then
    raise exception 'Enter a group name';
  end if;

  update public.split_groups
  set name = trim(p_name)
  where id = p_group_id
  returning * into g;

  members := array(
    select distinct x
    from unnest(array_append(coalesce(p_member_ids, '{}'::uuid[]), auth.uid())) as x
    where x is not null
  );

  foreach mid in array members loop
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
    values (p_group_id, mid)
    on conflict do nothing;
  end loop;

  delete from public.split_group_members m
  where m.group_id = p_group_id
    and not (m.user_id = any (members));

  return jsonb_build_object(
    'id', g.id,
    'owner_id', g.owner_id,
    'name', g.name,
    'created_at', g.created_at,
    'member_ids', members
  );
end;
$$;

revoke all on function public.split_update_group(uuid, text, uuid[]) from public;
grant execute on function public.split_update_group(uuid, text, uuid[]) to authenticated;

create or replace function public.split_delete_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.split_groups;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into g from public.split_groups where id = p_group_id;
  if not found then
    raise exception 'Group not found';
  end if;
  if g.owner_id <> auth.uid() then
    raise exception 'Only the group owner can delete';
  end if;

  delete from public.split_groups where id = p_group_id;
end;
$$;

revoke all on function public.split_delete_group(uuid) from public;
grant execute on function public.split_delete_group(uuid) to authenticated;
