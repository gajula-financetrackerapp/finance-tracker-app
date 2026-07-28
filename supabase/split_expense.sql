-- Split Expense among friends (Premium / Plus)
-- Run in Supabase → SQL Editor after base schema + premium_sync.sql

-- ─── Friendships (email invite) ─────────────────────────────────────────────
create table if not exists public.split_friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint split_friendships_distinct check (requester_id <> addressee_id),
  constraint split_friendships_pair unique (requester_id, addressee_id)
);

create index if not exists split_friendships_addressee_idx
  on public.split_friendships (addressee_id, status);
create index if not exists split_friendships_requester_idx
  on public.split_friendships (requester_id, status);

alter table public.split_friendships enable row level security;

drop policy if exists "split_friendships_select" on public.split_friendships;
create policy "split_friendships_select"
  on public.split_friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "split_friendships_insert" on public.split_friendships;
create policy "split_friendships_insert"
  on public.split_friendships for insert
  with check (auth.uid() = requester_id);

drop policy if exists "split_friendships_update" on public.split_friendships;
create policy "split_friendships_update"
  on public.split_friendships for update
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "split_friendships_delete" on public.split_friendships;
create policy "split_friendships_delete"
  on public.split_friendships for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- ─── Groups ─────────────────────────────────────────────────────────────────
create table if not exists public.split_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.split_group_members (
  group_id uuid not null references public.split_groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (group_id, user_id)
);

create index if not exists split_group_members_user_idx
  on public.split_group_members (user_id);

alter table public.split_groups enable row level security;
alter table public.split_group_members enable row level security;

create or replace function public.split_is_group_owner(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.split_groups g
    where g.id = p_group_id and g.owner_id = p_user_id
  );
$$;

