-- Save group_id on create so a group split is never listed as Non-group.
-- Run in the Supabase SQL editor after split_expense_group_attach.sql.

alter table public.split_expenses
  add column if not exists group_id uuid references public.split_groups (id) on delete set null;

drop function if exists public.split_create_expense(text, numeric, text, uuid, text, date, jsonb);
drop function if exists public.split_create_expense(text, numeric, text, uuid, text, date, jsonb, text);
drop function if exists public.split_create_expense(text, numeric, text, uuid, text, date, jsonb, text, uuid);

create function public.split_create_expense(
  p_description text,
  p_amount numeric,
  p_currency text,
  p_paid_by uuid,
  p_split_mode text,
  p_expense_date date,
  p_shares jsonb,
  p_finance_category text default null,
  p_group_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.split_expenses;
  share jsonb;
  uid uuid;
  amt numeric;
  total numeric := 0;
  share_count int := 0;
  cat text := nullif(trim(coalesce(p_finance_category, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if trim(coalesce(p_description, '')) = '' then
    raise exception 'Enter a description';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter a valid amount';
  end if;
  if p_split_mode not in ('equal', 'custom', 'exact', 'percentage', 'shares', 'adjustment') then
    raise exception 'Invalid split mode';
  end if;
  if p_paid_by is null then
    raise exception 'Who paid is required';
  end if;

  if p_group_id is not null and not public.split_is_group_member(p_group_id, auth.uid()) then
    raise exception 'Not a member of this group';
  end if;

  for share in select * from jsonb_array_elements(coalesce(p_shares, '[]'::jsonb))
  loop
    uid := nullif(share->>'user_id', '')::uuid;
    amt := coalesce((share->>'share_amount')::numeric, 0);
    if uid is null then
      raise exception 'Invalid share participant';
    end if;
    if amt < 0 then
      raise exception 'Share amounts must be >= 0';
    end if;
    total := total + amt;
    share_count := share_count + 1;
    if p_group_id is not null and not public.split_is_group_member(p_group_id, uid) then
      raise exception 'Everyone on this split must be in the group';
    end if;
  end loop;

  if share_count < 2 then
    raise exception 'Pick at least one friend (You + someone)';
  end if;
  if abs(total - p_amount) > 0.02 then
    raise exception 'Shares (%) must equal the bill (%)', total, p_amount;
  end if;

  if not exists (
    select 1 from jsonb_array_elements(p_shares) s
    where (s->>'user_id')::uuid = p_paid_by
  ) then
    raise exception 'Payer must be one of the participants';
  end if;

  for share in select * from jsonb_array_elements(p_shares)
  loop
    uid := (share->>'user_id')::uuid;
    if uid <> auth.uid() and not public.split_can_split_with(uid) then
      raise exception 'All participants must be accepted friends or in a group with you';
    end if;
  end loop;

  if to_regprocedure('public.split_consume_create_quota()') is not null then
    perform public.split_consume_create_quota();
  end if;

  insert into public.split_expenses (
    created_by, description, amount, currency, paid_by, split_mode, expense_date,
    finance_category, group_id
  ) values (
    auth.uid(),
    trim(p_description),
    round(p_amount::numeric, 2),
    coalesce(nullif(trim(p_currency), ''), 'INR'),
    p_paid_by,
    p_split_mode,
    coalesce(p_expense_date, current_date),
    cat,
    p_group_id
  )
  returning * into e;

  for share in select * from jsonb_array_elements(p_shares)
  loop
    insert into public.split_expense_shares (expense_id, user_id, share_amount, finance_txn_id)
    values (
      e.id,
      (share->>'user_id')::uuid,
      round((share->>'share_amount')::numeric, 2),
      null
    );
  end loop;

  return (
    select jsonb_build_object(
      'id', e.id,
      'created_by', e.created_by,
      'description', e.description,
      'amount', e.amount,
      'currency', e.currency,
      'paid_by', e.paid_by,
      'split_mode', e.split_mode,
      'expense_date', e.expense_date,
      'created_at', e.created_at,
      'finance_category', e.finance_category,
      'group_id', e.group_id,
      'shares', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'expense_id', s.expense_id,
              'user_id', s.user_id,
              'share_amount', s.share_amount,
              'finance_txn_id', s.finance_txn_id
            )
          )
          from public.split_expense_shares s
          where s.expense_id = e.id
        ),
        '[]'::jsonb
      )
    )
  );
end;
$$;

revoke all on function public.split_create_expense(text, numeric, text, uuid, text, date, jsonb, text, uuid) from public;
grant execute on function public.split_create_expense(text, numeric, text, uuid, text, date, jsonb, text, uuid) to authenticated;

create or replace function public.split_list_expenses()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc), '[]'::jsonb)
  into result
  from (
    select
      e.id,
      e.created_by,
      e.description,
      e.amount,
      e.currency,
      e.paid_by,
      e.split_mode,
      e.expense_date,
      e.created_at,
      e.finance_category,
      e.pay_source,
      e.group_id,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'expense_id', s.expense_id,
              'user_id', s.user_id,
              'share_amount', s.share_amount,
              'finance_txn_id', s.finance_txn_id
            )
          )
          from public.split_expense_shares s
          where s.expense_id = e.id
        ),
        '[]'::jsonb
      ) as shares
    from public.split_expenses e
    where public.split_is_expense_participant(e.id, auth.uid())
  ) x;

  return result;
end;
$$;

revoke all on function public.split_list_expenses() from public;
grant execute on function public.split_list_expenses() to authenticated;
