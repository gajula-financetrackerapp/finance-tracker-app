import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  resolveDefaultAccountId,
  withActiveFinance,
} from '../cashBooks';
import { uid } from '../utils';
import { requireAuthToSave, requireAdminToChangeSettings } from '../authGate';
import { showAppInfo } from '../appDialog';
import { syncAccountAmounts } from '../utils/accountBalance';
import { canUseTheme, firstAllowedTheme, mergeThemeCatalog } from '../utils/themeAccess';
import {
  canUseAvatarStyle,
  DEFAULT_AVATAR_STYLE,
  type AvatarStyleId,
} from '../data/avatars';
import { useFinance } from '../FinanceContext';
import {
  pullUserData,
  pushCategories,
  pushFinance,
  pushReminders,
  schedulePushCategories,
  schedulePushFinance,
  schedulePushReminders,
  setCloudSyncGate,
  deleteCloudUserData,
  mergeCloudIntoLocalBooks,
} from '../lib/cloudSync';
import type { CloudReminders } from '../lib/cloudSync';
import { fetchPremiumProfile, setPremiumStatusRemote } from '../lib/premium';
import {
  findCategoryMeta,
  type CategoryDef,
  type CategoryKind,
} from '../categories/defaults';
import { PALETTE } from '../constants';

export type DeleteDataScope = 'local' | 'cloud' | 'both';

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
  setTheme: (key: ThemeKey) => Promise<boolean>;
  setAvatarStyle: (id: string) => Promise<void>;
  /** Local Premium Member flag (or admin). Unlocks premium colors + cloud sync. */
  isPremiumMember: boolean;
  /** Server premium_since (ISO); used to sync only post-upgrade data. */
  premiumSince: string | null;
  setPremiumMember: (on: boolean) => Promise<void>;
  setHomePrefs: (patch: Partial<HomePrefs>) => Promise<void>;
  resetHomePrefsToDefaults: () => Promise<void>;
  setFinance: (next: FinanceState) => Promise<void>;
  addTransaction: (txn: Omit<Transaction, 'id'> & { id?: string }) => Promise<void>;
  updateTransaction: (txn: Transaction) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  upsertAccount: (account: Account) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  keepOnlyCashAccount: () => Promise<void>;
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
  /** Wipe data. Free: local. Premium: local | cloud | both. */
  resetAll: (scope?: DeleteDataScope) => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { session, ready: authReady, isAdmin } = useFinance();
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
  const [isPremiumMemberFlag, setIsPremiumMemberState] = useState(false);
  const [premiumSince, setPremiumSince] = useState<string | null>(null);
  /** Admins always get Premium color access + cloud sync. */
  const isPremiumMember = isPremiumMemberFlag || isAdmin;
  const premiumSinceRef = useRef<string | null>(null);
  premiumSinceRef.current = premiumSince;

  const applyPremiumGate = useCallback(
    (premium: boolean, since: string | null) => {
      setCloudSyncGate(premium || isAdmin, since);
    },
    [isAdmin],
  );

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

  /** Refresh Premium entitlement from Supabase (survives reinstall). */
  useEffect(() => {
    if (!ready || !authReady) return;
    if (!userId) {
      setIsPremiumMemberState(false);
      setPremiumSince(null);
      applyPremiumGate(false, null);
      return;
    }
    let cancelled = false;
    (async () => {
      const profile = await fetchPremiumProfile(userId);
      if (cancelled) return;
      const prem = !!profile?.is_premium || isAdmin;
      const since = profile?.premium_since ?? null;
      setIsPremiumMemberState(!!profile?.is_premium);
      setPremiumSince(since);
      applyPremiumGate(prem, since);
      await AsyncStorage.setItem(STORAGE_KEYS.premiumMember, profile?.is_premium ? '1' : '0');
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, authReady, userId, isAdmin, applyPremiumGate]);

  useEffect(() => {
    applyPremiumGate(isPremiumMember, premiumSince);
  }, [isPremiumMember, premiumSince, applyPremiumGate]);

  const currencyRef = useRef(config.currency);
  currencyRef.current = config.currency;

  /**
   * Guests see an empty workspace (never the previous account’s local cache).
   * Free: local only. Premium: hydrate local, then pull/push cloud (post-premium_since).
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

        const profile = await fetchPremiumProfile(userId);
        if (cancelled) return;
        const cloudEnabled = !!profile?.is_premium || isAdmin;
        const since = profile?.premium_since ?? null;
        setIsPremiumMemberState(!!profile?.is_premium);
        setPremiumSince(since);
        applyPremiumGate(cloudEnabled, since);

        if (!cloudEnabled) {
          return;
        }

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
          const mergedRaw = mergeCloudIntoLocalBooks(localBooks, cloud.cashBooks);
          const merged = mergeLocalBillImagesIntoBooks(mergedRaw, localBooks);
          cashBooksRef.current = merged;
          setCashBooksState(merged);
          await persist(STORAGE_KEYS.finance, merged);
        } else if (hasLocalFinance) {
          await pushFinance(userId, localBooks, {
            premiumSince: since,
            uploadImages: true,
          });
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
    };
  }, [
    ready,
    authReady,
    userId,
    isAdmin,
    applyEmptyWorkspace,
    applyLocalWorkspace,
    applyPremiumGate,
  ]);

  const theme = THEMES[config.theme];

  const updateConfig = useCallback(async (patch: Partial<AppConfig>) => {
    if (!requireAdminToChangeSettings('change app settings')) return false;
    setConfig((prev) => {
      const mergedCatalog = patch.themeCatalog
        ? mergeThemeCatalog({
            ...prev.themeCatalog,
            ...patch.themeCatalog,
            access: {
              ...(prev.themeCatalog?.access || {}),
              ...(patch.themeCatalog.access || {}),
            },
          })
        : prev.themeCatalog;
      let nextTheme = patch.theme ?? prev.theme;
      // Admin may set any known color as active. Only auto-fallback when
      // catalog changes make the current color unavailable to this user.
      if (!patch.theme && !canUseTheme(nextTheme, mergedCatalog, isPremiumMember)) {
        nextTheme = firstAllowedTheme(mergedCatalog, isPremiumMember, 'teal');
      }
      const next = mergeConfig({
        ...prev,
        ...patch,
        theme: nextTheme,
        features: { ...prev.features, ...(patch.features || {}) },
        adBanner: patch.adBanner
          ? mergeAdBanner({
              ...prev.adBanner,
              ...patch.adBanner,
              items: patch.adBanner.items ?? prev.adBanner.items,
            })
          : prev.adBanner,
        themeCatalog: mergedCatalog,
      });
      void persist(STORAGE_KEYS.config, next);
      return next;
    });
    return true;
  }, [isPremiumMember]);

  /** Currency is a personal display preference — available to everyone. */
  const setCurrency = useCallback(async (code: string) => {
    setConfig((prev) => {
      const next = mergeConfig({ ...prev, currency: code });
      void persist(STORAGE_KEYS.config, next);
      return next;
    });
  }, []);

  const setAvatarStyle = useCallback(async (id: string) => {
    setConfig((prev) => {
      const next = mergeConfig({ ...prev, avatarStyle: id });
      void persist(STORAGE_KEYS.config, next);
      return next;
    });
  }, []);

  const setPremiumMember = useCallback(async (on: boolean) => {
    // Payments / subscriptions are not live yet. Do not allow self-serve unlock.
    // Admins already receive Premium via role (isAdmin). Real billing will set
    // profiles.is_premium after a successful purchase.
    if (on) {
      showAppInfo(
        'Premium subscription',
        'Paid Premium is coming soon. Unlock will be available only after a successful subscription — not as a free toggle.',
        '👑',
      );
      return;
    }

    const remote = await setPremiumStatusRemote(false);
    const nextFlag = remote ? !!remote.is_premium : false;
    const since = remote?.premium_since ?? premiumSinceRef.current;
    setIsPremiumMemberState(nextFlag);
    setPremiumSince(since);
    applyPremiumGate(false, since);
    await AsyncStorage.setItem(STORAGE_KEYS.premiumMember, '0');
    setConfig((prev) => {
      if (isAdmin) return prev;
      let changed = false;
      let nextTheme = prev.theme;
      let nextAvatar = prev.avatarStyle;
      if (!canUseTheme(prev.theme, prev.themeCatalog, false)) {
        nextTheme = firstAllowedTheme(prev.themeCatalog, false, 'teal');
        changed = true;
      }
      if (!canUseAvatarStyle(nextAvatar as AvatarStyleId, false)) {
        nextAvatar = DEFAULT_AVATAR_STYLE;
        changed = true;
      }
      if (!changed) return prev;
      const next = mergeConfig({ ...prev, theme: nextTheme, avatarStyle: nextAvatar });
      void persist(STORAGE_KEYS.config, next);
      return next;
    });
  }, [isAdmin, applyPremiumGate]);

  const importBackup = useCallback(async (json: string) => {
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

  const resetAll = useCallback(async (scope: DeleteDataScope = 'local') => {
    const uidNow = userIdRef.current;
    if (scope === 'cloud' || scope === 'both') {
      if (uidNow) await deleteCloudUserData(uidNow);
      if (scope === 'cloud') return;
    }

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
    // Persist local empty workspace (cloud push only if Premium gate is on).
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

  /** Theme is a personal display preference — premium themes require Premium (or admin). */
  const setTheme = useCallback(async (key: ThemeKey) => {
    const catalog = config.themeCatalog;
    if (!canUseTheme(key, catalog, isPremiumMember)) {
      showAppInfo(
        'Premium theme',
        'This look is for Premium Members. It unlocks after a paid subscription (coming soon).',
        '👑',
      );
      return false;
    }
    setConfig((prev) => {
      const next = mergeConfig({ ...prev, theme: key });
      void persist(STORAGE_KEYS.config, next);
      return next;
    });
    return true;
  }, [config.themeCatalog, isPremiumMember]);

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

  const addTransaction = useCallback(
    async (txn: Omit<Transaction, 'id'> & { id?: string }) => {
      if (!requireAuthToSave('add transactions')) return;
      updateActiveFinance((prev) => {
        const amount = Math.abs(txn.amount);
        const { id: providedId, ...rest } = txn;
        const accountId =
          rest.kind === 'income' || rest.kind === 'expense'
            ? rest.accountId || resolveDefaultAccountId(prev)
            : rest.accountId;
        const next = {
          ...prev,
          transactions: [
            { ...rest, id: providedId || uid(), amount, accountId },
            ...prev.transactions,
          ],
        };
        return syncAccountAmounts(next);
      });
    },
    [updateActiveFinance],
  );

  const updateTransaction = useCallback(async (txn: Transaction) => {
    if (!requireAuthToSave('edit transactions')) return;
    updateActiveFinance((prev) => {
      const idx = prev.transactions.findIndex((t) => t.id === txn.id);
      if (idx < 0) return prev;
      const amount = Math.abs(txn.amount);
      const accountId =
        txn.kind === 'income' || txn.kind === 'expense'
          ? txn.accountId || resolveDefaultAccountId(prev)
          : txn.accountId;
      const transactions = [...prev.transactions];
      transactions[idx] = { ...txn, amount, accountId };
      return syncAccountAmounts({ ...prev, transactions });
    });
  }, [updateActiveFinance]);

  const deleteTransaction = useCallback(async (id: string) => {
    if (!requireAuthToSave('delete transactions')) return;
    updateActiveFinance((prev) => {
      const old = prev.transactions.find((t) => t.id === id);
      if (!old) return prev;
      return syncAccountAmounts({
        ...prev,
        transactions: prev.transactions.filter((t) => t.id !== id),
      });
    });
  }, [updateActiveFinance]);

  const upsertAccount = useCallback(async (account: Account) => {
    if (!requireAuthToSave('manage accounts')) return;
    updateActiveFinance((prev) => {
      const existing = prev.accounts.find((a) => a.id === account.id);
      const opening =
        typeof account.openingBalance === 'number' && !Number.isNaN(account.openingBalance)
          ? account.openingBalance
          : typeof existing?.openingBalance === 'number'
            ? existing.openingBalance
            : Number(account.amount) || 0;
      const nextAccount: Account = {
        ...existing,
        ...account,
        openingBalance: opening,
        amount: opening, // live amount refreshed below
      };
      const exists = !!existing;
      const accounts = exists
        ? prev.accounts.map((a) => (a.id === nextAccount.id ? nextAccount : a))
        : [...prev.accounts, nextAccount];
      const defaultAccountId =
        prev.defaultAccountId && accounts.some((a) => a.id === prev.defaultAccountId)
          ? prev.defaultAccountId
          : nextAccount.id;
      return syncAccountAmounts({ ...prev, accounts, defaultAccountId });
    });
  }, [updateActiveFinance]);

  const deleteAccount = useCallback(async (id: string) => {
    if (!requireAuthToSave('manage accounts')) return;
    const prev = getActiveFinance(cashBooksRef.current);
    const removed = prev.accounts.find((a) => a.id === id);
    if (removed?.name.trim().toLowerCase() === 'cash') {
      showAppInfo(
        'Keep Cash',
        'Cash is the default account and can’t be deleted.',
        'ℹ️',
      );
      return;
    }
    if (removed?.name.trim().toLowerCase() === 'bank') {
      showAppInfo(
        'Keep Bank',
        'Bank is kept so you can choose it in Received in / Paid with. Add other accounts for cards or wallets.',
        'ℹ️',
      );
      return;
    }
    if (prev.accounts.length <= 1) {
      showAppInfo(
        'Need at least one account',
        'Keep at least one account so incomes and expenses have somewhere to go.',
        'ℹ️',
      );
      return;
    }
    const accounts = prev.accounts.filter((a) => a.id !== id);
    const nextDefault =
      prev.defaultAccountId === id
        ? accounts.find((a) => !a.excluded)?.id || accounts[0]?.id
        : prev.defaultAccountId && accounts.some((a) => a.id === prev.defaultAccountId)
          ? prev.defaultAccountId
          : accounts[0]?.id;
    const fallback = nextDefault || accounts[0]?.id;
    if (!fallback) return;

    const keepName = accounts.find((a) => a.id === fallback)?.name || 'another account';
    const movedName = removed?.name || 'that account';

    updateActiveFinance((current) => {
      if (current.accounts.length <= 1 || !current.accounts.some((a) => a.id === id)) {
        return current;
      }
      const nextAccounts = current.accounts.filter((a) => a.id !== id);
      const nextFallback =
        (current.defaultAccountId !== id &&
          nextAccounts.some((a) => a.id === current.defaultAccountId) &&
          current.defaultAccountId) ||
        nextAccounts.find((a) => !a.excluded)?.id ||
        nextAccounts[0]?.id;
      if (!nextFallback) return current;

      const transactions = current.transactions
        .map((t) => {
          if (t.kind === 'transfer') {
            const fromAccountId = t.fromAccountId === id ? nextFallback : t.fromAccountId;
            const toAccountId = t.toAccountId === id ? nextFallback : t.toAccountId;
            if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) {
              return null;
            }
            return { ...t, fromAccountId, toAccountId };
          }
          if (t.accountId === id) {
            return { ...t, accountId: nextFallback };
          }
          return t;
        })
        .filter((t): t is NonNullable<typeof t> => t != null);

      return syncAccountAmounts({
        ...current,
        accounts: nextAccounts,
        defaultAccountId: nextFallback,
        transactions,
      });
    });

    showAppInfo(
      'Account removed',
      `“${movedName}” was deleted. Your incomes and expenses were kept and moved to “${keepName}”.`,
      'ℹ️',
    );
  }, [updateActiveFinance]);

  /** Remove extra accounts; keep Cash + Bank. Move incomes/expenses onto Cash. */
  const keepOnlyCashAccount = useCallback(async () => {
    if (!requireAuthToSave('manage accounts')) return;
    updateActiveFinance((current) => {
      const currency = current.accounts[0]?.currency || 'INR';
      let cash = current.accounts.find((a) => a.name.trim().toLowerCase() === 'cash');
      let bank = current.accounts.find((a) => a.name.trim().toLowerCase() === 'bank');
      if (!cash) {
        cash = {
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
      if (!bank) {
        bank = {
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
      const keepIds = new Set([cash.id, bank.id]);
      const removeIds = new Set(
        current.accounts.filter((a) => !keepIds.has(a.id)).map((a) => a.id),
      );

      const transactions = current.transactions
        .map((t) => {
          if (t.kind === 'transfer') {
            const fromAccountId =
              t.fromAccountId && removeIds.has(t.fromAccountId) ? cash!.id : t.fromAccountId;
            const toAccountId =
              t.toAccountId && removeIds.has(t.toAccountId) ? cash!.id : t.toAccountId;
            if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) {
              return null;
            }
            return { ...t, fromAccountId, toAccountId };
          }
          if (t.accountId && removeIds.has(t.accountId)) {
            return { ...t, accountId: cash!.id };
          }
          return t;
        })
        .filter((t): t is NonNullable<typeof t> => t != null);

      return syncAccountAmounts({
        ...current,
        accounts: [cash, bank],
        defaultAccountId: cash.id,
        transactions,
      });
    });
    showAppInfo('Done', 'Kept Cash and Bank. Extra accounts were removed.', '💵');
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
      setAvatarStyle,
      isPremiumMember,
      premiumSince,
      setPremiumMember,
      setHomePrefs,
      resetHomePrefsToDefaults,
      setFinance,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      upsertAccount,
      deleteAccount,
      keepOnlyCashAccount,
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
      setAvatarStyle,
      isPremiumMember,
      premiumSince,
      setPremiumMember,
      setHomePrefs,
      resetHomePrefsToDefaults,
      setFinance,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      upsertAccount,
      deleteAccount,
      keepOnlyCashAccount,
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
