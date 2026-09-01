import { supabase, isSupabaseConfigured } from './supabase';
import type {
  SplitBalanceRow,
  SplitExpense,
  SplitExpenseShare,
  SplitFriendship,
  SplitGroup,
  SplitMode,
  SplitPaySource,
  SplitProfile,
  SplitSettlement,
} from './splitTypes';
import { normalizeSplitMode } from './splitTypes';

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function rpcMissing(message?: string | null): boolean {
  const m = message || '';
  return /could not find the function|PGRST202|schema cache/i.test(m);
}

export function isSplitNeedDiamondsError(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err || '');
  return /SPLIT_NEED_DIAMONDS/i.test(m);
}

/** Normalize Postgres date / ISO string to YYYY-MM-DD. */
export function normalizeSplitDate(raw: string | null | undefined, fallback?: string): string {
  const s = String(raw || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return fallback || new Date().toISOString().slice(0, 10);
}

export function normalizeSplitPaySource(
  raw: string | null | undefined,
): SplitPaySource {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'card' || s === 'credit' || s === 'credit card' || s === 'creditcard') {
    return 'card';
  }
  return 'bank';
}

function mapExpenseRow(e: {
  id: string;
  created_by: string;
  description: string;
  amount: number;
  currency: string;
  paid_by: string;
  split_mode: SplitMode;
  expense_date: string;
  created_at: string;
  finance_category?: string | null;
  pay_source?: string | null;
  shares?: SplitExpenseShare[];
}): SplitExpense {
  const cat = String(e.finance_category || '').trim();
  return {
    id: String(e.id),
    created_by: String(e.created_by),
    description: e.description,
    amount: Number(e.amount),
    currency: e.currency,
    paid_by: String(e.paid_by),
    split_mode: e.split_mode,
    expense_date: normalizeSplitDate(e.expense_date),
    created_at: e.created_at,
    finance_category: cat || null,
    pay_source:
      e.pay_source == null || String(e.pay_source).trim() === ''
        ? null
        : normalizeSplitPaySource(e.pay_source),
    shares: (e.shares || []).map((s) => ({
      expense_id: String(s.expense_id),
      user_id: String(s.user_id),
      share_amount: Number(s.share_amount),
      finance_txn_id: s.finance_txn_id || null,
    })),
  };
}

async function persistSplitPaySource(expenseId: string, paySource: SplitPaySource): Promise<void> {
  const { error } = await supabase
    .from('split_expenses')
    .update({ pay_source: paySource })
    .eq('id', expenseId);
  if (error) {
    console.warn('[split] pay_source save failed', error.message);
  }
}

async function fillMissingPaySources(list: SplitExpense[]): Promise<SplitExpense[]> {
  const ids = list.filter((e) => !e.pay_source).map((e) => e.id);
  if (!ids.length) return list;
  const { data, error } = await supabase
    .from('split_expenses')
    .select('id, pay_source')
    .in('id', ids);
  if (error || !data) return list;
  const byId = new Map(
    (data as { id: string; pay_source?: string | null }[]).map((r) => [
      String(r.id),
      normalizeSplitPaySource(r.pay_source),
    ]),
  );
  return list.map((e) => ({
    ...e,
    pay_source: e.pay_source || byId.get(e.id) || 'bank',
  }));
}

/** Prefer stored finance_category; else match description to a known expense category. */
export function resolveSplitFinanceCategory(
  exp: Pick<SplitExpense, 'finance_category' | 'description'>,
  expenseCategoryNames: string[],
): string {
  const stored = String(exp.finance_category || '').trim();
  if (stored) return stored;
  const desc = String(exp.description || '').trim();
  if (desc && expenseCategoryNames.includes(desc)) return desc;
  return 'Others';
}

export function displaySplitName(
  profile: SplitProfile | undefined,
  userId: string,
  selfId: string | null,
): string {
  if (selfId && userId === selfId) return 'You';
  const name = (profile?.full_name || '').trim();
  if (name) return name;
  const email = (profile?.email || '').trim();
  if (email) return email.split('@')[0] || email;
  return userId.slice(0, 8);
}