create or replace function public.split_is_group_member(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.split_is_group_owner(p_group_id, p_user_id)
    or exists (
      select 1 from public.split_group_members m
      where m.group_id = p_group_id and m.user_id = p_user_id
    );
$$;

grant execute on function public.split_is_group_owner(uuid, uuid) to authenticated;
grant execute on function public.split_is_group_member(uuid, uuid) to authenticated;

drop policy if exists "split_groups_select" on public.split_groups;
create policy "split_groups_select"
  on public.split_groups for select
  using (public.split_is_group_member(id, auth.uid()));

drop policy if exists "split_groups_insert" on public.split_groups;
create policy "split_groups_insert"
  on public.split_groups for insert
  with check (auth.uid() = owner_id);

drop policy if exists "split_groups_update" on public.split_groups;
create policy "split_groups_update"
  on public.split_groups for update
  using (auth.uid() = owner_id);

drop policy if exists "split_groups_delete" on public.split_groups;
create policy "split_groups_delete"
  on public.split_groups for delete
  using (auth.uid() = owner_id);

drop policy if exists "split_group_members_select" on public.split_group_members;
create policy "split_group_members_select"
  on public.split_group_members for select
  using (public.split_is_group_member(group_id, auth.uid()));

drop policy if exists "split_group_members_write" on public.split_group_members;
drop policy if exists "split_group_members_insert" on public.split_group_members;
drop policy if exists "split_group_members_update" on public.split_group_members;
drop policy if exists "split_group_members_delete" on public.split_group_members;
create policy "split_group_members_insert"
  on public.split_group_members for insert
  with check (public.split_is_group_owner(group_id, auth.uid()));
create policy "split_group_members_update"
  on public.split_group_members for update
  using (public.split_is_group_owner(group_id, auth.uid()));
create policy "split_group_members_delete"
  on public.split_group_members for delete
  using (public.split_is_group_owner(group_id, auth.uid()));

-- ─── Expenses ───────────────────────────────────────────────────────────────
create table if not exists public.split_expenses (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  description text not null,
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null default 'INR',
  paid_by uuid not null references auth.users (id) on delete cascade,
  split_mode text not null check (split_mode in ('equal', 'custom')),
  expense_date date not null default (current_date),
  created_at timestamptz not null default now()
);

create table if not exists public.split_expense_shares (
  expense_id uuid not null references public.split_expenses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  share_amount numeric(14, 2) not null check (share_amount >= 0),
  finance_txn_id text,
  primary key (expense_id, user_id)
);

create index if not exists split_expense_shares_user_idx
  on public.split_expense_shares (user_id);

alter table public.split_expenses enable row level security;
alter table public.split_expense_shares enable row level security;

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

-- ─── Settlements ────────────────────────────────────────────────────────────
create table if not exists public.split_settlements (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references auth.users (id) on delete cascade,
  to_user_id uuid not null references auth.users (id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null default 'INR',
  debtor_confirmed boolean not null default false,
  creditor_confirmed boolean not null default false,
  status text not null default 'open'
    check (status in ('open', 'completed', 'cancelled')),
  created_by uuid not null references auth.users (id) on delete cascade,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint split_settlements_distinct check (from_user_id <> to_user_id)
);

create index if not exists split_settlements_from_idx
  on public.split_settlements (from_user_id, status);
create index if not exists split_settlements_to_idx
  on public.split_settlements (to_user_id, status);

alter table public.split_settlements enable row level security;

drop policy if exists "split_settlements_select" on public.split_settlements;
create policy "split_settlements_select"
  on public.split_settlements for select
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

drop policy if exists "split_settlements_insert" on public.split_settlements;
create policy "split_settlements_insert"
  on public.split_settlements for insert
  with check (
    auth.uid() = created_by
    and (auth.uid() = from_user_id or auth.uid() = to_user_id)
  );

drop policy if exists "split_settlements_update" on public.split_settlements;
create policy "split_settlements_update"
  on public.split_settlements for update
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

-- ─── Helpers ────────────────────────────────────────────────────────────────
create or replace function public.split_user_is_premium(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select
        p.is_premium = true
        and (p.premium_until is null or p.premium_until > now())
      from public.profiles p
      where p.id = uid
    ),
    false
  );
$$;

-- Lookup Premium/Plus user by email for invite (limited fields)
create or replace function public.split_lookup_invitee(p_email text)
returns table (id uuid, email text, full_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned text := lower(trim(coalesce(p_email, '')));
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.split_user_is_premium(auth.uid()) then
    raise exception 'Split Expense requires Premium or Plus';
  end if;
  if cleaned = '' or position('@' in cleaned) = 0 then
    return;
  end if;

  return query
  select p.id, p.email, p.full_name
  from public.profiles p
  where lower(trim(p.email)) = cleaned
    and public.split_user_is_premium(p.id)
  limit 1;
end;
$$;

revoke all on function public.split_lookup_invitee(text) from public;
grant execute on function public.split_lookup_invitee(text) to authenticated;

-- Friend profile snippet for accepted friends / shared expenses
create or replace function public.split_friend_profiles()
returns table (id uuid, email text, full_name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  return query
  select distinct p.id, p.email, p.full_name
  from public.profiles p
  where p.id = auth.uid()
     or exists (
       select 1 from public.split_friendships f
       where f.status = 'accepted'
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

-- Invite by email (creates pending friendship)
create or replace function public.split_invite_friend(p_email text)
returns public.split_friendships
language plpgsql
security definer
set search_path = public
as $$
declare
  target record;
  row public.split_friendships;
  reverse public.split_friendships;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.split_user_is_premium(auth.uid()) then
    raise exception 'Split Expense requires Premium or Plus';
  end if;

  select * into target from public.split_lookup_invitee(p_email);
  if target.id is null then
    raise exception 'No Premium/Plus account found for that email';
  end if;
  if target.id = auth.uid() then
    raise exception 'You cannot invite yourself';
  end if;

  select * into reverse
  from public.split_friendships
  where requester_id = target.id and addressee_id = auth.uid();

  if reverse.id is not null then
    if reverse.status = 'accepted' then
      return reverse;
    end if;
    update public.split_friendships
    set status = 'accepted', updated_at = now()
    where id = reverse.id
    returning * into row;
    return row;
  end if;

  insert into public.split_friendships (requester_id, addressee_id, status)
  values (auth.uid(), target.id, 'pending')
  on conflict (requester_id, addressee_id) do update
    set updated_at = now()
  returning * into row;

  return row;
end;
$$;

revoke all on function public.split_invite_friend(text) from public;
grant execute on function public.split_invite_friend(text) to authenticated;

-- List friendships for both parties (pending + accepted)
create or replace function public.split_list_friendships()
returns setof public.split_friendships
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  return query
  select f.*
  from public.split_friendships f
  where f.requester_id = auth.uid()
     or f.addressee_id = auth.uid()
  order by f.created_at desc;
end;
$$;

revoke all on function public.split_list_friendships() from public;
grant execute on function public.split_list_friendships() to authenticated;

-- Table grants (required in addition to RLS)
grant select, insert, update, delete on public.split_friendships to authenticated;
grant select, insert, update, delete on public.split_groups to authenticated;
grant select, insert, update, delete on public.split_group_members to authenticated;
grant select, insert, update, delete on public.split_expenses to authenticated;
grant select, insert, update, delete on public.split_expense_shares to authenticated;
grant select, insert, update, delete on public.split_settlements to authenticated;
