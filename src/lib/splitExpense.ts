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
import { tr } from '../i18n/translations';

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function rpcMissing(message?: string | null): boolean {
  const m = message || '';
  return /could not find the function|PGRST202|schema cache/i.test(m);
}

function columnMissing(message?: string | null): boolean {
  const m = message || '';
  return /column .* does not exist|42703/i.test(m);
}

const SETTLEMENT_COLS =
  'id, from_user_id, to_user_id, amount, currency, debtor_confirmed, creditor_confirmed, status, created_by, completed_at, created_at, group_id';
const SETTLEMENT_COLS_LEGACY =
  'id, from_user_id, to_user_id, amount, currency, debtor_confirmed, creditor_confirmed, status, created_by, completed_at, created_at';

export function settlementGroupId(s: Pick<SplitSettlement, 'group_id'>): string | null {
  const gid = String(s.group_id || '').trim();
  return gid || null;
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
  group_id?: string | null;
  shares?: SplitExpenseShare[];
}): SplitExpense {
  const cat = String(e.finance_category || '').trim();
  const gid = Object.prototype.hasOwnProperty.call(e, 'group_id')
    ? String(e.group_id || '').trim() || null
    : undefined;
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
    group_id: gid,
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

async function persistSplitGroupId(expenseId: string, groupId: string | null): Promise<void> {
  const { error } = await supabase
    .from('split_expenses')
    .update({ group_id: groupId })
    .eq('id', expenseId);
  if (error) {
    console.warn('[split] group_id save failed', error.message);
  }
}

async function fillMissingGroupIds(list: SplitExpense[]): Promise<SplitExpense[]> {
  const ids = list.filter((e) => e.group_id === undefined).map((e) => e.id);
  if (!ids.length) return list;
  const { data, error } = await supabase
    .from('split_expenses')
    .select('id, group_id')
    .in('id', ids);
  if (error || !data) {
    return list.map((e) => ({
      ...e,
      group_id: e.group_id === undefined ? null : e.group_id,
    }));
  }
  const byId = new Map(
    (data as { id: string; group_id?: string | null }[]).map((r) => [
      String(r.id),
      r.group_id ? String(r.group_id) : null,
    ]),
  );
  return list.map((e) => ({
    ...e,
    group_id: e.group_id !== undefined ? e.group_id : (byId.get(e.id) ?? null),
  }));
}

function mapSettlementRow(s: SplitSettlement & { group_id?: string | null }): SplitSettlement {
  return {
    ...s,
    id: String(s.id),
    from_user_id: String(s.from_user_id),
    to_user_id: String(s.to_user_id),
    amount: Number(s.amount),
    created_by: String(s.created_by),
    group_id: s.group_id ? String(s.group_id) : null,
  };
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
      group_id?: string | null;
      shares?: SplitExpenseShare[];
    }>;
    return fillMissingGroupIds(await fillMissingPaySources(list.map((e) => mapExpenseRow(e))));
  }

  const withGroupId = await supabase
    .from('split_expenses')
    .select(
      'id, created_by, description, amount, currency, paid_by, split_mode, expense_date, created_at, finance_category, group_id',
    )
    .order('created_at', { ascending: false });
  const tableRes =
    withGroupId.error && columnMissing(withGroupId.error.message)
      ? await supabase
          .from('split_expenses')
          .select(
            'id, created_by, description, amount, currency, paid_by, split_mode, expense_date, created_at, finance_category',
          )
          .order('created_at', { ascending: false })
      : withGroupId;
  const { data: expenses, error } = tableRes;
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

  return fillMissingGroupIds(
    await fillMissingPaySources(
      list.map((e) =>
        mapExpenseRow({
          ...e,
          expense_date: normalizeSplitDate(e.expense_date),
          shares: byExp.get(e.id) || [],
        }),
      ),
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
  groupId?: string | null;
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
    const groupId = input.groupId ? String(input.groupId) : null;
    await persistSplitGroupId(mapped.id, groupId);
    return { ...mapped, pay_source: paySource, group_id: groupId };
  }

  const groupId = input.groupId ? String(input.groupId) : null;
  const insertRow: Record<string, unknown> = {
    created_by: input.createdBy,
    description,
    amount,
    currency: input.currency,
    paid_by: input.paidBy,
    split_mode: input.splitMode,
    expense_date: input.expenseDate,
    ...(financeCategory ? { finance_category: financeCategory } : {}),
    ...(groupId ? { group_id: groupId } : {}),
  };
  let ins = await supabase
    .from('split_expenses')
    .insert(insertRow)
    .select(
      'id, created_by, description, amount, currency, paid_by, split_mode, expense_date, created_at, finance_category',
    )
    .single();
  if (ins.error && groupId && columnMissing(ins.error.message)) {
    delete insertRow.group_id;
    ins = await supabase
      .from('split_expenses')
      .insert(insertRow)
      .select(
        'id, created_by, description, amount, currency, paid_by, split_mode, expense_date, created_at, finance_category',
      )
      .single();
  }
  const { data: expense, error } = ins;
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
  await persistSplitGroupId(mapped.id, groupId);
  return { ...mapped, pay_source: paySource, group_id: groupId };
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
  groupId?: string | null;
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
      mapped.pay_source = paySource;
    }
    if (input.groupId !== undefined) {
      const groupId = input.groupId ? String(input.groupId) : null;
      await persistSplitGroupId(mapped.id, groupId);
      mapped.group_id = groupId;
    }
    return mapped;
  }

  throw new Error(
    rpcError?.message ||
      'Could not update split. Run split_expense_finance_category.sql in Supabase.',
  );
}