export async function fetchSplitProfiles(): Promise<SplitProfile[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.rpc('split_friend_profiles');
  if (error) throw new Error(error.message);
  return ((data || []) as SplitProfile[]).map((p) => ({
    id: String(p.id),
    email: p.email || null,
    full_name: p.full_name || null,
    can_split: (p as SplitProfile & { can_split?: boolean }).can_split !== false,
  }));
}

export async function inviteSplitFriend(email: string): Promise<SplitFriendship> {
  if (!isSupabaseConfigured) throw new Error('Cloud is not configured');
  const { data, error } = await supabase.rpc('split_invite_friend', {
    p_email: email.trim(),
  });
  if (error) throw new Error(error.message);
  return data as SplitFriendship;
}

export async function respondSplitInvite(
  friendshipId: string,
  accept: boolean,
): Promise<void> {
  if (!isSupabaseConfigured) throw new Error('Cloud is not configured');
  const { error } = await supabase
    .from('split_friendships')
    .update({
      status: accept ? 'accepted' : 'declined',
      updated_at: new Date().toISOString(),
    })
    .eq('id', friendshipId);
  if (error) throw new Error(error.message);
}

export async function removeSplitFriend(friendUserId: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error('Cloud is not configured');
  const { error } = await supabase.rpc('split_remove_friend', {
    p_friend_user_id: friendUserId,
  });
  if (error) {
    // Fallback: delete both directions if RPC not applied yet
    const { data: sessionData } = await supabase.auth.getSession();
    const selfId = sessionData.session?.user?.id;
    if (!selfId) throw new Error(error.message);
    const { error: delErr } = await supabase
      .from('split_friendships')
      .delete()
      .or(
        `and(requester_id.eq.${selfId},addressee_id.eq.${friendUserId}),and(requester_id.eq.${friendUserId},addressee_id.eq.${selfId})`,
      );
    if (delErr) throw new Error(error.message || delErr.message);
  }
}

export async function cancelSplitInvite(friendshipId: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error('Cloud is not configured');
  const { error } = await supabase.rpc('split_cancel_invite', {
    p_friendship_id: friendshipId,
  });
  if (error) {
    const { error: delErr } = await supabase
      .from('split_friendships')
      .delete()
      .eq('id', friendshipId);
    if (delErr) throw new Error(error.message || delErr.message);
  }
}

