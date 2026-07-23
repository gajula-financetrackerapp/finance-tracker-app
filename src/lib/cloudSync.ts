import { supabase, isSupabaseConfigured } from './supabase';
import type {
  CashBooksState,
  ExpenseReminder,
  FinanceState,
  GeneralReminder,
  GroceryReminder,
  MedReminder,
  Transaction,
} from '../types';
import {
  cashBooksHaveData,
  mergeLocalBillImagesIntoBooks,
  normalizeCashBooks,
  stripBillImagesFromBooks,
  getActiveFinance,
} from '../cashBooks';
import {
  DEFAULT_EXPENSE_CATS,
  DEFAULT_INCOME_CATS,
  normalizeCategoryList,
  type CategoryDef,
} from '../categories/defaults';

export type CloudReminders = {
  expense: ExpenseReminder[];
  medicine: MedReminder[];
  grocery: GroceryReminder[];
  general: GeneralReminder[];
};

export type CloudCategories = {
  expense: CategoryDef[];
  income: CategoryDef[];
};

export type CloudUserData = {
  cashBooks: CashBooksState | null;
  reminders: CloudReminders | null;
  categories: CloudCategories | null;
};

/** Drop local-only bill URIs before uploading (cloud storage comes later). */
export function stripBillImages(finance: FinanceState): FinanceState {
  return {
    ...finance,
    transactions: finance.transactions.map((t) => {
      const { billImageUri: _omit, ...rest } = t;
      return rest;
    }),
  };
}

/** Keep local billImageUri when reloading cloud rows that omit images. */
export function mergeLocalBillImages(
  cloud: FinanceState,
  local: FinanceState | null | undefined,
): FinanceState {
  if (!local?.transactions?.length) return cloud;
  const byId = new Map(
    local.transactions
      .filter((t) => t.billImageUri)
      .map((t) => [t.id, t.billImageUri] as const),
  );
  if (byId.size === 0) return cloud;
  return {
    ...cloud,
    transactions: cloud.transactions.map((t) => {
      const uri = byId.get(t.id);
      return uri ? { ...t, billImageUri: uri } : t;
    }),
  };
}

function normalizeLegacyFinance(row: {
  accounts?: unknown;
  transactions?: unknown;
  budget?: unknown;
  category_budgets?: unknown;
} | null): FinanceState | null {
  if (!row) return null;
  const accounts = Array.isArray(row.accounts) ? row.accounts : [];
  if (!accounts.length && !Array.isArray(row.transactions)) return null;
  const transactions = Array.isArray(row.transactions) ? (row.transactions as Transaction[]) : [];
  const categoryBudgets = Array.isArray(row.category_budgets) ? row.category_budgets : [];
  const budget = typeof row.budget === 'number' ? row.budget : Number(row.budget) || 0;
  return {
    accounts: accounts as FinanceState['accounts'],
    transactions,
    budget,
    categoryBudgets: categoryBudgets as FinanceState['categoryBudgets'],
  };
}

function normalizeReminders(row: {
  expense?: unknown;
  medicine?: unknown;
  grocery?: unknown;
  general?: unknown;
} | null): CloudReminders | null {
  if (!row) return null;
  return {
    expense: Array.isArray(row.expense) ? (row.expense as ExpenseReminder[]) : [],
    medicine: Array.isArray(row.medicine) ? (row.medicine as MedReminder[]) : [],
    grocery: Array.isArray(row.grocery) ? (row.grocery as GroceryReminder[]) : [],
    general: Array.isArray(row.general) ? (row.general as GeneralReminder[]) : [],
  };
}

