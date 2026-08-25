-- Bank vs credit card for split expenses.
-- Each Premium participant books the spend on that kind of account in their own Finance.
-- Run in Supabase SQL editor after split_expense_finance_category.sql.

alter table public.split_expenses
  add column if not exists pay_source text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'split_expenses_pay_source_check'
  ) then
    alter table public.split_expenses
      add constraint split_expenses_pay_source_check
      check (pay_source is null or pay_source in ('bank', 'card'));
  end if;
end
$$;

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
