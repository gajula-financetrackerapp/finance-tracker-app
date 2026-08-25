import { PALETTE } from '../constants';

export type CategoryDef = {
  name: string;
  icon: string;
  color: string;
};

export type CategoryKind = 'expense' | 'income';

export const DEFAULT_EXPENSE_CATS: CategoryDef[] = [
  { name: 'Groceries', icon: '🛍️', color: '#2E9E5B' },
  { name: 'Vegetables', icon: '🥕', color: '#3DBE7B' },
  { name: 'Fruits', icon: '🍒', color: '#E14D6E' },
  { name: 'Food', icon: '🍔', color: '#E07A3D' },
  { name: 'Snacks', icon: '🍿', color: '#E07A3D' },
  { name: 'Alcohol', icon: '🍷', color: '#D64545' },
  { name: 'Cigarettes', icon: '🚬', color: '#A9745B' },
  { name: 'Shopping', icon: '🛒', color: '#1FA7A3' },
  { name: 'Clothing', icon: '👕', color: '#845EC2' },
  { name: 'Jewellery', icon: '💍', color: '#C9A227' },
  { name: 'Beauty', icon: '💄', color: '#E14D6E' },
  { name: 'Electronics', icon: '💻', color: '#4A8FE7' },
  { name: 'Kids', icon: '🍼', color: '#FF7A9C' },
  { name: 'Transportation', icon: '🚌', color: '#4C8DFF' },
  { name: 'Car', icon: '🚗', color: '#6B7C78' },
  { name: 'Travel', icon: '✈️', color: '#26C6DA' },
  { name: 'Housing', icon: '🏠', color: '#289A5E' },
  { name: 'Home', icon: '🛋️', color: '#B06DFF' },
  { name: 'Repairs', icon: '🔧', color: '#8A8A8E' },
  { name: 'Phone', icon: '📱', color: '#4C8DFF' },
  { name: 'Pets', icon: '🐶', color: '#E8A33D' },
  { name: 'Health', icon: '💊', color: '#D64545' },
  { name: 'Education', icon: '🎓', color: '#8B6DFF' },
  { name: 'Sports', icon: '🏃', color: '#26D0A0' },
  { name: 'Entertainment', icon: '🎮', color: '#E5A100' },
  { name: 'Social', icon: '🥂', color: '#D4A94C' },
  { name: 'Lottery', icon: '🎲', color: '#E5A100' },
  { name: 'Gifts', icon: '🎁', color: '#FF7A5C' },
  { name: 'Flowers', icon: '💐', color: '#E8659B' },
  { name: 'Withdraw', icon: '🏧', color: '#5A7D9A' },
  { name: 'Donations', icon: '🤲', color: '#2E9E5B' },
  { name: 'Loans', icon: '🏦', color: '#2F6FED' },
  { name: 'EMI', icon: '📆', color: '#7B54D8' },
  { name: 'Electricity Bill', icon: '💡', color: '#F2B705' },
  { name: 'Internet Bill', icon: '🌐', color: '#2AA9E0' },
  { name: 'Gas Bill', icon: '🔥', color: '#E2603F' },
  { name: 'Water Bill', icon: '🚰', color: '#2BB3C0' },
  { name: 'Gym Bill', icon: '🏋️', color: '#D64592' },
  { name: 'Recharge', icon: '📶', color: '#17A398' },
  { name: 'Bill Pay', icon: '🧾', color: '#C2703D' },
  { name: 'Credit Card Bill', icon: '💳', color: '#7C5CD6' },
  // Keep Others last: findCategoryMeta falls back to the final entry.
  { name: 'Others', icon: '🪙', color: '#6B7C78' },
];

export const DEFAULT_INCOME_CATS: CategoryDef[] = [
  { name: 'Salary', icon: '💼', color: '#1F9D63' },
  { name: 'Investments', icon: '📈', color: '#4C8DFF' },
  { name: 'Part-Time', icon: '🤝', color: '#1FA7A3' },
  { name: 'Bonus', icon: '🏆', color: '#E5A100' },
  { name: 'Cashback', icon: '💸', color: '#0EA5A0' },
  { name: 'Gift', icon: '🎁', color: '#FF7A5C' },
  { name: 'Others', icon: '🪙', color: '#6B7C78' },
];

export const CATEGORY_ICON_CHOICES = [
  '🛍️', '🛒', '🍔', '📱', '🎮', '🎓', '💄', '🏃', '🥂', '🚌', '👕', '🚗', '🍷', '💻', '✈️',
  '💊', '🐶', '🔧', '🏠', '🛋️', '🎁', '🤲', '🎲', '🍿', '🍼', '🥕', '🍒', '🪙', '💼', '📈',
  '🤝', '🏆', '💰', '💵', '🏦', '🧾', '📦', '☕', '🍕', '⛽', '🎬', '📚', '🧹', '🪴', '✨',
  '📆', '📶', '💡', '🌐', '🔥', '🚰', '🏋️', '💸', '💳', '💐', '🏧', '💍',
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
  return repairOthersIcon(out.length ? out : fallback.map((c) => ({ ...c })));
}

