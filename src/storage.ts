import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_AD_BANNER,
  DEFAULT_CONFIG,
  DEFAULT_FEEDBACK,
  DEFAULT_HOME_PREFS,
  DEFAULT_PREMIUM_PLAN,
  THEMES,
} from './constants';
import { STORAGE_KEYS } from './constants';
import {
  AdBannerConfig,
  AppConfig,
  CashBooksState,
  FeedbackChannel,
  FeedbackConfig,
  HomePrefs,
  HomeSortOrder,
  PremiumFeaturesConfig,
  PremiumPlanConfig,
  ThemeKey,
} from './types';
import { defaultCashBooks, getActiveFinance, normalizeCashBooks, normalizeFinanceState } from './cashBooks';
import { normalizeAdCreative } from './utils/adCreative';
import { mergeThemeCatalog, themeAccessFor, firstAllowedTheme } from './utils/themeAccess';
import { findAvatarStyle } from './data/avatars';
import { findAppLanguage } from './i18n/languages';
import { mergePremiumFeatures } from './lib/premiumFeatures';
import { mergePlusFeatures } from './lib/premiumCart';
import { mergeUiFeedbackStyle } from './lib/uiFeedback';
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

/** Map retired flat accents onto the new dual-tone Premium packs. */
const THEME_MIGRATE: Partial<Record<ThemeKey, ThemeKey>> = {
  sapphire: 'aurora',
  amethyst: 'aurora',
  blue: 'aurora',
  jade: 'aurora',
  green: 'teal',
  yellow: 'teal',
  ember: 'sunset',
  rose: 'sunset',
  ruby: 'sunset',
  gold: 'royal',
  champagne: 'royal',
  inkNavy: 'obsidian',
  dark: 'obsidian',
};

