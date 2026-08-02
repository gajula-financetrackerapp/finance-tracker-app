export type ThemeKey =
  | 'teal'
  | 'yellow'
  | 'dark'
  | 'blue'
  | 'green'
  | 'rose'
  | 'sapphire'
  | 'amethyst'
  | 'ember'
  | 'gold'
  | 'inkNavy'
  | 'jade'
  | 'champagne'
  | 'ruby'
  | 'aurora'
  | 'sunset'
  | 'obsidian'
  | 'royal'
  | 'velvet'
  | 'lagoon'
  | 'sakura'
  | 'forest'
  | 'copper';

/** How a color is offered to users (admin-controlled). */
export type ThemeAccess = 'free' | 'premium' | 'premiumPro' | 'hidden';

export type ThemeCatalogConfig = {
  /** Per-color availability. Missing keys fall back to defaults. */
  access: Partial<Record<ThemeKey, ThemeAccess>>;
  /**
   * When true, Premium colors are unlocked for everyone
   * (useful for a temporary color drop / promo). Does not unlock Premium Pro.
   */
  unlockAllPremium: boolean;
};

export type FeatureFlags = {
  finance: boolean;
  reminders: boolean;
  expenseReminder: boolean;
  medicineReminder: boolean;
  groceryExpiryReminder: boolean;
  generalReminder: boolean;
  financeCharts: boolean;
  financeReports: boolean;
  financeAccounts: boolean;
  shoppingList: boolean;
  /** Admin kill switch for Split Expense workspace (still Premium/Plus-gated when on). */
  splitExpense: boolean;
  /** Admin kill switch for button sound & ripples (still Premium-gated when on). */
  buttonFeedback: boolean;
  /** Admin kill switch for exclusive themes (still Premium/Plus-gated when on). */
  themes: boolean;
  /** Admin kill switch for character avatars (still Premium/Plus-gated when on). */
  avatars: boolean;
  /** Admin kill switch for multi-device cloud sync (still Premium/Plus-gated when on). */
  cloud: boolean;
  /** Admin kill switch for file backup & restore (still Premium/Plus-gated when on). */
  backup: boolean;
  /** Admin kill switch for Smart Insights (still Premium/Plus-gated when on). */
  insights: boolean;
  /** Admin kill switch for SMS / paste / screenshot transaction import. */
  smsImport: boolean;
};

/** Rule for matching bank/order SMS, paste, or OCR text to a transaction. */
/** How the SMS was paid / received — maps to Cash book account on import. */
export type ImportPaymentType = 'bank' | 'card' | 'upi';

export type ImportSourceRule = {
  id: string;
  name: string;
  enabled: boolean;
  /** Match against SMS sender / address (case-insensitive substrings). */
  senders: string[];
  /** Body must include at least one (case-insensitive). Empty = any body. */
  bodyIncludes: string[];
  /** Skip if body includes any of these. */
  bodyExcludes?: string[];
  kind: 'expense' | 'income';
  category: string;
  notePrefix?: string;
  /** Default payment channel when body does not make it obvious. */
  paymentType?: ImportPaymentType;
  /** Higher wins when multiple rules match. */
  priority?: number;
};

export type ImportRulesConfig = {
  /** When false, import UI still opens but matching uses no rules. */
  enabled: boolean;
  /** How far back to scan the Android SMS inbox. */
  smsLookbackDays: number;
  /**
   * Admin custom rules + overrides (by id).
   * Merged over built-ins at runtime — see mergeImportRules().
   */
  rules: ImportSourceRule[];
};

export type AdCreative = {
  id: string;
  title: string;
  subtitle: string;
  /** Emoji / short icon for the end-card */
  icon: string;
  /** Fallback CTA label when install detection is unavailable */
  buttonLabel: string;
  /** Store / web URL (Install, or Open if no app scheme) */
  buttonUrl: string;
  /** Optional deep link — if openable, show Installed + Open */
  appScheme: string;
  /** Intro video (muted) or standalone image */
  mediaUri: string | null;
  mediaType: 'image' | 'video' | null;
  /** Image after video ends */
  endImageUri: string | null;
};

