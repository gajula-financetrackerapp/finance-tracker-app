-- Any group member can edit the group (delete stays owner-only).
-- People in a shared group can be on a split even if they are not pairwise friends.
-- Run in Supabase → SQL Editor (safe to re-run).

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

create or replace function public.split_update_group(
  p_group_id uuid,
  p_name text,
  p_member_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.split_groups;
  mid uuid;
  members uuid[];
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into g from public.split_groups where id = p_group_id;
  if not found then
    raise exception 'Group not found';
  end if;
  if not public.split_is_group_member(p_group_id, auth.uid()) then
    raise exception 'Only group members can edit';
  end if;
  if trim(coalesce(p_name, '')) = '' then
    raise exception 'Enter a group name';
  end if;

  update public.split_groups
  set name = trim(p_name)
  where id = p_group_id
  returning * into g;

  members := array(
    select distinct x
    from unnest(
      array_append(
        array_append(coalesce(p_member_ids, '{}'::uuid[]), auth.uid()),
        g.owner_id
      )
    ) as x
    where x is not null
  );

  foreach mid in array members loop
    if mid <> auth.uid() and not public.split_can_split_with(mid) then
      raise exception 'All members must be accepted friends or already in a group with you';
    end if;

    insert into public.split_group_members (group_id, user_id)
    values (p_group_id, mid)
    on conflict do nothing;
  end loop;

  delete from public.split_group_members m
  where m.group_id = p_group_id
    and not (m.user_id = any (members));

  return jsonb_build_object(
    'id', g.id,
    'owner_id', g.owner_id,
    'name', g.name,
    'created_at', g.created_at,
    'member_ids', members
  );
end;
$$;

revoke all on function public.split_update_group(uuid, text, uuid[]) from public;
grant execute on function public.split_update_group(uuid, text, uuid[]) to authenticated;

-- Allow group-mates on new / edited splits (same signatures as split_expense_free_quota.sql).
create or replace function public.split_create_expense(
  p_description text,
  p_amount numeric,
  p_currency text,
  p_paid_by uuid,
  p_split_mode text,
  p_expense_date date,
  p_shares jsonb,
  p_finance_category text default null
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
    if uid <> auth.uid() and not public.split_can_split_with(uid) then
      raise exception 'All participants must be accepted friends or in a group with you';
    end if;
  end loop;

  if to_regprocedure('public.split_consume_create_quota()') is not null then
    perform public.split_consume_create_quota();
  end if;

  insert into public.split_expenses (
    created_by, description, amount, currency, paid_by, split_mode, expense_date, finance_category
  ) values (
    auth.uid(),
    trim(p_description),
    round(p_amount::numeric, 2),
    coalesce(nullif(trim(p_currency), ''), 'INR'),
    p_paid_by,
    p_split_mode,
    coalesce(p_expense_date, current_date),
    cat
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

revoke all on function public.split_create_expense(text, numeric, text, uuid, text, date, jsonb, text) from public;
grant execute on function public.split_create_expense(text, numeric, text, uuid, text, date, jsonb, text) to authenticated;

create or replace function public.split_update_expense(
  p_expense_id uuid,
  p_description text,
  p_amount numeric,
  p_paid_by uuid,
  p_split_mode text,
  p_expense_date date,
  p_shares jsonb,
  p_finance_category text default null
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
  cat text := nullif(trim(coalesce(p_finance_category, '')), '');
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
    if uid <> auth.uid() and not public.split_can_split_with(uid) then
      raise exception 'All participants must be accepted friends or in a group with you';
    end if;
  end loop;

  update public.split_expenses
  set
    description = trim(p_description),
    amount = round(p_amount::numeric, 2),
    paid_by = p_paid_by,
    split_mode = p_split_mode,
    expense_date = coalesce(p_expense_date, expense_date),
    finance_category = cat
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
      'finance_category', e.finance_category,
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

revoke all on function public.split_update_expense(uuid, text, numeric, uuid, text, date, jsonb, text) from public;
grant execute on function public.split_update_expense(uuid, text, numeric, uuid, text, date, jsonb, text) to authenticated;

notify pgrst, 'reload schema';
