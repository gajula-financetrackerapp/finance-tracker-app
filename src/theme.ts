import { currencyDisplaySymbol } from './constants';
import {
  DEFAULT_EXPENSE_CATS,
  DEFAULT_INCOME_CATS,
  findCategoryMeta,
  type CategoryDef,
} from './categories/defaults';

export const theme = {
  // Distinct from Money Tracker's bright yellow — deep teal fintech look
  header: '#0F3D3E',
  accent: '#1FA7A3',
  accentDark: '#147F7C',
  accentSoft: '#D8F3F2',
  bg: '#F3F6F5',
  card: '#FFFFFF',
  ink: '#10221F',
  muted: '#6B7C78',
  line: '#E3EBE9',
  green: '#1F9D63',
  red: '#D64545',
  track: '#E8EEEC',
  white: '#FFFFFF',
  shadow: 'rgba(16, 34, 31, 0.08)',
};

/** Default lists — prefer `useApp().expenseCategories` when rendering live UI. */
export const EXPENSE_CATS = DEFAULT_EXPENSE_CATS;
export const INCOME_CATS = DEFAULT_INCOME_CATS;

export function catMeta(
  name: string,
  kind: 'expense' | 'income' = 'expense',
  lists?: { expense?: CategoryDef[]; income?: CategoryDef[] },
) {
  const list =
    kind === 'income'
      ? lists?.income || DEFAULT_INCOME_CATS
      : lists?.expense || DEFAULT_EXPENSE_CATS;
  return findCategoryMeta(list, name);
}

export function fmt(n: number, currencyCode = 'INR') {
  const sym = currencyDisplaySymbol(currencyCode) || '₹';
  // INR → 1,00,000; other currencies → 100,000
  const locale = currencyCode === 'INR' ? 'en-IN' : 'en-US';
  const abs = Math.abs(n).toLocaleString(locale);
  return `${sym}${abs}`;
}

export function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

export function uid() {
  return `id_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