export type AdBannerConfig = {
  /** Show the Profile promo banner */
  enabled: boolean;
  /** When true, Premium members (and admins) do not see Profile ads */
  hideForPremium: boolean;
  /** How long to keep the end-card before starting the next ad (seconds) */
  endCardHoldSec: number;
  /** Ads play one after another */
  items: AdCreative[];
};

/** Google AdMob (network ads). */
export type GoogleAdFormatKey =
  | 'banner'
  | 'native'
  | 'interstitial'
  | 'rewarded'
  | 'rewardedInterstitial'
  | 'appOpen';

export type GoogleAdFormatFlags = {
  /** Offer this format in the app */
  enabled: boolean;
  /** Hide this format for Premium members */
  hideForPremium: boolean;
};

export type GoogleAdsConfig = {
  /** Master switch — off hides every AdMob format */
  enabled: boolean;
  /**
   * Legacy global Premium hide (older installs).
   * Prefer per-format `formats.*.hideForPremium`.
   */
  hideForPremium: boolean;
  /**
   * Force Google sample unit IDs (recommended until AdMob app is approved).
   * When false, uses the real unit IDs below.
   */
  useTestIds: boolean;
  /** Per-format show + Premium hide */
  formats: Record<GoogleAdFormatKey, GoogleAdFormatFlags>;
  androidBannerUnitId: string;
  iosBannerUnitId: string;
  androidInterstitialUnitId: string;
  iosInterstitialUnitId: string;
  androidRewardedInterstitialUnitId: string;
  iosRewardedInterstitialUnitId: string;
  androidRewardedUnitId: string;
  iosRewardedUnitId: string;
  androidNativeUnitId: string;
  iosNativeUnitId: string;
  androidAppOpenUnitId: string;
  iosAppOpenUnitId: string;
};

/** Admin-controlled feedback destination (hidden from end users). */
export type FeedbackChannel = 'email' | 'whatsapp';

export type FeedbackConfig = {
  channel: FeedbackChannel;
  /** Destination inbox when channel is email */
  email: string;
  /** WhatsApp number with country code digits only (e.g. 9198…) */
  whatsapp: string;
};

/** Admin-editable Premium / Plus checkout offer (manual pay → email → activate). */
export type PlusFeatureOffer = {
  /** Offer this feature in Custom Plus cart */
  enabled: boolean;
  monthlyInr: number;
  yearlyInr: number;
  /**
   * Optional list / “was” price (INR). Shown struck out when greater than the sale price.
   * 0 = no strike-through.
   */
  compareAtMonthlyInr: number;
  compareAtYearlyInr: number;
};

export type PlusFeaturesConfig = Record<PremiumFeatureKey, PlusFeatureOffer>;

export type PremiumPlanConfig = {
  /** Yearly CTA label, e.g. ₹399/year */
  priceLabel: string;
  /** Yearly amount for UPI / email body (sale / pay price) */
  amountInr: number;
  /**
   * Optional yearly list price. Shown struck out when greater than amountInr.
   * 0 = hide strike-through.
   */
  compareAtAmountInr: number;
  /** Show monthly subscription button on Premium screen */
  monthlyEnabled: boolean;
  /** Monthly CTA label, e.g. ₹39/month */
  monthlyPriceLabel: string;
  /** Monthly amount for UPI / email body (sale / pay price) */
  monthlyAmountInr: number;
  /**
   * Optional monthly list price. Shown struck out when greater than monthlyAmountInr.
   * 0 = hide strike-through.
   */
  monthlyCompareAtAmountInr: number;
  /** Offer All-in-One Premium checkout */
  premiumEnabled: boolean;
  /** Offer Custom Plus (à la carte) checkout */
  plusEnabled: boolean;
  /**
   * Legacy flat Plus addon prices (fallback when a feature has no entry).
   * Prefer plusFeatures[key] for per-feature amounts.
   */
  plusAddonMonthlyInr: number;
  plusAddonYearlyInr: number;
  /** Per-feature Plus catalog: enable + monthly/yearly price */
  plusFeatures: PlusFeaturesConfig;
  /** Optional UPI VPA; empty hides Pay with UPI */
  upiId: string;
  payeeName: string;
};

