import type { Account, FinanceState, Transaction } from '../types';

/** Net effect of transactions on an account (income +, expense −, transfers). */
export function accountTxnNet(transactions: Transaction[], accountId: string): number {
  let net = 0;
  for (const t of transactions) {
    const amt = Math.abs(t.amount) || 0;
    if (t.kind === 'income' && t.accountId === accountId) net += amt;
    else if (t.kind === 'expense' && t.accountId === accountId) net -= amt;
    else if (t.kind === 'transfer') {
      if (t.fromAccountId === accountId) net -= amt;
      if (t.toAccountId === accountId) net += amt;
    }
  }
  return net;
}

/** Opening balance (user-set). Migrates legacy running `amount` once. */
export function accountOpening(account: Account, transactions: Transaction[]): number {
  if (typeof account.openingBalance === 'number' && !Number.isNaN(account.openingBalance)) {
    return account.openingBalance;
  }
  // Legacy: `amount` was a running balance (mutated by each txn). Recover opening.
  return (Number(account.amount) || 0) - accountTxnNet(transactions, account.id);
}

/** Live balance = opening + incomes − expenses ± transfers. */
export function accountBalance(account: Account, transactions: Transaction[]): number {
  return accountOpening(account, transactions) + accountTxnNet(transactions, account.id);
}

/** Income into this account in a given month (YYYY-MM). */
export function accountMonthIncome(
  accountId: string,
  transactions: Transaction[],
  month: string,
): number {
  let total = 0;
  for (const t of transactions) {
    if (t.kind !== 'income' || t.accountId !== accountId) continue;
    if (!(t.date || '').startsWith(month)) continue;
    total += Math.abs(t.amount) || 0;
  }
  return total;
}

/**
 * Existing amount = what’s in the account excluding current-month income.
 * Current-month income is added via Home → Income and shown separately.
 */
export function accountExistingAmount(
  account: Account,
  transactions: Transaction[],
  month: string,
): number {
  const live = accountBalance(account, transactions);
  return live - accountMonthIncome(account.id, transactions, month);
}

function txnTouchesAccount(t: Transaction, accountId: string): boolean {
  if (t.kind === 'income' || t.kind === 'expense') return t.accountId === accountId;
  if (t.kind === 'transfer') {
    return t.fromAccountId === accountId || t.toAccountId === accountId;
  }
  return false;
}

/** Net of account txns with date on or before `throughDate` (YYYY-MM-DD). */
export function accountTxnNetThrough(
  transactions: Transaction[],
  accountId: string,
  throughDate: string,
): number {
  let net = 0;
  for (const t of transactions) {
    const d = t.date || '';
    if (!d || d > throughDate) continue;
    const amt = Math.abs(t.amount) || 0;
    if (t.kind === 'income' && t.accountId === accountId) net += amt;
    else if (t.kind === 'expense' && t.accountId === accountId) net -= amt;
    else if (t.kind === 'transfer') {
      if (t.fromAccountId === accountId) net -= amt;
      if (t.toAccountId === accountId) net += amt;
    }
  }
  return net;
}

