import { CashBook, CashBooksState, FinanceState, Transaction } from './types';
import { uid } from './utils';

export const CASH_BOOK_ICONS = ['📒', '💼', '🏠', '✈️', '👨‍👩‍👧', '🛒', '🎓', '💪', '🚗', '💰'];

export function normalizeFinanceState(
  raw: Partial<FinanceState> | null | undefined,
  fallbackCurrency = 'INR',
): FinanceState {
  const accounts = Array.isArray(raw?.accounts) && raw!.accounts!.length > 0
    ? raw!.accounts!
    : [
        {
          id: uid(),
          name: 'Cash',
          type: 'Default',
          currency: fallbackCurrency,
          amount: 0,
          icon: '💵',
          excluded: false,
        },
      ];
  return {
    accounts,
    transactions: Array.isArray(raw?.transactions) ? raw!.transactions! : [],
    budget: typeof raw?.budget === 'number' && !Number.isNaN(raw.budget) ? raw.budget : 0,
    categoryBudgets: Array.isArray(raw?.categoryBudgets) ? raw!.categoryBudgets! : [],
    defaultAccountId:
      typeof raw?.defaultAccountId === 'string' &&
      accounts.some((a) => a.id === raw.defaultAccountId)
        ? raw.defaultAccountId
        : accounts[0]?.id,
  };
}

/** Account used for new income/expense when none is chosen. */
export function resolveDefaultAccountId(finance: FinanceState): string | undefined {
  if (
    finance.defaultAccountId &&
    finance.accounts.some((a) => a.id === finance.defaultAccountId)
  ) {
    return finance.defaultAccountId;
  }
  return finance.accounts.find((a) => !a.excluded)?.id || finance.accounts[0]?.id;
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