export async function fetchSplitFriendships(): Promise<SplitFriendship[]> {
  if (!isSupabaseConfigured) return [];
  // Prefer RPC so both parties always see pending/accepted rows (avoids GRANT/RLS gaps).
  const { data: rpcData, error: rpcError } = await supabase.rpc('split_list_friendships');
  if (!rpcError && rpcData) {
    return (rpcData as SplitFriendship[]).map((f) => ({
      ...f,
      id: String(f.id),
      requester_id: String(f.requester_id),
      addressee_id: String(f.addressee_id),
      status: f.status,
    }));
  }
  const { data, error } = await supabase
    .from('split_friendships')
    .select('id, requester_id, addressee_id, status, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(rpcError?.message || error.message);
  return ((data || []) as SplitFriendship[]).map((f) => ({
    ...f,
    id: String(f.id),
    requester_id: String(f.requester_id),
    addressee_id: String(f.addressee_id),
  }));
}

export async function fetchSplitGroups(userId: string): Promise<SplitGroup[]> {
  if (!isSupabaseConfigured) return [];
  const { data: rpcData, error: rpcError } = await supabase.rpc('split_list_groups');
  if (!rpcError && rpcData) {
    return ((rpcData || []) as {
      id: string;
      owner_id: string;
      name: string;
      created_at: string;
      member_ids: string[] | null;
    }[]).map((g) => {
      const member_ids = [...new Set((g.member_ids || []).map(String))];
      if (!member_ids.includes(String(g.owner_id))) member_ids.unshift(String(g.owner_id));
      return {
        id: String(g.id),
        owner_id: String(g.owner_id),
        name: g.name,
        created_at: g.created_at,
        member_ids,
      };
    });
  }

  const { data: groups, error } = await supabase
    .from('split_groups')
    .select('id, owner_id, name, created_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(rpcError?.message || error.message);
  const list = (groups || []) as Omit<SplitGroup, 'member_ids'>[];
  if (!list.length) return [];

  const ids = list.map((g) => g.id);
  const { data: members, error: memErr } = await supabase
    .from('split_group_members')
    .select('group_id, user_id')
    .in('group_id', ids);
  if (memErr) throw new Error(memErr.message);

  const byGroup = new Map<string, string[]>();
  for (const m of members || []) {
    const gid = String((m as { group_id: string }).group_id);
    const uid = String((m as { user_id: string }).user_id);
    const arr = byGroup.get(gid) || [];
    arr.push(uid);
    byGroup.set(gid, arr);
  }

  return list.map((g) => {
    const member_ids = byGroup.get(g.id) || [];
    if (!member_ids.includes(g.owner_id)) member_ids.unshift(g.owner_id);
    void userId;
    return { ...g, member_ids: [...new Set(member_ids)] };
  });
}

export async function createSplitGroup(input: {
  name: string;
  memberIds: string[];
  ownerId: string;
}): Promise<SplitGroup> {
  if (!isSupabaseConfigured) throw new Error('Cloud is not configured');
  const name = input.name.trim();
  if (!name) throw new Error('Enter a group name');

  const { data: rpcGroup, error: rpcError } = await supabase.rpc('split_create_group', {
    p_name: name,
    p_member_ids: input.memberIds,
  });
  if (!rpcError && rpcGroup) {
    const g = rpcGroup as { id: string; owner_id: string; name: string; created_at: string };
    const memberIds = [...new Set([input.ownerId, ...input.memberIds])];
    return {
      id: String(g.id),
      owner_id: String(g.owner_id),
      name: g.name,
      created_at: g.created_at,
      member_ids: memberIds,
    };
  }

  // Fallback (older DBs without RPC) — may still hit RLS if policies not fixed
  const { data: group, error } = await supabase
    .from('split_groups')
    .insert({ owner_id: input.ownerId, name })
    .select('id, owner_id, name, created_at')
    .single();
  if (error) throw new Error(rpcError?.message || error.message);

  const memberIds = [...new Set([input.ownerId, ...input.memberIds])];
  const rows = memberIds.map((user_id) => ({ group_id: group.id, user_id }));
  const { error: memErr } = await supabase.from('split_group_members').insert(rows);
  if (memErr) {
    await supabase.from('split_groups').delete().eq('id', group.id);
    throw new Error(memErr.message);
  }

  return { ...(group as Omit<SplitGroup, 'member_ids'>), member_ids: memberIds };
}

export async function updateSplitGroup(input: {
  groupId: string;
  name: string;
  memberIds: string[];
  ownerId: string;
}): Promise<SplitGroup> {
  if (!isSupabaseConfigured) throw new Error('Cloud is not configured');
  const name = input.name.trim();
  if (!name) throw new Error('Enter a group name');

  const memberIds = [...new Set([input.ownerId, ...input.memberIds])];
  const { data: rpcGroup, error: rpcError } = await supabase.rpc('split_update_group', {
    p_group_id: input.groupId,
    p_name: name,
    p_member_ids: input.memberIds,
  });
  if (!rpcError && rpcGroup) {
    const g = rpcGroup as {
      id: string;
      owner_id: string;
      name: string;
      created_at: string;
      member_ids?: string[];
    };
    return {
      id: String(g.id),
      owner_id: String(g.owner_id),
      name: g.name,
      created_at: g.created_at,
      member_ids: (g.member_ids || memberIds).map(String),
    };
  }

  throw new Error(
    rpcError?.message ||
      'Could not update group. Run split_expense_group_edit.sql in Supabase.',
  );
}

export async function deleteSplitGroup(groupId: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error('Cloud is not configured');
  const { error: rpcError } = await supabase.rpc('split_delete_group', {
    p_group_id: groupId,
  });
  if (!rpcError) return;

  const { error } = await supabase.from('split_groups').delete().eq('id', groupId);
  if (error) {
    throw new Error(
      rpcError.message ||
        error.message ||
        'Could not delete group. Run split_expense_group_edit.sql in Supabase.',
    );
  }
}

export async function fetchSplitExpenses(): Promise<SplitExpense[]> {
  if (!isSupabaseConfigured) return [];
  const { data: rpcData, error: rpcError } = await supabase.rpc('split_list_expenses');
  if (!rpcError && rpcData) {
    const list = (Array.isArray(rpcData) ? rpcData : []) as Array<{
      id: string;
      created_by: string;
      description: string;
      amount: number;
      currency: string;
      paid_by: string;
      split_mode: SplitMode;
      expense_date: string;
      created_at: string;
      finance_category?: string | null;
      pay_source?: string | null;
      shares?: SplitExpenseShare[];
    }>;
    return fillMissingPaySources(list.map((e) => mapExpenseRow(e)));
  }

  const { data: expenses, error } = await supabase
    .from('split_expenses')
    .select(
      'id, created_by, description, amount, currency, paid_by, split_mode, expense_date, created_at, finance_category',
    )
    .order('created_at', { ascending: false });
  if (error) throw new Error(rpcError?.message || error.message);
  const list = (expenses || []) as Omit<SplitExpense, 'shares'>[];
  if (!list.length) return [];

  const ids = list.map((e) => e.id);
  const { data: shares, error: shareErr } = await supabase
    .from('split_expense_shares')
    .select('expense_id, user_id, share_amount, finance_txn_id')
    .in('expense_id', ids);
  if (shareErr) throw new Error(shareErr.message);

  const byExp = new Map<string, SplitExpenseShare[]>();
  for (const s of (shares || []) as SplitExpenseShare[]) {
    const arr = byExp.get(s.expense_id) || [];
    arr.push({
      ...s,
      share_amount: Number(s.share_amount),
    });
    byExp.set(s.expense_id, arr);
  }

  return fillMissingPaySources(
    list.map((e) =>
      mapExpenseRow({
        ...e,
        expense_date: normalizeSplitDate(e.expense_date),
        shares: byExp.get(e.id) || [],
      }),
    ),
  );
}

export async function createSplitExpense(input: {
  createdBy: string;
  description: string;
  amount: number;
  currency: string;
  paidBy: string;
  splitMode: SplitMode;
  expenseDate: string;
  shares: { userId: string; shareAmount: number }[];
  financeCategory?: string | null;
  paySource?: SplitPaySource | null;
}): Promise<SplitExpense> {
  if (!isSupabaseConfigured) throw new Error('Cloud is not configured');
  const description = input.description.trim();
  const amount = roundMoney(input.amount);
  const financeCategory = String(input.financeCategory || '').trim() || null;
  const paySource = normalizeSplitPaySource(input.paySource);
  if (!description) throw new Error('Enter a description');
  if (!(amount > 0)) throw new Error('Enter a valid amount');

  const shares = input.shares.map((s) => ({
    userId: s.userId,
    shareAmount: roundMoney(s.shareAmount),
  }));
  if (shares.length < 2) throw new Error('Pick at least one friend (You + someone)');
  const sum = roundMoney(shares.reduce((a, s) => a + s.shareAmount, 0));
  if (Math.abs(sum - amount) > 0.02) {
    throw new Error(`Shares (${sum}) must equal the bill (${amount})`);
  }

  const sharePayload = shares.map((s) => ({
    user_id: s.userId,
    share_amount: s.shareAmount,
  }));

  const tryRpc = async (withCategory: boolean) => {
    const args: Record<string, unknown> = {
      p_description: description,
      p_amount: amount,
      p_currency: input.currency,
      p_paid_by: input.paidBy,
      p_split_mode: input.splitMode,
      p_expense_date: input.expenseDate,
      p_shares: sharePayload,
    };
    if (withCategory) args.p_finance_category = financeCategory;
    return supabase.rpc('split_create_expense', args);
  };

  let rpcExpense: unknown = null;
  let rpcError: { message: string } | null = null;
  {
    const first = await tryRpc(true);
    if (!first.error && first.data) {
      rpcExpense = first.data;
    } else if (first.error && !rpcMissing(first.error.message)) {
      throw new Error(first.error.message);
    } else {
      const second = await tryRpc(false);
      rpcError = second.error;
      if (!second.error && second.data) rpcExpense = second.data;
      else if (second.error && !rpcMissing(second.error.message)) {
        throw new Error(second.error.message);
      }
    }
  }
  if (rpcExpense) {
    const mapped = mapExpenseRow(rpcExpense as SplitExpense & { shares?: SplitExpenseShare[] });
    if (financeCategory && !mapped.finance_category) {
      await supabase
        .from('split_expenses')
        .update({ finance_category: financeCategory })
        .eq('id', mapped.id);
      mapped.finance_category = financeCategory;
    }
    await persistSplitPaySource(mapped.id, paySource);
    return { ...mapped, pay_source: paySource };
  }

  const { data: expense, error } = await supabase
    .from('split_expenses')
    .insert({
      created_by: input.createdBy,
      description,
      amount,
      currency: input.currency,
      paid_by: input.paidBy,
      split_mode: input.splitMode,
      expense_date: input.expenseDate,
      ...(financeCategory ? { finance_category: financeCategory } : {}),
    })
    .select(
      'id, created_by, description, amount, currency, paid_by, split_mode, expense_date, created_at, finance_category',
    )
    .single();
  if (error) throw new Error(rpcError?.message || error.message);

  const shareRows = shares.map((s) => ({
    expense_id: expense.id,
    user_id: s.userId,
    share_amount: s.shareAmount,
    finance_txn_id: null as string | null,
  }));
  const { error: shareErr } = await supabase.from('split_expense_shares').insert(shareRows);
  if (shareErr) {
    await supabase.from('split_expenses').delete().eq('id', expense.id);
    throw new Error(shareErr.message);
  }

  const mapped = mapExpenseRow({
    ...(expense as Omit<SplitExpense, 'shares'>),
    amount: Number(expense.amount),
    expense_date: normalizeSplitDate(
      (expense as { expense_date?: string }).expense_date,
      input.expenseDate,
    ),
    shares: shareRows.map((r) => ({
      expense_id: r.expense_id,
      user_id: r.user_id,
      share_amount: r.share_amount,
      finance_txn_id: null,
    })),
  });
  await persistSplitPaySource(mapped.id, paySource);
  return { ...mapped, pay_source: paySource };
}

export async function updateSplitExpense(input: {
  expenseId: string;
  description: string;
  amount: number;
  paidBy: string;
  splitMode: SplitMode;
  expenseDate: string;
  shares: { userId: string; shareAmount: number }[];
  financeCategory?: string | null;
  paySource?: SplitPaySource | null;
}): Promise<SplitExpense> {
  if (!isSupabaseConfigured) throw new Error('Cloud is not configured');
  const description = input.description.trim();
  const amount = roundMoney(input.amount);
  const financeCategory =
    input.financeCategory === undefined
      ? undefined
      : String(input.financeCategory || '').trim() || null;
  if (!description) throw new Error('Enter a description');
  if (!(amount > 0)) throw new Error('Enter a valid amount');

  const shares = input.shares.map((s) => ({
    userId: s.userId,
    shareAmount: roundMoney(s.shareAmount),
  }));
  if (shares.length < 2) throw new Error('Pick at least one friend (You + someone)');
  const sum = roundMoney(shares.reduce((a, s) => a + s.shareAmount, 0));
  if (Math.abs(sum - amount) > 0.02) {
    throw new Error(`Shares (${sum}) must equal the bill (${amount})`);
  }

  const expenseDate = normalizeSplitDate(input.expenseDate);
  const sharePayload = shares.map((s) => ({
    user_id: s.userId,
    share_amount: s.shareAmount,
  }));

  const tryRpc = async (withCategory: boolean) => {
    const args: Record<string, unknown> = {
      p_expense_id: input.expenseId,
      p_description: description,
      p_amount: amount,
      p_paid_by: input.paidBy,
      p_split_mode: input.splitMode,
      p_expense_date: expenseDate,
      p_shares: sharePayload,
    };
    if (withCategory && financeCategory !== undefined) {
      args.p_finance_category = financeCategory;
    }
    return supabase.rpc('split_update_expense', args);
  };

  let rpcExpense: unknown = null;
  let rpcError: { message: string } | null = null;
  if (financeCategory !== undefined) {
    const first = await tryRpc(true);
    if (!first.error && first.data) rpcExpense = first.data;
    else {
      const second = await tryRpc(false);
      rpcError = second.error;
      if (!second.error && second.data) rpcExpense = second.data;
    }
  } else {
    const res = await tryRpc(false);
    rpcError = res.error;
    if (!res.error && res.data) rpcExpense = res.data;
  }

  if (rpcExpense) {
    const mapped = mapExpenseRow(rpcExpense as SplitExpense & { shares?: SplitExpenseShare[] });
    if (financeCategory !== undefined && mapped.finance_category !== financeCategory) {
      await supabase
        .from('split_expenses')
        .update({ finance_category: financeCategory })
        .eq('id', mapped.id);
      mapped.finance_category = financeCategory;
    }
    if (input.paySource !== undefined) {
      const paySource = normalizeSplitPaySource(input.paySource);
      await persistSplitPaySource(mapped.id, paySource);
      return { ...mapped, pay_source: paySource };
    }
    return mapped;
  }

  throw new Error(
    rpcError?.message ||
      'Could not update split. Run split_expense_finance_category.sql in Supabase.',
  );
}

export async function markShareFinanceTxn(
  expenseId: string,
  userId: string,
  txnId: string,
): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error: rpcError } = await supabase.rpc('split_mark_share_finance_txn', {
    p_expense_id: expenseId,
    p_txn_id: txnId,
  });
  if (!rpcError) return;

  const { error } = await supabase
    .from('split_expense_shares')
    .update({ finance_txn_id: txnId })
    .eq('expense_id', expenseId)
    .eq('user_id', userId);
  if (error) throw new Error(rpcError.message || error.message);
}

