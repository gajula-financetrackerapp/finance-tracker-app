import { CashBook, CashBooksState, FinanceState, Transaction } from './types';
import { uid } from './utils';
import { reconcileAccountBalances } from './utils/accountBalance';

export const CASH_BOOK_ICONS = ['📒', '💼', '🏠', '✈️', '👨‍👩‍👧', '🛒', '🎓', '💪', '🚗', '💰'];

/** Normalize + migrate opening balances + backfill accountIds + sync live amounts. */
export function normalizeFinanceState(
  raw: Partial<FinanceState> | null | undefined,
  fallbackCurrency = 'INR',
): FinanceState {
  return reconcileAccountBalances(normalizeFinanceStateRaw(raw, fallbackCurrency));
}

function makeAccount(
  name: 'Cash' | 'Bank',
  currency: string,
): FinanceState['accounts'][number] {
  if (name === 'Cash') {
    return {
      id: uid(),
      name: 'Cash',
      type: 'Cash',
      currency,
      amount: 0,
      openingBalance: 0,
      icon: '💵',
      excluded: false,
    };
  }
  return {
    id: uid(),
    name: 'Bank',
    type: 'Bank',
    currency,
    amount: 0,
    openingBalance: 0,
    icon: '🏦',
    excluded: false,
  };
}

function starterAccounts(currency: string): FinanceState['accounts'] {
  return [makeAccount('Cash', currency), makeAccount('Bank', currency)];
}

/** Only the account named Cash — never Card/Wallet/etc. */
function cashAccountId(accounts: FinanceState['accounts']): string | undefined {
  return accounts.find((a) => a.name.trim().toLowerCase() === 'cash' && !a.excluded)?.id;
}

function normalizeFinanceStateRaw(
  raw: Partial<FinanceState> | null | undefined,
  fallbackCurrency = 'INR',
): FinanceState {
  const rawAccounts = Array.isArray(raw?.accounts) ? raw!.accounts! : [];
  let accounts =
    rawAccounts.length > 0
      ? rawAccounts.map((a) => {
          if ((a.type || '') === 'Default' && a.name.trim().toLowerCase() === 'cash') {
            return { ...a, type: 'Cash' };
          }
          return a;
        })
      : starterAccounts(fallbackCurrency);

  const currency = accounts[0]?.currency || fallbackCurrency;
  const hasCash = accounts.some((a) => a.name.trim().toLowerCase() === 'cash');
  const hasBank = accounts.some((a) => a.name.trim().toLowerCase() === 'bank');
  // Income “Received in” needs Cash + Bank. Extra accounts (HDFC, etc.) are user-added.
  if (!hasCash) accounts = [makeAccount('Cash', currency), ...accounts];
  if (!hasBank) accounts = [...accounts, makeAccount('Bank', currency)];

  const defaultAccountId = cashAccountId(accounts) || accounts[0]?.id;

  return {
    accounts,
    transactions: Array.isArray(raw?.transactions) ? raw!.transactions! : [],
    budget: typeof raw?.budget === 'number' && !Number.isNaN(raw.budget) ? raw.budget : 0,
    categoryBudgets: Array.isArray(raw?.categoryBudgets) ? raw!.categoryBudgets! : [],
    defaultAccountId,
  };
}

/** Label for account chips: "Cash" or "Bank-HDFC" (never "Cash-Cash"). */
export function accountChipLabel(account: { name: string; type?: string; icon?: string }): string {
  const name = (account.name || '').trim() || 'Account';
  const type = (account.type || '').trim();
  const icon = account.icon ? `${account.icon} ` : '';
  if (!type || type.toLowerCase() === name.toLowerCase()) {
    return `${icon}${name}`;
  }
  return `${icon}${type}-${name}`;
}

/** New income/expense without a pick always use Cash. */
export function resolveDefaultAccountId(finance: FinanceState): string | undefined {
  return cashAccountId(finance.accounts) || finance.defaultAccountId || finance.accounts[0]?.id;
}

