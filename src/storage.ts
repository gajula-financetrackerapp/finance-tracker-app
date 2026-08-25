import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_AD_BANNER,
  DEFAULT_CONFIG,
  DEFAULT_FEEDBACK,
  DEFAULT_GOOGLE_AD_FORMATS,
  DEFAULT_GOOGLE_ADS,
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
  GoogleAdFormatFlags,
  GoogleAdFormatKey,
  GoogleAdsConfig,
  HomePrefs,
  HomeSortOrder,
  PremiumFeaturesConfig,
  PremiumPlanConfig,
  ThemeKey,
} from './types';
import { clearStoredCardLimits, defaultCashBooks, getActiveFinance, mergeCashIntoBank, normalizeCashBooks, normalizeFinanceState, rebookCardOnlyBills, repairImportedCardBills } from './cashBooks';
import { dropNoiseImports } from './lib/importRules/cleanupImports';

/** The bank account now covers cash, so the separate Cash account folds into it. */
const MERGE_CASH_MIGRATION = 'merge-cash-into-bank-2026-08';
/**
 * Card bills imported as a one-sided bank expense never cleared the card, and
 * where the bank's SMS and the card's arrived days apart the card was credited
 * twice. The second pass repairs both, so it needs its own id.
 */
const CARD_BILL_TRANSFER_MIGRATION = 'card-bill-transfers-2026-08b';
/**
 * A card's limit used to be kept in its opening balance. The limit figures are
 * gone, so that number is cleared rather than left to read as money in hand.
 */
const CARD_LIMITS_REMOVED_MIGRATION = 'card-limits-removed-2026-08';
/**
 * A bill reaching the card through CRED or another app was booked as though the
 * bank had paid it, on top of the debit the bank itself reported. Those rows
 * become a credit on the card, so the bank is emptied once.
 */
const CARD_CREDIT_NOT_BANK_MIGRATION = 'card-credit-not-bank-2026-08';
/**
 * A biller's "we received your payment" was read as income by older builds. The
 * message is kept in the import key, so those rows are put to today's rules and
 * removed where they no longer count as a transaction at all.
 */
const BILLER_RECEIPTS_MIGRATION = 'drop-biller-receipts-2026-08';
import { normalizeAdCreative } from './utils/adCreative';
import { mergeThemeCatalog, themeAccessFor, firstAllowedTheme } from './utils/themeAccess';
import { findAvatarStyle } from './data/avatars';
import { findAppLanguage } from './i18n/languages';
import { mergePremiumFeatures } from './lib/premiumFeatures';
import { defaultPlusFeatures, mergePlusFeatures } from './lib/premiumCart';
import { mergeUiFeedbackStyle } from './lib/uiFeedback';
import { mergeImportRules } from './lib/importRules';
import {
  applyCategorySeeds,
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
  // Royal is the free colour now, so everyone who was on it lands there.
  gold: 'teal',
  champagne: 'teal',
  royal: 'teal',
  inkNavy: 'obsidian',
  dark: 'obsidian',
};

const RETIRED_APP_NAMES = new Set(['Finance Tracker', 'Pulse Wallet']);

const RETIRED_PAYEE_NAMES = new Set([
  'Finance Tracker Premium',
  'Pulse Wallet Premium',
]);

