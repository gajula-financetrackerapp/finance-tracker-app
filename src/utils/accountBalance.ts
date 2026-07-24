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

/** Full normalize pipeline for account ↔ transaction consistency. */
export function reconcileAccountBalances(finance: FinanceState): FinanceState {
  return syncAccountAmounts(withOpeningBalances(withDefaultAccountIds(finance)));
}
