// Categories, icons, currencies, and palette — matching the HTML reference

export const EXPENSE_CATS = [
  { id: 'food', label: 'Food & Dining', icon: 'restaurant', color: '#F59E0B' },
  { id: 'transport', label: 'Transport', icon: 'car', color: '#3B82F6' },
  { id: 'shopping', label: 'Shopping', icon: 'cart', color: '#8B5CF6' },
  { id: 'bills', label: 'Bills & Utilities', icon: 'flash', color: '#EF4444' },
  { id: 'health', label: 'Health & Medical', icon: 'medkit', color: '#10B981' },
  { id: 'entertainment', label: 'Entertainment', icon: 'film', color: '#F43F5E' },
  { id: 'education', label: 'Education', icon: 'school', color: '#6366F1' },
  { id: 'travel', label: 'Travel', icon: 'airplane', color: '#0EA5E9' },
  { id: 'home', label: 'Home & Garden', icon: 'home', color: '#84CC16' },
  { id: 'fitness', label: 'Fitness', icon: 'fitness', color: '#F97316' },
  { id: 'beauty', label: 'Beauty & Care', icon: 'heart', color: '#EC4899' },
  { id: 'insurance', label: 'Insurance', icon: 'shield-checkmark', color: '#14B8A6' },
  { id: 'subscriptions', label: 'Subscriptions', icon: 'repeat', color: '#A855F7' },
  { id: 'gifts', label: 'Gifts & Donations', icon: 'gift', color: '#EF4444' },
  { id: 'pets', label: 'Pets', icon: 'paw', color: '#78716C' },
  { id: 'taxes', label: 'Taxes & Fees', icon: 'document-text', color: '#475569' },
  { id: 'savings', label: 'Savings & Investments', icon: 'trending-up', color: '#2E9E5B' },
  { id: 'other_expense', label: 'Other', icon: 'ellipsis-horizontal-circle', color: '#94A3B8' },
];

export const INCOME_CATS = [
  { id: 'salary', label: 'Salary', icon: 'briefcase', color: '#2E9E5B' },
  { id: 'freelance', label: 'Freelance', icon: 'laptop', color: '#3B82F6' },
  { id: 'business', label: 'Business', icon: 'storefront', color: '#F59E0B' },
  { id: 'investments', label: 'Investments', icon: 'trending-up', color: '#8B5CF6' },
  { id: 'rental', label: 'Rental Income', icon: 'home', color: '#10B981' },
  { id: 'dividends', label: 'Dividends', icon: 'cash', color: '#0EA5E9' },
  { id: 'bonus', label: 'Bonus', icon: 'star', color: '#F43F5E' },
  { id: 'gifts_received', label: 'Gifts Received', icon: 'gift', color: '#EC4899' },
  { id: 'refunds', label: 'Refunds', icon: 'refresh-circle', color: '#14B8A6' },
  { id: 'grants', label: 'Grants & Aid', icon: 'ribbon', color: '#6366F1' },
  { id: 'pension', label: 'Pension', icon: 'people', color: '#78716C' },
  { id: 'other_income', label: 'Other', icon: 'ellipsis-horizontal-circle', color: '#94A3B8' },
];

// Account type icons
export const ACCOUNT_ICONS = [
  { id: 'wallet', icon: 'wallet', label: 'Wallet' },
  { id: 'bank', icon: 'business', label: 'Bank Account' },
  { id: 'savings', icon: 'save', label: 'Savings' },
  { id: 'credit', icon: 'card', label: 'Credit Card' },
  { id: 'cash', icon: 'cash', label: 'Cash' },
  { id: 'investment', icon: 'trending-up', label: 'Investment' },
  { id: 'crypto', icon: 'logo-bitcoin', label: 'Crypto' },
  { id: 'loan', icon: 'git-compare', label: 'Loan' },
];

// Supported currencies
export const CURRENCIES = [
  { code: 'USD', symbol: '$', label: 'US Dollar', flag: '🇺🇸' },
  { code: 'EUR', symbol: '€', label: 'Euro', flag: '🇪🇺' },
  { code: 'GBP', symbol: '£', label: 'British Pound', flag: '🇬🇧' },
  { code: 'INR', symbol: '₹', label: 'Indian Rupee', flag: '🇮🇳' },
  { code: 'JPY', symbol: '¥', label: 'Japanese Yen', flag: '🇯🇵' },
  { code: 'AUD', symbol: 'A$', label: 'Australian Dollar', flag: '🇦🇺' },
  { code: 'CAD', symbol: 'C$', label: 'Canadian Dollar', flag: '🇨🇦' },
  { code: 'CHF', symbol: 'CHF', label: 'Swiss Franc', flag: '🇨🇭' },
  { code: 'CNY', symbol: '¥', label: 'Chinese Yuan', flag: '🇨🇳' },
  { code: 'SGD', symbol: 'S$', label: 'Singapore Dollar', flag: '🇸🇬' },
  { code: 'AED', symbol: 'د.إ', label: 'UAE Dirham', flag: '🇦🇪' },
  { code: 'MYR', symbol: 'RM', label: 'Malaysian Ringgit', flag: '🇲🇾' },
];

// Color palette for user-assignable account/category colors
export const PALETTE = [
  '#FFCD3C', // yellow
  '#F5B700', // amber
  '#F59E0B', // orange-amber
  '#F97316', // orange
  '#EF4444', // red
  '#F43F5E', // rose
  '#EC4899', // pink
  '#A855F7', // purple
  '#8B5CF6', // violet
  '#6366F1', // indigo
  '#3B82F6', // blue
  '#0EA5E9', // sky
  '#06B6D4', // cyan
  '#14B8A6', // teal
  '#10B981', // emerald
  '#2E9E5B', // green
  '#84CC16', // lime
  '#78716C', // stone
  '#64748B', // slate
  '#475569', // slate-dark
];

// Budget period options
export const BUDGET_PERIODS = [
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly', label: 'Yearly' },
];

// Transaction types
export const TRANSACTION_TYPES = {
  EXPENSE: 'expense',
  INCOME: 'income',
  TRANSFER: 'transfer',
};

// Days of week for recurring reminders
export const DAYS_OF_WEEK = [
  { id: 0, short: 'Su', label: 'Sunday' },
  { id: 1, short: 'Mo', label: 'Monday' },
  { id: 2, short: 'Tu', label: 'Tuesday' },
  { id: 3, short: 'We', label: 'Wednesday' },
  { id: 4, short: 'Th', label: 'Thursday' },
  { id: 5, short: 'Fr', label: 'Friday' },
  { id: 6, short: 'Sa', label: 'Saturday' },
];

// Reminder frequency options
export const REMINDER_FREQUENCIES = [
  { id: 'once', label: 'Once' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly', label: 'Yearly' },
];

// Bill/expense recurrence options
export const BILL_FREQUENCIES = [
  { id: 'one_time', label: 'One-time' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' },
  { id: 'yearly', label: 'Yearly' },
];