export async function fetchSplitSettlements(): Promise<SplitSettlement[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('split_settlements')
    .select(
      'id, from_user_id, to_user_id, amount, currency, debtor_confirmed, creditor_confirmed, status, created_by, completed_at, created_at',
    )
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data || []) as SplitSettlement[]).map((s) => ({
    ...s,
    amount: Number(s.amount),
  }));
}

export async function createSplitSettlement(input: {
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency: string;
  createdBy: string;
}): Promise<SplitSettlement> {
  if (!isSupabaseConfigured) throw new Error('Cloud is not configured');
  const amount = roundMoney(input.amount);
  if (!(amount > 0)) throw new Error('Enter a valid amount');

  const { data: existingOpen, error: existErr } = await supabase
    .from('split_settlements')
    .select('id')
    .eq('status', 'open')
    .or(
      `and(from_user_id.eq.${input.fromUserId},to_user_id.eq.${input.toUserId}),and(from_user_id.eq.${input.toUserId},to_user_id.eq.${input.fromUserId})`,
    )
    .limit(1);
  if (existErr) throw new Error(existErr.message);
  if (existingOpen && existingOpen.length > 0) {
    throw new Error('A settlement with this friend is already pending');
  }

  const { data, error } = await supabase
    .from('split_settlements')
    .insert({
      from_user_id: input.fromUserId,
      to_user_id: input.toUserId,
      amount,
      currency: input.currency,
      created_by: input.createdBy,
      debtor_confirmed: false,
      creditor_confirmed: false,
      status: 'open',
    })
    .select(
      'id, from_user_id, to_user_id, amount, currency, debtor_confirmed, creditor_confirmed, status, created_by, completed_at, created_at',
    )
    .single();
  if (error) throw new Error(error.message);
  return { ...(data as SplitSettlement), amount: Number(data.amount) };
}

