import { currencyDisplaySymbol, THEMES } from './constants';
import {
  DEFAULT_EXPENSE_CATS,
  DEFAULT_INCOME_CATS,
  findCategoryMeta,
  type CategoryDef,
} from './categories/defaults';
import type { ThemeTokens } from './types';

/** Default Pulse Teal — prefer `useApp().theme` so the whole app follows the selected color. */
export const theme: ThemeTokens = THEMES.teal;

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
  const locale = currencyCode === 'INR' ? 'en-IN' : 'en-US';
  const digits = Math.abs(n).toLocaleString(locale);
  const body = `${sym}${digits}`;
  return n < 0 ? `-${body}` : body;
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
