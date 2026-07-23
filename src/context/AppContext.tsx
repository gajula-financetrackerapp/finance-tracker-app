import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { DEFAULT_HOME_PREFS, STORAGE_KEYS, THEMES } from '../constants';
import {
  AppConfig,
  CashBook,
  CashBooksState,
  ExpenseReminder,
  FinanceState,
  GeneralReminder,
  GroceryReminder,
  HomePrefs,
  MedReminder,
  ShoppingItem,
  ThemeKey,
  ThemeTokens,
  Transaction,
  Account,
} from '../types';
import { clearAllData, clearUserWorkspaceData, defaultCategories, defaultCashBooks, loadAll, mergeAdBanner, mergeConfig, persist } from '../storage';
import type { CategoriesState } from '../storage';
import {
  cashBooksHaveData,
  getActiveBook,
  getActiveFinance,
  mergeLocalBillImagesIntoBooks,
  normalizeCashBooks,
  withActiveFinance,
} from '../cashBooks';
import { uid } from '../utils';
import { requireAuthToSave, requireAdminToChangeSettings } from '../authGate';
import { useFinance } from '../FinanceContext';
import {
  pullUserData,
  pushCategories,
  pushFinance,
  pushReminders,
  schedulePushCategories,
  schedulePushFinance,
  schedulePushReminders,
} from '../lib/cloudSync';
import type { CloudReminders } from '../lib/cloudSync';
import {
  findCategoryMeta,
  type CategoryDef,
  type CategoryKind,
} from '../categories/defaults';
import { PALETTE } from '../constants';