export async function confirmSplitSettlement(
  settlementId: string,
  role: 'debtor' | 'creditor',
): Promise<SplitSettlement> {
  if (!isSupabaseConfigured) throw new Error('Cloud is not configured');
  const patch =
    role === 'debtor'
      ? { debtor_confirmed: true }
      : { creditor_confirmed: true };

  const { data: current, error: readErr } = await supabase
    .from('split_settlements')
    .select(
      'id, from_user_id, to_user_id, amount, currency, debtor_confirmed, creditor_confirmed, status, created_by, completed_at, created_at',
    )
    .eq('id', settlementId)
    .single();
  if (readErr) throw new Error(readErr.message);
  if (current.status !== 'open') {
    throw new Error('This settlement is no longer open');
  }

  const nextDebtor = role === 'debtor' ? true : !!current.debtor_confirmed;
  const nextCreditor = role === 'creditor' ? true : !!current.creditor_confirmed;
  const both = nextDebtor && nextCreditor;

  const { data, error } = await supabase
    .from('split_settlements')
    .update({
      ...patch,
      status: both ? 'completed' : 'open',
      completed_at: both ? new Date().toISOString() : null,
    })
    .eq('id', settlementId)
    .eq('status', 'open')
    .select(
      'id, from_user_id, to_user_id, amount, currency, debtor_confirmed, creditor_confirmed, status, created_by, completed_at, created_at',
    )
    .single();
  if (error) throw new Error(error.message);
  return { ...(data as SplitSettlement), amount: Number(data.amount) };
}

