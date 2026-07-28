-- Fix infinite recursion in split_expenses / split_expense_shares RLS
-- Run in Supabase → SQL Editor (safe to re-run)

create or replace function public.split_is_expense_creator(p_expense_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.split_expenses e
    where e.id = p_expense_id and e.created_by = p_user_id
  );
$$;

create or replace function public.split_is_expense_participant(p_expense_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.split_is_expense_creator(p_expense_id, p_user_id)
    or exists (
      select 1 from public.split_expense_shares s
      where s.expense_id = p_expense_id and s.user_id = p_user_id
    );
$$;

revoke all on function public.split_is_expense_creator(uuid, uuid) from public;
revoke all on function public.split_is_expense_participant(uuid, uuid) from public;
grant execute on function public.split_is_expense_creator(uuid, uuid) to authenticated;
grant execute on function public.split_is_expense_participant(uuid, uuid) to authenticated;

drop policy if exists "split_expenses_select" on public.split_expenses;
create policy "split_expenses_select"
  on public.split_expenses for select
  using (public.split_is_expense_participant(id, auth.uid()));

drop policy if exists "split_expenses_insert" on public.split_expenses;
create policy "split_expenses_insert"
  on public.split_expenses for insert
  with check (auth.uid() = created_by);

drop policy if exists "split_expenses_delete" on public.split_expenses;
create policy "split_expenses_delete"
  on public.split_expenses for delete
  using (auth.uid() = created_by);

drop policy if exists "split_shares_select" on public.split_expense_shares;
create policy "split_shares_select"
  on public.split_expense_shares for select
  using (public.split_is_expense_participant(expense_id, auth.uid()));

drop policy if exists "split_shares_insert" on public.split_expense_shares;
create policy "split_shares_insert"
  on public.split_expense_shares for insert
  with check (public.split_is_expense_creator(expense_id, auth.uid()));

drop policy if exists "split_shares_update" on public.split_expense_shares;
create policy "split_shares_update"
  on public.split_expense_shares for update
  using (
    user_id = auth.uid()
    or public.split_is_expense_creator(expense_id, auth.uid())
  );

-- List expenses + shares for current user
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

-- Create expense + shares atomically
create or replace function public.split_create_expense(
  p_description text,
  p_amount numeric,
  p_currency text,
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
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
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

  -- Everyone except self must be accepted friend; paid_by must be a participant
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

  insert into public.split_expenses (
    created_by, description, amount, currency, paid_by, split_mode, expense_date
  ) values (
    auth.uid(),
    trim(p_description),
    round(p_amount::numeric, 2),
    coalesce(nullif(trim(p_currency), ''), 'INR'),
    p_paid_by,
    p_split_mode,
    coalesce(p_expense_date, current_date)
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

revoke all on function public.split_create_expense(text, numeric, text, uuid, text, date, jsonb) from public;
grant execute on function public.split_create_expense(text, numeric, text, uuid, text, date, jsonb) to authenticated;

-- Mark own finance txn id on a share
create or replace function public.split_mark_share_finance_txn(
  p_expense_id uuid,
  p_txn_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  update public.split_expense_shares
  set finance_txn_id = p_txn_id
  where expense_id = p_expense_id
    and user_id = auth.uid();
end;
$$;

revoke all on function public.split_mark_share_finance_txn(uuid, text) from public;
grant execute on function public.split_mark_share_finance_txn(uuid, text) to authenticated;