type AppContextValue = {
  ready: boolean;
  config: AppConfig;
  theme: ThemeTokens;
  finance: FinanceState;
  cashBooks: CashBooksState;
  activeBook: CashBook;
  setActiveBookId: (id: string) => Promise<void>;
  createCashBook: (input: { name: string; icon?: string }) => Promise<string | null>;
  renameCashBook: (id: string, name: string) => Promise<string | null>;
  setCashBookIcon: (id: string, icon: string) => Promise<void>;
  setCashBookArchived: (id: string, archived: boolean) => Promise<string | null>;
  deleteCashBook: (id: string) => Promise<string | null>;
  expenseReminders: ExpenseReminder[];
  medReminders: MedReminder[];
  groceryReminders: GroceryReminder[];
  shoppingList: ShoppingItem[];
  generalReminders: GeneralReminder[];
  expenseCategories: CategoryDef[];
  incomeCategories: CategoryDef[];
  catMeta: (name: string, kind?: 'expense' | 'income') => CategoryDef;
  addCategory: (kind: CategoryKind, cat: Omit<CategoryDef, 'color'> & { color?: string }) => Promise<string | null>;
  updateCategory: (
    kind: CategoryKind,
    oldName: string,
    patch: Partial<CategoryDef>,
  ) => Promise<string | null>;
  deleteCategory: (kind: CategoryKind, name: string) => Promise<string | null>;
  resetCategoriesToDefault: (kind?: CategoryKind) => Promise<void>;
  adminAuthed: boolean;
  setAdminAuthed: (v: boolean) => void;
  updateConfig: (patch: Partial<AppConfig>) => Promise<boolean>;
  setCurrency: (code: string) => Promise<void>;
  setTheme: (key: ThemeKey) => Promise<void>;
  setHomePrefs: (patch: Partial<HomePrefs>) => Promise<void>;
  resetHomePrefsToDefaults: () => Promise<void>;
  setFinance: (next: FinanceState) => Promise<void>;
  addTransaction: (txn: Omit<Transaction, 'id'> & { id?: string }) => Promise<void>;
  updateTransaction: (txn: Transaction) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  upsertAccount: (account: Account) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  setDefaultAccountId: (id: string) => Promise<void>;
  setBudget: (amount: number) => Promise<void>;
  setCategoryBudget: (month: string, category: string, limit: number) => Promise<void>;
  removeCategoryBudget: (month: string, category: string) => Promise<void>;
  setExpenseReminders: (items: ExpenseReminder[]) => Promise<void>;
  setMedReminders: (items: MedReminder[]) => Promise<void>;
  setGroceryReminders: (items: GroceryReminder[]) => Promise<void>;
  setShoppingList: (items: ShoppingItem[]) => Promise<void>;
  setGeneralReminders: (items: GeneralReminder[]) => Promise<void>;
  exportBackup: () => string;
  importBackup: (json: string) => Promise<boolean>;
  resetAll: () => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { session, ready: authReady } = useFinance();
  const userId = session?.user?.id || null;
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = userId;
  const hydratingRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const [config, setConfig] = useState<AppConfig>(mergeConfig(null));
  const [cashBooks, setCashBooksState] = useState<CashBooksState>(() => defaultCashBooks());
  const cashBooksRef = useRef(cashBooks);
  cashBooksRef.current = cashBooks;
  const finance = useMemo(() => getActiveFinance(cashBooks), [cashBooks]);
  const activeBook = useMemo(() => getActiveBook(cashBooks), [cashBooks]);
  const [expenseReminders, setExpenseRemindersState] = useState<ExpenseReminder[]>([]);
  const [medReminders, setMedRemindersState] = useState<MedReminder[]>([]);
  const [groceryReminders, setGroceryRemindersState] = useState<GroceryReminder[]>([]);
  const [shoppingList, setShoppingListState] = useState<ShoppingItem[]>([]);
  const [generalReminders, setGeneralRemindersState] = useState<GeneralReminder[]>([]);
  const [categories, setCategoriesState] = useState<CategoriesState>(defaultCategories());
  const [adminAuthed, setAdminAuthed] = useState(false);

  const financeRef = useRef(finance);
  financeRef.current = finance;
  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;
  const remindersRef = useRef<CloudReminders>({
    expense: expenseReminders,
    medicine: medReminders,
    grocery: groceryReminders,
    general: generalReminders,
  });
  remindersRef.current = {
    expense: expenseReminders,
    medicine: medReminders,
    grocery: groceryReminders,
    general: generalReminders,
  };

  const applyEmptyWorkspace = useCallback((currency: string) => {
    const nextBooks = defaultCashBooks(currency);
    cashBooksRef.current = nextBooks;
    setCashBooksState(nextBooks);
    setExpenseRemindersState([]);
    setMedRemindersState([]);
    setGroceryRemindersState([]);
    setShoppingListState([]);
    setGeneralRemindersState([]);
    const nextCats = defaultCategories();
    categoriesRef.current = nextCats;
    setCategoriesState(nextCats);
    remindersRef.current = { expense: [], medicine: [], grocery: [], general: [] };
  }, []);

  const applyLocalWorkspace = useCallback(
    (data: Awaited<ReturnType<typeof loadAll>>) => {
      cashBooksRef.current = data.cashBooks;
      setCashBooksState(data.cashBooks);
      setExpenseRemindersState(data.expenseReminders);
      setMedRemindersState(data.medReminders);
      setGroceryRemindersState(data.groceryReminders);
      setShoppingListState(data.shoppingList);
      setGeneralRemindersState(data.generalReminders);
      categoriesRef.current = data.categories;
      setCategoriesState(data.categories);
      remindersRef.current = {
        expense: data.expenseReminders,
        medicine: data.medReminders,
        grocery: data.groceryReminders,
        general: data.generalReminders,
      };
    },
    [],
  );

  const persistCashBooksLocalAndCloud = useCallback(async (next: CashBooksState) => {
    cashBooksRef.current = next;
    setCashBooksState(next);
    await persist(STORAGE_KEYS.finance, next);
    const uidNow = userIdRef.current;
    if (uidNow && !hydratingRef.current) {
      schedulePushFinance(uidNow, next);
    }
  }, []);

  const updateActiveFinance = useCallback(
    (updater: (prev: FinanceState) => FinanceState) => {
      const prevFin = getActiveFinance(cashBooksRef.current);
      const nextFin = updater(prevFin);
      void persistCashBooksLocalAndCloud(withActiveFinance(cashBooksRef.current, nextFin));
    },
    [persistCashBooksLocalAndCloud],
  );

  const persistFinanceLocalAndCloud = useCallback(
    async (next: FinanceState) => {
      await persistCashBooksLocalAndCloud(withActiveFinance(cashBooksRef.current, next));
    },
    [persistCashBooksLocalAndCloud],
  );

  const persistCategoriesLocalAndCloud = useCallback(async (next: CategoriesState) => {
    await persist(STORAGE_KEYS.categories, next);
    const uidNow = userIdRef.current;
    if (uidNow && !hydratingRef.current) {
      schedulePushCategories(uidNow, next);
    }
  }, []);

  const persistRemindersLocalAndCloud = useCallback(
    async (patch: Partial<CloudReminders> & { shopping?: ShoppingItem[] }) => {
      const next: CloudReminders = {
        expense: patch.expense ?? remindersRef.current.expense,
        medicine: patch.medicine ?? remindersRef.current.medicine,
        grocery: patch.grocery ?? remindersRef.current.grocery,
        general: patch.general ?? remindersRef.current.general,
      };
      if (patch.expense) await persist(STORAGE_KEYS.expenseReminders, patch.expense);
      if (patch.medicine) await persist(STORAGE_KEYS.medReminders, patch.medicine);
      if (patch.grocery) await persist(STORAGE_KEYS.groceryReminders, patch.grocery);
      if (patch.general) await persist(STORAGE_KEYS.generalReminders, patch.general);
      if (patch.shopping) await persist(STORAGE_KEYS.shoppingList, patch.shopping);

      const uidNow = userIdRef.current;
      if (uidNow && !hydratingRef.current && (patch.expense || patch.medicine || patch.grocery || patch.general)) {
        schedulePushReminders(uidNow, next);
      }
    },
    [],
  );

  useEffect(() => {
    (async () => {
      const data = await loadAll();
      setConfig(data.config);
      setReady(true);
    })();
  }, []);

  const currencyRef = useRef(config.currency);
  currencyRef.current = config.currency;

  /**
   * Guests see an empty workspace (never the previous account’s local cache).
   * Signed-in users: hydrate from local cache, then Supabase.
   */
  useEffect(() => {
    if (!ready || !authReady) return;

    if (!userId) {
      applyEmptyWorkspace(currencyRef.current);
      void clearUserWorkspaceData();
      setCloudReady(true);
      return;
    }

    let cancelled = false;
    (async () => {
      hydratingRef.current = true;
      setCloudReady(false);
      try {
        const local = await loadAll();
        if (cancelled) return;
        setConfig(local.config);
        applyLocalWorkspace(local);

        const cloud = await pullUserData(userId);
        if (cancelled) return;

        const localBooks = cashBooksRef.current;
        const localReminders = remindersRef.current;
        const hasLocalFinance = cashBooksHaveData(localBooks);
        const hasLocalReminders =
          localReminders.expense.length +
            localReminders.medicine.length +
            localReminders.grocery.length +
            localReminders.general.length >
          0;

        if (cloud.cashBooks) {
          const merged = mergeLocalBillImagesIntoBooks(cloud.cashBooks, localBooks);
          cashBooksRef.current = merged;
          setCashBooksState(merged);
          await persist(STORAGE_KEYS.finance, merged);
        } else if (hasLocalFinance) {
          await pushFinance(userId, localBooks);
        }

        if (cloud.reminders) {
          setExpenseRemindersState(cloud.reminders.expense);
          setMedRemindersState(cloud.reminders.medicine);
          setGroceryRemindersState(cloud.reminders.grocery);
          setGeneralRemindersState(cloud.reminders.general);
          remindersRef.current = cloud.reminders;
          await persist(STORAGE_KEYS.expenseReminders, cloud.reminders.expense);
          await persist(STORAGE_KEYS.medReminders, cloud.reminders.medicine);
          await persist(STORAGE_KEYS.groceryReminders, cloud.reminders.grocery);
          await persist(STORAGE_KEYS.generalReminders, cloud.reminders.general);
        } else if (hasLocalReminders) {
          await pushReminders(userId, localReminders);
        }

        if (cloud.categories) {
          categoriesRef.current = cloud.categories;
          setCategoriesState(cloud.categories);
          await persist(STORAGE_KEYS.categories, cloud.categories);
        } else {
          const localCats = categoriesRef.current;
          const customized =
            JSON.stringify(localCats) !== JSON.stringify(defaultCategories());
          if (customized) {
            await pushCategories(userId, localCats);
          }
        }
      } finally {
        if (!cancelled) {
          hydratingRef.current = false;
          setCloudReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      hydratingRef.current = false;
    };
  }, [ready, authReady, userId, applyEmptyWorkspace, applyLocalWorkspace]);

  const theme = THEMES[config.theme];

  const updateConfig = useCallback(async (patch: Partial<AppConfig>) => {
    if (!requireAdminToChangeSettings('change app settings')) return false;
    setConfig((prev) => {
      const next = mergeConfig({
        ...prev,
        ...patch,
        features: { ...prev.features, ...(patch.features || {}) },
        adBanner: patch.adBanner
          ? mergeAdBanner({
              ...prev.adBanner,
              ...patch.adBanner,
              items: patch.adBanner.items ?? prev.adBanner.items,
            })
          : prev.adBanner,
      });
      void persist(STORAGE_KEYS.config, next);
      return next;
    });
    return true;
  }, []);

  /** Currency is a personal display preference — available to everyone. */
  const setCurrency = useCallback(async (code: string) => {
    setConfig((prev) => {
      const next = mergeConfig({ ...prev, currency: code });
      void persist(STORAGE_KEYS.config, next);
      return next;
    });
  }, []);

  /** Theme is a personal display preference — available to everyone. */
  const setTheme = useCallback(async (key: ThemeKey) => {
    setConfig((prev) => {
      const next = mergeConfig({ ...prev, theme: key });
      void persist(STORAGE_KEYS.config, next);
      return next;
    });
  }, []);

  /** Home layout preferences — available to everyone. */
  const setHomePrefs = useCallback(async (patch: Partial<HomePrefs>) => {
    setConfig((prev) => {
      const next = mergeConfig({
        ...prev,
        homePrefs: { ...prev.homePrefs, ...patch },
      });
      void persist(STORAGE_KEYS.config, next);
      return next;
    });
  }, []);

  const resetHomePrefsToDefaults = useCallback(async () => {
    setConfig((prev) => {
      const next = mergeConfig({
        ...prev,
        homePrefs: { ...DEFAULT_HOME_PREFS },
      });
      void persist(STORAGE_KEYS.config, next);
      return next;
    });
  }, []);

  const setFinance = useCallback(async (next: FinanceState) => {
    if (!requireAuthToSave('save finance data')) return;
    await persistFinanceLocalAndCloud(next);
  }, [persistFinanceLocalAndCloud]);

  const applyAccountDelta = (
    accounts: Account[],
    kind: Transaction['kind'],
    accountId: string | undefined,
    fromAccountId: string | undefined,
    toAccountId: string | undefined,
    amount: number,
    direction: 1 | -1,
  ) => {
    const amt = Math.abs(amount) * direction;
    if (kind === 'expense' && accountId) {
      const i = accounts.findIndex((a) => a.id === accountId);
      if (i >= 0) accounts[i] = { ...accounts[i], amount: accounts[i].amount - amt };
    } else if (kind === 'income' && accountId) {
      const i = accounts.findIndex((a) => a.id === accountId);
      if (i >= 0) accounts[i] = { ...accounts[i], amount: accounts[i].amount + amt };
    } else if (kind === 'transfer' && fromAccountId && toAccountId) {
      const from = accounts.findIndex((a) => a.id === fromAccountId);
      const to = accounts.findIndex((a) => a.id === toAccountId);
      if (from >= 0) accounts[from] = { ...accounts[from], amount: accounts[from].amount - amt };
      if (to >= 0) accounts[to] = { ...accounts[to], amount: accounts[to].amount + amt };
    }
  };

  const addTransaction = useCallback(
    async (txn: Omit<Transaction, 'id'> & { id?: string }) => {
      if (!requireAuthToSave('add transactions')) return;
      updateActiveFinance((prev) => {
        const accounts = [...prev.accounts];
        const amount = Math.abs(txn.amount);
        applyAccountDelta(
          accounts,
          txn.kind,
          txn.accountId,
          txn.fromAccountId,
          txn.toAccountId,
          amount,
          1,
        );
        const { id: providedId, ...rest } = txn;
        const next = {
          ...prev,
          accounts,
          transactions: [{ ...rest, id: providedId || uid(), amount }, ...prev.transactions],
        };
        return next;
      });
    },
    [updateActiveFinance],
  );

  const updateTransaction = useCallback(async (txn: Transaction) => {
    if (!requireAuthToSave('edit transactions')) return;
    updateActiveFinance((prev) => {
      const idx = prev.transactions.findIndex((t) => t.id === txn.id);
      if (idx < 0) return prev;
      const old = prev.transactions[idx];
      const accounts = [...prev.accounts];
      // Undo old account impact, then apply the edited one.
      applyAccountDelta(
        accounts,
        old.kind,
        old.accountId,
        old.fromAccountId,
        old.toAccountId,
        old.amount,
        -1,
      );
      const amount = Math.abs(txn.amount);
      applyAccountDelta(
        accounts,
        txn.kind,
        txn.accountId,
        txn.fromAccountId,
        txn.toAccountId,
        amount,
        1,
      );
      const transactions = [...prev.transactions];
      transactions[idx] = { ...txn, amount };
      const next = { ...prev, accounts, transactions };
      return next;
    });
  }, [updateActiveFinance]);

  const deleteTransaction = useCallback(async (id: string) => {
    if (!requireAuthToSave('delete transactions')) return;
    updateActiveFinance((prev) => {
      const old = prev.transactions.find((t) => t.id === id);
      if (!old) return prev;
      const accounts = [...prev.accounts];
      applyAccountDelta(
        accounts,
        old.kind,
        old.accountId,
        old.fromAccountId,
        old.toAccountId,
        old.amount,
        -1,
      );
      const next = {
        ...prev,
        accounts,
        transactions: prev.transactions.filter((t) => t.id !== id),
      };
      return next;
    });
  }, [updateActiveFinance]);

  const upsertAccount = useCallback(async (account: Account) => {
    if (!requireAuthToSave('manage accounts')) return;
    updateActiveFinance((prev) => {
      const exists = prev.accounts.some((a) => a.id === account.id);
      const accounts = exists
        ? prev.accounts.map((a) => (a.id === account.id ? account : a))
        : [...prev.accounts, account];
      const defaultAccountId =
        prev.defaultAccountId && accounts.some((a) => a.id === prev.defaultAccountId)
          ? prev.defaultAccountId
          : account.id;
      return { ...prev, accounts, defaultAccountId };
    });
  }, [updateActiveFinance]);

  const deleteAccount = useCallback(async (id: string) => {
    if (!requireAuthToSave('manage accounts')) return;
    updateActiveFinance((prev) => {
      if (prev.accounts.length <= 1) {
        Alert.alert('Cannot delete', 'Keep at least one account.');
        return prev;
      }
      const accounts = prev.accounts.filter((a) => a.id !== id);
      const nextDefault =
        prev.defaultAccountId === id
          ? accounts.find((a) => !a.excluded)?.id || accounts[0]?.id
          : prev.defaultAccountId && accounts.some((a) => a.id === prev.defaultAccountId)
            ? prev.defaultAccountId
            : accounts[0]?.id;
      return {
        ...prev,
        accounts,
        defaultAccountId: nextDefault,
        transactions: prev.transactions.filter(
          (t) => t.accountId !== id && t.fromAccountId !== id && t.toAccountId !== id,
        ),
      };
    });
  }, [updateActiveFinance]);

  const setDefaultAccountId = useCallback(async (id: string) => {
    if (!requireAuthToSave('set default account')) return;
    updateActiveFinance((prev) => {
      if (!prev.accounts.some((a) => a.id === id)) return prev;
      return { ...prev, defaultAccountId: id };
    });
  }, [updateActiveFinance]);

  const setBudget = useCallback(async (amount: number) => {
    if (!requireAuthToSave('set a budget')) return;
    updateActiveFinance((prev) => {
      const next = { ...prev, budget: amount };
      return next;
    });
  }, [updateActiveFinance]);

  const setCategoryBudget = useCallback(async (month: string, category: string, limit: number) => {
    if (!requireAuthToSave('set a budget')) return;
    updateActiveFinance((prev) => {
      const budgets = [...(prev.categoryBudgets || [])];
      const idx = budgets.findIndex((b) => b.month === month && b.category === category);
      if (limit <= 0) {
        if (idx >= 0) budgets.splice(idx, 1);
      } else if (idx >= 0) {
        budgets[idx] = { month, category, limit };
      } else {
        budgets.push({ month, category, limit });
      }
      const monthTotal = budgets
        .filter((b) => b.month === month)
        .reduce((s, b) => s + b.limit, 0);
      const next = { ...prev, categoryBudgets: budgets, budget: monthTotal };
      return next;
    });
  }, [updateActiveFinance]);

  const removeCategoryBudget = useCallback(async (month: string, category: string) => {
    if (!requireAuthToSave('remove a budget')) return;
    updateActiveFinance((prev) => {
      const budgets = (prev.categoryBudgets || []).filter(
        (b) => !(b.month === month && b.category === category),
      );
      const monthTotal = budgets
        .filter((b) => b.month === month)
        .reduce((s, b) => s + b.limit, 0);
      const next = { ...prev, categoryBudgets: budgets, budget: monthTotal };
      return next;
    });
  }, [updateActiveFinance]);

  const setExpenseReminders = useCallback(async (items: ExpenseReminder[]) => {
    if (!requireAuthToSave('save reminders')) return;
    setExpenseRemindersState(items);
    await persistRemindersLocalAndCloud({ expense: items });
  }, [persistRemindersLocalAndCloud]);

  const setMedReminders = useCallback(async (items: MedReminder[]) => {
    if (!requireAuthToSave('save reminders')) return;
    setMedRemindersState(items);
    await persistRemindersLocalAndCloud({ medicine: items });
  }, [persistRemindersLocalAndCloud]);

  const setGroceryReminders = useCallback(async (items: GroceryReminder[]) => {
    if (!requireAuthToSave('save reminders')) return;
    setGroceryRemindersState(items);
    await persistRemindersLocalAndCloud({ grocery: items });
  }, [persistRemindersLocalAndCloud]);

  const setShoppingList = useCallback(async (items: ShoppingItem[]) => {
    if (!requireAuthToSave('save shopping list')) return;
    setShoppingListState(items);
    await persistRemindersLocalAndCloud({ shopping: items });
  }, [persistRemindersLocalAndCloud]);

  const setGeneralReminders = useCallback(async (items: GeneralReminder[]) => {
    if (!requireAuthToSave('save reminders')) return;
    setGeneralRemindersState(items);
    await persistRemindersLocalAndCloud({ general: items });
  }, [persistRemindersLocalAndCloud]);

  const catMetaFn = useCallback(
    (name: string, kind: 'expense' | 'income' = 'expense') => {
      const list = kind === 'income' ? categories.income : categories.expense;
      return findCategoryMeta(list, name);
    },
    [categories],
  );

  const addCategory = useCallback(
    async (kind: CategoryKind, cat: Omit<CategoryDef, 'color'> & { color?: string }) => {
      if (!requireAuthToSave('add categories')) return 'Sign in required';
      const name = cat.name.trim();
      if (!name) return 'Name is required';
      const list = kind === 'income' ? categoriesRef.current.income : categoriesRef.current.expense;
      if (list.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
        return 'That category already exists';
      }
      const nextCat: CategoryDef = {
        name,
        icon: cat.icon || '🪙',
        color: cat.color || PALETTE[list.length % PALETTE.length],
      };
      const next: CategoriesState = {
        ...categoriesRef.current,
        [kind]: [...list, nextCat],
      };
      setCategoriesState(next);
      await persistCategoriesLocalAndCloud(next);
      return null;
    },
    [persistCategoriesLocalAndCloud],
  );

  const updateCategory = useCallback(
    async (kind: CategoryKind, oldName: string, patch: Partial<CategoryDef>) => {
      if (!requireAuthToSave('edit categories')) return 'Sign in required';
      const list = kind === 'income' ? categoriesRef.current.income : categoriesRef.current.expense;
      const idx = list.findIndex((c) => c.name === oldName);
      if (idx < 0) return 'Category not found';

      const nextName = (patch.name ?? oldName).trim();
      if (!nextName) return 'Name is required';
      if (
        nextName.toLowerCase() !== oldName.toLowerCase() &&
        list.some((c) => c.name.toLowerCase() === nextName.toLowerCase())
      ) {
        return 'That category already exists';
      }

      const updated: CategoryDef = {
        ...list[idx],
        ...patch,
        name: nextName,
        icon: patch.icon?.trim() || list[idx].icon,
        color: patch.color || list[idx].color,
      };
      const nextList = [...list];
      nextList[idx] = updated;
      const nextCats: CategoriesState = { ...categoriesRef.current, [kind]: nextList };
      setCategoriesState(nextCats);
      await persistCategoriesLocalAndCloud(nextCats);

      // Rename on existing transactions + category budgets when the label changes.
      if (nextName !== oldName) {
        const prevFin = financeRef.current;
        const nextFin: FinanceState = {
          ...prevFin,
          transactions: prevFin.transactions.map((t) =>
            t.category === oldName ? { ...t, category: nextName } : t,
          ),
          categoryBudgets: (prevFin.categoryBudgets || []).map((b) =>
            b.category === oldName ? { ...b, category: nextName } : b,
          ),
        };
        await persistFinanceLocalAndCloud(nextFin);
      }
      return null;
    },
    [persistCategoriesLocalAndCloud, persistFinanceLocalAndCloud],
  );

  const deleteCategory = useCallback(
    async (kind: CategoryKind, name: string) => {
      if (!requireAuthToSave('delete categories')) return 'Sign in required';
      if (name === 'Others') return 'Keep the Others category';
      const list = kind === 'income' ? categoriesRef.current.income : categoriesRef.current.expense;
      if (list.length <= 1) return 'Keep at least one category';
      if (!list.some((c) => c.name === name)) return 'Category not found';

      const used = financeRef.current.transactions.some(
        (t) => t.category === name && (kind === 'income' ? t.kind === 'income' : t.kind === 'expense'),
      );
      const fallback = list.find((c) => c.name === 'Others')?.name || list.find((c) => c.name !== name)?.name;

      const nextList = list.filter((c) => c.name !== name);
      const nextCats: CategoriesState = { ...categoriesRef.current, [kind]: nextList };
      setCategoriesState(nextCats);
      await persistCategoriesLocalAndCloud(nextCats);

      if (used && fallback) {
        const prevFin = financeRef.current;
        const nextFin: FinanceState = {
          ...prevFin,
          transactions: prevFin.transactions.map((t) =>
            t.category === name ? { ...t, category: fallback } : t,
          ),
          categoryBudgets: (prevFin.categoryBudgets || []).filter((b) => b.category !== name),
        };
        await persistFinanceLocalAndCloud(nextFin);
      } else {
        const prevFin = financeRef.current;
        const nextBudgets = (prevFin.categoryBudgets || []).filter((b) => b.category !== name);
        if (nextBudgets.length !== (prevFin.categoryBudgets || []).length) {
          const nextFin: FinanceState = { ...prevFin, categoryBudgets: nextBudgets };
          await persistFinanceLocalAndCloud(nextFin);
        }
      }
      return null;
    },
    [persistCategoriesLocalAndCloud, persistFinanceLocalAndCloud],
  );

  const resetCategoriesToDefault = useCallback(
    async (kind?: CategoryKind) => {
      if (!requireAuthToSave('reset categories')) return;
      const defaults = defaultCategories();
      const next: CategoriesState = kind
        ? { ...categoriesRef.current, [kind]: defaults[kind] }
        : defaults;
      setCategoriesState(next);
      await persistCategoriesLocalAndCloud(next);
    },
    [persistCategoriesLocalAndCloud],
  );


  const setActiveBookId = useCallback(
    async (id: string) => {
      const book = cashBooksRef.current.books.find((b) => b.id === id);
      if (!book || book.archived) return;
      const next = { ...cashBooksRef.current, activeBookId: id };
      await persistCashBooksLocalAndCloud(next);
    },
    [persistCashBooksLocalAndCloud],
  );

  const createCashBook = useCallback(
    async (input: { name: string; icon?: string }) => {
      if (!requireAuthToSave('create a cash book')) return 'Sign in required';
      const name = input.name.trim();
      if (!name) return 'Name is required';
      const book: CashBook = {
        id: uid(),
        name,
        icon: input.icon || '📒',
        archived: false,
        finance: defaultCashBooks(config.currency).books[0].finance,
      };
      const next: CashBooksState = {
        books: [...cashBooksRef.current.books, book],
        activeBookId: book.id,
      };
      await persistCashBooksLocalAndCloud(next);
      return null;
    },
    [config.currency, persistCashBooksLocalAndCloud],
  );

  const renameCashBook = useCallback(
    async (id: string, name: string) => {
      if (!requireAuthToSave('rename a cash book')) return 'Sign in required';
      const trimmed = name.trim();
      if (!trimmed) return 'Name is required';
      if (!cashBooksRef.current.books.some((b) => b.id === id)) return 'Book not found';
      const next: CashBooksState = {
        ...cashBooksRef.current,
        books: cashBooksRef.current.books.map((b) => (b.id === id ? { ...b, name: trimmed } : b)),
      };
      await persistCashBooksLocalAndCloud(next);
      return null;
    },
    [persistCashBooksLocalAndCloud],
  );

  const setCashBookIcon = useCallback(
    async (id: string, icon: string) => {
      if (!requireAuthToSave('update a cash book')) return;
      const next: CashBooksState = {
        ...cashBooksRef.current,
        books: cashBooksRef.current.books.map((b) => (b.id === id ? { ...b, icon } : b)),
      };
      await persistCashBooksLocalAndCloud(next);
    },
    [persistCashBooksLocalAndCloud],
  );

  const setCashBookArchived = useCallback(
    async (id: string, archived: boolean) => {
      if (!requireAuthToSave('update a cash book')) return 'Sign in required';
      const books = cashBooksRef.current.books;
      const target = books.find((b) => b.id === id);
      if (!target) return 'Book not found';
      if (archived) {
        const remaining = books.filter((b) => b.id !== id && !b.archived);
        if (remaining.length === 0) return 'Keep at least one active cash book';
        const nextActive =
          cashBooksRef.current.activeBookId === id ? remaining[0].id : cashBooksRef.current.activeBookId;
        const next: CashBooksState = {
          activeBookId: nextActive,
          books: books.map((b) => (b.id === id ? { ...b, archived: true } : b)),
        };
        await persistCashBooksLocalAndCloud(next);
        return null;
      }
      const next: CashBooksState = {
        ...cashBooksRef.current,
        books: books.map((b) => (b.id === id ? { ...b, archived: false } : b)),
      };
      await persistCashBooksLocalAndCloud(next);
      return null;
    },
    [persistCashBooksLocalAndCloud],
  );

  const deleteCashBook = useCallback(
    async (id: string) => {
      if (!requireAuthToSave('delete a cash book')) return 'Sign in required';
      const books = cashBooksRef.current.books;
      if (books.length <= 1) return 'Keep at least one cash book';
      const remaining = books.filter((b) => b.id !== id);
      if (!remaining.length) return 'Keep at least one cash book';
      const active = remaining.find((b) => !b.archived) || remaining[0];
      const next: CashBooksState = {
        books: remaining,
        activeBookId:
          cashBooksRef.current.activeBookId === id ? active.id : cashBooksRef.current.activeBookId,
      };
      if (!remaining.some((b) => b.id === next.activeBookId)) {
        next.activeBookId = active.id;
      }
      await persistCashBooksLocalAndCloud(next);
      return null;
    },
    [persistCashBooksLocalAndCloud],
  );

  const exportBackup = useCallback(() => {
    return JSON.stringify(
      {
        config,
        cashBooks,
        financeState: finance,
        expenseReminders,
        medReminders,
        groceryReminders,
        shoppingList,
        generalReminders,
        categories,
        exportedAt: new Date().toISOString(),
      },
      null,
      2,
    );
  }, [config, cashBooks, finance, expenseReminders, medReminders, groceryReminders, shoppingList, generalReminders, categories]);

  const importBackup = useCallback(async (json: string) => {
    if (!requireAdminToChangeSettings('import backup data')) return false;
    try {
      const data = JSON.parse(json);
      if (data.config) {
        const nextConfig = mergeConfig(data.config);
        setConfig(nextConfig);
        await persist(STORAGE_KEYS.config, nextConfig);
      }
      if (data.cashBooks || data.financeState) {
        const nextBooks = normalizeCashBooks(data.cashBooks || data.financeState, config.currency);
        await persistCashBooksLocalAndCloud(nextBooks);
      }
      if (data.expenseReminders) {
        setExpenseRemindersState(data.expenseReminders);
        await persistRemindersLocalAndCloud({ expense: data.expenseReminders });
      }
      if (data.medReminders) {
        setMedRemindersState(data.medReminders);
        await persistRemindersLocalAndCloud({ medicine: data.medReminders });
      }
      if (data.groceryReminders) {
        setGroceryRemindersState(data.groceryReminders);
        await persistRemindersLocalAndCloud({ grocery: data.groceryReminders });
      }
      if (data.shoppingList) {
        setShoppingListState(data.shoppingList);
        await persistRemindersLocalAndCloud({ shopping: data.shoppingList });
      }
      if (data.generalReminders) {
        setGeneralRemindersState(data.generalReminders);
        await persistRemindersLocalAndCloud({ general: data.generalReminders });
      }
      if (data.categories) {
        const nextCats: CategoriesState = {
          expense: Array.isArray(data.categories.expense)
            ? data.categories.expense
            : defaultCategories().expense,
          income: Array.isArray(data.categories.income)
            ? data.categories.income
            : defaultCategories().income,
        };
        setCategoriesState(nextCats);
        await persistCategoriesLocalAndCloud(nextCats);
      }
      return true;
    } catch {
      return false;
    }
  }, [config.currency, persistCashBooksLocalAndCloud, persistRemindersLocalAndCloud, persistCategoriesLocalAndCloud]);

  const resetAll = useCallback(async () => {
    if (!requireAdminToChangeSettings('delete all data')) return;
    const nextBooks = defaultCashBooks(config.currency);
    const nextCats = defaultCategories();
    setExpenseRemindersState([]);
    setMedRemindersState([]);
    setGroceryRemindersState([]);
    setShoppingListState([]);
    setGeneralRemindersState([]);
    setCategoriesState(nextCats);
    await clearAllData();
    await persist(STORAGE_KEYS.config, config);
    await persistCashBooksLocalAndCloud(nextBooks);
    await persistRemindersLocalAndCloud({
      expense: [],
      medicine: [],
      grocery: [],
      general: [],
      shopping: [],
    });
    await persistCategoriesLocalAndCloud(nextCats);
  }, [config, persistCashBooksLocalAndCloud, persistRemindersLocalAndCloud, persistCategoriesLocalAndCloud]);

  const value = useMemo(
    () => ({
      ready: ready && cloudReady,
      config,
      theme,
      finance,
      cashBooks,
      activeBook,
      setActiveBookId,
      createCashBook,
      renameCashBook,
      setCashBookIcon,
      setCashBookArchived,
      deleteCashBook,
      expenseReminders,
      medReminders,
      groceryReminders,
      shoppingList,
      generalReminders,
      expenseCategories: categories.expense,
      incomeCategories: categories.income,
      catMeta: catMetaFn,
      addCategory,
      updateCategory,
      deleteCategory,
      resetCategoriesToDefault,
      adminAuthed,
      setAdminAuthed,
      updateConfig,
      setCurrency,
      setTheme,
      setHomePrefs,
      resetHomePrefsToDefaults,
      setFinance,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      upsertAccount,
      deleteAccount,
      setDefaultAccountId,
      setBudget,
      setCategoryBudget,
      removeCategoryBudget,
      setExpenseReminders,
      setMedReminders,
      setGroceryReminders,
      setShoppingList,
      setGeneralReminders,
      exportBackup,
      importBackup,
      resetAll,
    }),
    [
      ready,
      cloudReady,
      config,
      theme,
      finance,
      cashBooks,
      activeBook,
      setActiveBookId,
      createCashBook,
      renameCashBook,
      setCashBookIcon,
      setCashBookArchived,
      deleteCashBook,
      expenseReminders,
      medReminders,
      groceryReminders,
      shoppingList,
      generalReminders,
      categories,
      catMetaFn,
      addCategory,
      updateCategory,
      deleteCategory,
      resetCategoriesToDefault,
      adminAuthed,
      updateConfig,
      setCurrency,
      setTheme,
      setHomePrefs,
      resetHomePrefsToDefaults,
      setFinance,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      upsertAccount,
      deleteAccount,
      setDefaultAccountId,
      setBudget,
      setCategoryBudget,
      removeCategoryBudget,
      setExpenseReminders,
      setMedReminders,
      setGroceryReminders,
      setShoppingList,
      setGeneralReminders,
      exportBackup,
      importBackup,
      resetAll,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
