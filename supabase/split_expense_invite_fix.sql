-- Fix: Split invites not visible to the other user
-- Run this in Supabase → SQL Editor (safe to re-run)

-- 1) Grants (RLS alone is not enough if authenticated can't SELECT)
grant select, insert, update, delete on public.split_friendships to authenticated;
grant select, insert, update, delete on public.split_groups to authenticated;
grant select, insert, update, delete on public.split_group_members to authenticated;
grant select, insert, update, delete on public.split_expenses to authenticated;
grant select, insert, update, delete on public.split_expense_shares to authenticated;
grant select, insert, update, delete on public.split_settlements to authenticated;

-- 2) List friendships via security definer (both sides always see their rows)
create or replace function public.split_list_friendships()
returns setof public.split_friendships
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  return query
  select f.*
  from public.split_friendships f
  where f.requester_id = auth.uid()
     or f.addressee_id = auth.uid()
  order by f.created_at desc;
end;
$$;

revoke all on function public.split_list_friendships() from public;
grant execute on function public.split_list_friendships() to authenticated;

-- 3) Include pending invite counterparts in profile lookup (so names show)
create or replace function public.split_friend_profiles()
returns table (id uuid, email text, full_name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  return query
  select distinct p.id, p.email, p.full_name
  from public.profiles p
  where p.id = auth.uid()
     or exists (
       select 1 from public.split_friendships f
       where f.status in ('pending', 'accepted')
         and (
           (f.requester_id = auth.uid() and f.addressee_id = p.id)
           or (f.addressee_id = auth.uid() and f.requester_id = p.id)
         )
     )
     or exists (
       select 1 from public.split_expense_shares s1
       join public.split_expense_shares s2 on s1.expense_id = s2.expense_id
       where s1.user_id = auth.uid() and s2.user_id = p.id
     )
     or exists (
       select 1 from public.split_group_members gm1
       join public.split_group_members gm2 on gm1.group_id = gm2.group_id
       where gm1.user_id = auth.uid() and gm2.user_id = p.id
     )
     or exists (
       select 1 from public.split_settlements st
       where (st.from_user_id = auth.uid() and st.to_user_id = p.id)
          or (st.to_user_id = auth.uid() and st.from_user_id = p.id)
     );
end;
$$;

revoke all on function public.split_friend_profiles() from public;
grant execute on function public.split_friend_profiles() to authenticated;

-- 4) Re-invite should reset declined → pending
create or replace function public.split_invite_friend(p_email text)
returns public.split_friendships
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
  target_email text;
  target_name text;
  row public.split_friendships;
  reverse public.split_friendships;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.split_user_is_premium(auth.uid()) then
    raise exception 'Split Expense requires Premium or Plus';
  end if;

  select t.id, t.email, t.full_name
    into target_id, target_email, target_name
  from public.split_lookup_invitee(p_email) as t
  limit 1;

  if target_id is null then
    raise exception 'No Premium/Plus account found for that email';
  end if;
  if target_id = auth.uid() then
    raise exception 'You cannot invite yourself';
  end if;

  select * into reverse
  from public.split_friendships
  where requester_id = target_id and addressee_id = auth.uid();

  if reverse.id is not null then
    if reverse.status = 'accepted' then
      return reverse;
    end if;
    update public.split_friendships
    set status = 'accepted', updated_at = now()
    where id = reverse.id
    returning * into row;
    return row;
  end if;

  insert into public.split_friendships (requester_id, addressee_id, status)
  values (auth.uid(), target_id, 'pending')
  on conflict (requester_id, addressee_id) do update
    set status = 'pending',
        updated_at = now()
  returning * into row;

  return row;
end;
$$;

revoke all on function public.split_invite_friend(text) from public;
grant execute on function public.split_invite_friend(text) to authenticated;
