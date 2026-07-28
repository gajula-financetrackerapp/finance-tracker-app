-- Update an existing split expense (creator only). Preserves finance_txn_id on shares.
-- Run in Supabase SQL editor after split_expense_expenses_fix.sql.

create or replace function public.split_update_expense(
  p_expense_id uuid,
  p_description text,
  p_amount numeric,
  p_paid_by uuid,
  p_split_mode text,
  p_expense_date date,
  p_shares jsonb
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
  old_txn text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into e from public.split_expenses where id = p_expense_id;
  if not found then
    raise exception 'Expense not found';
  end if;
  if e.created_by <> auth.uid() then
    raise exception 'Only the creator can edit this split';
  end if;
  if not public.split_user_is_premium(auth.uid()) then
    raise exception 'Split Expense requires Premium or Plus';
  end if;
  if trim(coalesce(p_description, '')) = '' then
    raise exception 'Enter a description';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter a valid amount';
  end if;
  if p_split_mode not in ('equal', 'custom') then
    raise exception 'Invalid split mode';
  end if;
  if p_paid_by is null then
    raise exception 'Who paid is required';
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
    if uid <> auth.uid() and not exists (
      select 1 from public.split_friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = uid)
          or (f.addressee_id = auth.uid() and f.requester_id = uid)
        )
    ) then
      raise exception 'All participants must be accepted friends';
    end if;
  end loop;

  update public.split_expenses
  set
    description = trim(p_description),
    amount = round(p_amount::numeric, 2),
    paid_by = p_paid_by,
    split_mode = p_split_mode,
    expense_date = coalesce(p_expense_date, expense_date)
  where id = p_expense_id
  returning * into e;

  -- Upsert shares; keep existing finance_txn_id when user stays on the expense
  for share in select * from jsonb_array_elements(p_shares)
  loop
    uid := (share->>'user_id')::uuid;
    amt := round((share->>'share_amount')::numeric, 2);
    select finance_txn_id into old_txn
    from public.split_expense_shares
    where expense_id = p_expense_id and user_id = uid;

    insert into public.split_expense_shares (expense_id, user_id, share_amount, finance_txn_id)
    values (p_expense_id, uid, amt, old_txn)
    on conflict (expense_id, user_id) do update
      set share_amount = excluded.share_amount;
  end loop;

  -- Drop shares for users no longer on the expense
  delete from public.split_expense_shares s
  where s.expense_id = p_expense_id
    and not exists (
      select 1
      from jsonb_array_elements(p_shares) x
      where (x->>'user_id')::uuid = s.user_id
    );

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

revoke all on function public.split_update_expense(uuid, text, numeric, uuid, text, date, jsonb) from public;
grant execute on function public.split_update_expense(uuid, text, numeric, uuid, text, date, jsonb) to authenticated;
