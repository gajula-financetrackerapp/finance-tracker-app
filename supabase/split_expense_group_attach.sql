-- Attach a split to a group only when the user picked that group.
-- Friends-only splits stay non-group even if those people already form a group.
-- Group Details settlements are scoped to that group (open settlements show the group name).
-- Run in Supabase SQL editor after prior split_expense_*.sql migrations.

alter table public.split_expenses
  add column if not exists group_id uuid references public.split_groups (id) on delete set null;

create index if not exists split_expenses_group_id_idx
  on public.split_expenses (group_id);

alter table public.split_settlements
  add column if not exists group_id uuid references public.split_groups (id) on delete set null;

create index if not exists split_settlements_group_id_idx
  on public.split_settlements (group_id);

-- One open settlement per pair + currency + group (null group = friends-only).
drop index if exists public.split_settlements_one_open_pair_idx;

create unique index if not exists split_settlements_one_open_pair_group_idx
  on public.split_settlements (
    least(from_user_id, to_user_id),
    greatest(from_user_id, to_user_id),
    currency,
    coalesce(group_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status = 'open';

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
