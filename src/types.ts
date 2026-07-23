export type ThemeKey = 'teal' | 'yellow' | 'dark' | 'blue' | 'green' | 'rose';

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
  /** How long to keep the end-card before starting the next ad (seconds) */
  endCardHoldSec: number;
  /** Ads play one after another */
  items: AdCreative[];
};

export type AppConfig = {
  appName: string;
  theme: ThemeKey;
  adminPassword: string;
  currency: string;
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
};

export type HomeListTab = 'income' | 'expense';
export type HomeSortOrder = 'newest' | 'oldest' | 'amount_high' | 'amount_low';

export type HomePrefs = {
  /** Which list opens first on Home */
  defaultTab: HomeListTab;
  /** Show Expenses / Income / Balance amounts on Home */
  showSummary: boolean;
  /** How Home transactions are ordered */
  sortOrder: HomeSortOrder;
};

export type Account = {
  id: string;
  name: string;
  type: string;
  currency: string;
  amount: number;
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
  /** Simple item label (used when no groceryItems). */
  itemName?: string;
  /** Simple quantity (used when no groceryItems). */
  quantity?: string;
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
};
