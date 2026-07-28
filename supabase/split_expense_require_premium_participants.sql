-- Block adding users without active Premium/Plus to new splits.
-- Existing shares on an expense may stay when editing; new participants must be premium.
-- Also returns can_split on friend profiles for the app UI.
-- Run after split_expense_expenses_fix.sql + split_expense_update.sql.

drop function if exists public.split_friend_profiles();

create or replace function public.split_friend_profiles()
returns table (id uuid, email text, full_name text, can_split boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  return query
  select distinct
    p.id,
    p.email,
    p.full_name,
    public.split_user_is_premium(p.id) as can_split
  from public.profiles p
  where p.id = auth.uid()
     or exists (
       select 1 from public.split_friendships f
       where f.status in ('pending', 'accepted')
         and (
           (f.requester_id = auth.uid() and f.addressee_id = p.id)
           or (f.addressee_id = auth.uid() and f.requester_id = p.id)
         )
     )
     or exists (
       select 1 from public.split_expense_shares s1
       join public.split_expense_shares s2 on s1.expense_id = s2.expense_id
       where s1.user_id = auth.uid() and s2.user_id = p.id
     )
     or exists (
       select 1 from public.split_group_members gm1
       join public.split_group_members gm2 on gm1.group_id = gm2.group_id
       where gm1.user_id = auth.uid() and gm2.user_id = p.id
     )
     or exists (
       select 1 from public.split_settlements st
       where (st.from_user_id = auth.uid() and st.to_user_id = p.id)
          or (st.to_user_id = auth.uid() and st.from_user_id = p.id)
     );
end;
$$;

revoke all on function public.split_friend_profiles() from public;
grant execute on function public.split_friend_profiles() to authenticated;

-- Recreate create expense with premium participant check
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
    if not public.split_user_is_premium(uid) then
      raise exception 'Every participant needs active Premium or Plus';
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

-- Update: existing non-premium members can stay; newly added must be premium
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
  was_member boolean;
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

    select exists (
      select 1 from public.split_expense_shares s
      where s.expense_id = p_expense_id and s.user_id = uid
    ) into was_member;

    if not public.split_user_is_premium(uid) and not was_member then
      raise exception 'Every new participant needs active Premium or Plus';
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