/** Immersive button feedback (sound + ripple). Off disables playback. */
export type UiFeedbackStyle = 'pop' | 'chime' | 'beep' | 'buzz';
export type UiFeedbackPreference = 'off' | UiFeedbackStyle;

/** Which extras require a Premium membership (admin can flip to Free). */
export type PremiumFeatureKey =
  | 'themes'
  | 'avatars'
  | 'cloud'
  | 'backup'
  | 'insights'
  | 'feedback'
  | 'splitExpense';
export type PremiumFeatureAccess = 'free' | 'premium';
export type PremiumFeaturesConfig = Record<PremiumFeatureKey, PremiumFeatureAccess>;

export type AppConfig = {
  appName: string;
  theme: ThemeKey;
  /** Profile avatar motion style (classic free; animated = Premium). */
  avatarStyle: string;
  adminPassword: string;
  currency: string;
  /** App UI language (BCP-47 / system). */
  language: string;
  alarmsEnabled: boolean;
  medicineTimes: { Morning: string; Afternoon: string; Evening: string };
  alertTime: string;
  expenseOffsets: number[];
  groceryOffsets: number[];
  alarmDurationSec: number;
  features: FeatureFlags;
  homePrefs: HomePrefs;
  /** Profile tab promo banner — editable in Admin settings only */
  adBanner: AdBannerConfig;
  /** Google AdMob network ads (Free tier) — Admin settings */
  googleAds: GoogleAdsConfig;
  /** SMS / paste / screenshot import rules — Admin editable */
  importRules: ImportRulesConfig;
  /** Free vs Premium themes — editable in Admin */
  themeCatalog: ThemeCatalogConfig;
  /** Where user Feedback is sent — Admin only */
  feedback: FeedbackConfig;
  /** Premium price / UPI — Admin only (synced via cloud) */
  premiumPlan: PremiumPlanConfig;
  /** Which extras are Free vs Premium — Admin only (synced via cloud) */
  premiumFeatures: PremiumFeaturesConfig;
  /**
   * Immersive button feedback style (sound + ripple).
   * Gated by premiumFeatures.feedback.
   */
  uiFeedbackStyle: UiFeedbackPreference;
  /** When a style is on, play the tone. Ripples still show if this is false. */
  uiFeedbackSound: boolean;
};

export type HomeListTab = 'income' | 'expense';
export type HomeSortOrder = 'newest' | 'oldest' | 'amount_high' | 'amount_low';
/** Home summary layout: Option 1 = Bank/Card under each column; Option 2 = totals + Card tile. */
export type HomeSummaryLayout = 'splitAccounts' | 'cardTile';

export type HomePrefs = {
  /** Which list opens first on Home */
  defaultTab: HomeListTab;
  /** Show Expenses / Income / Balance amounts on Home */
  showSummary: boolean;
  /** How Home transactions are ordered */
  sortOrder: HomeSortOrder;
  /** Summary band layout (Option 1 vs Option 2) */
  summaryLayout: HomeSummaryLayout;
};

export type Account = {
  id: string;
  name: string;
  type: string;
  currency: string;
  /**
   * Cached live balance (opening + transactions). Kept in sync for exports/legacy.
   * Prefer accountBalance() for display.
   */
  amount: number;
  /** User-set starting balance. Live balance = openingBalance + txn net. */
  openingBalance?: number;
  icon: string;
  excluded?: boolean;
};

/** Item tagged on a Groceries / Vegetables / Fruits / Snacks expense. */
export type GroceryTxnItem = {
  id: string;
  name: string;
  category: string;
  icon: string;
  quantity?: string;
  expiryDate?: string;
  groceryReminderId?: string | null;
};