export function mergeConfig(saved: Partial<AppConfig> | null): AppConfig {
  let theme: ThemeKey =
    saved?.theme && saved.theme in THEMES ? saved.theme : DEFAULT_CONFIG.theme;
  if (THEME_MIGRATE[theme]) theme = THEME_MIGRATE[theme]!;
  // Names the app has shipped under. The stored value wins for anyone who set
  // their own, but a previous default has to move or the rename never lands.
  const appName =
    !saved?.appName || RETIRED_APP_NAMES.has(saved.appName) ? 'Kashio' : saved.appName;
  const homePrefs = mergeHomePrefs(saved?.homePrefs);
  const adBanner = mergeAdBanner(saved?.adBanner);
  const googleAds = mergeGoogleAds(saved?.googleAds);
  const importRules = mergeImportRules(saved?.importRules);
  const themeCatalog = mergeThemeCatalog(saved?.themeCatalog);
  let defaultTheme: ThemeKey =
    saved?.defaultTheme && saved.defaultTheme in THEMES
      ? saved.defaultTheme
      : DEFAULT_CONFIG.defaultTheme;
  if (THEME_MIGRATE[defaultTheme]) defaultTheme = THEME_MIGRATE[defaultTheme]!;
  const feedback = mergeFeedback(saved?.feedback);
  const premiumPlan = mergePremiumPlan(saved?.premiumPlan);
  const premiumFeatures = mergePremiumFeatures(saved?.premiumFeatures);
  const uiFeedbackStyle = mergeUiFeedbackStyle(saved?.uiFeedbackStyle);
  const uiFeedbackSound = saved?.uiFeedbackSound !== false;
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
    googleAds,
    importRules,
    themeCatalog,
    defaultTheme,
    themePicked: saved?.themePicked === true,
    feedback,
    premiumPlan,
    premiumFeatures,
    uiFeedbackStyle,
    uiFeedbackSound,
    // Both start on, so anything other than an explicit false means on. This
    // also carries users who saved a config before these switches existed.
    alarmSound: saved?.alarmSound !== false,
    alarmVibration: saved?.alarmVibration !== false,
    alarmToneUri: typeof saved?.alarmToneUri === 'string' ? saved.alarmToneUri : null,
    alarmToneName: typeof saved?.alarmToneName === 'string' ? saved.alarmToneName : null,
    adminPassword: '',
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
  const compareAtRaw = Number(raw.compareAtAmountInr);
  const compareAtAmountInr =
    Number.isFinite(compareAtRaw) && compareAtRaw >= 0
      ? Math.round(compareAtRaw * 100) / 100
      : DEFAULT_PREMIUM_PLAN.compareAtAmountInr;
  const monthlyCompareAtRaw = Number(raw.monthlyCompareAtAmountInr);
  const monthlyCompareAtAmountInr =
    Number.isFinite(monthlyCompareAtRaw) && monthlyCompareAtRaw >= 0
      ? Math.round(monthlyCompareAtRaw * 100) / 100
      : DEFAULT_PREMIUM_PLAN.monthlyCompareAtAmountInr;
  const premiumEnabled =
    typeof raw.premiumEnabled === 'boolean'
      ? raw.premiumEnabled
      : DEFAULT_PREMIUM_PLAN.premiumEnabled;
  const plusEnabled =
    typeof raw.plusEnabled === 'boolean' ? raw.plusEnabled : DEFAULT_PREMIUM_PLAN.plusEnabled;
  const money = (value: unknown, fallback: number, allowZero = false) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    if (n < 0 || (!allowZero && n === 0)) return fallback;
    return Math.round(n * 100) / 100;
  };
  const label = (value: unknown, fallback: string) =>
    typeof value === 'string' && value.trim() ? value.trim() : fallback;
  const plusAmountInr = money(raw.plusAmountInr, DEFAULT_PREMIUM_PLAN.plusAmountInr);
  const plusPriceLabel = label(raw.plusPriceLabel, DEFAULT_PREMIUM_PLAN.plusPriceLabel);
  const plusCompareAtAmountInr = money(
    raw.plusCompareAtAmountInr,
    DEFAULT_PREMIUM_PLAN.plusCompareAtAmountInr,
    true,
  );
  const plusMonthlyAmountInr = money(
    raw.plusMonthlyAmountInr,
    DEFAULT_PREMIUM_PLAN.plusMonthlyAmountInr,
  );
  const plusMonthlyPriceLabel = label(
    raw.plusMonthlyPriceLabel,
    DEFAULT_PREMIUM_PLAN.plusMonthlyPriceLabel,
  );
  const plusMonthlyCompareAtAmountInr = money(
    raw.plusMonthlyCompareAtAmountInr,
    DEFAULT_PREMIUM_PLAN.plusMonthlyCompareAtAmountInr,
    true,
  );
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
  // Settings saved before Plus became one tier had every feature switched on,
  // because that was the à la carte menu rather than a tier's contents. Start
  // those from the new default set instead of carrying all seven over.
  const isLegacyPlus = !Number.isFinite(Number(raw.plusAmountInr));
  const plusFeatures = isLegacyPlus
    ? defaultPlusFeatures(plusAddonMonthlyInr, plusAddonYearlyInr)
    : mergePlusFeatures(raw.plusFeatures, plusAddonMonthlyInr, plusAddonYearlyInr);
  const upiId =
    typeof raw.upiId === 'string' ? raw.upiId.trim() : DEFAULT_PREMIUM_PLAN.upiId;
  const savedPayee = typeof raw.payeeName === 'string' ? raw.payeeName.trim() : '';
  // A payee left at a previous app name follows the rename; a name an admin
  // actually typed is theirs to keep.
  const payeeName =
    savedPayee && !RETIRED_PAYEE_NAMES.has(savedPayee)
      ? savedPayee
      : DEFAULT_PREMIUM_PLAN.payeeName;
  return {
    priceLabel,
    amountInr,
    compareAtAmountInr,
    monthlyEnabled,
    monthlyPriceLabel,
    monthlyAmountInr,
    monthlyCompareAtAmountInr,
    premiumEnabled,
    plusEnabled,
    plusPriceLabel,
    plusAmountInr,
    plusCompareAtAmountInr,
    plusMonthlyPriceLabel,
    plusMonthlyAmountInr,
    plusMonthlyCompareAtAmountInr,
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
    // Absent means a banner saved before Home was a placement, and that one did
    // show on Home, so keep it there rather than moving it on upgrade.
    showOnHome:
      typeof raw.showOnHome === 'boolean' ? raw.showOnHome : DEFAULT_AD_BANNER.showOnHome,
    hideForPremium:
      typeof raw.hideForPremium === 'boolean'
        ? raw.hideForPremium
        : DEFAULT_AD_BANNER.hideForPremium,
    endCardHoldSec: hold,
    items,
  };
}

