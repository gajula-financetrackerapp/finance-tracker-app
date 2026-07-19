/**
 * AppContext — single source of truth for the entire app.
 *
 * What lives here
 * ───────────────
 * • config      — theme, currency, admin settings (synced to Supabase user_config)
 * • finance     — accounts, transactions, budget
 * • reminders   — expense/bill, medicine, grocery
 * • buyList     — items to buy (syncs warning with groceryReminders)
 *
 * Data flow
 * ─────────
 * 1. On auth → loadAllData() pulls everything from Supabase.
 * 2. Every mutation calls both the local setter AND the DB function.
 * 3. Notification ids are stored on each reminder so they can be
 *    cancelled/rescheduled on edit.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from 'react';
import { onAuthStateChanged } from '../services/auth';
import {
  getConfig,
  saveConfig,
  getAccounts,
  saveAccount,
  updateAccount,
  deleteAccount,
  getTransactions,
  saveTransaction,
  updateTransaction,
  deleteTransaction,
  getExpenseReminders,
  saveExpenseReminder,
  updateExpenseReminder,
  deleteExpenseReminder,
  getMedReminders,
  saveMedReminder,
  updateMedReminder,
  deleteMedReminder,
  getGroceryReminders,
  saveGroceryReminder,
  updateGroceryReminder,
  deleteGroceryReminder,
  getBuyList,
  saveBuyListItem,
  updateBuyListItem,
  deleteBuyListItem,
} from '../services/database';
import {
  scheduleExpenseReminder,
  scheduleMedicineReminders,
  scheduleGroceryReminder,
  cancelAllForReminder,
} from '../services/notifications';

// ─── Default config ───────────────────────────────────────────────────────────

export const DEFAULT_CONFIG = {
  theme: 'yellow',
  currency: 'USD',
  adminPassword: '',
  alarmsEnabled: true,
  medicineTimes: {
    morning: '08:00',
    afternoon: '13:00',
    evening: '19:00',
  },
  alertTime: '09:00', // default alert time for expense + grocery reminders
  features: {
    finance: true,
    expenseReminders: true,
    medReminders: true,
    groceryReminders: true,
    buyList: true,
  },
  budget: {
    period: 'monthly',
    amount: 0,
    categories: {}, // { categoryId: amount }
  },
};

// ─── Initial state ────────────────────────────────────────────────────────────

const INITIAL_STATE = {
  // Auth
  user: null,
  authLoading: true,

  // App-level config
  config: DEFAULT_CONFIG,

  // Finance
  accounts: [],
  transactions: [],

  // Reminders
  expenseReminders: [],
  medReminders: [],
  groceryReminders: [],

  // List to Buy
  buyList: [],

  // Loading / error
  loading: false,
  error: null,
};

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state, action) {
  switch (action.type) {
    // Auth
    case 'SET_USER':
      return { ...state, user: action.payload, authLoading: false };
    case 'AUTH_RESOLVED':
      return { ...state, authLoading: false };

    // Config
    case 'SET_CONFIG':
      return { ...state, config: { ...state.config, ...action.payload } };

    // Loading / error
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };

    // Accounts
    case 'SET_ACCOUNTS':
      return { ...state, accounts: action.payload };
    case 'ADD_ACCOUNT':
      return { ...state, accounts: [action.payload, ...state.accounts] };
    case 'UPDATE_ACCOUNT':
      return {
        ...state,
        accounts: state.accounts.map((a) =>
          a.id === action.payload.id ? { ...a, ...action.payload } : a
        ),
      };
    case 'DELETE_ACCOUNT':
      return {
        ...state,
        accounts: state.accounts.filter((a) => a.id !== action.payload),
      };

    // Transactions
    case 'SET_TRANSACTIONS':
      return { ...state, transactions: action.payload };
    case 'ADD_TRANSACTION':
      return { ...state, transactions: [action.payload, ...state.transactions] };
    case 'UPDATE_TRANSACTION':
      return {
        ...state,
        transactions: state.transactions.map((t) =>
          t.id === action.payload.id ? { ...t, ...action.payload } : t
        ),
      };
    case 'DELETE_TRANSACTION':
      return {
        ...state,
        transactions: state.transactions.filter((t) => t.id !== action.payload),
      };

    // Expense reminders
    case 'SET_EXPENSE_REMINDERS':
      return { ...state, expenseReminders: action.payload };
    case 'ADD_EXPENSE_REMINDER':
      return { ...state, expenseReminders: [action.payload, ...state.expenseReminders] };
    case 'UPDATE_EXPENSE_REMINDER':
      return {
        ...state,
        expenseReminders: state.expenseReminders.map((r) =>
          r.id === action.payload.id ? { ...r, ...action.payload } : r
        ),
      };
    case 'DELETE_EXPENSE_REMINDER':
      return {
        ...state,
        expenseReminders: state.expenseReminders.filter((r) => r.id !== action.payload),
      };

    // Med reminders
    case 'SET_MED_REMINDERS':
      return { ...state, medReminders: action.payload };
    case 'ADD_MED_REMINDER':
      return { ...state, medReminders: [action.payload, ...state.medReminders] };
    case 'UPDATE_MED_REMINDER':
      return {
        ...state,
        medReminders: state.medReminders.map((r) =>
          r.id === action.payload.id ? { ...r, ...action.payload } : r
        ),
      };
    case 'DELETE_MED_REMINDER':
      return {
        ...state,
        medReminders: state.medReminders.filter((r) => r.id !== action.payload),
      };

    // Grocery reminders
    case 'SET_GROCERY_REMINDERS':
      return { ...state, groceryReminders: action.payload };
    case 'ADD_GROCERY_REMINDER':
      return { ...state, groceryReminders: [action.payload, ...state.groceryReminders] };
    case 'UPDATE_GROCERY_REMINDER':
      return {
        ...state,
        groceryReminders: state.groceryReminders.map((r) =>
          r.id === action.payload.id ? { ...r, ...action.payload } : r
        ),
      };
    case 'DELETE_GROCERY_REMINDER':
      return {
        ...state,
        groceryReminders: state.groceryReminders.filter((r) => r.id !== action.payload),
      };

    // Buy list
    case 'SET_BUY_LIST':
      return { ...state, buyList: action.payload };
    case 'ADD_BUY_ITEM':
      return { ...state, buyList: [...state.buyList, action.payload] };
    case 'UPDATE_BUY_ITEM':
      return {
        ...state,
        buyList: state.buyList.map((i) =>
          i.id === action.payload.id ? { ...i, ...action.payload } : i
        ),
      };
    case 'DELETE_BUY_ITEM':
      return {
        ...state,
        buyList: state.buyList.filter((i) => i.id !== action.payload),
      };

    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  // Keep a ref to current config for use in async callbacks without stale closure
  const configRef = useRef(state.config);
  useEffect(() => {
    configRef.current = state.config;
  }, [state.config]);

  // ── Auth listener ──────────────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(async (_event, session) => {
      const user = session?.user ?? null;
      dispatch({ type: 'SET_USER', payload: user });
      if (user) {
        await loadAllData(user.id);
      } else {
        dispatch({ type: 'AUTH_RESOLVED' });
      }
    });
    return unsubscribe;
  }, []);

  // ── Load all data ──────────────────────────────────────────────────────────
  const loadAllData = useCallback(async (userId) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const [
        { data: cfg },
        { data: accounts },
        { data: transactions },
        { data: expenseReminders },
        { data: medReminders },
        { data: groceryReminders },
        { data: buyList },
      ] = await Promise.all([
        getConfig(userId),
        getAccounts(userId),
        getTransactions(userId),
        getExpenseReminders(userId),
        getMedReminders(userId),
        getGroceryReminders(userId),
        getBuyList(userId),
      ]);

      if (cfg) {
        dispatch({ type: 'SET_CONFIG', payload: cfg });
      }
      dispatch({ type: 'SET_ACCOUNTS', payload: accounts ?? [] });
      dispatch({ type: 'SET_TRANSACTIONS', payload: transactions ?? [] });
      dispatch({ type: 'SET_EXPENSE_REMINDERS', payload: expenseReminders ?? [] });
      dispatch({ type: 'SET_MED_REMINDERS', payload: medReminders ?? [] });
      dispatch({ type: 'SET_GROCERY_REMINDERS', payload: groceryReminders ?? [] });
      dispatch({ type: 'SET_BUY_LIST', payload: buyList ?? [] });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  // ── Config ─────────────────────────────────────────────────────────────────
  const updateConfig = useCallback(
    async (updates) => {
      const merged = { ...configRef.current, ...updates };
      dispatch({ type: 'SET_CONFIG', payload: merged });
      if (state.user) {
        await saveConfig(state.user.id, merged);
      }
    },
    [state.user]
  );

  // ── Accounts ───────────────────────────────────────────────────────────────
  const addAccount = useCallback(
    async (account) => {
      if (!state.user) return;
      const { data, error } = await saveAccount(state.user.id, account);
      if (!error && data) dispatch({ type: 'ADD_ACCOUNT', payload: data });
      return { data, error };
    },
    [state.user]
  );

  const editAccount = useCallback(
    async (accountId, updates) => {
      if (!state.user) return;
      const { data, error } = await updateAccount(state.user.id, accountId, updates);
      if (!error && data) dispatch({ type: 'UPDATE_ACCOUNT', payload: data });
      return { data, error };
    },
    [state.user]
  );

  const removeAccount = useCallback(
    async (accountId) => {
      if (!state.user) return;
      const { error } = await deleteAccount(state.user.id, accountId);
      if (!error) dispatch({ type: 'DELETE_ACCOUNT', payload: accountId });
      return { error };
    },
    [state.user]
  );

  // ── Transactions ───────────────────────────────────────────────────────────
  const addTransaction = useCallback(
    async (transaction) => {
      if (!state.user) return;
      const { data, error } = await saveTransaction(state.user.id, transaction);
      if (!error && data) dispatch({ type: 'ADD_TRANSACTION', payload: data });
      return { data, error };
    },
    [state.user]
  );

  const editTransaction = useCallback(
    async (transactionId, updates) => {
      if (!state.user) return;
      const { data, error } = await updateTransaction(state.user.id, transactionId, updates);
      if (!error && data) dispatch({ type: 'UPDATE_TRANSACTION', payload: data });
      return { data, error };
    },
    [state.user]
  );

  const removeTransaction = useCallback(
    async (transactionId) => {
      if (!state.user) return;
      const { error } = await deleteTransaction(state.user.id, transactionId);
      if (!error) dispatch({ type: 'DELETE_TRANSACTION', payload: transactionId });
      return { error };
    },
    [state.user]
  );

  // ── Expense Reminders ──────────────────────────────────────────────────────
  const addExpenseReminder = useCallback(
    async (reminder) => {
      if (!state.user) return;
      // Schedule notifications first to get ids
      const notifIds = await scheduleExpenseReminder(reminder, configRef.current);
      const full = { ...reminder, notifIds };
      const { data, error } = await saveExpenseReminder(state.user.id, full);
      if (!error && data) dispatch({ type: 'ADD_EXPENSE_REMINDER', payload: data });
      return { data, error };
    },
    [state.user]
  );

  const editExpenseReminder = useCallback(
    async (reminderId, updates) => {
      if (!state.user) return;
      // Cancel old notifications
      const existing = state.expenseReminders.find((r) => r.id === reminderId);
      if (existing?.notifIds) await cancelAllForReminder(existing.notifIds);
      // Re-schedule with merged data
      const merged = { ...(existing ?? {}), ...updates };
      const notifIds = await scheduleExpenseReminder(merged, configRef.current);
      const finalUpdates = { ...updates, notifIds };
      const { data, error } = await updateExpenseReminder(state.user.id, reminderId, finalUpdates);
      if (!error) dispatch({ type: 'UPDATE_EXPENSE_REMINDER', payload: { id: reminderId, ...finalUpdates } });
      return { data, error };
    },
    [state.user, state.expenseReminders]
  );

  const removeExpenseReminder = useCallback(
    async (reminderId) => {
      if (!state.user) return;
      const existing = state.expenseReminders.find((r) => r.id === reminderId);
      if (existing?.notifIds) await cancelAllForReminder(existing.notifIds);
      const { error } = await deleteExpenseReminder(state.user.id, reminderId);
      if (!error) dispatch({ type: 'DELETE_EXPENSE_REMINDER', payload: reminderId });
      return { error };
    },
    [state.user, state.expenseReminders]
  );

  // ── Med Reminders ──────────────────────────────────────────────────────────
  const addMedReminder = useCallback(
    async (reminder) => {
      if (!state.user) return;
      const notifIds = await scheduleMedicineReminders(reminder, configRef.current);
      const full = { ...reminder, notifIds };
      const { data, error } = await saveMedReminder(state.user.id, full);
      if (!error && data) dispatch({ type: 'ADD_MED_REMINDER', payload: data });
      return { data, error };
    },
    [state.user]
  );

  const editMedReminder = useCallback(
    async (reminderId, updates) => {
      if (!state.user) return;
      const existing = state.medReminders.find((r) => r.id === reminderId);
      if (existing?.notifIds) await cancelAllForReminder(existing.notifIds);
      const merged = { ...(existing ?? {}), ...updates };
      const notifIds = await scheduleMedicineReminders(merged, configRef.current);
      const finalUpdates = { ...updates, notifIds };
      const { data, error } = await updateMedReminder(state.user.id, reminderId, finalUpdates);
      if (!error) dispatch({ type: 'UPDATE_MED_REMINDER', payload: { id: reminderId, ...finalUpdates } });
      return { data, error };
    },
    [state.user, state.medReminders]
  );

  const removeMedReminder = useCallback(
    async (reminderId) => {
      if (!state.user) return;
      const existing = state.medReminders.find((r) => r.id === reminderId);
      if (existing?.notifIds) await cancelAllForReminder(existing.notifIds);
      const { error } = await deleteMedReminder(state.user.id, reminderId);
      if (!error) dispatch({ type: 'DELETE_MED_REMINDER', payload: reminderId });
      return { error };
    },
    [state.user, state.medReminders]
  );

  // ── Grocery Reminders ──────────────────────────────────────────────────────
  const addGroceryReminder = useCallback(
    async (reminder) => {
      if (!state.user) return;
      const notifIds = await scheduleGroceryReminder(reminder, configRef.current);
      const full = { ...reminder, notifIds };
      const { data, error } = await saveGroceryReminder(state.user.id, full);
      if (!error && data) dispatch({ type: 'ADD_GROCERY_REMINDER', payload: data });
      return { data, error };
    },
    [state.user]
  );

  const editGroceryReminder = useCallback(
    async (reminderId, updates) => {
      if (!state.user) return;
      const existing = state.groceryReminders.find((r) => r.id === reminderId);
      if (existing?.notifIds) await cancelAllForReminder(existing.notifIds);
      const merged = { ...(existing ?? {}), ...updates };
      const notifIds = await scheduleGroceryReminder(merged, configRef.current);
      const finalUpdates = { ...updates, notifIds };
      const { data, error } = await updateGroceryReminder(state.user.id, reminderId, finalUpdates);
      if (!error) dispatch({ type: 'UPDATE_GROCERY_REMINDER', payload: { id: reminderId, ...finalUpdates } });
      return { data, error };
    },
    [state.user, state.groceryReminders]
  );

  const removeGroceryReminder = useCallback(
    async (reminderId) => {
      if (!state.user) return;
      const existing = state.groceryReminders.find((r) => r.id === reminderId);
      if (existing?.notifIds) await cancelAllForReminder(existing.notifIds);
      const { error } = await deleteGroceryReminder(state.user.id, reminderId);
      if (!error) dispatch({ type: 'DELETE_GROCERY_REMINDER', payload: reminderId });
      return { error };
    },
    [state.user, state.groceryReminders]
  );

  // ── Buy List ───────────────────────────────────────────────────────────────

  /**
   * Returns the grocery reminder (if any) that matches the buy list item name.
   * Used to warn the user when they add an item already in the grocery reminder list.
   */
  const findDuplicateInGrocery = useCallback(
    (itemName) => {
      const needle = itemName.trim().toLowerCase();
      return state.groceryReminders.find(
        (g) => g.name && g.name.trim().toLowerCase() === needle
      ) ?? null;
    },
    [state.groceryReminders]
  );

  const addBuyItem = useCallback(
    async (item) => {
      if (!state.user) return;
      const { data, error } = await saveBuyListItem(state.user.id, item);
      if (!error && data) dispatch({ type: 'ADD_BUY_ITEM', payload: data });
      return { data, error };
    },
    [state.user]
  );

  const editBuyItem = useCallback(
    async (itemId, updates) => {
      if (!state.user) return;
      const { data, error } = await updateBuyListItem(state.user.id, itemId, updates);
      if (!error) dispatch({ type: 'UPDATE_BUY_ITEM', payload: { id: itemId, ...updates } });
      return { data, error };
    },
    [state.user]
  );

  const toggleBuyItem = useCallback(
    async (itemId) => {
      if (!state.user) return;
      const item = state.buyList.find((i) => i.id === itemId);
      if (!item) return;
      return editBuyItem(itemId, { bought: !item.bought });
    },
    [state.user, state.buyList, editBuyItem]
  );

  const removeBuyItem = useCallback(
    async (itemId) => {
      if (!state.user) return;
      const { error } = await deleteBuyListItem(state.user.id, itemId);
      if (!error) dispatch({ type: 'DELETE_BUY_ITEM', payload: itemId });
      return { error };
    },
    [state.user]
  );

  // ── Derived helpers ────────────────────────────────────────────────────────

  /** Total balance across all accounts */
  const totalBalance = state.accounts.reduce((sum, a) => sum + (a.balance ?? 0), 0);

  /** Income and expense totals for the current month */
  const currentMonthTotals = (() => {
    const now = new Date();
    const y = now.getFullYear();
    const mo = now.getMonth();
    let income = 0;
    let expense = 0;
    for (const t of state.transactions) {
      const d = new Date(t.date);
      if (d.getFullYear() === y && d.getMonth() === mo) {
        if (t.type === 'income') income += t.amount ?? 0;
        else if (t.type === 'expense') expense += t.amount ?? 0;
      }
    }
    return { income, expense, net: income - expense };
  })();

  // ── Context value ──────────────────────────────────────────────────────────
  const value = {
    // State
    ...state,

    // Derived
    totalBalance,
    currentMonthTotals,

    // Config
    updateConfig,

    // Accounts
    addAccount,
    editAccount,
    removeAccount,

    // Transactions
    addTransaction,
    editTransaction,
    removeTransaction,

    // Expense reminders
    addExpenseReminder,
    editExpenseReminder,
    removeExpenseReminder,

    // Med reminders
    addMedReminder,
    editMedReminder,
    removeMedReminder,

    // Grocery reminders
    addGroceryReminder,
    editGroceryReminder,
    removeGroceryReminder,

    // Buy list
    findDuplicateInGrocery,
    addBuyItem,
    editBuyItem,
    toggleBuyItem,
    removeBuyItem,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useAppContext must be used inside <AppProvider>');
  }
  return ctx;
}