export type Transaction = {
  id: string;
  kind: 'expense' | 'income' | 'transfer';
  category: string;
  amount: number;
  date: string;
  note: string;
  accountId?: string;
  fromAccountId?: string;
  toAccountId?: string;
  groceryItems?: GroceryTxnItem[];
  /** Local file URI of snapped/uploaded bill image. */
  billImageUri?: string;
  /** Supabase Storage path for Premium-synced bill image. */
  billImagePath?: string;
  /** Simple item label (used when no groceryItems). */
  itemName?: string;
  /** Simple quantity (used when no groceryItems). */
  quantity?: string;
  /** Linked Split expense — edit only in Split workspace. */
  splitExpenseId?: string;
  /** Linked Split settlement — edit only in Split workspace. */
  splitSettlementId?: string;
};

export type CategoryBudget = {
  month: string; // YYYY-MM
  category: string;
  limit: number;
};

export type FinanceState = {
  accounts: Account[];
  transactions: Transaction[];
  /** Legacy overall monthly budget (kept for older screens/backups). */
  budget: number;
  /** Per-category budgets keyed by month. */
  categoryBudgets: CategoryBudget[];
  /** Preferred account for new income/expense in this book. */
  defaultAccountId?: string;
};

/** A separate money notebook (Personal, Business, Trip, …) with its own accounts & transactions. */
export type CashBook = {
  id: string;
  name: string;
  icon: string;
  archived?: boolean;
  finance: FinanceState;
};

export type CashBooksState = {
  books: CashBook[];
  activeBookId: string;
};

export type ExpenseRepeat = 'once' | 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';

export type ExpenseReminder = {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  paid: boolean;
  offsets: number[];
  customTime?: string;
  alarmDurationSec?: number;
  mode: 'default' | 'custom';
  /** Finance expense created when this reminder was marked paid. */
  linkedTxnId?: string | null;
  /**
   * How often this bill/subscription renews.
   * Prefer this over `recurring` (kept for older saved data).
   */
  repeat?: ExpenseRepeat;
  /** @deprecated Use `repeat !== 'once'`. Still written for older clients. */
  recurring?: boolean;
  /** Calendar day (1–31) used when repeat is not once. */
  dayOfMonth?: number;
  /** Optional detail — e.g. Netflix / Hotstar for OTT. */
  detail?: string;
  /** Optional people this bill is for — e.g. family members on a phone bill. */
  forPeople?: string[];
};

export type MedReminder = {
  id: string;
  name: string;
  frequency: 'daily' | 'weekly';
  days: string[];
  times: string[];
  customTimes: Record<string, string>;
  done: Record<string, Record<string, boolean>>;
  mode: 'default' | 'custom';
  alarmDurationSec?: number;
};

export type GroceryReminder = {
  id: string;
  category: string;
  item: string;
  icon: string;
  expiryDate: string;
  quantity?: string;
  note?: string;
  offsets: number[];
  mode: 'default' | 'custom';
  customTime?: string;
  alarmDurationSec?: number;
  /** Set when created from an Add Transaction grocery tag. */
  fromTransactionId?: string | null;
};

export type ShoppingItem = {
  id: string;
  name: string;
  qty: string;
  unit: string;
  price: string;
  /** @deprecated Prefer expiry; kept for older local data. */
  store?: string;
  expiry?: string;
  bought: boolean;
  addedDate?: string;
  linkedTransactionId?: string | null;
  linkedGroceryId?: string | null;
};

export type GeneralReminder = {
  id: string;
  title: string;
  date: string;
  time: string;
  repeat: 'once' | 'daily' | 'weekly';
  days: string[];
  note?: string;
  done: boolean;
  doneDate?: string;
  alarmDurationSec?: number;
};

export type ThemeTokens = {
  label: string;
  primary: string;
  primaryDark: string;
  bg: string;
  card: string;
  ink: string;
  muted: string;
  line: string;
  green: string;
  red: string;
  /** Nav / band header (maps to primaryDark) */
  header: string;
  /** Main accent / FAB / tabs (maps to primary) */
  accent: string;
  accentDark: string;
  /** Soft tint of accent for chips / badges */
  accentSoft: string;
  track: string;
  white: string;
  shadow: string;
  /** Second tone for dual-tone premium packs */
  secondary: string;
  /** Gradient end color for headers */
  headerEnd: string;
  /** Use header → headerEnd → secondary gradient */
  dualTone: boolean;
  /** Soft header glow + breathing accent (Premium) */
  premiumMotion: boolean;
};