export function mergeConfig(saved: Partial<AppConfig> | null): AppConfig {
  let theme: ThemeKey =
    saved?.theme && saved.theme in THEMES ? saved.theme : DEFAULT_CONFIG.theme;
  if (THEME_MIGRATE[theme]) theme = THEME_MIGRATE[theme]!;
  const appName =
    !saved?.appName || saved.appName === 'Finance Tracker' ? 'Pulse Wallet' : saved.appName;
  const homePrefs = mergeHomePrefs(saved?.homePrefs);
  const adBanner = mergeAdBanner(saved?.adBanner);
  const themeCatalog = mergeThemeCatalog(saved?.themeCatalog);
  const feedback = mergeFeedback(saved?.feedback);
  const premiumPlan = mergePremiumPlan(saved?.premiumPlan);
  const premiumFeatures = mergePremiumFeatures(saved?.premiumFeatures);
  const uiFeedbackStyle = mergeUiFeedbackStyle(saved?.uiFeedbackStyle);
  if (themeAccessFor(theme, themeCatalog) === 'hidden') {
    theme = firstAllowedTheme(themeCatalog, true, 'teal');
  }
  const avatarStyle = findAvatarStyle(saved?.avatarStyle).id;
  const language = findAppLanguage(saved?.language).code;
  const merged: AppConfig = {
    ...DEFAULT_CONFIG,
    ...(saved || {}),
    theme,
    avatarStyle,
    language,
    appName,
    homePrefs,
    adBanner,
    themeCatalog,
    feedback,
    premiumPlan,
    premiumFeatures,
    uiFeedbackStyle,
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

export function mergePremiumPlan(saved?: Partial<PremiumPlanConfig> | null): PremiumPlanConfig {
  const raw = (saved || {}) as Partial<PremiumPlanConfig>;
  const amountRaw = Number(raw.amountInr);
  const amountInr =
    Number.isFinite(amountRaw) && amountRaw > 0
      ? Math.round(amountRaw * 100) / 100
      : DEFAULT_PREMIUM_PLAN.amountInr;
  const priceLabel =
    typeof raw.priceLabel === 'string' && raw.priceLabel.trim()
      ? raw.priceLabel.trim()
      : DEFAULT_PREMIUM_PLAN.priceLabel;
  const monthlyAmountRaw = Number(raw.monthlyAmountInr);
  const monthlyAmountInr =
    Number.isFinite(monthlyAmountRaw) && monthlyAmountRaw > 0
      ? Math.round(monthlyAmountRaw * 100) / 100
      : DEFAULT_PREMIUM_PLAN.monthlyAmountInr;
  const monthlyPriceLabel =
    typeof raw.monthlyPriceLabel === 'string' && raw.monthlyPriceLabel.trim()
      ? raw.monthlyPriceLabel.trim()
      : DEFAULT_PREMIUM_PLAN.monthlyPriceLabel;
  const monthlyEnabled =
    typeof raw.monthlyEnabled === 'boolean'
      ? raw.monthlyEnabled
      : DEFAULT_PREMIUM_PLAN.monthlyEnabled;
  const premiumEnabled =
    typeof raw.premiumEnabled === 'boolean'
      ? raw.premiumEnabled
      : DEFAULT_PREMIUM_PLAN.premiumEnabled;
  const plusEnabled =
    typeof raw.plusEnabled === 'boolean' ? raw.plusEnabled : DEFAULT_PREMIUM_PLAN.plusEnabled;
  const plusMoRaw = Number(raw.plusAddonMonthlyInr);
  const plusAddonMonthlyInr =
    Number.isFinite(plusMoRaw) && plusMoRaw >= 0
      ? Math.round(plusMoRaw * 100) / 100
      : DEFAULT_PREMIUM_PLAN.plusAddonMonthlyInr;
  const plusYrRaw = Number(raw.plusAddonYearlyInr);
  const plusAddonYearlyInr =
    Number.isFinite(plusYrRaw) && plusYrRaw >= 0
      ? Math.round(plusYrRaw * 100) / 100
      : DEFAULT_PREMIUM_PLAN.plusAddonYearlyInr;
  const plusFeatures = mergePlusFeatures(
    raw.plusFeatures,
    plusAddonMonthlyInr,
    plusAddonYearlyInr,
  );
  const upiId =
    typeof raw.upiId === 'string' ? raw.upiId.trim() : DEFAULT_PREMIUM_PLAN.upiId;
  const payeeName =
    typeof raw.payeeName === 'string' && raw.payeeName.trim()
      ? raw.payeeName.trim()
      : DEFAULT_PREMIUM_PLAN.payeeName;
  return {
    priceLabel,
    amountInr,
    monthlyEnabled,
    monthlyPriceLabel,
    monthlyAmountInr,
    premiumEnabled,
    plusEnabled,
    plusAddonMonthlyInr,
    plusAddonYearlyInr,
    plusFeatures,
    upiId,
    payeeName,
  };
}

export function mergeFeedback(saved?: Partial<FeedbackConfig> | null): FeedbackConfig {
  const raw = (saved || {}) as Partial<FeedbackConfig>;
  const channel: FeedbackChannel =
    raw.channel === 'whatsapp' || raw.channel === 'email' ? raw.channel : DEFAULT_FEEDBACK.channel;
  const email =
    typeof raw.email === 'string' && raw.email.trim()
      ? raw.email.trim()
      : DEFAULT_FEEDBACK.email;
  const whatsapp =
    typeof raw.whatsapp === 'string' ? raw.whatsapp.replace(/[^\d+]/g, '').replace(/^\+/, '') : DEFAULT_FEEDBACK.whatsapp;
  return { channel, email, whatsapp };
}

export function mergeAdBanner(saved?: Partial<AdBannerConfig> | null): AdBannerConfig {
  const raw = (saved || {}) as Partial<AdBannerConfig> & Record<string, unknown>;
  const enabled =
    typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_AD_BANNER.enabled;
  const hold =
    typeof raw.endCardHoldSec === 'number' && Number.isFinite(raw.endCardHoldSec)
      ? Math.max(5, Math.min(3600, Math.floor(raw.endCardHoldSec)))
      : DEFAULT_AD_BANNER.endCardHoldSec;

  let items: AdBannerConfig['items'] = [];
  if (Array.isArray(raw.items)) {
    items = raw.items
      .map((item) => normalizeAdCreative(item))
      .filter((item): item is NonNullable<typeof item> => !!item);
  } else if (
    typeof raw.title === 'string' ||
    typeof raw.mediaUri === 'string' ||
    typeof raw.endImageUri === 'string'
  ) {
    // Legacy single-ad shape → one playlist item
    const migrated = normalizeAdCreative({
      id: 'legacy',
      title: typeof raw.title === 'string' ? raw.title : undefined,
      subtitle: typeof raw.subtitle === 'string' ? raw.subtitle : undefined,
      icon: typeof raw.icon === 'string' ? raw.icon : undefined,
      buttonLabel: typeof raw.buttonLabel === 'string' ? raw.buttonLabel : undefined,
      buttonUrl: typeof raw.buttonUrl === 'string' ? raw.buttonUrl : undefined,
      appScheme: typeof raw.appScheme === 'string' ? raw.appScheme : undefined,
      mediaUri: typeof raw.mediaUri === 'string' ? raw.mediaUri : null,
      mediaType:
        raw.mediaType === 'image' || raw.mediaType === 'video' ? raw.mediaType : null,
      endImageUri: typeof raw.endImageUri === 'string' ? raw.endImageUri : null,
    });
    if (migrated) items = [migrated];
  }

  return {
    enabled,
    hideForPremium:
      typeof raw.hideForPremium === 'boolean'
        ? raw.hideForPremium
        : DEFAULT_AD_BANNER.hideForPremium,
    endCardHoldSec: hold,
    items,
  };
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

/** Active keys that hold the signed-in user's workspace (not app-wide config). */
const WORKSPACE_STORAGE_KEYS = [
  STORAGE_KEYS.finance,
  STORAGE_KEYS.expenseReminders,
  STORAGE_KEYS.medReminders,
  STORAGE_KEYS.groceryReminders,
  STORAGE_KEYS.shoppingList,
  STORAGE_KEYS.generalReminders,
  STORAGE_KEYS.categories,
] as const;

function userWorkspaceKey(baseKey: string, userId: string) {
  return `${baseKey}::user::${userId}`;
}

/** Snapshot active workspace into a per-user slot (survives logout). */
export async function stashWorkspaceForUser(userId: string) {
  if (!userId) return;
  await Promise.all(
    WORKSPACE_STORAGE_KEYS.map(async (key) => {
      const raw = await AsyncStorage.getItem(key);
      if (raw != null) {
        await AsyncStorage.setItem(userWorkspaceKey(key, userId), raw);
      }
    }),
  );
}

/**
 * Restore a user's workspace into the active keys.
 * If no per-user snapshot exists yet, keep current active data and claim it for this user.
 */
export async function restoreWorkspaceForUser(userId: string) {
  if (!userId) return;
  let restoredAny = false;
  await Promise.all(
    WORKSPACE_STORAGE_KEYS.map(async (key) => {
      const scoped = await AsyncStorage.getItem(userWorkspaceKey(key, userId));
      if (scoped != null) {
        restoredAny = true;
        await AsyncStorage.setItem(key, scoped);
      }
    }),
  );
  if (!restoredAny) {
    // First login on this device/build — keep orphaned active data and bind it to this user.
    await stashWorkspaceForUser(userId);
  }
}

/** Mirror one active key into the signed-in user's stash (call after every save). */
export async function mirrorWorkspaceKeyForUser(
  key: (typeof WORKSPACE_STORAGE_KEYS)[number],
  userId: string | null | undefined,
) {
  if (!userId) return;
  const raw = await AsyncStorage.getItem(key);
  if (raw != null) {
    await AsyncStorage.setItem(userWorkspaceKey(key, userId), raw);
  }
}

/** Clear finance / reminders / lists on logout — keep app config (theme, ads, etc.). */
export async function clearUserWorkspaceData() {
  await Promise.all(WORKSPACE_STORAGE_KEYS.map((key) => AsyncStorage.removeItem(key)));
}

export { defaultCashBooks };
