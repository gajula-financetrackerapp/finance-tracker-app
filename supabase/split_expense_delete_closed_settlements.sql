-- TEST: let a participant delete completed / cancelled settlements.
-- Remove this file and the functions after testing.

drop policy if exists "split_settlements_delete_closed" on public.split_settlements;
create policy "split_settlements_delete_closed"
  on public.split_settlements for delete
  using (
    (auth.uid() = from_user_id or auth.uid() = to_user_id)
    and status in ('completed', 'cancelled')
  );

create or replace function public.split_delete_closed_settlement(p_settlement_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.split_settlements
  where id = p_settlement_id
    and status in ('completed', 'cancelled')
    and (from_user_id = auth.uid() or to_user_id = auth.uid())
  returning id into deleted_id;

  if deleted_id is null then
    raise exception 'Could not delete this closed settlement';
  end if;
end;
$$;

revoke all on function public.split_delete_closed_settlement(uuid) from public;
grant execute on function public.split_delete_closed_settlement(uuid) to authenticated;

create or replace function public.split_delete_all_closed_settlements()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.split_settlements
  where status in ('completed', 'cancelled')
    and (from_user_id = auth.uid() or to_user_id = auth.uid());
end;
$$;

revoke all on function public.split_delete_all_closed_settlements() from public;
grant execute on function public.split_delete_all_closed_settlements() to authenticated;