export function mergeGoogleAds(saved?: Partial<GoogleAdsConfig> | null): GoogleAdsConfig {
  const raw = (saved || {}) as Partial<GoogleAdsConfig> & Record<string, unknown>;
  const unit = (key: keyof GoogleAdsConfig): string => {
    const v = raw[key];
    return typeof v === 'string' ? v.trim() : String(DEFAULT_GOOGLE_ADS[key] ?? '');
  };
  const globalHide =
    typeof raw.hideForPremium === 'boolean'
      ? raw.hideForPremium
      : DEFAULT_GOOGLE_ADS.hideForPremium;
  const rawFormats = (raw.formats || {}) as Partial<
    Record<GoogleAdFormatKey, Partial<GoogleAdFormatFlags>>
  >;
  const formatKeys = Object.keys(DEFAULT_GOOGLE_AD_FORMATS) as GoogleAdFormatKey[];
  const formats = {} as Record<GoogleAdFormatKey, GoogleAdFormatFlags>;
  for (const key of formatKeys) {
    const row = rawFormats[key];
    const fallback = DEFAULT_GOOGLE_AD_FORMATS[key];
    formats[key] = {
      enabled: typeof row?.enabled === 'boolean' ? row.enabled : fallback.enabled,
      // Older installs only had a global hide — apply it when format flags are missing.
      hideForPremium:
        typeof row?.hideForPremium === 'boolean'
          ? row.hideForPremium
          : raw.formats
            ? fallback.hideForPremium
            : globalHide,
    };
  }
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_GOOGLE_ADS.enabled,
    hideForPremium: globalHide,
    useTestIds:
      typeof raw.useTestIds === 'boolean' ? raw.useTestIds : DEFAULT_GOOGLE_ADS.useTestIds,
    formats,
    androidBannerUnitId: unit('androidBannerUnitId'),
    iosBannerUnitId: unit('iosBannerUnitId'),
    androidInterstitialUnitId: unit('androidInterstitialUnitId'),
    iosInterstitialUnitId: unit('iosInterstitialUnitId'),
    androidRewardedInterstitialUnitId: unit('androidRewardedInterstitialUnitId'),
    iosRewardedInterstitialUnitId: unit('iosRewardedInterstitialUnitId'),
    androidRewardedUnitId: unit('androidRewardedUnitId'),
    iosRewardedUnitId: unit('iosRewardedUnitId'),
    androidNativeUnitId: unit('androidNativeUnitId'),
    iosNativeUnitId: unit('iosNativeUnitId'),
    androidAppOpenUnitId: unit('androidAppOpenUnitId'),
    iosAppOpenUnitId: unit('iosAppOpenUnitId'),
  };
}

/**
 * Lays a partial edit over existing ad settings, keeping per-format flags that
 * the edit did not mention. A plain spread would drop them, since `formats` is
 * a nested object.
 */
