import type {
  CashBooksState,
  CategoryBudget,
  FinanceState,
  Transaction,
} from '../types';
import { normalizeCashBooks, normalizeFinanceState } from '../cashBooks';
import {
  DEFAULT_EXPENSE_CATS,
  DEFAULT_INCOME_CATS,
  type CategoryDef,
} from '../categories/defaults';

export type TxnDateRange = { start: string; end: string };

export type ImportBackupOptions = {
  /** When true, replace reminders + buy list from the backup. */
  replaceReminders?: boolean;
};

/** Infer inclusive YYYY-MM-DD range from transaction dates. */
export function inferTxnDateRange(transactions: Transaction[]): TxnDateRange | null {
  let start = '';
  let end = '';
  for (const t of transactions) {
    const d = (t.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    if (!start || d < start) start = d;
    if (!end || d > end) end = d;
  }
  if (!start || !end) return null;
  return { start, end };
}

function collectAllTxns(books: CashBooksState): Transaction[] {
  const out: Transaction[] = [];
  for (const b of books.books) {
    out.push(...(b.finance.transactions || []));
  }
  return out;
}

export function inferBackupDateRange(books: CashBooksState): TxnDateRange | null {
  return inferTxnDateRange(collectAllTxns(books));
}

/** Fresh / empty phone: restore accounts from backup. Otherwise keep phone accounts. */
export function localNeedsAccountRestore(finance: FinanceState): boolean {
  return (finance.transactions?.length || 0) === 0;
}

function inRange(date: string, range: TxnDateRange): boolean {
  const d = (date || '').slice(0, 10);
  return d >= range.start && d <= range.end;
}

function monthInRange(month: string, range: TxnDateRange): boolean {
  const m = (month || '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(m)) return false;
  const startM = range.start.slice(0, 7);
  const endM = range.end.slice(0, 7);
  return m >= startM && m <= endM;
}

/**
 * Merge imported finance into local:
 * - txns + category budgets: replace only the backup date range
 * - accounts: from backup only when local has no transactions
 */
export function mergeFinanceFromBackup(
  local: FinanceState,
  imported: FinanceState,
  range: TxnDateRange | null,
  currency: string,
): FinanceState {
  const useBackupAccounts = localNeedsAccountRestore(local);
  const accounts = useBackupAccounts
    ? imported.accounts?.length
      ? imported.accounts
      : local.accounts
    : local.accounts;

  let transactions: Transaction[];
  let categoryBudgets: CategoryBudget[];

  if (!range) {
    // No dated txns in backup — keep local history; still allow empty import of budgets if any
    transactions = local.transactions || [];
    categoryBudgets = local.categoryBudgets || [];
    if (imported.categoryBudgets?.length && !(local.transactions?.length || 0)) {
      categoryBudgets = imported.categoryBudgets;
    }
  } else {
    const keptTxns = (local.transactions || []).filter((t) => !inRange(t.date, range));
    const importedTxns = (imported.transactions || []).filter((t) => inRange(t.date, range));
    transactions = [...keptTxns, ...importedTxns];

    const keptBudgets = (local.categoryBudgets || []).filter((b) => !monthInRange(b.month, range));
    const importedBudgets = (imported.categoryBudgets || []).filter((b) =>
      monthInRange(b.month, range),
    );
    categoryBudgets = [...keptBudgets, ...importedBudgets];
  }

  const defaultAccountId = useBackupAccounts
    ? imported.defaultAccountId || accounts[0]?.id
    : local.defaultAccountId || accounts[0]?.id;

  // Recompute legacy month budget from category budgets for active feel.
  const monthKey = new Date().toISOString().slice(0, 7);
  const budget =
    categoryBudgets.filter((b) => b.month === monthKey).reduce((s, b) => s + (b.limit || 0), 0) ||
    imported.budget ||
    local.budget ||
    0;

  return normalizeFinanceState(
    {
      accounts,
      transactions,
      categoryBudgets,
      budget,
      defaultAccountId,
    },
    currency,
  );
}

export function mergeCashBooksFromBackup(
  local: CashBooksState,
  imported: CashBooksState,
  currency: string,
): CashBooksState {
  const range = inferBackupDateRange(imported);
  const localById = new Map(local.books.map((b) => [b.id, b]));
  const importedIds = new Set(imported.books.map((b) => b.id));

  const mergedBooks = imported.books.map((ib) => {
    const lb = localById.get(ib.id);
    if (!lb) {
      // New book from backup — take as-is (normalized).
      return {
        ...ib,
        finance: mergeFinanceFromBackup(
          {
            accounts: [],
            transactions: [],
            budget: 0,
            categoryBudgets: [],
          },
          ib.finance,
          inferTxnDateRange(ib.finance.transactions || []),
          currency,
        ),
      };
    }
    return {
      ...lb,
      name: ib.name || lb.name,
      icon: ib.icon || lb.icon,
      archived: ib.archived ?? lb.archived,
      finance: mergeFinanceFromBackup(lb.finance, ib.finance, range, currency),
    };
  });

  // Keep local-only books.
  for (const lb of local.books) {
    if (!importedIds.has(lb.id)) mergedBooks.push(lb);
  }

  const activeBookId = imported.activeBookId || local.activeBookId;
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

function unionCategories(local: CategoryDef[], imported: CategoryDef[]): CategoryDef[] {
  const byName = new Map<string, CategoryDef>();
  for (const c of local) byName.set(c.name.toLowerCase(), c);
  for (const c of imported) {
    const key = c.name.toLowerCase();
    if (!byName.has(key)) byName.set(key, c);
  }
  return Array.from(byName.values());
}

export function mergeCategoriesFromBackup(
  local: { expense: CategoryDef[]; income: CategoryDef[] },
  imported: { expense?: CategoryDef[]; income?: CategoryDef[] } | null | undefined,
): { expense: CategoryDef[]; income: CategoryDef[] } {
  return {
    expense: unionCategories(
      local.expense?.length ? local.expense : DEFAULT_EXPENSE_CATS,
      Array.isArray(imported?.expense) ? imported!.expense! : [],
    ),
    income: unionCategories(
      local.income?.length ? local.income : DEFAULT_INCOME_CATS,
      Array.isArray(imported?.income) ? imported!.income! : [],
    ),
  };
}

/**
 * Rolling cloud retention start (YYYY-MM-DD).
 * Keeps 24 inclusive calendar months ending this month (e.g. Jul 2026 → Aug 2024-01).
 * Admins: pass isAdmin true → null (no prune).
 */
export function cloudRetentionStartDate(isAdmin: boolean, now = new Date()): string | null {
  if (isAdmin) return null;
  const start = new Date(now.getFullYear(), now.getMonth() - 23, 1);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}
