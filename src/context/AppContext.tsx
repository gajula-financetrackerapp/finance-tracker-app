import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { STORAGE_KEYS, THEMES } from '../constants';
import {
  AppConfig,
  ExpenseReminder,
  FinanceState,
  GeneralReminder,
  GroceryReminder,
  MedReminder,
  ShoppingItem,
  ThemeTokens,
  Transaction,
  Account,
} from '../types';
import { clearAllData, defaultFinance, loadAll, mergeConfig, persist } from '../storage';
import { uid } from '../utils';
import { requireAuthToSave, requireAdminToChangeSettings } from '../authGate';

type AppContextValue = {
  ready: boolean;
  config: AppConfig;
  theme: ThemeTokens;
  finance: FinanceState;
  expenseReminders: ExpenseReminder[];
  medReminders: MedReminder[];
  groceryReminders: GroceryReminder[];
  shoppingList: ShoppingItem[];
  generalReminders: GeneralReminder[];
  adminAuthed: boolean;
  setAdminAuthed: (v: boolean) => void;
  updateConfig: (patch: Partial<AppConfig>) => Promise<void>;
  setCurrency: (code: string) => Promise<void>;
  setFinance: (next: FinanceState) => Promise<void>;
  addTransaction: (txn: Omit<Transaction, 'id'> & { id?: string }) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  upsertAccount: (account: Account) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
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
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<AppConfig>(mergeConfig(null));
  const [finance, setFinanceState] = useState<FinanceState>(defaultFinance());
  const [expenseReminders, setExpenseRemindersState] = useState<ExpenseReminder[]>([]);
  const [medReminders, setMedRemindersState] = useState<MedReminder[]>([]);
  const [groceryReminders, setGroceryRemindersState] = useState<GroceryReminder[]>([]);
  const [shoppingList, setShoppingListState] = useState<ShoppingItem[]>([]);
  const [generalReminders, setGeneralRemindersState] = useState<GeneralReminder[]>([]);
  const [adminAuthed, setAdminAuthed] = useState(false);

  useEffect(() => {
    (async () => {
      const data = await loadAll();
      setConfig(data.config);
      setFinanceState(data.finance);
      setExpenseRemindersState(data.expenseReminders);
      setMedRemindersState(data.medReminders);
      setGroceryRemindersState(data.groceryReminders);
      setShoppingListState(data.shoppingList);
      setGeneralRemindersState(data.generalReminders);
      setReady(true);
    })();
  }, []);

  const theme = THEMES[config.theme];

  const updateConfig = useCallback(async (patch: Partial<AppConfig>) => {
    if (!requireAdminToChangeSettings('change app settings')) return;
    setConfig((prev) => {
      const next = mergeConfig({ ...prev, ...patch, features: { ...prev.features, ...(patch.features || {}) } });
      void persist(STORAGE_KEYS.config, next);
      return next;
    });
  }, []);

  /** Currency is a personal display preference — available to everyone. */
  const setCurrency = useCallback(async (code: string) => {
    setConfig((prev) => {
      const next = mergeConfig({ ...prev, currency: code });
      void persist(STORAGE_KEYS.config, next);
      return next;
    });
  }, []);

  const setFinance = useCallback(async (next: FinanceState) => {
    if (!requireAuthToSave('save finance data')) return;
    setFinanceState(next);
    await persist(STORAGE_KEYS.finance, next);
  }, []);

  const addTransaction = useCallback(
    async (txn: Omit<Transaction, 'id'> & { id?: string }) => {
      if (!requireAuthToSave('add transactions')) return;
      setFinanceState((prev) => {
        const accounts = [...prev.accounts];
        const amount = Math.abs(txn.amount);
        if (txn.kind === 'expense' && txn.accountId) {
          const i = accounts.findIndex((a) => a.id === txn.accountId);
          if (i >= 0) accounts[i] = { ...accounts[i], amount: accounts[i].amount - amount };
        } else if (txn.kind === 'income' && txn.accountId) {
          const i = accounts.findIndex((a) => a.id === txn.accountId);
          if (i >= 0) accounts[i] = { ...accounts[i], amount: accounts[i].amount + amount };
        } else if (txn.kind === 'transfer' && txn.fromAccountId && txn.toAccountId) {
          const from = accounts.findIndex((a) => a.id === txn.fromAccountId);
          const to = accounts.findIndex((a) => a.id === txn.toAccountId);
          if (from >= 0) accounts[from] = { ...accounts[from], amount: accounts[from].amount - amount };
          if (to >= 0) accounts[to] = { ...accounts[to], amount: accounts[to].amount + amount };
        }
        const { id: providedId, ...rest } = txn;
        const next = {
          ...prev,
          accounts,
          transactions: [{ ...rest, id: providedId || uid(), amount }, ...prev.transactions],
        };
        void persist(STORAGE_KEYS.finance, next);
        return next;
      });
    },
    [],
  );

  const deleteTransaction = useCallback(async (id: string) => {
    if (!requireAuthToSave('delete transactions')) return;
    setFinanceState((prev) => {
      const next = { ...prev, transactions: prev.transactions.filter((t) => t.id !== id) };
      void persist(STORAGE_KEYS.finance, next);
      return next;
    });
  }, []);

  const upsertAccount = useCallback(async (account: Account) => {
    if (!requireAuthToSave('manage accounts')) return;
    setFinanceState((prev) => {
      const exists = prev.accounts.some((a) => a.id === account.id);
      const accounts = exists
        ? prev.accounts.map((a) => (a.id === account.id ? account : a))
        : [...prev.accounts, account];
      const next = { ...prev, accounts };
      void persist(STORAGE_KEYS.finance, next);
      return next;
    });
  }, []);

  const deleteAccount = useCallback(async (id: string) => {
    if (!requireAuthToSave('manage accounts')) return;
    setFinanceState((prev) => {
      if (prev.accounts.length <= 1) {
        Alert.alert('Cannot delete', 'Keep at least one account.');
        return prev;
      }
      const next = {
        ...prev,
        accounts: prev.accounts.filter((a) => a.id !== id),
        transactions: prev.transactions.filter(
          (t) => t.accountId !== id && t.fromAccountId !== id && t.toAccountId !== id,
        ),
      };
      void persist(STORAGE_KEYS.finance, next);
      return next;
    });
  }, []);

  const setBudget = useCallback(async (amount: number) => {
    if (!requireAuthToSave('set a budget')) return;
    setFinanceState((prev) => {
      const next = { ...prev, budget: amount };
      void persist(STORAGE_KEYS.finance, next);
      return next;
    });
  }, []);

  const setCategoryBudget = useCallback(async (month: string, category: string, limit: number) => {
    if (!requireAuthToSave('set a budget')) return;
    setFinanceState((prev) => {
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
      void persist(STORAGE_KEYS.finance, next);
      return next;
    });
  }, []);

  const removeCategoryBudget = useCallback(async (month: string, category: string) => {
    if (!requireAuthToSave('remove a budget')) return;
    setFinanceState((prev) => {
      const budgets = (prev.categoryBudgets || []).filter(
        (b) => !(b.month === month && b.category === category),
      );
      const monthTotal = budgets
        .filter((b) => b.month === month)
        .reduce((s, b) => s + b.limit, 0);
      const next = { ...prev, categoryBudgets: budgets, budget: monthTotal };
      void persist(STORAGE_KEYS.finance, next);
      return next;
    });
  }, []);

  const setExpenseReminders = useCallback(async (items: ExpenseReminder[]) => {
    if (!requireAuthToSave('save reminders')) return;
    setExpenseRemindersState(items);
    await persist(STORAGE_KEYS.expenseReminders, items);
  }, []);

  const setMedReminders = useCallback(async (items: MedReminder[]) => {
    if (!requireAuthToSave('save reminders')) return;
    setMedRemindersState(items);
    await persist(STORAGE_KEYS.medReminders, items);
  }, []);

  const setGroceryReminders = useCallback(async (items: GroceryReminder[]) => {
    if (!requireAuthToSave('save reminders')) return;
    setGroceryRemindersState(items);
    await persist(STORAGE_KEYS.groceryReminders, items);
  }, []);

  const setShoppingList = useCallback(async (items: ShoppingItem[]) => {
    if (!requireAuthToSave('save shopping list')) return;
    setShoppingListState(items);
    await persist(STORAGE_KEYS.shoppingList, items);
  }, []);

  const setGeneralReminders = useCallback(async (items: GeneralReminder[]) => {
    if (!requireAuthToSave('save reminders')) return;
    setGeneralRemindersState(items);
    await persist(STORAGE_KEYS.generalReminders, items);
  }, []);

  const exportBackup = useCallback(() => {
    return JSON.stringify(
      {
        config,
        financeState: finance,
        expenseReminders,
        medReminders,
        groceryReminders,
        shoppingList,
        generalReminders,
        exportedAt: new Date().toISOString(),
      },
      null,
      2,
    );
  }, [config, finance, expenseReminders, medReminders, groceryReminders, shoppingList, generalReminders]);

  const importBackup = useCallback(async (json: string) => {
    if (!requireAdminToChangeSettings('import backup data')) return false;
    try {
      const data = JSON.parse(json);
      if (data.config) {
        const nextConfig = mergeConfig(data.config);
        setConfig(nextConfig);
        await persist(STORAGE_KEYS.config, nextConfig);
      }
      if (data.financeState) {
        const nextFinance = data.financeState as FinanceState;
        nextFinance.accounts = Array.isArray(nextFinance.accounts) ? nextFinance.accounts : defaultFinance().accounts;
        nextFinance.transactions = Array.isArray(nextFinance.transactions) ? nextFinance.transactions : [];
        setFinanceState(nextFinance);
        await persist(STORAGE_KEYS.finance, nextFinance);
      }
      if (data.expenseReminders) {
        setExpenseRemindersState(data.expenseReminders);
        await persist(STORAGE_KEYS.expenseReminders, data.expenseReminders);
      }
      if (data.medReminders) {
        setMedRemindersState(data.medReminders);
        await persist(STORAGE_KEYS.medReminders, data.medReminders);
      }
      if (data.groceryReminders) {
        setGroceryRemindersState(data.groceryReminders);
        await persist(STORAGE_KEYS.groceryReminders, data.groceryReminders);
      }
      if (data.shoppingList) {
        setShoppingListState(data.shoppingList);
        await persist(STORAGE_KEYS.shoppingList, data.shoppingList);
      }
      if (data.generalReminders) {
        setGeneralRemindersState(data.generalReminders);
        await persist(STORAGE_KEYS.generalReminders, data.generalReminders);
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  const resetAll = useCallback(async () => {
    if (!requireAdminToChangeSettings('delete all data')) return;
    const nextFinance = defaultFinance(config.currency);
    setFinanceState(nextFinance);
    setExpenseRemindersState([]);
    setMedRemindersState([]);
    setGroceryRemindersState([]);
    setShoppingListState([]);
    setGeneralRemindersState([]);
    await clearAllData();
    await persist(STORAGE_KEYS.config, config);
    await persist(STORAGE_KEYS.finance, nextFinance);
  }, [config]);

  const value = useMemo(
    () => ({
      ready,
      config,
      theme,
      finance,
      expenseReminders,
      medReminders,
      groceryReminders,
      shoppingList,
      generalReminders,
      adminAuthed,
      setAdminAuthed,
      updateConfig,
      setCurrency,
      setFinance,
      addTransaction,
      deleteTransaction,
      upsertAccount,
      deleteAccount,
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
      config,
      theme,
      finance,
      expenseReminders,
      medReminders,
      groceryReminders,
      shoppingList,
      generalReminders,
      adminAuthed,
      updateConfig,
      setCurrency,
      setFinance,
      addTransaction,
      deleteTransaction,
      upsertAccount,
      deleteAccount,
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