/** Others is the coin bucket. A global icon picker briefly saved Food's burger on it. */
export function repairOthersIcon(list: CategoryDef[]): CategoryDef[] {
  const coin =
    DEFAULT_EXPENSE_CATS.find((c) => c.name === 'Others')?.icon ||
    DEFAULT_INCOME_CATS.find((c) => c.name === 'Others')?.icon ||
    '🪙';
  let changed = false;
  const next = list.map((c) => {
    if (c.name !== 'Others' || c.icon === coin) return c;
    changed = true;
    return { ...c, icon: coin };
  });
  return changed ? next : list;
}

export type CategorySeed = {
  id: string;
  expense?: string[];
  income?: string[];
};

/**
 * Categories added after the first release. Existing installs keep their saved
 * list, so new defaults would never reach them without this. Each batch is
 * applied once and remembered, so deleting a seeded category makes it stay
 * deleted instead of returning on the next launch.
 */
export const CATEGORY_SEEDS: CategorySeed[] = [
  {
    id: 'bills-loans-2026-08',
    expense: [
      'Loans',
      'EMI',
      'Electricity Bill',
      'Internet Bill',
      'Gas Bill',
      'Water Bill',
      'Gym Bill',
      'Recharge',
      'Bill Pay',
    ],
    income: ['Cashback'],
  },
  {
    id: 'credit-card-bill-2026-08',
    expense: ['Credit Card Bill'],
  },
  {
    // Imported SMS lands in these often enough that Others was hiding them.
    id: 'flowers-withdraw-2026-08',
    expense: ['Flowers', 'Withdraw'],
  },
  {
    // Big, infrequent buys that Shopping and Clothing were swallowing.
    id: 'jewellery-2026-08',
    expense: ['Jewellery'],
  },
];

function seedInto(list: CategoryDef[], names: string[] | undefined, defaults: CategoryDef[]) {
  if (!names?.length) return { list, added: 0 };
  const have = new Set(list.map((c) => c.name.trim().toLowerCase()));
  const additions: CategoryDef[] = [];
  for (const name of names) {
    if (have.has(name.trim().toLowerCase())) continue;
    const def = defaults.find((d) => d.name === name);
    if (def) additions.push({ ...def });
  }
  if (!additions.length) return { list, added: 0 };

  // Others is the fallback bucket and must stay last.
  const tailIdx = list.findIndex((c) => c.name === 'Others');
  if (tailIdx < 0) return { list: [...list, ...additions], added: additions.length };
  return {
    list: [...list.slice(0, tailIdx), ...additions, ...list.slice(tailIdx)],
    added: additions.length,
  };
}

/** Returns the seeded lists plus the batch ids that were newly applied. */
export function applyCategorySeeds(
  current: { expense: CategoryDef[]; income: CategoryDef[] },
  appliedIds: string[],
  scope = '',
): {
  expense: CategoryDef[];
  income: CategoryDef[];
  newlyApplied: string[];
  changed: boolean;
} {
  const done = new Set(appliedIds);
  let expense = current.expense;
  let income = current.income;
  const newlyApplied: string[] = [];
  let changed = false;

  for (const seed of CATEGORY_SEEDS) {
    const key = scope ? `${seed.id}:${scope}` : seed.id;
    if (done.has(key)) continue;
    const nextExp = seedInto(expense, seed.expense, DEFAULT_EXPENSE_CATS);
    const nextInc = seedInto(income, seed.income, DEFAULT_INCOME_CATS);
    expense = nextExp.list;
    income = nextInc.list;
    if (nextExp.added || nextInc.added) changed = true;
    newlyApplied.push(key);
  }

  const nextExpense = repairOthersIcon(expense);
  const nextIncome = repairOthersIcon(income);
  if (nextExpense !== expense || nextIncome !== income) changed = true;

  return { expense: nextExpense, income: nextIncome, newlyApplied, changed };
}

export function findCategoryMeta(
  list: CategoryDef[],
  name: string,
): CategoryDef {
  const wanted = (name || '').trim().toLowerCase();
  return (
    list.find((c) => c.name === name) ||
    (wanted ? list.find((c) => c.name.trim().toLowerCase() === wanted) : undefined) ||
    list.find((c) => c.name === 'Others') ||
    list[list.length - 1] ||
    DEFAULT_EXPENSE_CATS[DEFAULT_EXPENSE_CATS.length - 1]
  );
}
