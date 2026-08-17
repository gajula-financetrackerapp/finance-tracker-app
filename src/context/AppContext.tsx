import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
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
import { clearAllData, clearUserWorkspaceData, defaultCategories, defaultCashBooks, loadAll, markCategorySeedsApplied, mergeAdBanner, mergeConfig, mergeGoogleAds, mergePremiumPlan, mirrorWorkspaceKeyForUser, persist, readAppliedCategorySeeds, restoreWorkspaceForUser, stashWorkspaceForUser } from '../storage';
import type { CategoriesState } from '../storage';
import { mergeImportRules } from '../lib/importRules';
import {
  cashBooksHaveData,
  consolidateCashBooks,
  CORE_BANK_NAME,
  CORE_CARD_NAME,
  isCoreBankAccount,
  isCoreCardAccount,
  mergeCashIntoBank,
  getActiveBook,
  getActiveFinance,
  mergeCloudIntoLocalBooks,
  mergeLocalBillImagesIntoBooks,
  normalizeCashBooks,
  preferredFinanceBookId,
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
  setBillPathsSyncHandler,
  isCloudSyncEnabled,
  deleteCloudUserData,
} from '../lib/cloudSync';
import type { CloudReminders } from '../lib/cloudSync';
import { uploadBillImageDetailed } from '../lib/billStorage';
import {
  fetchPremiumProfile,
  setPremiumStatusRemote,
  isPremiumCurrentlyActive,
  hasPremiumAccess,
} from '../lib/premium';
import {
  EMPTY_DIAMOND_STATE,
  fetchDiamondState,
  ownsDiamondUnlock,
  purchaseDiamondItem,
  redeemPremiumPass,
  watchAdForDiamonds,
  type DiamondState,
  type DiamondStoreKind,
} from '../lib/diamonds';
import {
  applyReferralCode,
  EMPTY_REFERRAL_STATE,
  fetchReferralState,
  type ReferralState,
} from '../lib/referrals';
import { fetchRemoteAppSettings, pushRemoteAppSettings } from '../lib/appSettings';
import { mergePremiumFeatures, canAccessPremiumFeature } from '../lib/premiumFeatures';
import { plusFeaturesEqual } from '../lib/premiumCart';
import {
  cloudRetentionStartDate,
  inferBackupDateRange,
  mergeCashBooksFromBackup,
  mergeCategoriesFromBackup,
  type ImportBackupOptions,
} from '../lib/backupMerge';
import {
  applyCategorySeeds,
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
  /** Pull Admin Premium price/UPI from Supabase into local config. */
  refreshSharedPremiumPlan: () => Promise<void>;
  /** Re-read profiles.is_premium from cloud (e.g. after admin unlock). */
  refreshPremiumStatus: () => Promise<boolean>;
  setLanguage: (code: string) => Promise<void>;
  setCurrency: (code: string) => Promise<void>;
  setTheme: (key: ThemeKey) => Promise<boolean>;
  setAvatarStyle: (id: string) => Promise<void>;
  /** Immersive button sound + ripple style (Premium-gated). */
  setUiFeedbackStyle: (style: AppConfig['uiFeedbackStyle']) => Promise<void>;
  /** Play feedback tone with ripples (style must still be on). */
  setUiFeedbackSound: (on: boolean) => Promise<void>;
  /** Local Premium Member flag (or admin). Unlocks premium colors + cloud sync. */
  isPremiumMember: boolean;
  /**
   * Paid Premium (or admin) only — a diamond pass does not count. Ads use this
   * so pass holders keep seeing the ads that fund their next pass.
   */
  isAdFreeMember: boolean;
  /** Server premium_since (ISO); used to sync only post-upgrade data. */
  premiumSince: string | null;
  /** Server premium_pass_until (ISO) for Premium bought with diamonds. */
  premiumPassUntil: string | null;
  setPremiumMember: (on: boolean) => Promise<void>;
  /** Diamond balance, daily cap progress, and redeemable passes. */
  diamonds: DiamondState;
  refreshDiamonds: () => Promise<void>;
  /** Play a rewarded ad and credit diamonds only if the reward is earned. */
  earnDiamondsByAd: () => ReturnType<typeof watchAdForDiamonds>;
  /** Spend diamonds on a Premium pass, then re-read entitlement. */
  redeemDiamondPass: (days: number) => ReturnType<typeof redeemPremiumPass>;
  /** Spend diamonds on one avatar / theme, or timed access to a feature. */
  buyDiamondItem: (
    kind: DiamondStoreKind,
    itemId: string,
  ) => ReturnType<typeof purchaseDiamondItem>;
  /** True when this avatar / theme / feature was bought with diamonds. */
  ownsWithDiamonds: (kind: DiamondStoreKind, itemId: string) => boolean;
  /** Own invite code plus how many friends joined and what that paid out. */
  referrals: ReferralState;
  refreshReferrals: () => Promise<void>;
  /** Redeem a friend's code; credits both sides server-side. */
  applyReferral: (code: string) => ReturnType<typeof applyReferralCode>;
  setHomePrefs: (patch: Partial<HomePrefs>) => Promise<void>;
  resetHomePrefsToDefaults: () => Promise<void>;
  setFinance: (next: FinanceState) => Promise<void>;
  addTransaction: (
    txn: Omit<Transaction, 'id'> & { id?: string },
  ) => Promise<{ imageError: string | null; imagePath: string | null }>;
  updateTransaction: (
    txn: Transaction,
  ) => Promise<{ imageError: string | null; imagePath: string | null }>;
  deleteTransaction: (id: string) => Promise<void>;
  upsertAccount: (account: Account) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  keepOnlyCashAccount: () => Promise<void>;
  setDefaultAccountId: (id: string) => Promise<void>;
  setBudget: (amount: number) => Promise<void>;
  setCategoryBudget: (month: string, category: string, limit: number) => Promise<void>;
  removeCategoryBudget: (month: string, category: string) => Promise<void>;
  /** Replace target month’s category budgets with a copy of another month’s. */
  copyCategoryBudgetsFromMonth: (
    fromMonth: string,
    toMonth: string,
  ) => Promise<{ copied: number; error: string | null }>;
  setExpenseReminders: (items: ExpenseReminder[]) => Promise<void>;
  setMedReminders: (items: MedReminder[]) => Promise<void>;
  setGroceryReminders: (items: GroceryReminder[]) => Promise<void>;
  setShoppingList: (items: ShoppingItem[]) => Promise<void>;
  setGeneralReminders: (items: GeneralReminder[]) => Promise<void>;
  exportBackup: () => string;
  importBackup: (json: string, options?: ImportBackupOptions) => Promise<boolean>;
  /** Wipe data. Free: local. Premium: local | cloud | both. */
  resetAll: (scope?: DeleteDataScope) => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { session, ready: authReady, isAdmin } = useFinance();
  const userId = session?.user?.id || null;
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = userId;
  const prevUserIdRef = useRef<string | null>(null);
  const hydratingRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const [config, setConfig] = useState<AppConfig>(mergeConfig(null));
  const configRef = useRef(config);
  configRef.current = config;
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
  const [isPaidPremiumFlag, setIsPaidPremiumState] = useState(false);
  const [premiumSince, setPremiumSince] = useState<string | null>(null);
  const [premiumPassUntil, setPremiumPassUntil] = useState<string | null>(null);
  const [referrals, setReferralsState] = useState<ReferralState>(EMPTY_REFERRAL_STATE);
  const [diamonds, setDiamondsState] = useState<DiamondState>(EMPTY_DIAMOND_STATE);
  const diamondsRef = useRef<DiamondState>(EMPTY_DIAMOND_STATE);
  diamondsRef.current = diamonds;
  const [diamondsLoaded, setDiamondsLoaded] = useState(false);
  /** Admins always get Premium color access + cloud sync. */
  const isPremiumMember = isPremiumMemberFlag || isAdmin;
  const isAdFreeMember = isPaidPremiumFlag || isAdmin;
  const premiumSinceRef = useRef<string | null>(null);
  premiumSinceRef.current = premiumSince;
  const isPremiumMemberRef = useRef(isPremiumMember);
  isPremiumMemberRef.current = isPremiumMember;

  const applyPremiumGate = useCallback(
    (premium: boolean, _since: string | null) => {
      const cloudOk = canAccessPremiumFeature(
        'cloud',
        premium,
        configRef.current?.premiumFeatures || mergePremiumFeatures(null),
        configRef.current?.features,
      );
      // Admins: sync all history. Premium: rolling 2-year cloud window. Free/grace: no sync.
      const retention = isAdmin ? null : cloudOk ? cloudRetentionStartDate(false) : null;
      setCloudSyncGate(cloudOk, retention);
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
      const currency = data.config?.currency || 'INR';
      const consolidated = consolidateCashBooks(data.cashBooks, currency);
      cashBooksRef.current = consolidated;
      setCashBooksState(consolidated);
      // Persist merge of duplicate Personal books created by older sync bugs.
      if (
        consolidated.books.length !== data.cashBooks.books.length ||
        consolidated.activeBookId !== data.cashBooks.activeBookId ||
        consolidated.books.some((b, i) => b.id !== data.cashBooks.books[i]?.id)
      ) {
        void persist(STORAGE_KEYS.finance, consolidated);
        const uidNow = userIdRef.current;
        if (uidNow) void mirrorWorkspaceKeyForUser(STORAGE_KEYS.finance, uidNow);
      }
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
    await mirrorWorkspaceKeyForUser(STORAGE_KEYS.finance, uidNow);
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
    await mirrorWorkspaceKeyForUser(STORAGE_KEYS.categories, uidNow);
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
      const uidNow = userIdRef.current;
      if (patch.expense) {
        await persist(STORAGE_KEYS.expenseReminders, patch.expense);
        await mirrorWorkspaceKeyForUser(STORAGE_KEYS.expenseReminders, uidNow);
      }
      if (patch.medicine) {
        await persist(STORAGE_KEYS.medReminders, patch.medicine);
        await mirrorWorkspaceKeyForUser(STORAGE_KEYS.medReminders, uidNow);
      }
      if (patch.grocery) {
        await persist(STORAGE_KEYS.groceryReminders, patch.grocery);
        await mirrorWorkspaceKeyForUser(STORAGE_KEYS.groceryReminders, uidNow);
      }
      if (patch.general) {
        await persist(STORAGE_KEYS.generalReminders, patch.general);
        await mirrorWorkspaceKeyForUser(STORAGE_KEYS.generalReminders, uidNow);
      }
      if (patch.shopping) {
        await persist(STORAGE_KEYS.shoppingList, patch.shopping);
        await mirrorWorkspaceKeyForUser(STORAGE_KEYS.shoppingList, uidNow);
      }

      if (uidNow && !hydratingRef.current && (patch.expense || patch.medicine || patch.grocery || patch.general)) {
        schedulePushReminders(uidNow, next);
      }
    },
    [],
  );

  useEffect(() => {
    (async () => {
      const data = await loadAll();
      const { ensureLocale } = await import('../i18n/translations');
      await ensureLocale(data.config.language);
      setConfig(data.config);
      setReady(true);
    })();
  }, []);

  // After Storage upload, stamp billImagePath onto local txns (no re-push).
  useEffect(() => {
    setBillPathsSyncHandler((pathById) => {
      const prev = cashBooksRef.current;
      let changed = false;
      const books = prev.books.map((b) => {
        let bookChanged = false;
        const transactions = b.finance.transactions.map((t) => {
          const path = pathById.get(t.id);
          if (!path || t.billImagePath === path) return t;
          bookChanged = true;
          changed = true;
          return { ...t, billImagePath: path };
        });
        return bookChanged ? { ...b, finance: { ...b.finance, transactions } } : b;
      });
      if (!changed) return;
      const next = { ...prev, books };
      cashBooksRef.current = next;
      setCashBooksState(next);
      void persist(STORAGE_KEYS.finance, next);
      void mirrorWorkspaceKeyForUser(STORAGE_KEYS.finance, userIdRef.current);
    });
    return () => setBillPathsSyncHandler(null);
  }, []);

  const refreshPremiumStatus = useCallback(async (): Promise<boolean> => {
    const uid = userIdRef.current;
    if (!uid) {
      setIsPremiumMemberState(false);
      setIsPaidPremiumState(false);
      setPremiumSince(null);
      setPremiumPassUntil(null);
      applyPremiumGate(false, null);
      return false;
    }
    const profile = await fetchPremiumProfile(uid);
    const paid = isPremiumCurrentlyActive(profile);
    const access = hasPremiumAccess(profile);
    const since = profile?.premium_since ?? null;
    setIsPremiumMemberState(access);
    setIsPaidPremiumState(paid);
    setPremiumSince(since);
    setPremiumPassUntil(profile?.premium_pass_until ?? null);
    applyPremiumGate(access || isAdmin, since);
    await AsyncStorage.setItem(STORAGE_KEYS.premiumMember, access ? '1' : '0');
    return access;
  }, [isAdmin, applyPremiumGate]);

  // Guests get a zero balance with the real economy attached, so the Diamonds
  // screen can show what signing in would earn them.
  const refreshDiamonds = useCallback(async () => {
    const next = await fetchDiamondState();
    setDiamondsState(next || EMPTY_DIAMOND_STATE);
    // Only a real answer proves what the user owns. Offline or signed out the
    // fetch returns nothing, and acting on that would revoke a paid-for unlock.
    if (next) setDiamondsLoaded(true);
  }, []);

  const earnDiamondsByAd = useCallback(async () => {
    const result = await watchAdForDiamonds(configRef.current.googleAds);
    if (result.state) setDiamondsState(result.state);
    return result;
  }, []);

  const redeemDiamondPass = useCallback(
    async (days: number) => {
      const result = await redeemPremiumPass(days);
      if (result.state) setDiamondsState(result.state);
      // The pass changes entitlement, so re-read the profile before the UI settles.
      if (result.ok) await refreshPremiumStatus();
      return result;
    },
    [refreshPremiumStatus],
  );

  const buyDiamondItem = useCallback(
    async (kind: DiamondStoreKind, itemId: string) => {
      const result = await purchaseDiamondItem(kind, itemId);
      if (result.state) setDiamondsState(result.state);
      return result;
    },
    [],
  );

  // Read through a ref so the premium-lapse cleanup and setTheme can check
  // ownership without re-creating themselves on every balance change.
  const ownsWithDiamonds = useCallback(
    (kind: DiamondStoreKind, itemId: string) =>
      ownsDiamondUnlock(diamondsRef.current, kind, itemId),
    [],
  );

  const refreshReferrals = useCallback(async () => {
    const next = await fetchReferralState();
    if (next) setReferralsState(next);
  }, []);

  const applyReferral = useCallback(
    async (code: string) => {
      const result = await applyReferralCode(code);
      // Both sides move: the balance changed and the claim is now on record.
      if (result.ok) {
        await refreshDiamonds();
        await refreshReferrals();
      }
      return result;
    },
    [refreshDiamonds, refreshReferrals],
  );

  /**
   * Drop a rented theme / avatar once its unlock runs out. Diamond unlocks
   * expire on their own clock rather than with Premium, so the lapse cleanup
   * would never notice them.
   */
  useEffect(() => {
    // Waiting for a real answer matters: acting on the empty starting state
    // would strip a purchased avatar every time the app opens.
    if (!ready || !diamondsLoaded) return;
    setConfig((prev) => {
      if (isAdmin) return prev;
      const themesOk = canAccessPremiumFeature(
        'themes',
        isPremiumMember,
        prev.premiumFeatures,
        prev.features,
      );
      const avatarsOk = canAccessPremiumFeature(
        'avatars',
        isPremiumMember,
        prev.premiumFeatures,
        prev.features,
      );
      let nextTheme = prev.theme;
      let nextAvatar = prev.avatarStyle;
      let changed = false;
      if (
        !canUseTheme(prev.theme, prev.themeCatalog, themesOk) &&
        !ownsDiamondUnlock(diamonds, 'theme', prev.theme)
      ) {
        nextTheme = firstAllowedTheme(prev.themeCatalog, themesOk, 'teal');
        changed = nextTheme !== prev.theme;
      }
      if (
        !canUseAvatarStyle(nextAvatar as AvatarStyleId, avatarsOk) &&
        !ownsDiamondUnlock(diamonds, 'avatar', nextAvatar)
      ) {
        nextAvatar = DEFAULT_AVATAR_STYLE;
        changed = changed || nextAvatar !== prev.avatarStyle;
      }
      if (!changed) return prev;
      const next = mergeConfig({ ...prev, theme: nextTheme, avatarStyle: nextAvatar });
      void persist(STORAGE_KEYS.config, next);
      return next;
    });
  }, [ready, diamondsLoaded, diamonds, isPremiumMember, isAdmin]);

  /** Refresh Premium entitlement from Supabase (survives reinstall). */
  useEffect(() => {
    if (!ready || !authReady) return;
    if (!userId) {
      setIsPremiumMemberState(false);
      setIsPaidPremiumState(false);
      setPremiumSince(null);
      setPremiumPassUntil(null);
      applyPremiumGate(false, null);
      setReferralsState(EMPTY_REFERRAL_STATE);
      void refreshDiamonds();
      return;
    }
    void refreshPremiumStatus();
    void refreshDiamonds();
    void refreshReferrals();
  }, [
    ready,
    authReady,
    userId,
    refreshPremiumStatus,
    refreshDiamonds,
    refreshReferrals,
    applyPremiumGate,
  ]);

  /** Pick up admin Premium grants without forcing a full app restart. */
  useEffect(() => {
    if (!ready || !authReady || !userId) return;
    const onChange = (next: AppStateStatus) => {
      if (next !== 'active') return;
      void refreshPremiumStatus();
      // Also re-reads the daily cap, which rolls over while the app is backgrounded.
      void refreshDiamonds();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [ready, authReady, userId, refreshPremiumStatus, refreshDiamonds]);

  useEffect(() => {
    applyPremiumGate(isPremiumMember, premiumSince);
  }, [isPremiumMember, premiumSince, applyPremiumGate]);

  const currencyRef = useRef(config.currency);
  currencyRef.current = config.currency;

  /**
   * Guests see an empty workspace in memory (never another account’s data on screen).
   * Each signed-in user has a per-user disk snapshot — logout no longer destroys it.
   * Free: local restore. Premium/admin: restore local, then pull/push cloud.
   */
  useEffect(() => {
    if (!ready || !authReady) return;

    if (!userId) {
      const leavingId = prevUserIdRef.current;
      let cancelled = false;
      void (async () => {
        if (leavingId) {
          await stashWorkspaceForUser(leavingId);
          if (cancelled) return;
          await clearUserWorkspaceData();
        }
        if (cancelled) return;
        // App start as guest: do not wipe disk — may still hold a recoverable stash.
        applyEmptyWorkspace(currencyRef.current);
        prevUserIdRef.current = null;
        setCloudReady(true);
      })();
      return () => {
        cancelled = true;
      };
    }

    let cancelled = false;
    (async () => {
      hydratingRef.current = true;
      setCloudReady(false);
      try {
        const previousId = prevUserIdRef.current;
        if (previousId && previousId !== userId) {
          await stashWorkspaceForUser(previousId);
          await clearUserWorkspaceData();
        }

        await restoreWorkspaceForUser(userId);
        if (cancelled) return;
        prevUserIdRef.current = userId;

        const local = await loadAll();
        if (cancelled) return;
        setConfig(local.config);
        applyLocalWorkspace(local);

        const profile = await fetchPremiumProfile(userId);
        if (cancelled) return;
        const paid = isPremiumCurrentlyActive(profile);
        const access = hasPremiumAccess(profile);
        const cloudEnabled =
          canAccessPremiumFeature(
            'cloud',
            access || isAdmin,
            local.config.premiumFeatures,
            local.config.features,
          );
        const since = profile?.premium_since ?? null;
        setIsPremiumMemberState(access);
        setIsPaidPremiumState(paid);
        setPremiumSince(since);
        setPremiumPassUntil(profile?.premium_pass_until ?? null);
        applyPremiumGate(access || isAdmin, since);

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
          // A backup taken before Cash was retired would otherwise restore it.
          // Re-normalize on change so the bank's live amount picks up the merge.
          const dropped = mergeCashIntoBank(mergedRaw);
          const withoutCash = dropped.changed
            ? normalizeCashBooks(dropped.state, configRef.current.currency)
            : dropped.state;
          const merged = mergeLocalBillImagesIntoBooks(withoutCash, localBooks);
          cashBooksRef.current = merged;
          setCashBooksState(merged);
          await persist(STORAGE_KEYS.finance, merged);
          await mirrorWorkspaceKeyForUser(STORAGE_KEYS.finance, userId);
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
          await mirrorWorkspaceKeyForUser(STORAGE_KEYS.expenseReminders, userId);
          await mirrorWorkspaceKeyForUser(STORAGE_KEYS.medReminders, userId);
          await mirrorWorkspaceKeyForUser(STORAGE_KEYS.groceryReminders, userId);
          await mirrorWorkspaceKeyForUser(STORAGE_KEYS.generalReminders, userId);
        } else if (hasLocalReminders) {
          await pushReminders(userId, localReminders);
        }

        if (cloud.categories) {
          // A cloud list saved before a category batch shipped would otherwise
          // wipe the new entries on every sign-in, so seed it here too.
          const appliedSeeds = await readAppliedCategorySeeds();
          const seeded = applyCategorySeeds(cloud.categories, appliedSeeds, 'cloud');
          const nextCats: CategoriesState = seeded.changed
            ? { expense: seeded.expense, income: seeded.income }
            : cloud.categories;
          categoriesRef.current = nextCats;
          setCategoriesState(nextCats);
          await persist(STORAGE_KEYS.categories, nextCats);
          await mirrorWorkspaceKeyForUser(STORAGE_KEYS.categories, userId);
          if (seeded.newlyApplied.length) {
            await markCategorySeedsApplied(seeded.newlyApplied);
            if (seeded.changed) await pushCategories(userId, nextCats);
          }
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

  /** Preferences signed-in users may change without being admin. */
  const PERSONAL_CONFIG_KEYS = new Set<keyof AppConfig>([
    'language',
    'alarmsEnabled',
    'medicineTimes',
    'alertTime',
    'expenseOffsets',
    'groceryOffsets',
    'alarmDurationSec',
  ]);

  /** Alarm / notification defaults — require a signed-in account (not guests). */
  const ALARM_CONFIG_KEYS = new Set<keyof AppConfig>([
    'alarmsEnabled',
    'medicineTimes',
    'alertTime',
    'expenseOffsets',
    'groceryOffsets',
    'alarmDurationSec',
  ]);

  const updateConfig = useCallback(async (patch: Partial<AppConfig>) => {
    const keys = Object.keys(patch) as (keyof AppConfig)[];
    const personalOnly =
      keys.length > 0 && keys.every((k) => PERSONAL_CONFIG_KEYS.has(k));
    if (!personalOnly && !requireAdminToChangeSettings('change app settings')) {
      return false;
    }
    const touchesAlarms = keys.some((k) => ALARM_CONFIG_KEYS.has(k));
    if (touchesAlarms && !requireAuthToSave('change alarm settings')) {
      return false;
    }

    let pushedPremium: ReturnType<typeof mergePremiumPlan> | null = null;
    let pushedFeatures: ReturnType<typeof mergePremiumFeatures> | null = null;
    if (patch.premiumPlan) {
      pushedPremium = mergePremiumPlan({
        ...configRef.current.premiumPlan,
        ...patch.premiumPlan,
      });
    }
    if (patch.premiumFeatures) {
      pushedFeatures = mergePremiumFeatures({
        ...configRef.current.premiumFeatures,
        ...patch.premiumFeatures,
      });
    }

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
      if (
        !patch.theme &&
        !canUseTheme(nextTheme, mergedCatalog, isPremiumMember) &&
        !ownsDiamondUnlock(diamondsRef.current, 'theme', nextTheme)
      ) {
        nextTheme = firstAllowedTheme(mergedCatalog, isPremiumMember, 'teal');
      }
      const nextPremium = pushedPremium ?? prev.premiumPlan;
      const nextFeatures = pushedFeatures ?? prev.premiumFeatures;
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
        googleAds: patch.googleAds
          ? mergeGoogleAds({
              ...prev.googleAds,
              ...patch.googleAds,
              formats: {
                ...prev.googleAds.formats,
                ...Object.fromEntries(
                  Object.entries(patch.googleAds.formats || {}).map(([key, value]) => [
                    key,
                    {
                      ...prev.googleAds.formats[
                        key as keyof typeof prev.googleAds.formats
                      ],
                      ...value,
                    },
                  ]),
                ),
              },
            })
          : prev.googleAds,
        importRules: patch.importRules
          ? mergeImportRules({
              ...prev.importRules,
              ...patch.importRules,
              rules: patch.importRules.rules ?? prev.importRules.rules,
            })
          : prev.importRules,
        feedback: patch.feedback
          ? {
              ...prev.feedback,
              ...patch.feedback,
            }
          : prev.feedback,
        premiumPlan: nextPremium,
        premiumFeatures: nextFeatures,
        themeCatalog: mergedCatalog,
      });
      void persist(STORAGE_KEYS.config, next);
      return next;
    });

    if (pushedPremium || pushedFeatures) {
      const res = await pushRemoteAppSettings({
        premiumPlan: pushedPremium || undefined,
        premiumFeatures: pushedFeatures || undefined,
      });
      if (!res.ok) {
        showAppInfo(
          'Premium settings',
          res.error?.includes('app_settings') ||
            res.error?.includes('schema cache') ||
            res.error?.includes('Could not find') ||
            res.error?.includes('function')
            ? 'Saved on this phone only. Run supabase/admin_premium_users.sql in the Supabase SQL Editor, then Save again.'
            : `Saved on this phone, but cloud sync failed: ${res.error || 'unknown error'}.`,
          '⚠️',
        );
        return false;
      }
      // Re-apply cloud gate if feature matrix changed
      applyPremiumGate(isPremiumMember, premiumSinceRef.current);
    }

    return true;
  }, [isPremiumMember, applyPremiumGate]);

  const refreshSharedPremiumPlan = useCallback(async () => {
    const remote = await fetchRemoteAppSettings();
    if (!remote) return;
    setConfig((prev) => {
      const samePlan =
        prev.premiumPlan.priceLabel === remote.premiumPlan.priceLabel &&
        prev.premiumPlan.amountInr === remote.premiumPlan.amountInr &&
        prev.premiumPlan.compareAtAmountInr === remote.premiumPlan.compareAtAmountInr &&
        prev.premiumPlan.monthlyEnabled === remote.premiumPlan.monthlyEnabled &&
        prev.premiumPlan.monthlyPriceLabel === remote.premiumPlan.monthlyPriceLabel &&
        prev.premiumPlan.monthlyAmountInr === remote.premiumPlan.monthlyAmountInr &&
        prev.premiumPlan.monthlyCompareAtAmountInr ===
          remote.premiumPlan.monthlyCompareAtAmountInr &&
        prev.premiumPlan.premiumEnabled === remote.premiumPlan.premiumEnabled &&
        prev.premiumPlan.plusEnabled === remote.premiumPlan.plusEnabled &&
        prev.premiumPlan.plusAddonMonthlyInr === remote.premiumPlan.plusAddonMonthlyInr &&
        prev.premiumPlan.plusAddonYearlyInr === remote.premiumPlan.plusAddonYearlyInr &&
        plusFeaturesEqual(prev.premiumPlan.plusFeatures, remote.premiumPlan.plusFeatures) &&
        prev.premiumPlan.upiId === remote.premiumPlan.upiId &&
        prev.premiumPlan.payeeName === remote.premiumPlan.payeeName;
      const sameFeat =
        prev.premiumFeatures.themes === remote.premiumFeatures.themes &&
        prev.premiumFeatures.avatars === remote.premiumFeatures.avatars &&
        prev.premiumFeatures.cloud === remote.premiumFeatures.cloud &&
        prev.premiumFeatures.backup === remote.premiumFeatures.backup &&
        prev.premiumFeatures.insights === remote.premiumFeatures.insights &&
        prev.premiumFeatures.feedback === remote.premiumFeatures.feedback &&
        prev.premiumFeatures.splitExpense === remote.premiumFeatures.splitExpense;
      if (samePlan && sameFeat) return prev;
      const next = mergeConfig({
        ...prev,
        premiumPlan: remote.premiumPlan,
        premiumFeatures: remote.premiumFeatures,
      });
      void persist(STORAGE_KEYS.config, next);
      return next;
    });
  }, []);

  /** Pull shared Premium offer (price / UPI) so all devices match Admin edits. */
  useEffect(() => {
    if (!ready) return;
    void refreshSharedPremiumPlan();
  }, [ready, authReady, userId, refreshSharedPremiumPlan]);

  /** Language is a personal display preference — available to everyone (including guests). */
  const setLanguage = useCallback(async (code: string) => {
    const { ensureLocale, translate } = await import('../i18n/translations');
    const resolved = await ensureLocale(code);
    // Touch a key so the pack is loaded before React re-renders screens.
    void translate(code === 'system' ? resolved : code, 'language.title');
    setConfig((prev) => {
      const next = mergeConfig({ ...prev, language: code });
      void persist(STORAGE_KEYS.config, next);
      return next;
    });
    const { applyRtlForLanguage } = await import('../i18n/rtl');
    applyRtlForLanguage(code, { notifyRestart: true });
  }, []);

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

  const setUiFeedbackStyle = useCallback(async (style: AppConfig['uiFeedbackStyle']) => {
    setConfig((prev) => {
      const next = mergeConfig({ ...prev, uiFeedbackStyle: style });
      void persist(STORAGE_KEYS.config, next);
      return next;
    });
  }, []);

  const setUiFeedbackSound = useCallback(async (on: boolean) => {
    setConfig((prev) => {
      const next = mergeConfig({ ...prev, uiFeedbackSound: on });
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
      // Anything bought with diamonds is kept — it was paid for separately and
      // does not lapse with Premium.
      if (
        !canUseTheme(prev.theme, prev.themeCatalog, false) &&
        !ownsDiamondUnlock(diamondsRef.current, 'theme', prev.theme)
      ) {
        nextTheme = firstAllowedTheme(prev.themeCatalog, false, 'teal');
        changed = true;
      }
      if (
        !canUseAvatarStyle(nextAvatar as AvatarStyleId, false) &&
        !ownsDiamondUnlock(diamondsRef.current, 'avatar', nextAvatar)
      ) {
        nextAvatar = DEFAULT_AVATAR_STYLE;
        changed = true;
      }
      if (!changed) return prev;
      const next = mergeConfig({ ...prev, theme: nextTheme, avatarStyle: nextAvatar });
      void persist(STORAGE_KEYS.config, next);
      return next;
    });
  }, [isAdmin, applyPremiumGate]);

  const importBackup = useCallback(async (json: string, options?: ImportBackupOptions) => {
    try {
      const data = JSON.parse(json);
      const replaceReminders = options?.replaceReminders === true;
      const currency = configRef.current.currency;

      if (data.config) {
        // Keep personal display prefs from backup; preserve live premium feature gates from device/cloud.
        const incoming = mergeConfig(data.config);
        const nextConfig = mergeConfig({
          ...incoming,
          premiumFeatures: configRef.current.premiumFeatures,
          premiumPlan: configRef.current.premiumPlan,
        });
        setConfig(nextConfig);
        await persist(STORAGE_KEYS.config, nextConfig);
      }

      if (data.cashBooks || data.financeState) {
        const importedBooks = normalizeCashBooks(data.cashBooks || data.financeState, currency);
        const restored = mergeCashIntoBank(
          mergeCashBooksFromBackup(cashBooksRef.current, importedBooks, currency),
        );
        const mergedBooks = restored.changed
          ? normalizeCashBooks(restored.state, currency)
          : restored.state;
        await persistCashBooksLocalAndCloud(mergedBooks);
      }

      if (replaceReminders) {
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
      }

      if (data.categories) {
        const nextCats = mergeCategoriesFromBackup(categoriesRef.current, data.categories);
        setCategoriesState(nextCats);
        await persistCategoriesLocalAndCloud(nextCats);
      }
      return true;
    } catch {
      return false;
    }
  }, [persistCashBooksLocalAndCloud, persistRemindersLocalAndCloud, persistCategoriesLocalAndCloud]);

  const exportBackup = useCallback(() => {
    const range = inferBackupDateRange(cashBooks);
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
        dataStart: range?.start ?? null,
        dataEnd: range?.end ?? null,
      },
      null,
      2,
    );
  }, [config, cashBooks, finance, expenseReminders, medReminders, groceryReminders, shoppingList, generalReminders, categories]);

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
    const themesOk = canAccessPremiumFeature(
      'themes',
      isPremiumMember,
      config.premiumFeatures,
      config.features,
    );
    if (!canUseTheme(key, catalog, themesOk) && !ownsWithDiamonds('theme', key)) {
      showAppInfo(
        'Premium theme',
        'This look is for Premium Members. Open Profile → Premium to unlock.',
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
  }, [
    config.themeCatalog,
    config.premiumFeatures,
    config.features,
    isPremiumMember,
    ownsWithDiamonds,
  ]);

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
      if (!requireAuthToSave('add transactions')) {
        return { imageError: 'Sign in required', imagePath: null };
      }
      // Split / settle posts must land on the notebook that already has history —
      // not an empty duplicate Personal book created by legacy sync.
      if (txn.splitExpenseId || txn.splitSettlementId) {
        const preferred = preferredFinanceBookId(cashBooksRef.current);
        if (preferred && preferred !== cashBooksRef.current.activeBookId) {
          const nextBooks = { ...cashBooksRef.current, activeBookId: preferred };
          cashBooksRef.current = nextBooks;
          setCashBooksState(nextBooks);
        }
      }
      const amount = Math.abs(txn.amount);
      const { id: providedId, ...rest } = txn;
      const prev = getActiveFinance(cashBooksRef.current);
      const accountId =
        rest.kind === 'income' || rest.kind === 'expense'
          ? rest.accountId || resolveDefaultAccountId(prev)
          : rest.accountId;
      let saved: Transaction = {
        ...rest,
        id: providedId || uid(),
        amount,
        accountId,
      };

      let imageError: string | null = null;
      let imagePath: string | null = null;

      if (saved.billImageUri) {
        const uidNow = userIdRef.current;
        const shouldUpload = isCloudSyncEnabled() || isPremiumMemberRef.current;
        if (!uidNow) {
          imageError = 'Not signed in — bill kept on this phone only.';
        } else if (!shouldUpload) {
          imageError = 'Cloud sync is off for this account — bill kept on this phone only.';
        } else {
          const res = await uploadBillImageDetailed(uidNow, saved.id, saved.billImageUri);
          if (res.path) {
            saved = { ...saved, billImagePath: res.path };
            imagePath = res.path;
          } else {
            imageError = res.error || 'Cloud bill upload failed.';
          }
        }
      }

      await persistFinanceLocalAndCloud(
        syncAccountAmounts({
          ...prev,
          transactions: [saved, ...prev.transactions],
        }),
      );
      return { imageError, imagePath };
    },
    [persistFinanceLocalAndCloud],
  );

  const updateTransaction = useCallback(async (txn: Transaction) => {
    if (!requireAuthToSave('edit transactions')) {
      return { imageError: 'Sign in required', imagePath: null };
    }
    const prev = getActiveFinance(cashBooksRef.current);
    const idx = prev.transactions.findIndex((t) => t.id === txn.id);
    if (idx < 0) return { imageError: null, imagePath: null };
    const amount = Math.abs(txn.amount);
    const accountId =
      txn.kind === 'income' || txn.kind === 'expense'
        ? txn.accountId || resolveDefaultAccountId(prev)
        : txn.accountId;
    let saved: Transaction = { ...txn, amount, accountId };

    let imageError: string | null = null;
    let imagePath: string | null = saved.billImagePath || null;
    const prevTxn = prev.transactions[idx];
    const imageChanged = !!saved.billImageUri && prevTxn?.billImageUri !== saved.billImageUri;
    const needsUpload =
      !!saved.billImageUri && (!saved.billImagePath || imageChanged);

    if (needsUpload) {
      const uidNow = userIdRef.current;
      const shouldUpload = isCloudSyncEnabled() || isPremiumMemberRef.current;
      if (!uidNow) {
        imageError = 'Not signed in — bill kept on this phone only.';
      } else if (!shouldUpload) {
        imageError = 'Cloud sync is off for this account — bill kept on this phone only.';
      } else {
        const res = await uploadBillImageDetailed(uidNow, saved.id, saved.billImageUri!);
        if (res.path) {
          saved = { ...saved, billImagePath: res.path };
          imagePath = res.path;
        } else {
          imageError = res.error || 'Cloud bill upload failed.';
        }
      }
    }

    const transactions = [...prev.transactions];
    transactions[idx] = saved;
    await persistFinanceLocalAndCloud(syncAccountAmounts({ ...prev, transactions }));
    return { imageError, imagePath };
  }, [persistFinanceLocalAndCloud]);

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
    if (removed && isCoreBankAccount(removed)) {
      showAppInfo(
        `Keep ${CORE_BANK_NAME}`,
        'This account is kept so you can choose it in Received in / Paid with.',
        'ℹ️',
      );
      return;
    }
    if (removed && isCoreCardAccount(removed)) {
      showAppInfo(
        `Keep ${CORE_CARD_NAME}`,
        'Credit Card is kept for card spends so the bank account isn’t double-counted.',
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

  /** Remove extra accounts; keep Bank + Card. Move incomes/expenses onto Bank. */
  const keepOnlyCashAccount = useCallback(async () => {
    if (!requireAuthToSave('manage accounts')) return;
    updateActiveFinance((current) => {
      const currency = current.accounts[0]?.currency || 'INR';
      let bank = current.accounts.find(isCoreBankAccount);
      let card = current.accounts.find(isCoreCardAccount);
      if (!bank) {
        bank = {
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
      if (!card) {
        card = {
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
      const keepIds = new Set([bank.id, card.id]);
      const removeIds = new Set(
        current.accounts.filter((a) => !keepIds.has(a.id)).map((a) => a.id),
      );

      const transactions = current.transactions
        .map((t) => {
          if (t.kind === 'transfer') {
            const fromAccountId =
              t.fromAccountId && removeIds.has(t.fromAccountId) ? bank!.id : t.fromAccountId;
            const toAccountId =
              t.toAccountId && removeIds.has(t.toAccountId) ? bank!.id : t.toAccountId;
            if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) {
              return null;
            }
            return { ...t, fromAccountId, toAccountId };
          }
          if (t.accountId && removeIds.has(t.accountId)) {
            return { ...t, accountId: bank!.id };
          }
          return t;
        })
        .filter((t): t is NonNullable<typeof t> => t != null);

      return syncAccountAmounts({
        ...current,
        accounts: [bank, card],
        defaultAccountId: bank.id,
        transactions,
      });
    });
    showAppInfo(
      'Done',
      `Kept ${CORE_BANK_NAME} and ${CORE_CARD_NAME}. Extra accounts were removed.`,
      '🏦',
    );
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

  const copyCategoryBudgetsFromMonth = useCallback(
    async (fromMonth: string, toMonth: string) => {
      if (!requireAuthToSave('set a budget')) {
        return { copied: 0, error: 'Sign in required' };
      }
      if (!fromMonth || !toMonth || fromMonth === toMonth) {
        return { copied: 0, error: 'Invalid months' };
      }
      let copied = 0;
      updateActiveFinance((prev) => {
        const source = (prev.categoryBudgets || []).filter(
          (b) => b.month === fromMonth && b.limit > 0,
        );
        copied = source.length;
        if (!source.length) return prev;
        const others = (prev.categoryBudgets || []).filter((b) => b.month !== toMonth);
        const cloned = source.map((b) => ({
          month: toMonth,
          category: b.category,
          limit: b.limit,
        }));
        const budgets = [...others, ...cloned];
        const monthTotal = cloned.reduce((s, b) => s + b.limit, 0);
        return { ...prev, categoryBudgets: budgets, budget: monthTotal };
      });
      return { copied, error: null };
    },
    [updateActiveFinance],
  );

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
      refreshSharedPremiumPlan,
      refreshPremiumStatus,
      setLanguage,
      setCurrency,
      setTheme,
      setAvatarStyle,
      setUiFeedbackStyle,
      setUiFeedbackSound,
      isPremiumMember,
      isAdFreeMember,
      premiumSince,
      premiumPassUntil,
      setPremiumMember,
      diamonds,
      refreshDiamonds,
      earnDiamondsByAd,
      redeemDiamondPass,
      buyDiamondItem,
      ownsWithDiamonds,
      referrals,
      refreshReferrals,
      applyReferral,
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
      copyCategoryBudgetsFromMonth,
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
      refreshSharedPremiumPlan,
      refreshPremiumStatus,
      setLanguage,
      setCurrency,
      setTheme,
      setAvatarStyle,
      setUiFeedbackStyle,
      setUiFeedbackSound,
      isPremiumMember,
      isAdFreeMember,
      premiumSince,
      premiumPassUntil,
      setPremiumMember,
      diamonds,
      refreshDiamonds,
      earnDiamondsByAd,
      redeemDiamondPass,
      buyDiamondItem,
      ownsWithDiamonds,
      referrals,
      refreshReferrals,
      applyReferral,
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
      copyCategoryBudgetsFromMonth,
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
