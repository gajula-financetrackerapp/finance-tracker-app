import { PALETTE } from '../constants';

export type CategoryDef = {
  name: string;
  icon: string;
  color: string;
};

export type CategoryKind = 'expense' | 'income';

export const DEFAULT_EXPENSE_CATS: CategoryDef[] = [
  { name: 'Groceries', icon: '🛍️', color: '#2E9E5B' },
  { name: 'Shopping', icon: '🛒', color: '#1FA7A3' },
  { name: 'Food', icon: '🍔', color: '#E07A3D' },
  { name: 'Phone', icon: '📱', color: '#4C8DFF' },
  { name: 'Entertainment', icon: '🎮', color: '#E5A100' },
  { name: 'Education', icon: '🎓', color: '#8B6DFF' },
  { name: 'Beauty', icon: '💄', color: '#E14D6E' },
  { name: 'Sports', icon: '🏃', color: '#26D0A0' },
  { name: 'Social', icon: '🥂', color: '#D4A94C' },
  { name: 'Transportation', icon: '🚌', color: '#4C8DFF' },
  { name: 'Clothing', icon: '👕', color: '#845EC2' },
  { name: 'Car', icon: '🚗', color: '#6B7C78' },
  { name: 'Alcohol', icon: '🍷', color: '#D64545' },
  { name: 'Cigarettes', icon: '🚬', color: '#A9745B' },
  { name: 'Electronics', icon: '💻', color: '#4A8FE7' },
  { name: 'Travel', icon: '✈️', color: '#26C6DA' },
  { name: 'Health', icon: '💊', color: '#D64545' },
  { name: 'Pets', icon: '🐶', color: '#E8A33D' },
  { name: 'Repairs', icon: '🔧', color: '#8A8A8E' },
  { name: 'Housing', icon: '🏠', color: '#289A5E' },
  { name: 'Home', icon: '🛋️', color: '#B06DFF' },
  { name: 'Gifts', icon: '🎁', color: '#FF7A5C' },
  { name: 'Donations', icon: '🤲', color: '#2E9E5B' },
  { name: 'Lottery', icon: '🎲', color: '#E5A100' },
  { name: 'Snacks', icon: '🍿', color: '#E07A3D' },
  { name: 'Kids', icon: '🍼', color: '#FF7A9C' },
  { name: 'Vegetables', icon: '🥕', color: '#3DBE7B' },
  { name: 'Fruits', icon: '🍒', color: '#E14D6E' },
  { name: 'Others', icon: '🪙', color: '#6B7C78' },
];

export const DEFAULT_INCOME_CATS: CategoryDef[] = [
  { name: 'Salary', icon: '💼', color: '#1F9D63' },
  { name: 'Investments', icon: '📈', color: '#4C8DFF' },
  { name: 'Part-Time', icon: '🤝', color: '#1FA7A3' },
  { name: 'Bonus', icon: '🏆', color: '#E5A100' },
  { name: 'Gift', icon: '🎁', color: '#FF7A5C' },
  { name: 'Others', icon: '🪙', color: '#6B7C78' },
];

export const CATEGORY_ICON_CHOICES = [
  '🛍️', '🛒', '🍔', '📱', '🎮', '🎓', '💄', '🏃', '🥂', '🚌', '👕', '🚗', '🍷', '💻', '✈️',
  '💊', '🐶', '🔧', '🏠', '🛋️', '🎁', '🤲', '🎲', '🍿', '🍼', '🥕', '🍒', '🪙', '💼', '📈',
  '🤝', '🏆', '💰', '💵', '🏦', '🧾', '📦', '☕', '🍕', '⛽', '🎬', '📚', '🧹', '🪴', '✨',
];

export function normalizeCategoryList(
  raw: unknown,
  fallback: CategoryDef[],
): CategoryDef[] {
  if (!Array.isArray(raw) || raw.length === 0) return fallback.map((c) => ({ ...c }));
  const out: CategoryDef[] = [];
  raw.forEach((item, i) => {
    if (!item || typeof item !== 'object') return;
    const row = item as Partial<CategoryDef>;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!name) return;
    out.push({
      name,
      icon: typeof row.icon === 'string' && row.icon ? row.icon : '🪙',
      color:
        typeof row.color === 'string' && row.color
          ? row.color
          : PALETTE[i % PALETTE.length],
    });
  });
  return out.length ? out : fallback.map((c) => ({ ...c }));
}

export function findCategoryMeta(
  list: CategoryDef[],
  name: string,
): CategoryDef {
  return list.find((c) => c.name === name) || list[list.length - 1] || DEFAULT_EXPENSE_CATS[DEFAULT_EXPENSE_CATS.length - 1];
}