/** Stable display order: Cash, Bank, then the rest. */
export function sortAccountsForDisplay<T extends { name: string; type?: string }>(
  accounts: T[],
): T[] {
  const rank = (a: T) => {
    const n = a.name.trim().toLowerCase();
    const t = (a.type || '').toLowerCase();
    if (n === 'cash' || t === 'cash') return 0;
    if (n === 'bank' || t === 'bank') return 1;
    return 2;
  };
  return [...accounts].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export function defaultCashBooks(currency = 'INR'): CashBooksState {
  const book: CashBook = {
    id: uid(),
    name: 'Personal',
    icon: '📒',
    archived: false,
    finance: normalizeFinanceState(null, currency),
  };
  return { books: [book], activeBookId: book.id };
}

function isLegacyFinance(raw: unknown): raw is FinanceState {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  return Array.isArray(o.accounts) && Array.isArray(o.transactions) && !Array.isArray(o.books);
}

function isCashBooksState(raw: unknown): raw is CashBooksState {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  return Array.isArray(o.books) && typeof o.activeBookId === 'string';
}

/** Accept legacy FinanceState or CashBooksState from storage/cloud/backup. */
export function normalizeCashBooks(
  raw: unknown,
  currency = 'INR',
): CashBooksState {
  if (isCashBooksState(raw) && raw.books.length > 0) {
    const books = raw.books.map((b, i) => ({
      id: b.id || uid(),
      name: (b.name || `Book ${i + 1}`).trim() || `Book ${i + 1}`,
      icon: b.icon || '📒',
      archived: !!b.archived,
      finance: normalizeFinanceState(b.finance, currency),
    }));
    // Starter book was briefly named Default — restore Personal.
    if (books.length === 1 && books[0].name === 'Default') {
      books[0] = { ...books[0], name: 'Personal' };
    }
    const activeBookId = books.some((b) => b.id === raw.activeBookId)
      ? raw.activeBookId
      : books.find((b) => !b.archived)?.id || books[0].id;
    return { books, activeBookId };
  }

  if (isLegacyFinance(raw)) {
    const book: CashBook = {
      id: uid(),
      name: 'Personal',
      icon: '📒',
      archived: false,
      finance: normalizeFinanceState(raw, currency),
    };
    return { books: [book], activeBookId: book.id };
  }

  return defaultCashBooks(currency);
}

export function getActiveBook(state: CashBooksState): CashBook {
  return (
    state.books.find((b) => b.id === state.activeBookId) ||
    state.books.find((b) => !b.archived) ||
    state.books[0]
  );
}

export function getActiveFinance(state: CashBooksState): FinanceState {
  return getActiveBook(state).finance;
}

export function withActiveFinance(state: CashBooksState, finance: FinanceState): CashBooksState {
  const activeId = getActiveBook(state).id;
  return {
    ...state,
    books: state.books.map((b) => (b.id === activeId ? { ...b, finance } : b)),
  };
}

export function stripBillImagesFromBooks(state: CashBooksState): CashBooksState {
  return {
    ...state,
    books: state.books.map((b) => ({
      ...b,
      finance: {
        ...b.finance,
        transactions: b.finance.transactions.map((t) => {
          const { billImageUri: _omit, ...rest } = t;
          return rest;
        }),
      },
    })),
  };
}

/** Keep only transactions on/after Premium start date (YYYY-MM-DD). */
export function filterCashBooksSince(
  state: CashBooksState,
  sinceDate: string | null,
): CashBooksState {
  if (!sinceDate) {
    return {
      ...state,
      books: state.books.map((b) => ({
        ...b,
        finance: { ...b.finance, transactions: [] },
      })),
    };
  }
  return {
    ...state,
    books: state.books.map((b) => ({
      ...b,
      finance: {
        ...b.finance,
        transactions: b.finance.transactions.filter((t) => (t.date || '') >= sinceDate),
      },
    })),
  };
}

/** Merge cloud (premium-era) into local without dropping older local-only txns. */
export function mergeCloudIntoLocalBooks(
  local: CashBooksState,
  cloud: CashBooksState,
): CashBooksState {
  const localByBook = new Map(local.books.map((b) => [b.id, b]));
  const cloudIds = new Set(cloud.books.map((b) => b.id));
  const mergedBooks = cloud.books.map((cb) => {
    const lb = localByBook.get(cb.id);
    if (!lb) return cb;
    const cloudTxnIds = new Set(cb.finance.transactions.map((t) => t.id));
    const olderLocal = lb.finance.transactions.filter((t) => !cloudTxnIds.has(t.id));
    return {
      ...cb,
      finance: {
        ...cb.finance,
        accounts: cb.finance.accounts.length ? cb.finance.accounts : lb.finance.accounts,
        transactions: [...olderLocal, ...cb.finance.transactions],
        budget: cb.finance.budget,
        categoryBudgets: cb.finance.categoryBudgets?.length
          ? cb.finance.categoryBudgets
          : lb.finance.categoryBudgets,
        defaultAccountId: cb.finance.defaultAccountId || lb.finance.defaultAccountId,
      },
    };
  });
  // Keep local-only books that never synced.
  for (const lb of local.books) {
    if (!cloudIds.has(lb.id)) mergedBooks.push(lb);
  }
  const activeBookId = cloud.activeBookId || local.activeBookId;
  const currency =
    mergedBooks[0]?.finance.accounts[0]?.currency ||
    local.books[0]?.finance.accounts[0]?.currency ||
    'INR';
  return normalizeCashBooks(
    {
      books: mergedBooks,
      activeBookId: mergedBooks.some((b) => b.id === activeBookId)
        ? activeBookId
        : mergedBooks[0]?.id,
    },
    currency,
  );
}

export function mergeLocalBillImagesIntoBooks(
  cloud: CashBooksState,
  local: CashBooksState | null | undefined,
): CashBooksState {
  if (!local?.books?.length) return cloud;
  const byId = new Map<string, string>();
  for (const book of local.books) {
    for (const t of book.finance.transactions) {
      if (t.billImageUri) byId.set(t.id, t.billImageUri);
    }
  }
  if (byId.size === 0) return cloud;
  return {
    ...cloud,
    books: cloud.books.map((b) => ({
      ...b,
      finance: {
        ...b.finance,
        transactions: b.finance.transactions.map((t) => {
          const uri = byId.get(t.id);
          return uri ? { ...t, billImageUri: uri } : t;
        }),
      },
    })),
  };
}

export function bookHasData(book: CashBook): boolean {
  return (
    book.finance.transactions.length > 0 ||
    book.finance.accounts.some((a) => a.amount !== 0) ||
    (book.finance.categoryBudgets?.length || 0) > 0
  );
}

export function cashBooksHaveData(state: CashBooksState): boolean {
  return state.books.some(bookHasData);
}

export type { Transaction };