export async function pullUserData(userId: string): Promise<CloudUserData> {
  if (!isSupabaseConfigured || !userId) {
    return { cashBooks: null, reminders: null, categories: null };
  }

  const [financeRes, remindersRes, categoriesRes] = await Promise.all([
    supabase
      .from('user_finance')
      .select('accounts,transactions,budget,category_budgets,books,active_book_id')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase.from('user_reminders').select('expense,medicine,grocery,general').eq('user_id', userId).maybeSingle(),
    supabase.from('user_categories').select('expense,income').eq('user_id', userId).maybeSingle(),
  ]);

  if (financeRes.error) {
    // Older schemas without books columns — retry legacy select.
    console.warn('[cloudSync] pull finance failed', financeRes.error.message);
    const legacy = await supabase
      .from('user_finance')
      .select('accounts,transactions,budget,category_budgets')
      .eq('user_id', userId)
      .maybeSingle();
    if (legacy.error) {
      console.warn('[cloudSync] pull finance legacy failed', legacy.error.message);
    } else if (legacy.data) {
      const fin = normalizeLegacyFinance(legacy.data);
      return {
        cashBooks: fin ? normalizeCashBooks(fin) : null,
        reminders: normalizeReminders(remindersRes.data),
        categories: categoriesRes.data
          ? {
              expense: normalizeCategoryList(categoriesRes.data.expense, DEFAULT_EXPENSE_CATS),
              income: normalizeCategoryList(categoriesRes.data.income, DEFAULT_INCOME_CATS),
            }
          : null,
      };
    }
  }

  let categories: CloudCategories | null = null;
  if (categoriesRes.data) {
    categories = {
      expense: normalizeCategoryList(categoriesRes.data.expense, DEFAULT_EXPENSE_CATS),
      income: normalizeCategoryList(categoriesRes.data.income, DEFAULT_INCOME_CATS),
    };
  }

  let cashBooks: CashBooksState | null = null;
  if (financeRes.data) {
    const row = financeRes.data as {
      books?: unknown;
      active_book_id?: string;
      accounts?: unknown;
      transactions?: unknown;
      budget?: unknown;
      category_budgets?: unknown;
    };
    if (Array.isArray(row.books) && row.books.length > 0) {
      cashBooks = normalizeCashBooks({
        books: row.books,
        activeBookId: row.active_book_id || '',
      });
    } else {
      const legacy = normalizeLegacyFinance(row);
      cashBooks = legacy ? normalizeCashBooks(legacy) : null;
    }
  }

  if (remindersRes.error) {
    console.warn('[cloudSync] pull reminders failed', remindersRes.error.message);
  }
  if (categoriesRes.error) {
    console.warn('[cloudSync] pull categories failed', categoriesRes.error.message);
  }

  return {
    cashBooks,
    reminders: normalizeReminders(remindersRes.data),
    categories,
  };
}

export async function pushFinance(userId: string, cashBooks: CashBooksState): Promise<boolean> {
  if (!isSupabaseConfigured || !userId) return false;
  const cleanBooks = stripBillImagesFromBooks(cashBooks);
  const active = stripBillImages(getActiveFinance(cleanBooks));

  const payloadWithBooks = {
    user_id: userId,
    accounts: active.accounts,
    transactions: active.transactions,
    budget: active.budget,
    category_budgets: active.categoryBudgets || [],
    books: cleanBooks.books,
    active_book_id: cleanBooks.activeBookId,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('user_finance').upsert(payloadWithBooks, { onConflict: 'user_id' });
  if (!error) return true;

  // Schema may not have books columns yet — fall back to active book only.
  console.warn('[cloudSync] push finance with books failed, retrying legacy', error.message);
  const { error: legacyError } = await supabase.from('user_finance').upsert(
    {
      user_id: userId,
      accounts: active.accounts,
      transactions: active.transactions,
      budget: active.budget,
      category_budgets: active.categoryBudgets || [],
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (legacyError) {
    console.warn('[cloudSync] push finance failed', legacyError.message);
    return false;
  }
  return true;
}

export async function pushReminders(userId: string, reminders: CloudReminders): Promise<boolean> {
  if (!isSupabaseConfigured || !userId) return false;
  const { error } = await supabase.from('user_reminders').upsert(
    {
      user_id: userId,
      expense: reminders.expense,
      medicine: reminders.medicine,
      grocery: reminders.grocery,
      general: reminders.general,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) {
    console.warn('[cloudSync] push reminders failed', error.message);
    return false;
  }
  return true;
}

export async function pushCategories(userId: string, categories: CloudCategories): Promise<boolean> {
  if (!isSupabaseConfigured || !userId) return false;
  const { error } = await supabase.from('user_categories').upsert(
    {
      user_id: userId,
      expense: categories.expense,
      income: categories.income,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) {
    console.warn('[cloudSync] push categories failed', error.message);
    return false;
  }
  return true;
}

let financeTimer: ReturnType<typeof setTimeout> | null = null;
let remindersTimer: ReturnType<typeof setTimeout> | null = null;
let categoriesTimer: ReturnType<typeof setTimeout> | null = null;

export function schedulePushFinance(userId: string, cashBooks: CashBooksState) {
  if (financeTimer) clearTimeout(financeTimer);
  financeTimer = setTimeout(() => {
    financeTimer = null;
    void pushFinance(userId, cashBooks);
  }, 450);
}

export function schedulePushReminders(userId: string, reminders: CloudReminders) {
  if (remindersTimer) clearTimeout(remindersTimer);
  remindersTimer = setTimeout(() => {
    remindersTimer = null;
    void pushReminders(userId, reminders);
  }, 450);
}

export function schedulePushCategories(userId: string, categories: CloudCategories) {
  if (categoriesTimer) clearTimeout(categoriesTimer);
  categoriesTimer = setTimeout(() => {
    categoriesTimer = null;
    void pushCategories(userId, categories);
  }, 450);
}

export { cashBooksHaveData, mergeLocalBillImagesIntoBooks };
