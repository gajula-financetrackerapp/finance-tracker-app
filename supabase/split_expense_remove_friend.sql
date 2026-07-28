-- Allow either party to remove a friend / cancel an invite
-- Run in Supabase → SQL Editor (safe to re-run)

drop policy if exists "split_friendships_delete" on public.split_friendships;
create policy "split_friendships_delete"
  on public.split_friendships for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create or replace function public.split_remove_friend(p_friend_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_friend_user_id is null or p_friend_user_id = auth.uid() then
    raise exception 'Invalid friend';
  end if;

  delete from public.split_friendships
  where (
      (requester_id = auth.uid() and addressee_id = p_friend_user_id)
      or (addressee_id = auth.uid() and requester_id = p_friend_user_id)
    );
end;
$$;

revoke all on function public.split_remove_friend(uuid) from public;
grant execute on function public.split_remove_friend(uuid) to authenticated;

-- Cancel a pending invite by friendship row id (sender or receiver)
create or replace function public.split_cancel_invite(p_friendship_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.split_friendships
  where id = p_friendship_id
    and (requester_id = auth.uid() or addressee_id = auth.uid());
end;
$$;

revoke all on function public.split_cancel_invite(uuid) from public;
grant execute on function public.split_cancel_invite(uuid) to authenticated;