/**
 * Delete a split for everyone in it. Only the person who added it may.
 *
 * Both paths lean on the same rule: the RPC checks `created_by` itself, and
 * the plain delete is held to it by row-level security. The share rows go with
 * the expense on the cascade, which is what tells every other phone the split
 * is gone — their next fetch simply no longer lists it.
 *
 * A delete that row-level security refuses is not an error in Postgres, it is
 * a delete of no rows, so the fallback asks for the deleted id back and treats
 * silence as a failure rather than reporting success. Silence does not say
 * which failure it was — refused, or already deleted from another phone — so
 * the wording claims neither.
 */
export async function deleteSplitExpense(expenseId: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error('Cloud is not configured');
  const { error: rpcError } = await supabase.rpc('split_delete_expense', {
    p_expense_id: expenseId,
  });
  if (!rpcError) return;

  const { data, error } = await supabase
    .from('split_expenses')
    .delete()
    .eq('id', expenseId)
    .select('id');
  if (error) throw new Error(rpcError.message || error.message);
  if (!data || data.length === 0) {
    throw new Error(tr('split.msgExpenseDeleteFailed'));
  }
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
  const withGroup = await supabase
    .from('split_settlements')
    .select(SETTLEMENT_COLS)
    .order('created_at', { ascending: false });
  const res =
    withGroup.error && columnMissing(withGroup.error.message)
      ? await supabase
          .from('split_settlements')
          .select(SETTLEMENT_COLS_LEGACY)
          .order('created_at', { ascending: false })
      : withGroup;
  if (res.error) throw new Error(res.error.message);
  return ((res.data || []) as unknown as SplitSettlement[]).map((s) => mapSettlementRow(s));
}

