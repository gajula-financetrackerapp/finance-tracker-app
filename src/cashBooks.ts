import { CashBook, CashBooksState, FinanceState, Transaction } from './types';
import { uid } from './utils';
import { reconcileAccountBalances } from './utils/accountBalance';

export const CASH_BOOK_ICONS = ['📒', '💼', '🏠', '✈️', '👨‍👩‍👧', '🛒', '🎓', '💪', '🚗', '💰'];

/** Stable id for the default Personal book — never regenerate on each normalize. */
export const PERSONAL_BOOK_ID = 'book_personal';

function financeDataScore(finance: FinanceState): number {
  return (
    (finance.transactions?.length || 0) * 1000 +
    (finance.categoryBudgets?.length || 0) * 10 +
    (finance.accounts || []).filter((a) => a.amount !== 0).length
  );
}

function isAutoPersonalBookName(name: string): boolean {
  const n = (name || '').trim().toLowerCase();
  return n === 'personal' || n === 'default' || n === '';
}

/** Merge secondary finance into primary (txn/budget/account union). */
export function mergeFinanceStates(primary: FinanceState, secondary: FinanceState): FinanceState {
  const accounts = [...(primary.accounts || [])];
  const accountIdMap = new Map<string, string>();
  for (const sa of secondary.accounts || []) {
    const key = sa.name.trim().toLowerCase();
    const match =
      accounts.find(
        (a) => a.name.trim().toLowerCase() === key && (a.type || '') === (sa.type || ''),
      ) || accounts.find((a) => a.name.trim().toLowerCase() === key);
    if (match) accountIdMap.set(sa.id, match.id);
    else {
      accounts.push(sa);
      accountIdMap.set(sa.id, sa.id);
    }
  }

  const remapId = (id?: string) => (id ? accountIdMap.get(id) || id : id);
  const primaryTxnIds = new Set(primary.transactions.map((t) => t.id));
  const extraTxns = (secondary.transactions || [])
    .filter((t) => !primaryTxnIds.has(t.id))
    .map((t) => ({
      ...t,
      accountId: remapId(t.accountId),
      fromAccountId: remapId(t.fromAccountId),
      toAccountId: remapId(t.toAccountId),
    }));

  const budgetKeys = new Set(
    (primary.categoryBudgets || []).map((b) => `${b.month}::${b.category}`),
  );
  const extraBudgets = (secondary.categoryBudgets || []).filter(
    (b) => !budgetKeys.has(`${b.month}::${b.category}`),
  );

  return normalizeFinanceState({
    accounts,
    transactions: [...primary.transactions, ...extraTxns],
    budget: Math.max(primary.budget || 0, secondary.budget || 0),
    categoryBudgets: [...(primary.categoryBudgets || []), ...extraBudgets],
    defaultAccountId: primary.defaultAccountId || secondary.defaultAccountId,
  });
}

/**
 * Collapse duplicate Personal/Default books created by unstable legacy ids.
 * Keeps intentionally named books (Business, Trip, …) as separate notebooks.
 */
export function consolidateCashBooks(
  state: CashBooksState,
  currency = 'INR',
): CashBooksState {
  if (!state.books.length) return defaultCashBooks(currency);

  const personalish = state.books.filter((b) => isAutoPersonalBookName(b.name));
  const others = state.books.filter((b) => !isAutoPersonalBookName(b.name));

  let books: CashBook[];

  if (personalish.length === 0) {
    books = [...others];
  } else if (personalish.length === 1) {
    const only = personalish[0];
    books = [
      {
        ...only,
        id: PERSONAL_BOOK_ID,
        name: 'Personal',
      },
      ...others,
    ];
  } else {
    const ranked = [...personalish].sort(
      (a, b) => financeDataScore(b.finance) - financeDataScore(a.finance),
    );
    let mergedFinance = ranked[0].finance;
    for (const extra of ranked.slice(1)) {
      mergedFinance = mergeFinanceStates(mergedFinance, extra.finance);
    }
    books = [
      {
        ...ranked[0],
        id: PERSONAL_BOOK_ID,
        name: 'Personal',
        icon: ranked[0].icon || '📒',
        archived: false,
        finance: mergedFinance,
      },
      ...others,
    ];
  }

  if (!books.length) return defaultCashBooks(currency);

  const byId = new Map(books.map((b) => [b.id, b]));
  let activeBookId = state.activeBookId;
  const active = byId.get(activeBookId);
  if (!active || active.archived || !bookHasData(active)) {
    const preferred =
      [...books]
        .filter((b) => !b.archived)
        .sort((a, b) => financeDataScore(b.finance) - financeDataScore(a.finance))[0] || books[0];
    activeBookId = preferred.id;
  }

  return { books, activeBookId };
}