export async function cancelSplitSettlement(settlementId: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error('Cloud is not configured');
  const { data, error } = await supabase
    .from('split_settlements')
    .update({ status: 'cancelled' })
    .eq('id', settlementId)
    .eq('status', 'open')
    .select('id')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Settlement is no longer open');
}

/**
 * Net balances from expenses − completed settlements.
 * Open (pending) settlements do not hide balances — the UI disables Mark paid instead.
 * Positive = they owe you; negative = you owe them.
 */
export function computeSplitBalances(
  selfId: string,
  expenses: SplitExpense[],
  settlements: SplitSettlement[],
  currency: string,
): SplitBalanceRow[] {
  const map = new Map<string, number>();

  const add = (uid: string, delta: number) => {
    if (uid === selfId) return;
    map.set(uid, roundMoney((map.get(uid) || 0) + delta));
  };

  for (const exp of expenses) {
    if (exp.currency !== currency) continue;
    const payer = exp.paid_by;
    for (const share of exp.shares) {
      if (share.user_id === payer) continue;
      // share.user_id owes payer share_amount
      if (payer === selfId) {
        add(share.user_id, share.share_amount);
      } else if (share.user_id === selfId) {
        add(payer, -share.share_amount);
      }
    }
  }

  for (const s of settlements) {
    if (s.status !== 'completed' || s.currency !== currency) continue;
    // from pays to → reduces from's debt to `to`
    if (s.to_user_id === selfId) {
      add(s.from_user_id, -s.amount);
    } else if (s.from_user_id === selfId) {
      add(s.to_user_id, s.amount);
    }
  }

  return [...map.entries()]
    .map(([userId, amount]) => ({ userId, amount, currency }))
    .filter((r) => Math.abs(r.amount) >= 0.01)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

/** Open settlement between self and other, if any. */
export function findOpenSettlementWith(
  selfId: string,
  otherUserId: string,
  settlements: SplitSettlement[],
): SplitSettlement | undefined {
  return settlements.find(
    (s) =>
      s.status === 'open' &&
      ((s.from_user_id === selfId && s.to_user_id === otherUserId) ||
        (s.from_user_id === otherUserId && s.to_user_id === selfId)),
  );
}

export function buildEqualShares(
  total: number,
  userIds: string[],
): { userId: string; shareAmount: number }[] {
  const n = userIds.length;
  if (n === 0) return [];
  const base = Math.floor((total * 100) / n) / 100;
  const shares = userIds.map((userId) => ({ userId, shareAmount: base }));
  const sum = roundMoney(shares.reduce((a, s) => a + s.shareAmount, 0));
  const diff = roundMoney(total - sum);
  if (shares[0]) shares[0].shareAmount = roundMoney(shares[0].shareAmount + diff);
  return shares;
}

function fixRoundingToTotal(
  shares: { userId: string; shareAmount: number }[],
  total: number,
): { userId: string; shareAmount: number }[] {
  if (!shares.length) return shares;
  const sum = roundMoney(shares.reduce((a, s) => a + s.shareAmount, 0));
  const diff = roundMoney(total - sum);
  if (Math.abs(diff) < 0.0001) return shares;
  // Adjust the largest share so pennies land on someone with room.
  const idx = shares.reduce(
    (best, s, i, arr) => (s.shareAmount >= arr[best].shareAmount ? i : best),
    0,
  );
  const next = shares.map((s) => ({ ...s }));
  next[idx] = {
    ...next[idx],
    shareAmount: roundMoney(next[idx].shareAmount + diff),
  };
  return next;
}

/**
 * Convert UI inputs into money shares that should sum to `total`.
 * - equal: ignore inputs
 * - exact: inputs are currency amounts
 * - percentage: inputs are 0–100 percentages
 * - shares: inputs are relative weights (2,1,1…)
 * - adjustment: inputs are +/- vs an equal split
 */
export function buildSharesForMode(
  mode: SplitMode,
  total: number,
  userIds: string[],
  inputs: Record<string, number>,
): { userId: string; shareAmount: number }[] {
  const m = normalizeSplitMode(mode);
  const amount = roundMoney(total);
  if (!userIds.length || !(amount > 0)) {
    return userIds.map((userId) => ({ userId, shareAmount: 0 }));
  }

  if (m === 'equal') return buildEqualShares(amount, userIds);

  if (m === 'exact') {
    return userIds.map((userId) => ({
      userId,
      shareAmount: roundMoney(Math.max(0, inputs[userId] || 0)),
    }));
  }

  if (m === 'percentage') {
    const pcts = userIds.map((id) => Math.max(0, inputs[id] || 0));
    const shares = userIds.map((userId, i) => ({
      userId,
      shareAmount: roundMoney((amount * pcts[i]) / 100),
    }));
    const pctSum = roundMoney(pcts.reduce((a, b) => a + b, 0));
    if (Math.abs(pctSum - 100) <= 0.05) return fixRoundingToTotal(shares, amount);
    return shares;
  }

  if (m === 'shares') {
    const weights = userIds.map((id) => Math.max(0, inputs[id] || 0));
    const wSum = weights.reduce((a, b) => a + b, 0);
    if (wSum <= 0) return userIds.map((userId) => ({ userId, shareAmount: 0 }));
    const shares = userIds.map((userId, i) => ({
      userId,
      shareAmount: roundMoney((amount * weights[i]) / wSum),
    }));
    return fixRoundingToTotal(shares, amount);
  }

  // adjustment: equal baseline + signed deltas (should sum ≈ 0)
  const baseline = buildEqualShares(amount, userIds);
  const shares = baseline.map((s) => ({
    userId: s.userId,
    shareAmount: roundMoney(s.shareAmount + (inputs[s.userId] || 0)),
  }));
  return shares;
}

/** UI fields for a split mode, derived from current money shares. */
export function customInputsForMode(
  mode: SplitMode,
  total: number,
  shares: { userId: string; shareAmount: number }[],
): Record<string, string> {
  const m = normalizeSplitMode(mode);
  const amount = roundMoney(total);
  const ids = shares.map((s) => s.userId);
  const equal = buildSharesForMode('equal', amount, ids, {});
  const cust: Record<string, string> = {};
  if (m === 'equal') return cust;
  for (const s of shares) {
    if (m === 'exact') {
      cust[s.userId] = String(s.shareAmount);
    } else if (m === 'percentage' && amount > 0) {
      cust[s.userId] = String(Math.round((Number(s.shareAmount) / amount) * 1000) / 10);
    } else if (m === 'shares') {
      cust[s.userId] = String(Math.max(1, Math.round(Number(s.shareAmount) * 100)));
    } else if (m === 'adjustment') {
      const base = equal.find((e) => e.userId === s.userId)?.shareAmount || 0;
      cust[s.userId] = String(Math.round((Number(s.shareAmount) - base) * 100) / 100);
    }
  }
  return cust;
}

/** Keep the same money split when switching equal / % / exact / shares. */
export function customInputsAfterModeChange(
  fromMode: SplitMode,
  toMode: Exclude<SplitMode, 'custom'>,
  total: number,
  participantIds: string[],
  custom: Record<string, string>,
): Record<string, string> {
  const inputs: Record<string, number> = {};
  for (const id of participantIds) {
    inputs[id] = parseFloat((custom[id] || '0').replace(/,/g, '')) || 0;
  }
  const preview = buildSharesForMode(fromMode, total, participantIds, inputs);
  return customInputsForMode(toMode, total, preview);
}

/** Scale exact rupee shares when the bill total changes. */
export function scaleExactCustomInputs(
  custom: Record<string, string>,
  fromTotal: number,
  toTotal: number,
): Record<string, string> {
  if (!(fromTotal > 0) || !(toTotal > 0) || Math.abs(fromTotal - toTotal) < 0.001) {
    return custom;
  }
  const factor = toTotal / fromTotal;
  const next: Record<string, string> = { ...custom };
  for (const id of Object.keys(next)) {
    const n = parseFloat((next[id] || '0').replace(/,/g, '')) || 0;
    next[id] = String(roundMoney(n * factor));
  }
  return next;
}

export function splitModeInputLabel(
  mode: Exclude<SplitMode, 'custom'>,
  currencySym: string,
): string {
  switch (mode) {
    case 'exact':
      return currencySym;
    case 'percentage':
      return '%';
    case 'shares':
      return '×';
    case 'adjustment':
      return `±${currencySym}`;
    default:
      return '';
  }
}