export async function createSplitSettlement(input: {
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency: string;
  createdBy: string;
  groupId?: string | null;
}): Promise<SplitSettlement> {
  if (!isSupabaseConfigured) throw new Error('Cloud is not configured');
  const amount = roundMoney(input.amount);
  if (!(amount > 0)) throw new Error('Enter a valid amount');
  const groupId = input.groupId ? String(input.groupId) : null;

  const pairOr = `and(from_user_id.eq.${input.fromUserId},to_user_id.eq.${input.toUserId}),and(from_user_id.eq.${input.toUserId},to_user_id.eq.${input.fromUserId})`;
  const openQuery = () => {
    let q = supabase.from('split_settlements').select('id').eq('status', 'open').or(pairOr);
    if (groupId) q = q.eq('group_id', groupId);
    else q = q.is('group_id', null);
    return q.limit(1);
  };
  let existRes = await openQuery();
  if (existRes.error && columnMissing(existRes.error.message)) {
    existRes = await supabase
      .from('split_settlements')
      .select('id')
      .eq('status', 'open')
      .or(pairOr)
      .limit(1);
  }
  if (existRes.error) throw new Error(existRes.error.message);
  if (existRes.data && existRes.data.length > 0) {
    throw new Error('A settlement with this friend is already pending');
  }

  const payload: Record<string, unknown> = {
    from_user_id: input.fromUserId,
    to_user_id: input.toUserId,
    amount,
    currency: input.currency,
    created_by: input.createdBy,
    debtor_confirmed: false,
    creditor_confirmed: false,
    status: 'open',
  };
  if (groupId) payload.group_id = groupId;

  let insertRes = await supabase
    .from('split_settlements')
    .insert(payload)
    .select(SETTLEMENT_COLS)
    .single();
  if (insertRes.error && columnMissing(insertRes.error.message)) {
    delete payload.group_id;
    insertRes = await supabase
      .from('split_settlements')
      .insert(payload)
      .select(SETTLEMENT_COLS_LEGACY)
      .single();
  }
  if (insertRes.error) throw new Error(insertRes.error.message);
  return mapSettlementRow(insertRes.data as SplitSettlement);
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

  const { data: current, error: readErr } = await (async () => {
    const first = await supabase
      .from('split_settlements')
      .select(SETTLEMENT_COLS)
      .eq('id', settlementId)
      .single();
    if (first.error && columnMissing(first.error.message)) {
      return supabase
        .from('split_settlements')
        .select(SETTLEMENT_COLS_LEGACY)
        .eq('id', settlementId)
        .single();
    }
    return first;
  })();
  if (readErr) throw new Error(readErr.message);
  if (current.status !== 'open') {
    throw new Error('This settlement is no longer open');
  }

  const nextDebtor = role === 'debtor' ? true : !!current.debtor_confirmed;
  const nextCreditor = role === 'creditor' ? true : !!current.creditor_confirmed;
  const both = nextDebtor && nextCreditor;

  let upd = await supabase
    .from('split_settlements')
    .update({
      ...patch,
      status: both ? 'completed' : 'open',
      completed_at: both ? new Date().toISOString() : null,
    })
    .eq('id', settlementId)
    .eq('status', 'open')
    .select(SETTLEMENT_COLS)
    .single();
  if (upd.error && columnMissing(upd.error.message)) {
    upd = await supabase
      .from('split_settlements')
      .update({
        ...patch,
        status: both ? 'completed' : 'open',
        completed_at: both ? new Date().toISOString() : null,
      })
      .eq('id', settlementId)
      .eq('status', 'open')
      .select(SETTLEMENT_COLS_LEGACY)
      .single();
  }
  if (upd.error) throw new Error(upd.error.message);
  return mapSettlementRow(upd.data as SplitSettlement);
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

export function netBetween(
  selfId: string,
  otherId: string,
  expenses: SplitExpense[],
  settlements: SplitSettlement[],
  currency: string,
): number {
  return (
    computeSplitBalances(selfId, expenses, settlements, currency).find((r) => r.userId === otherId)
      ?.amount || 0
  );
}

export function expensesScopedToGroup(
  expenses: SplitExpense[],
  groupId: string | null,
): SplitExpense[] {
  if (groupId) {
    const gid = String(groupId);
    return expenses.filter((e) => String(e.group_id || '') === gid);
  }
  return expenses.filter((e) => !e.group_id);
}

export function settlementsScopedToGroup(
  settlements: SplitSettlement[],
  groupId: string | null,
): SplitSettlement[] {
  if (groupId) {
    const gid = String(groupId);
    return settlements.filter((s) => settlementGroupId(s) === gid);
  }
  return settlements.filter((s) => !settlementGroupId(s));
}

/** Open settlement between self and other. Pass groupId to match that group (null = friends-only). */
export function findOpenSettlementWith(
  selfId: string,
  otherUserId: string,
  settlements: SplitSettlement[],
  groupId: string | null = null,
): SplitSettlement | undefined {
  const want = groupId ? String(groupId) : null;
  return settlements.find(
    (s) =>
      s.status === 'open' &&
      settlementGroupId(s) === want &&
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

export function peopleSetsEqual(a: string[], b: string[]): boolean {
  const left = new Set(a.map(String).filter(Boolean));
  const right = new Set(b.map(String).filter(Boolean));
  if (left.size === 0 || left.size !== right.size) return false;
  for (const id of left) {
    if (!right.has(id)) return false;
  }
  return true;
}

/**
 * Attach when exactly one group is picked and every person on the split is in
 * that group. A subset is enough — unchecked members are left out of this split.
 */
export function resolveAttachedGroupId(
  pickedGroupIds: string[],
  participantIds: string[],
  groups: SplitGroup[],
): string | null {
  if (pickedGroupIds.length !== 1) return null;
  const group = groups.find((g) => g.id === pickedGroupIds[0]);
  if (!group) return null;
  const members = new Set(group.member_ids.map(String).filter(Boolean));
  if (members.size === 0) return null;
  const people = [...new Set(participantIds.map(String).filter(Boolean))];
  if (people.length < 2) return null;
  for (const id of people) {
    if (!members.has(id)) return null;
  }
  return group.id;
}

/** Expense is this group's only when it was saved with this group selected. */
export function expenseMatchesGroup(exp: SplitExpense, group: SplitGroup): boolean {
  return String(exp.group_id || '') === String(group.id);
}

export function expenseMonthKey(exp: SplitExpense): string {
  return normalizeSplitDate(exp.expense_date).slice(0, 7);
}

export function expenseMatchesAnyGroup(exp: SplitExpense, groups: SplitGroup[]): boolean {
  const gid = String(exp.group_id || '');
  if (!gid) return false;
  return groups.some((g) => String(g.id) === gid);
}

export function groupsMatchingExpense(exp: SplitExpense, groups: SplitGroup[]): SplitGroup[] {
  const gid = String(exp.group_id || '');
  if (!gid) return [];
  return groups.filter((g) => String(g.id) === gid);
}

/** Group name when the split was saved on a group; otherwise the non-group label. */
export function splitScopeName(
  exp: Pick<SplitExpense, 'group_id'>,
  groups: SplitGroup[],
  nonGroupLabel: string,
): string {
  const gid = String(exp.group_id || '');
  if (!gid) return nonGroupLabel;
  const g = groups.find((x) => String(x.id) === gid);
  return g ? g.name : nonGroupLabel;
}

export function splitScopeLabel(
  exp: Pick<SplitExpense, 'group_id'>,
  groups: SplitGroup[],
  nonGroupLabel: string,
): string {
  const gid = String(exp.group_id || '');
  if (!gid) return nonGroupLabel;
  const g = groups.find((x) => String(x.id) === gid);
  return g ? `👥 ${g.name}` : nonGroupLabel;
}

export function listExpensesNewest(expenses: SplitExpense[]): SplitExpense[] {
  return [...expenses].sort((a, b) => {
    const da = normalizeSplitDate(b.expense_date);
    const db = normalizeSplitDate(a.expense_date);
    if (da !== db) return da.localeCompare(db);
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });
}

export type GroupOweRow = { fromId: string; toId: string; amount: number };

export type ScopePaymentRow = {
  fromId: string;
  toId: string;
  amount: number;
  completedAt: string;
};

export function computeScopedOwedPairs(
  memberIds: string[],
  expenses: SplitExpense[],
  settlements: SplitSettlement[],
  currency: string,
  groupId: string | null,
): GroupOweRow[] {
  const members = new Set(memberIds.map(String));
  const net = new Map<string, number>();
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const wantGroup = groupId ? String(groupId) : null;

  const addOwe = (from: string, to: string, amt: number) => {
    if (from === to || !members.has(from) || !members.has(to)) return;
    const n = roundMoney(amt);
    if (Math.abs(n) < 0.0001) return;
    if (n < 0) {
      addOwe(to, from, -n);
      return;
    }
    const key = pairKey(from, to);
    const sign = from < to ? 1 : -1;
    net.set(key, roundMoney((net.get(key) || 0) + sign * n));
  };

  for (const exp of expenses) {
    if (exp.currency !== currency) continue;
    const payer = String(exp.paid_by);
    for (const share of exp.shares) {
      const uid = String(share.user_id);
      if (uid === payer) continue;
      addOwe(uid, payer, Number(share.share_amount) || 0);
    }
  }

  for (const s of settlements) {
    if (s.status !== 'completed' || s.currency !== currency) continue;
    if (settlementGroupId(s) !== wantGroup) continue;
    addOwe(String(s.from_user_id), String(s.to_user_id), -Number(s.amount) || 0);
  }

  const rows: GroupOweRow[] = [];
  for (const [key, signed] of net) {
    if (Math.abs(signed) < 0.01) continue;
    const [a, b] = key.split('|');
    if (signed > 0) rows.push({ fromId: a, toId: b, amount: roundMoney(signed) });
    else rows.push({ fromId: b, toId: a, amount: roundMoney(-signed) });
  }
  rows.sort((x, y) => y.amount - x.amount);
  return rows;
}

export function listCompletedScopePayments(
  memberIds: string[],
  settlements: SplitSettlement[],
  groupId: string | null,
  currency?: string,
): ScopePaymentRow[] {
  const members = new Set(memberIds.map(String));
  const wantGroup = groupId ? String(groupId) : null;
  const wantCurrency = currency ? String(currency) : null;
  return settlements
    .filter((s) => {
      if (s.status !== 'completed') return false;
      if (settlementGroupId(s) !== wantGroup) return false;
      if (wantCurrency && s.currency !== wantCurrency) return false;
      return members.has(String(s.from_user_id)) && members.has(String(s.to_user_id));
    })
    .map((s) => ({
      fromId: String(s.from_user_id),
      toId: String(s.to_user_id),
      amount: roundMoney(Number(s.amount) || 0),
      completedAt: s.completed_at || s.created_at,
    }))
    .sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
}

/**
 * Who owes whom inside one group (all-time): group expenses minus completed
 * settlements saved on that group.
 */
export function computeGroupOwedPairs(
  group: SplitGroup,
  expenses: SplitExpense[],
  settlements: SplitSettlement[],
  currency: string,
): GroupOweRow[] {
  return computeScopedOwedPairs(
    group.member_ids,
    expenses.filter((exp) => expenseMatchesGroup(exp, group)),
    settlements,
    currency,
    group.id,
  );
}

export function expensePeopleKey(exp: SplitExpense): string {
  return [...new Set(exp.shares.map((s) => String(s.user_id)).filter(Boolean))].sort().join('|');
}

export type NonGroupCluster = {
  peopleKey: string;
  userIds: string[];
  expenses: SplitExpense[];
  total: number;
  count: number;
  byUser: { userId: string; share: number }[];
};

/** Splits saved without picking a group, clustered by who was on the split. */
export function listNonGroupClusters(
  expenses: SplitExpense[],
  groups: SplitGroup[],
  monthKey: string,
): NonGroupCluster[] {
  const map = new Map<string, SplitExpense[]>();
  for (const exp of expenses) {
    if (exp.shares.length < 2) continue;
    if (expenseMatchesAnyGroup(exp, groups)) continue;
    if (monthKey && expenseMonthKey(exp) !== monthKey) continue;
    const key = expensePeopleKey(exp);
    if (!key) continue;
    const arr = map.get(key) || [];
    arr.push(exp);
    map.set(key, arr);
  }
  const clusters: NonGroupCluster[] = [];
  for (const [peopleKey, rows] of map) {
    const userIds = peopleKey.split('|').filter(Boolean);
    const shareMap = new Map<string, number>();
    for (const id of userIds) shareMap.set(id, 0);
    let total = 0;
    const sorted = [...rows].sort((a, b) => {
      const da = normalizeSplitDate(b.expense_date);
      const db = normalizeSplitDate(a.expense_date);
      if (da !== db) return da.localeCompare(db);
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
    for (const exp of sorted) {
      total = roundMoney(total + Number(exp.amount) || 0);
      for (const s of exp.shares) {
        const uid = String(s.user_id);
        shareMap.set(uid, roundMoney((shareMap.get(uid) || 0) + Number(s.share_amount) || 0));
      }
    }
    clusters.push({
      peopleKey,
      userIds,
      expenses: sorted,
      total,
      count: sorted.length,
      byUser: userIds.map((userId) => ({
        userId,
        share: shareMap.get(userId) || 0,
      })),
    });
  }
  clusters.sort((a, b) => b.total - a.total);
  return clusters;
}

export function nonGroupMonthKeys(expenses: SplitExpense[], groups: SplitGroup[]): string[] {
  const keys = new Set<string>();
  for (const exp of expenses) {
    if (exp.shares.length < 2) continue;
    if (expenseMatchesAnyGroup(exp, groups)) continue;
    const key = expenseMonthKey(exp);
    if (/^\d{4}-\d{2}$/.test(key)) keys.add(key);
  }
  return [...keys].sort((a, b) => b.localeCompare(a));
}

export function countNonGroupExpenses(expenses: SplitExpense[], groups: SplitGroup[]): number {
  let n = 0;
  for (const exp of expenses) {
    if (exp.shares.length < 2) continue;
    if (expenseMatchesAnyGroup(exp, groups)) continue;
    n += 1;
  }
  return n;
}

export function summarizeScopedExpenses(
  memberIds: string[],
  expenses: SplitExpense[],
  monthKey: string,
): { total: number; count: number; byUser: { userId: string; share: number }[]; rows: SplitExpense[] } {
  const rows = expenses.filter((exp) => {
    if (exp.shares.length < 2) return false;
    if (!monthKey) return true;
    return expenseMonthKey(exp) === monthKey;
  });
  const shareMap = new Map<string, number>();
  for (const id of memberIds) shareMap.set(String(id), 0);
  let total = 0;
  for (const exp of rows) {
    total = roundMoney(total + Number(exp.amount) || 0);
    for (const s of exp.shares) {
      const uid = String(s.user_id);
      shareMap.set(uid, roundMoney((shareMap.get(uid) || 0) + Number(s.share_amount) || 0));
    }
  }
  return {
    total,
    count: rows.length,
    byUser: memberIds.map((userId) => ({
      userId: String(userId),
      share: shareMap.get(String(userId)) || 0,
    })),
    rows,
  };
}

export function scopedExpenseMonthKeys(expenses: SplitExpense[]): string[] {
  const keys = new Set<string>();
  for (const exp of expenses) {
    if (exp.shares.length < 2) continue;
    const key = expenseMonthKey(exp);
    if (/^\d{4}-\d{2}$/.test(key)) keys.add(key);
  }
  return [...keys].sort((a, b) => b.localeCompare(a));
}

export function groupExpenseMonthKeys(group: SplitGroup, expenses: SplitExpense[]): string[] {
  const keys = new Set<string>();
  for (const exp of expenses) {
    if (!expenseMatchesGroup(exp, group)) continue;
    const key = expenseMonthKey(exp);
    if (/^\d{4}-\d{2}$/.test(key)) keys.add(key);
  }
  return [...keys].sort((a, b) => b.localeCompare(a));
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