/** Book id that should receive Split / auto-posted finance (richest non-archived). */
export function preferredFinanceBookId(state: CashBooksState): string {
  const ranked = [...state.books]
    .filter((b) => !b.archived)
    .sort((a, b) => financeDataScore(b.finance) - financeDataScore(a.finance));
  return ranked[0]?.id || state.activeBookId || PERSONAL_BOOK_ID;
}

/** Normalize + migrate opening balances + backfill accountIds + sync live amounts. */
export function normalizeFinanceState(
  raw: Partial<FinanceState> | null | undefined,
  fallbackCurrency = 'INR',
): FinanceState {
  return reconcileAccountBalances(normalizeFinanceStateRaw(raw, fallbackCurrency));
}

export const CORE_BANK_NAME = 'Bank/Cash/Debit Card';
export const CORE_CARD_NAME = 'Credit Card';

/**
 * Core accounts are matched by type first, with names kept only as aliases for
 * books saved under older labels. Matching on the name alone is a trap now that
 * the bank is called "…Debit Card" — a loose /card/ test would capture it and
 * send credit-card spends to the wrong account.
 */
const BANK_ALIASES = new Set([
  'bank',
  'bank/cash/debit card',
  'bank / cash / debit card',
  'bank/cash/debit-card',
]);
const CARD_ALIASES = new Set(['card', 'credit card', 'cr.card', 'cr card', 'creditcard']);

const nameKeyOf = (a: { name?: string }) => (a.name || '').trim().toLowerCase();
const typeKeyOf = (a: { type?: string }) => (a.type || '').trim().toLowerCase();

export function isCoreBankAccount(a: { name?: string; type?: string }): boolean {
  if (CARD_ALIASES.has(nameKeyOf(a))) return false;
  return typeKeyOf(a) === 'bank' || BANK_ALIASES.has(nameKeyOf(a));
}

export function isCoreCardAccount(a: { name?: string; type?: string }): boolean {
  if (BANK_ALIASES.has(nameKeyOf(a))) return false;
  return typeKeyOf(a) === 'card' || CARD_ALIASES.has(nameKeyOf(a));
}

export function isCashAccount(a: { name?: string }): boolean {
  return nameKeyOf(a) === 'cash';
}

function makeAccount(
  name: 'Bank' | 'Card',
  currency: string,
): FinanceState['accounts'][number] {
  if (name === 'Card') {
    return {
      id: uid(),
      name: CORE_CARD_NAME,
      type: 'Card',
      currency,
      amount: 0,
      openingBalance: 0,
      icon: '💳',
      excluded: false,
    };
  }
  return {
    id: uid(),
    name: CORE_BANK_NAME,
    type: 'Bank',
    currency,
    amount: 0,
    openingBalance: 0,
    icon: '🏦',
    excluded: false,
  };
}

function starterAccounts(currency: string): FinanceState['accounts'] {
  return [makeAccount('Bank', currency), makeAccount('Card', currency)];
}

/** Only the account named Cash — never Card/Wallet/etc. */
function cashAccountId(accounts: FinanceState['accounts']): string | undefined {
  return accounts.find((a) => isCashAccount(a) && !a.excluded)?.id;
}

/** The core bank account: exact name wins, so a custom "Bank" type can't shadow it. */
export function bankAccountId(accounts: FinanceState['accounts']): string | undefined {
  const active = accounts.filter((a) => !a.excluded);
  return (
    active.find((a) => BANK_ALIASES.has(nameKeyOf(a)))?.id ||
    active.find(isCoreBankAccount)?.id
  );
}

/** The core credit-card account: exact name wins over any other Card-type account. */
export function cardAccountId(accounts: FinanceState['accounts']): string | undefined {
  const active = accounts.filter((a) => !a.excluded);
  return (
    active.find((a) => CARD_ALIASES.has(nameKeyOf(a)))?.id ||
    active.find(isCoreCardAccount)?.id
  );
}