export function applyGoogleAdsPatch(
  base: GoogleAdsConfig,
  patch: Partial<GoogleAdsConfig>,
): GoogleAdsConfig {
  const formats = { ...base.formats };
  for (const [key, value] of Object.entries(patch.formats || {})) {
    const formatKey = key as GoogleAdFormatKey;
    formats[formatKey] = { ...base.formats[formatKey], ...value };
  }
  return mergeGoogleAds({ ...base, ...patch, formats });
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

async function readStringList(key: string): Promise<string[]> {
  const raw = await readJSON<unknown>(key, []);
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
}

/** One-shot data migrations, so a change the user later undoes isn't reapplied. */
export async function hasRunMigration(id: string): Promise<boolean> {
  return (await readStringList(STORAGE_KEYS.migrations)).includes(id);
}

export async function markMigrationRun(id: string) {
  const prev = await readStringList(STORAGE_KEYS.migrations);
  if (prev.includes(id)) return;
  await persist(STORAGE_KEYS.migrations, [...prev, id]);
}

export async function readAppliedCategorySeeds(): Promise<string[]> {
  return readStringList(STORAGE_KEYS.categorySeeds);
}

export async function markCategorySeedsApplied(ids: string[]) {
  if (!ids.length) return;
  const prev = await readAppliedCategorySeeds();
  const next = Array.from(new Set([...prev, ...ids]));
  await persist(STORAGE_KEYS.categorySeeds, next);
}

export async function loadAll() {
  const config = mergeConfig(await readJSON(STORAGE_KEYS.config, null));
  const rawFinance = await readJSON<unknown>(STORAGE_KEYS.finance, null);
  let cashBooks: CashBooksState = normalizeCashBooks(rawFinance, config.currency);

  if (!(await hasRunMigration(MERGE_CASH_MIGRATION))) {
    const merged = mergeCashIntoBank(cashBooks);
    if (merged.changed) {
      cashBooks = normalizeCashBooks(merged.state, config.currency);
      await persist(STORAGE_KEYS.finance, cashBooks);
    }
    await markMigrationRun(MERGE_CASH_MIGRATION);
  }

  if (!(await hasRunMigration(CARD_BILL_TRANSFER_MIGRATION))) {
    const repaired = repairImportedCardBills(cashBooks);
    if (repaired.changed) {
      cashBooks = normalizeCashBooks(repaired.state, config.currency);
      await persist(STORAGE_KEYS.finance, cashBooks);
    }
    await markMigrationRun(CARD_BILL_TRANSFER_MIGRATION);
  }

  if (!(await hasRunMigration(CARD_CREDIT_NOT_BANK_MIGRATION))) {
    const rebooked = rebookCardOnlyBills(cashBooks);
    if (rebooked.changed) {
      cashBooks = normalizeCashBooks(rebooked.state, config.currency);
      await persist(STORAGE_KEYS.finance, cashBooks);
    }
    await markMigrationRun(CARD_CREDIT_NOT_BANK_MIGRATION);
  }

  if (!(await hasRunMigration(BILLER_RECEIPTS_MIGRATION))) {
    const cleaned = dropNoiseImports(cashBooks);
    if (cleaned.changed) {
      cashBooks = normalizeCashBooks(cleaned.state, config.currency);
      await persist(STORAGE_KEYS.finance, cashBooks);
    }
    await markMigrationRun(BILLER_RECEIPTS_MIGRATION);
  }

  if (!(await hasRunMigration(CARD_LIMITS_REMOVED_MIGRATION))) {
    const cleared = clearStoredCardLimits(cashBooks);
    if (cleared.changed) {
      cashBooks = normalizeCashBooks(cleared.state, config.currency);
      await persist(STORAGE_KEYS.finance, cashBooks);
    }
    await markMigrationRun(CARD_LIMITS_REMOVED_MIGRATION);
  }

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
  let categories: CategoriesState = savedCats
    ? {
        expense: normalizeCategoryList(savedCats.expense, DEFAULT_EXPENSE_CATS),
        income: normalizeCategoryList(savedCats.income, DEFAULT_INCOME_CATS),
      }
    : defaultCategories();

  if (savedCats) {
    const applied = await readAppliedCategorySeeds();
    const seeded = applyCategorySeeds(categories, applied);
    if (seeded.newlyApplied.length) {
      if (seeded.changed) {
        categories = { expense: seeded.expense, income: seeded.income };
        await persist(STORAGE_KEYS.categories, categories);
      }
      await persist(STORAGE_KEYS.categorySeeds, [...applied, ...seeded.newlyApplied]);
    }
  }

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

/**
 * Forget a user's workspace entirely: the active keys and the per-user stash
 * behind them. Signing out only stashes the workspace so it comes back next
 * time, which is the opposite of what closing an account asks for.
 */
export async function forgetUserWorkspace(userId: string) {
  await Promise.all([
    ...WORKSPACE_STORAGE_KEYS.map((key) => AsyncStorage.removeItem(key)),
    ...(userId
      ? WORKSPACE_STORAGE_KEYS.map((key) => AsyncStorage.removeItem(userWorkspaceKey(key, userId)))
      : []),
  ]);
}

export { defaultCashBooks };
