-- Let the person who added a split delete it, for everyone in it
-- Run in Supabase → SQL Editor (safe to re-run)
--
-- The delete policy from split_expense.sql already allows this, so the app
-- works without this file. What the function adds is a clear refusal: a
-- delete blocked by row-level security removes no rows and reports no error,
-- which is indistinguishable from a split that was already gone.
--
-- Share rows are not deleted here — split_expense_shares.expense_id cascades
-- on delete, which is also how every other participant's phone learns the
-- split is gone: their next list simply no longer includes it.

drop policy if exists "split_expenses_delete" on public.split_expenses;
create policy "split_expenses_delete"
  on public.split_expenses for delete
  using (auth.uid() = created_by);

create or replace function public.split_delete_expense(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_expense_id is null then
    raise exception 'Invalid split';
  end if;

  select created_by into owner
  from public.split_expenses
  where id = p_expense_id;

  if owner is null then
    raise exception 'This split no longer exists';
  end if;
  if owner <> auth.uid() then
    raise exception 'Only the person who added this split can delete it';
  end if;

  delete from public.split_expenses where id = p_expense_id;
end;
$$;

revoke all on function public.split_delete_expense(uuid) from public;
grant execute on function public.split_delete_expense(uuid) to authenticated;