function normalizeFinanceStateRaw(
  raw: Partial<FinanceState> | null | undefined,
  fallbackCurrency = 'INR',
): FinanceState {
  const rawAccounts = Array.isArray(raw?.accounts) ? raw!.accounts! : [];
  let accounts =
    rawAccounts.length > 0
      ? rawAccounts.map((a) => {
          const n = (a.name || '').trim().toLowerCase();
          // Canonicalise the core accounts, which also renames books saved under
          // the older "Bank" / "Card" labels.
          if (n === 'cash') {
            return { ...a, name: 'Cash', type: 'Cash', icon: '💵' };
          }
          if (BANK_ALIASES.has(n)) {
            return { ...a, name: CORE_BANK_NAME, type: 'Bank', icon: '🏦' };
          }
          if (CARD_ALIASES.has(n)) {
            return { ...a, name: CORE_CARD_NAME, type: 'Card', icon: a.icon || '💳' };
          }
          return a;
        })
      : starterAccounts(fallbackCurrency);

  const currency = accounts[0]?.currency || fallbackCurrency;
  const hasBank = accounts.some((a) => BANK_ALIASES.has(nameKeyOf(a)));
  const hasCard = accounts.some((a) => CARD_ALIASES.has(nameKeyOf(a)));
  // Core accounts: Bank, Card — then any extras. Cash is no longer forced, so a
  // deleted Cash account stays deleted.
  if (!hasBank) accounts = [makeAccount('Bank', currency), ...accounts];
  if (!hasCard) accounts = [...accounts, makeAccount('Card', currency)];

  const defaultAccountId = bankAccountId(accounts) || cashAccountId(accounts) || accounts[0]?.id;

  return {
    accounts,
    transactions: Array.isArray(raw?.transactions) ? raw!.transactions! : [],
    budget: typeof raw?.budget === 'number' && !Number.isNaN(raw.budget) ? raw.budget : 0,
    categoryBudgets: Array.isArray(raw?.categoryBudgets) ? raw!.categoryBudgets! : [],
    defaultAccountId,
  };
}

/** Label for account chips: "🏦 Bank", "💵 Cash", or "Bank-HDFC" for custom accounts. */
export function accountChipLabel(account: { name: string; type?: string; icon?: string }): string {
  const name = (account.name || '').trim() || 'Account';
  const type = (account.type || '').trim();
  const nameKey = name.toLowerCase();
  // Core accounts: fixed symbol + name (never "Bank-Cash").
  if (BANK_ALIASES.has(nameKey)) return `🏦 ${name}`;
  if (nameKey === 'cash') return `💵 ${name}`;
  if (CARD_ALIASES.has(nameKey)) return `💳 ${name}`;
  const icon = account.icon ? `${account.icon} ` : '';
  if (!type || type.toLowerCase() === nameKey) {
    return `${icon}${name}`;
  }
  return `${icon}${type}-${name}`;
}

/** New income / fallback account — prefer Bank (then Cash). */
export function resolveDefaultAccountId(finance: FinanceState): string | undefined {
  return (
    bankAccountId(finance.accounts) ||
    cashAccountId(finance.accounts) ||
    finance.defaultAccountId ||
    finance.accounts[0]?.id
  );
}

/** Paid with (expenses / groceries) defaults to Bank. */
export function resolvePaidWithAccountId(finance: FinanceState): string | undefined {
  return resolveDefaultAccountId(finance);
}

