import type { CategoryDef, CategoryKind } from './defaults';

/** Purpose buckets for expense category UI (stored names stay English). */
export type ExpenseGroupId =
  | 'food'
  | 'shopping'
  | 'transport'
  | 'home'
  | 'health'
  | 'lifestyle'
  | 'giving'
  | 'custom'
  | 'other';

export type IncomeGroupId = 'earnings' | 'extra' | 'custom' | 'other';

export type CategoryGroupId = ExpenseGroupId | IncomeGroupId;

export type CategoryGroupSection<T extends CategoryDef = CategoryDef> = {
  id: CategoryGroupId;
  /** i18n key, e.g. categories.groupFood */
  titleKey: string;
  data: T[];
};

const EXPENSE_GROUP_ORDER: ExpenseGroupId[] = [
  'food',
  'shopping',
  'transport',
  'home',
  'health',
  'lifestyle',
  'giving',
  'custom',
  'other',
];

const INCOME_GROUP_ORDER: IncomeGroupId[] = ['earnings', 'extra', 'custom', 'other'];

const EXPENSE_NAME_GROUP: Record<string, ExpenseGroupId> = {
  Groceries: 'food',
  Vegetables: 'food',
  Fruits: 'food',
  Food: 'food',
  Snacks: 'food',
  Alcohol: 'food',
  Cigarettes: 'food',
  Shopping: 'shopping',
  Clothing: 'shopping',
  Beauty: 'shopping',
  Electronics: 'shopping',
  Kids: 'shopping',
  Transportation: 'transport',
  Car: 'transport',
  Travel: 'transport',
  Housing: 'home',
  Home: 'home',
  Repairs: 'home',
  Phone: 'home',
  Pets: 'home',
  Health: 'health',
  Education: 'health',
  Sports: 'health',
  Entertainment: 'lifestyle',
  Social: 'lifestyle',
  Lottery: 'lifestyle',
  Gifts: 'giving',
  Donations: 'giving',
  Others: 'other',
};

const INCOME_NAME_GROUP: Record<string, IncomeGroupId> = {
  Salary: 'earnings',
  'Part-Time': 'earnings',
  Bonus: 'earnings',
  Investments: 'extra',
  Gift: 'extra',
  Others: 'other',
};

const EXPENSE_TITLE: Record<ExpenseGroupId, string> = {
  food: 'categories.groupFood',
  shopping: 'categories.groupShopping',
  transport: 'categories.groupTransport',
  home: 'categories.groupHome',
  health: 'categories.groupHealth',
  lifestyle: 'categories.groupLifestyle',
  giving: 'categories.groupGiving',
  custom: 'categories.groupCustom',
  other: 'categories.groupOther',
};

const INCOME_TITLE: Record<IncomeGroupId, string> = {
  earnings: 'categories.groupEarnings',
  extra: 'categories.groupExtra',
  custom: 'categories.groupCustom',
  other: 'categories.groupOther',
};

function expenseGroupFor(name: string): ExpenseGroupId {
  return EXPENSE_NAME_GROUP[name] || 'custom';
}

function incomeGroupFor(name: string): IncomeGroupId {
  return INCOME_NAME_GROUP[name] || 'custom';
}

/** Preferred display order inside each expense group (Others last overall). */
export const EXPENSE_DISPLAY_ORDER: string[] = [
  'Groceries',
  'Vegetables',
  'Fruits',
  'Food',
  'Snacks',
  'Alcohol',
  'Cigarettes',
  'Shopping',
  'Clothing',
  'Beauty',
  'Electronics',
  'Kids',
  'Transportation',
  'Car',
  'Travel',
  'Housing',
  'Home',
  'Repairs',
  'Phone',
  'Pets',
  'Health',
  'Education',
  'Sports',
  'Entertainment',
  'Social',
  'Lottery',
  'Gifts',
  'Donations',
  'Others',
];

export const INCOME_DISPLAY_ORDER: string[] = [
  'Salary',
  'Part-Time',
  'Bonus',
  'Investments',
  'Gift',
  'Others',
];

function sortByPreferred(list: CategoryDef[], preferred: string[]): CategoryDef[] {
  const rank = new Map(preferred.map((n, i) => [n, i]));
  return [...list].sort((a, b) => {
    const ra = rank.has(a.name) ? rank.get(a.name)! : 1000;
    const rb = rank.has(b.name) ? rank.get(b.name)! : 1000;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });
}

/** Group categories by purpose for Settings + Add picker. */
export function groupCategoriesByPurpose(
  list: CategoryDef[],
  kind: CategoryKind,
): CategoryGroupSection[] {
  if (kind === 'income') {
    const buckets = new Map<IncomeGroupId, CategoryDef[]>();
    for (const id of INCOME_GROUP_ORDER) buckets.set(id, []);
    for (const cat of list) {
      const id = incomeGroupFor(cat.name);
      buckets.get(id)!.push(cat);
    }
    return INCOME_GROUP_ORDER.map((id) => ({
      id,
      titleKey: INCOME_TITLE[id],
      data: sortByPreferred(buckets.get(id) || [], INCOME_DISPLAY_ORDER),
    })).filter((s) => s.data.length > 0);
  }

  const buckets = new Map<ExpenseGroupId, CategoryDef[]>();
  for (const id of EXPENSE_GROUP_ORDER) buckets.set(id, []);
  for (const cat of list) {
    const id = expenseGroupFor(cat.name);
    buckets.get(id)!.push(cat);
  }
  return EXPENSE_GROUP_ORDER.map((id) => ({
    id,
    titleKey: EXPENSE_TITLE[id],
    data: sortByPreferred(buckets.get(id) || [], EXPENSE_DISPLAY_ORDER),
  })).filter((s) => s.data.length > 0);
}
