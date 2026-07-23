import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_CONFIG, DEFAULT_HOME_PREFS, THEMES } from './constants';
import { STORAGE_KEYS } from './constants';
import { AppConfig, CashBooksState, HomePrefs, HomeSortOrder, ThemeKey } from './types';
import { defaultCashBooks, getActiveFinance, normalizeCashBooks, normalizeFinanceState } from './cashBooks';
import {
  DEFAULT_EXPENSE_CATS,
  DEFAULT_INCOME_CATS,
  normalizeCategoryList,
  type CategoryDef,
} from './categories/defaults';

export type CategoriesState = {
  expense: CategoryDef[];
  income: CategoryDef[];
};

export function defaultCategories(): CategoriesState {
  return {
    expense: DEFAULT_EXPENSE_CATS.map((c) => ({ ...c })),
    income: DEFAULT_INCOME_CATS.map((c) => ({ ...c })),
  };
}

/** @deprecated Prefer defaultCashBooks — kept for call sites that need a bare FinanceState. */
export function defaultFinance(currency = DEFAULT_CONFIG.currency) {
  return normalizeFinanceState(null, currency);
}

export function mergeConfig(saved: Partial<AppConfig> | null): AppConfig {
  const theme: ThemeKey =
    saved?.theme && saved.theme in THEMES ? saved.theme : DEFAULT_CONFIG.theme;
  const appName =
    !saved?.appName || saved.appName === 'Finance Tracker' ? 'Pulse Wallet' : saved.appName;
  const homePrefs = mergeHomePrefs(saved?.homePrefs);
  const merged: AppConfig = {
    ...DEFAULT_CONFIG,
    ...(saved || {}),
    theme,
    appName,
    homePrefs,
    features: {
      ...DEFAULT_CONFIG.features,
      ...(saved?.features || {}),
    },
    medicineTimes: {
      ...DEFAULT_CONFIG.medicineTimes,
      ...(saved?.medicineTimes || {}),
    },
    expenseOffsets:
      saved?.expenseOffsets?.length ? saved.expenseOffsets : DEFAULT_CONFIG.expenseOffsets,
    groceryOffsets:
      saved?.groceryOffsets?.length ? saved.groceryOffsets : DEFAULT_CONFIG.groceryOffsets,
  };
  return merged;
}

const HOME_SORTS: HomeSortOrder[] = ['newest', 'oldest', 'amount_high', 'amount_low'];

export function mergeHomePrefs(saved?: Partial<HomePrefs> | null): HomePrefs {
  const base = { ...DEFAULT_HOME_PREFS, ...(saved || {}) };
  const defaultTab = base.defaultTab === 'expense' ? 'expense' : 'income';
  const sortOrder = HOME_SORTS.includes(base.sortOrder) ? base.sortOrder : DEFAULT_HOME_PREFS.sortOrder;
  return {
    defaultTab,
    showSummary: base.showSummary !== false,
    sortOrder,
  };
}

async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function persist(key: string, value: unknown) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function loadAll() {
  const config = mergeConfig(await readJSON(STORAGE_KEYS.config, null));
  const rawFinance = await readJSON<unknown>(STORAGE_KEYS.finance, null);
  const cashBooks: CashBooksState = normalizeCashBooks(rawFinance, config.currency);
  // Persist migrated shapes (legacy finance → books, Personal → Default).
  const needsRewrite =
    !rawFinance ||
    !Array.isArray((rawFinance as { books?: unknown }).books) ||
    (Array.isArray((rawFinance as { books?: { name?: string }[] }).books) &&
      (rawFinance as { books: { name?: string }[] }).books.length === 1 &&
      (rawFinance as { books: { name?: string }[] }).books[0]?.name === 'Default');
  if (needsRewrite) {
    await persist(STORAGE_KEYS.finance, cashBooks);
  }

  const expenseReminders = await readJSON(STORAGE_KEYS.expenseReminders, []);
  const medReminders = await readJSON(STORAGE_KEYS.medReminders, []);
  const groceryReminders = await readJSON(STORAGE_KEYS.groceryReminders, []);
  const shoppingList = await readJSON(STORAGE_KEYS.shoppingList, []);
  const generalReminders = await readJSON(STORAGE_KEYS.generalReminders, []);
  const savedCats = await readJSON<{ expense?: unknown; income?: unknown } | null>(
    STORAGE_KEYS.categories,
    null,
  );
  const categories: CategoriesState = savedCats
    ? {
        expense: normalizeCategoryList(savedCats.expense, DEFAULT_EXPENSE_CATS),
        income: normalizeCategoryList(savedCats.income, DEFAULT_INCOME_CATS),
      }
    : defaultCategories();

  return {
    config,
    cashBooks,
    finance: getActiveFinance(cashBooks),
    expenseReminders: Array.isArray(expenseReminders) ? expenseReminders : [],
    medReminders: Array.isArray(medReminders) ? medReminders : [],
    groceryReminders: Array.isArray(groceryReminders) ? groceryReminders : [],
    shoppingList: Array.isArray(shoppingList) ? shoppingList : [],
    generalReminders: Array.isArray(generalReminders) ? generalReminders : [],
    categories,
  };
}

export async function clearAllData() {
  await Promise.all(Object.values(STORAGE_KEYS).map((key) => AsyncStorage.removeItem(key)));
}

export { defaultCashBooks };