/** Stable display order: Bank, Cash, Card, then the rest (by name, not type). */
export function sortAccountsForDisplay<T extends { name: string; type?: string }>(
  accounts: T[],
): T[] {
  const rank = (a: T) => {
    const n = a.name.trim().toLowerCase();
    if (BANK_ALIASES.has(n)) return 0;
    if (n === 'cash') return 1;
    if (CARD_ALIASES.has(n)) return 2;
    return 3;
  };
  return [...accounts].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export function defaultCashBooks(currency = 'INR'): CashBooksState {
  const book: CashBook = {
    id: PERSONAL_BOOK_ID,
    name: 'Personal',
    icon: '📒',
    archived: false,
    finance: normalizeFinanceState(null, currency),
  };
  return { books: [book], activeBookId: PERSONAL_BOOK_ID };
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
/**
 * Retire the old Cash account by folding it into the bank account, which now
 * covers cash too. Records move rather than vanish, and Cash's opening balance
 * is added to the bank's so the overall total is unchanged.
 */
export function mergeCashIntoBank(state: CashBooksState): {
  state: CashBooksState;
  changed: boolean;
  movedTxns: number;
} {
  let changed = false;
  let movedTxns = 0;

  const books = state.books.map((book) => {
    const fin = book.finance;
    const cash = fin.accounts.find(isCashAccount);
    if (!cash || fin.accounts.length <= 1) return book;

    const targetId = bankAccountId(fin.accounts) || fin.accounts.find((a) => a.id !== cash.id)?.id;
    if (!targetId) return book;

    const accounts = fin.accounts
      .filter((a) => a.id !== cash.id)
      .map((a) =>
        a.id === targetId
          ? {
              ...a,
              openingBalance: Number(a.openingBalance || 0) + Number(cash.openingBalance || 0),
            }
          : a,
      );

    const transactions = fin.transactions
      .map((t) => {
        if (t.kind === 'transfer') {
          const fromAccountId = t.fromAccountId === cash.id ? targetId : t.fromAccountId;
          const toAccountId = t.toAccountId === cash.id ? targetId : t.toAccountId;
          // A Cash↔Bank transfer becomes a no-op once they are one account.
          if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) return null;
          if (fromAccountId !== t.fromAccountId || toAccountId !== t.toAccountId) movedTxns += 1;
          return { ...t, fromAccountId, toAccountId };
        }
        if (t.accountId === cash.id) {
          movedTxns += 1;
          return { ...t, accountId: targetId };
        }
        return t;
      })
      .filter((t): t is NonNullable<typeof t> => t != null);

    changed = true;
    return {
      ...book,
      finance: {
        ...fin,
        accounts,
        transactions,
        defaultAccountId:
          fin.defaultAccountId === cash.id ? targetId : fin.defaultAccountId,
      },
    };
  });

  return { state: changed ? { ...state, books } : state, changed, movedTxns };
}

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
    return consolidateCashBooks({ books, activeBookId }, currency);
  }

  if (isLegacyFinance(raw)) {
    const book: CashBook = {
      id: PERSONAL_BOOK_ID,
      name: 'Personal',
      icon: '📒',
      archived: false,
      finance: normalizeFinanceState(raw, currency),
    };
    return { books: [book], activeBookId: PERSONAL_BOOK_ID };
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

/**
 * Keep transactions / category budgets on or after `sinceDate` (YYYY-MM-DD).
 * When `sinceDate` is null (admin / no retention window), sync everything —
 * callers already gate Free users out of cloud push.
 */
export function filterCashBooksSince(
  state: CashBooksState,
  sinceDate: string | null,
): CashBooksState {
  if (!sinceDate) return state;
  const sinceMonth = sinceDate.slice(0, 7);
  return {
    ...state,
    books: state.books.map((b) => ({
      ...b,
      finance: {
        ...b.finance,
        transactions: b.finance.transactions.filter((t) => (t.date || '') >= sinceDate),
        categoryBudgets: (b.finance.categoryBudgets || []).filter(
          (cb) => (cb.month || '') >= sinceMonth,
        ),
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

  // Prefer cloud active book only when it actually has data (or local has none).
  // Avoid switching onto an empty cloud book and hiding a local book full of txns/budgets.
  const cloudActive = mergedBooks.find((b) => b.id === cloud.activeBookId);
  const localActive = mergedBooks.find((b) => b.id === local.activeBookId);
  let activeBookId = cloud.activeBookId || local.activeBookId;
  if (cloudActive && localActive && cloudActive.id !== localActive.id) {
    const cloudOk = bookHasData(cloudActive);
    const localOk = bookHasData(localActive);
    if (!cloudOk && localOk) activeBookId = localActive.id;
  }

  const currency =
    mergedBooks[0]?.finance.accounts[0]?.currency ||
    local.books[0]?.finance.accounts[0]?.currency ||
    'INR';
  return consolidateCashBooks(
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