function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${month}-${String(last).padStart(2, '0')}`;
}

/** Closing balance at end of month (current month = through today). */
export function accountClosingBalance(
  account: Account,
  transactions: Transaction[],
  month: string,
  today = new Date().toISOString().slice(0, 10),
): number {
  const current = today.slice(0, 7);
  const through = month >= current ? today : lastDayOfMonth(month);
  return accountOpening(account, transactions) + accountTxnNetThrough(transactions, account.id, through);
}

export type AccountMonthBalance = { month: string; balance: number };

/**
 * Month-end closing balances from first activity (or current month) through `throughMonth`.
 * Intermediate months are filled so carried balances stay visible.
 */
export function accountMonthlyBalances(
  account: Account,
  transactions: Transaction[],
  throughMonth: string,
  today = new Date().toISOString().slice(0, 10),
): AccountMonthBalance[] {
  const months = new Set<string>();
  for (const t of transactions) {
    if (!txnTouchesAccount(t, account.id)) continue;
    const m = (t.date || '').slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(m) && m <= throughMonth) months.add(m);
  }
  months.add(throughMonth);

  const sorted = [...months].sort();
  const start = sorted[0];
  const filled: string[] = [];
  let cur = start;
  while (cur <= throughMonth) {
    filled.push(cur);
    const [y, m] = cur.split('-').map(Number);
    const next = new Date(y, m, 1); // month is 1-based in cur; Date month is 0-based so m is next month index
    cur = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
  }

  return filled.map((month) => ({
    month,
    balance: accountClosingBalance(account, transactions, month, today),
  }));
}

/** Plain-language parts of an account balance (for UI). */
export function accountMoneyInOut(accountId: string, transactions: Transaction[]) {
  let incomeIn = 0;
  let expenseOut = 0;
  let transferIn = 0;
  let transferOut = 0;
  for (const t of transactions) {
    const amt = Math.abs(t.amount) || 0;
    if (t.kind === 'income' && t.accountId === accountId) incomeIn += amt;
    else if (t.kind === 'expense' && t.accountId === accountId) expenseOut += amt;
    else if (t.kind === 'transfer') {
      if (t.toAccountId === accountId) transferIn += amt;
      if (t.fromAccountId === accountId) transferOut += amt;
    }
  }
  return { incomeIn, expenseOut, transferIn, transferOut };
}

/**
 * When the user edits “current balance”, derive the opening so
 * opening + txnNet === desiredLive.
 */
export function openingFromDesiredLive(
  accountId: string,
  desiredLive: number,
  transactions: Transaction[],
): number {
  return desiredLive - accountTxnNet(transactions, accountId);
}

/** Attach default account to income/expense rows that never got accountId. */
export function withDefaultAccountIds(finance: FinanceState): FinanceState {
  const fallback =
    (finance.defaultAccountId &&
      finance.accounts.some((a) => a.id === finance.defaultAccountId) &&
      finance.defaultAccountId) ||
    finance.accounts.find((a) => !a.excluded)?.id ||
    finance.accounts[0]?.id;
  if (!fallback) return finance;

  let changed = false;
  const transactions = finance.transactions.map((t) => {
    if (t.kind !== 'income' && t.kind !== 'expense') return t;
    if (t.accountId && finance.accounts.some((a) => a.id === t.accountId)) return t;
    changed = true;
    return { ...t, accountId: fallback };
  });
  return changed ? { ...finance, transactions } : finance;
}

/** Ensure every account has openingBalance set (idempotent migration). */
export function withOpeningBalances(finance: FinanceState): FinanceState {
  const txns = finance.transactions || [];
  let changed = false;
  const accounts = finance.accounts.map((a) => {
    if (typeof a.openingBalance === 'number' && !Number.isNaN(a.openingBalance)) {
      return a;
    }
    changed = true;
    const opening = accountOpening(a, txns);
    return {
      ...a,
      openingBalance: opening,
      // Keep `amount` as the live balance for older export/cloud readers.
      amount: opening + accountTxnNet(txns, a.id),
    };
  });
  return changed ? { ...finance, accounts } : finance;
}

/** Refresh cached `amount` from opening + txns (for exports / legacy fields). */
export function syncAccountAmounts(finance: FinanceState): FinanceState {
  const txns = finance.transactions || [];
  let changed = false;
  const accounts = finance.accounts.map((a) => {
    const opening = accountOpening(a, txns);
    const bal = opening + accountTxnNet(txns, a.id);
    if (
      a.openingBalance === opening &&
      a.amount === bal &&
      typeof a.openingBalance === 'number'
    ) {
      return a;
    }
    changed = true;
    return { ...a, openingBalance: opening, amount: bal };
  });
  return changed ? { ...finance, accounts } : finance;
}

/** Merge accounts that share the same name (case-insensitive). Remaps linked transactions. */
export function dedupeAccountsByName(finance: FinanceState): FinanceState {
  const keepByName = new Map<string, Account>();
  const ordered: Account[] = [];
  const remap = new Map<string, string>();

  for (const a of finance.accounts) {
    const key = a.name.trim().toLowerCase();
    if (!key) {
      ordered.push(a);
      continue;
    }
    const kept = keepByName.get(key);
    if (!kept) {
      keepByName.set(key, a);
      ordered.push(a);
      continue;
    }
    remap.set(a.id, kept.id);
    const keptOpen = accountOpening(kept, finance.transactions || []);
    const dupOpen = accountOpening(a, finance.transactions || []);
    const merged: Account = {
      ...kept,
      openingBalance: keptOpen + dupOpen,
    };
    keepByName.set(key, merged);
    const idx = ordered.findIndex((x) => x.id === kept.id);
    if (idx >= 0) ordered[idx] = merged;
  }

  if (remap.size === 0) return finance;

  const transactions = (finance.transactions || []).map((t) => {
    let next = t;
    if (t.accountId && remap.has(t.accountId)) {
      next = { ...next, accountId: remap.get(t.accountId) };
    }
    if (t.fromAccountId && remap.has(t.fromAccountId)) {
      next = { ...next, fromAccountId: remap.get(t.fromAccountId) };
    }
    if (t.toAccountId && remap.has(t.toAccountId)) {
      next = { ...next, toAccountId: remap.get(t.toAccountId) };
    }
    return next;
  });

  let defaultAccountId = finance.defaultAccountId;
  if (defaultAccountId && remap.has(defaultAccountId)) {
    defaultAccountId = remap.get(defaultAccountId);
  }

  return {
    ...finance,
    accounts: ordered,
    transactions,
    defaultAccountId,
  };
}

/** Full normalize pipeline for account ↔ transaction consistency. */
export function reconcileAccountBalances(finance: FinanceState): FinanceState {
  return syncAccountAmounts(
    withOpeningBalances(withDefaultAccountIds(dedupeAccountsByName(finance))),
  );
}
