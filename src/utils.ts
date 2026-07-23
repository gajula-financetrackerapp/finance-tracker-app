import { CURRENCIES, EXPENSE_CATS, INCOME_CATS, PALETTE } from './constants';

export function uid() {
  return `id_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function shiftMonth(mkey: string, delta: number) {
  const [y, m] = mkey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return monthKey(d);
}

export function monthLabel(mkey: string) {
  const [y, m] = mkey.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function currencySymbol(code: string) {
  return CURRENCIES.find((c) => c.code === code)?.sym ?? '₹';
}

/** INR uses Indian grouping (1,00,000); other currencies use Western (100,000). */
export function amountLocale(currencyCode: string) {
  return currencyCode === 'INR' ? 'en-IN' : 'en-US';
}

export function formatAmountDigits(
  amount: number,
  currencyCode = 'INR',
  opts?: { minimumFractionDigits?: number; maximumFractionDigits?: number },
) {
  const abs = Math.abs(amount);
  const min =
    opts?.minimumFractionDigits ?? (abs % 1 === 0 ? 0 : 2);
  const max = opts?.maximumFractionDigits ?? 2;
  return abs.toLocaleString(amountLocale(currencyCode), {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  });
}

export function fmt(amount: number, currencyCode: string) {
  return `${currencySymbol(currencyCode)}${formatAmountDigits(amount, currencyCode)}`;
}

export function catColor(name: string) {
  const all = [...EXPENSE_CATS, ...INCOME_CATS];
  let i = all.findIndex((c) => c.name === name);
  if (i < 0) i = 0;
  return PALETTE[i % PALETTE.length];
}

export function findIcon(name: string, kind: 'expense' | 'income' = 'expense') {
  const list = kind === 'income' ? INCOME_CATS : EXPENSE_CATS;
  return list.find((c) => c.name === name)?.icon ?? '💰';
}

export function daysUntil(dateStr: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function expiryStatus(dateStr: string): 'expired' | 'soon' | 'fresh' {
  const d = daysUntil(dateStr);
  if (d < 0) return 'expired';
  if (d <= 2) return 'soon';
  return 'fresh';
}
