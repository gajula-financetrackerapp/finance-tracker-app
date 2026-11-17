-- Harden Split Expense mutations.
-- Run after every split_expense*.sql file listed in README.md.

alter table public.split_expenses
  add column if not exists finance_category text,
  add column if not exists pay_source text,
  add column if not exists group_id uuid references public.split_groups (id) on delete set null;

drop policy if exists "split_friendships_insert" on public.split_friendships;
create policy "split_friendships_insert"
  on public.split_friendships for insert
  with check (
    auth.uid() = requester_id
    and requester_id <> addressee_id
    and status = 'pending'
  );

drop policy if exists "split_friendships_update" on public.split_friendships;
drop policy if exists "split_shares_update" on public.split_expense_shares;
drop policy if exists "split_settlements_update" on public.split_settlements;
drop policy if exists "split_settlements_delete_closed" on public.split_settlements;

drop policy if exists "split_settlements_insert" on public.split_settlements;
create policy "split_settlements_insert"
  on public.split_settlements for insert
  with check (
    auth.uid() = created_by
    and (auth.uid() = from_user_id or auth.uid() = to_user_id)
    and debtor_confirmed = false
    and creditor_confirmed = false
    and status = 'open'
    and completed_at is null
  );

revoke update on table public.split_friendships from authenticated;
revoke insert, update on table public.split_expenses from authenticated;
revoke insert, update on table public.split_expense_shares from authenticated;
revoke update, delete on table public.split_settlements from authenticated;

drop function if exists public.split_delete_closed_settlement(uuid);
drop function if exists public.split_delete_all_closed_settlements();

create or replace function public.split_set_expense_pay_source(
  p_expense_id uuid,
  p_pay_source text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.split_expenses;
  source text := lower(nullif(trim(p_pay_source), ''));
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if source is null or source not in ('bank', 'card') then
    raise exception 'Invalid pay source';
  end if;

  update public.split_expenses
  set pay_source = source
  where id = p_expense_id
    and created_by = auth.uid()
  returning * into row;
  if row.id is null then
    raise exception 'Expense not found or not editable' using errcode = '42501';
  end if;
  return row_to_json(row);
end;
$$;

revoke all on function public.split_set_expense_pay_source(uuid, text) from public, anon;
grant execute on function public.split_set_expense_pay_source(uuid, text) to authenticated;

create or replace function public.split_set_expense_group_id(
  p_expense_id uuid,
  p_group_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.split_expenses;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_group_id is not null
    and not public.split_is_group_member(p_group_id, auth.uid())
  then
    raise exception 'Group not found or not accessible' using errcode = '42501';
  end if;
  if p_group_id is not null and exists (
    select 1
    from public.split_expense_shares s
    where s.expense_id = p_expense_id
      and not public.split_is_group_member(p_group_id, s.user_id)
  ) then
    raise exception 'Every split participant must belong to the group'
      using errcode = '42501';
  end if;

  update public.split_expenses
  set group_id = p_group_id
  where id = p_expense_id
    and created_by = auth.uid()
  returning * into row;
  if row.id is null then
    raise exception 'Expense not found or not editable' using errcode = '42501';
  end if;
  return row_to_json(row);
end;
$$;

revoke all on function public.split_set_expense_group_id(uuid, uuid) from public, anon;
grant execute on function public.split_set_expense_group_id(uuid, uuid) to authenticated;

create or replace function public.split_mark_share_finance_txn(
  p_expense_id uuid,
  p_txn_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  update public.split_expense_shares
  set finance_txn_id = nullif(trim(p_txn_id), '')
  where expense_id = p_expense_id
    and user_id = auth.uid();
  get diagnostics changed = row_count;
  if changed = 0 then
    raise exception 'Expense share not found' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.split_mark_share_finance_txn(uuid, text) from public, anon;
grant execute on function public.split_mark_share_finance_txn(uuid, text) to authenticated;

create or replace function public.split_respond_invite(
  p_friendship_id uuid,
  p_accept boolean
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.split_friendships;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.split_friendships
  set
    status = case when coalesce(p_accept, false) then 'accepted' else 'declined' end,
    updated_at = now()
  where id = p_friendship_id
    and addressee_id = auth.uid()
    and status = 'pending'
  returning * into row;

  if row.id is null then
    raise exception 'Pending invitation not found or not addressed to this user'
      using errcode = '42501';
  end if;
  return row_to_json(row);
end;
$$;

revoke all on function public.split_respond_invite(uuid, boolean) from public, anon;
grant execute on function public.split_respond_invite(uuid, boolean) to authenticated;

create or replace function public.split_confirm_settlement(p_settlement_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row public.split_settlements;
  next_debtor boolean;
  next_creditor boolean;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into row
  from public.split_settlements s
  where s.id = p_settlement_id
  for update;

  if row.id is null or (uid <> row.from_user_id and uid <> row.to_user_id) then
    raise exception 'Settlement not found' using errcode = '42501';
  end if;
  if row.status <> 'open' then
    raise exception 'This settlement is no longer open';
  end if;

  next_debtor := row.debtor_confirmed or uid = row.from_user_id;
  next_creditor := row.creditor_confirmed or uid = row.to_user_id;

  update public.split_settlements
  set
    debtor_confirmed = next_debtor,
    creditor_confirmed = next_creditor,
    status = case when next_debtor and next_creditor then 'completed' else 'open' end,
    completed_at = case when next_debtor and next_creditor then now() else null end
  where id = row.id
  returning * into row;

  return row_to_json(row);
end;
$$;

revoke all on function public.split_confirm_settlement(uuid) from public, anon;
grant execute on function public.split_confirm_settlement(uuid) to authenticated;

create or replace function public.split_cancel_settlement(p_settlement_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  changed integer;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  update public.split_settlements
  set status = 'cancelled', completed_at = null
  where id = p_settlement_id
    and status = 'open'
    and (from_user_id = uid or to_user_id = uid);
  get diagnostics changed = row_count;

  if changed = 0 then
    raise exception 'Settlement is no longer open or is not yours'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.split_cancel_settlement(uuid) from public, anon;
grant execute on function public.split_cancel_settlement(uuid) to authenticated;
