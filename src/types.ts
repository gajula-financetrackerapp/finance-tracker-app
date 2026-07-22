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
};

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
  store: string;
  bought: boolean;
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
