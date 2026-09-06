-- Fixes: function public.split_can_split_with(uuid) does not exist
-- Run this in Supabase → SQL Editor. Safe to re-run.

create or replace function public.split_can_split_with(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_other is not null
    and (
      p_other = auth.uid()
      or exists (
        select 1
        from public.split_friendships f
        where f.status = 'accepted'
          and (
            (f.requester_id = auth.uid() and f.addressee_id = p_other)
            or (f.addressee_id = auth.uid() and f.requester_id = p_other)
          )
      )
      or exists (
        select 1
        from public.split_groups g
        where public.split_is_group_member(g.id, auth.uid())
          and public.split_is_group_member(g.id, p_other)
      )
    );
$$;

revoke all on function public.split_can_split_with(uuid) from public;
grant execute on function public.split_can_split_with(uuid) to authenticated;
