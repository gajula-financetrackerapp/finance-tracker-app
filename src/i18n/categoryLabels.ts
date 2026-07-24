import { translate, type TranslationKey } from './translations';

/**
 * Canonical English names (stored on transactions) → i18n keys.
 * Custom user categories are shown as-is.
 */
const CATEGORY_KEYS: Record<string, TranslationKey> = {
  Groceries: 'cat.groceries',
  Shopping: 'cat.shopping',
  Food: 'cat.food',
  Phone: 'cat.phone',
  Entertainment: 'cat.entertainment',
  Education: 'cat.education',
  Beauty: 'cat.beauty',
  Sports: 'cat.sports',
  Social: 'cat.social',
  Transportation: 'cat.transportation',
  Clothing: 'cat.clothing',
  Car: 'cat.car',
  Alcohol: 'cat.alcohol',
  Cigarettes: 'cat.cigarettes',
  Electronics: 'cat.electronics',
  Travel: 'cat.travel',
  Health: 'cat.health',
  Pets: 'cat.pets',
  Repairs: 'cat.repairs',
  Housing: 'cat.housing',
  Home: 'cat.home',
  Gifts: 'cat.gifts',
  Donations: 'cat.donations',
  Lottery: 'cat.lottery',
  Snacks: 'cat.snacks',
  Kids: 'cat.kids',
  Vegetables: 'cat.vegetables',
  Fruits: 'cat.fruits',
  Others: 'cat.others',
  Salary: 'cat.salary',
  Investments: 'cat.investments',
  'Part-Time': 'cat.partTime',
  Bonus: 'cat.bonus',
  Gift: 'cat.gift',
  // Grocery picker subcategories
  'Dairy & Eggs': 'groc.dairy',
  'Meat & Seafood': 'groc.meat',
  Bakery: 'groc.bakery',
  'Spices & Condiments': 'groc.spices',
  Beverages: 'groc.beverages',
  'Frozen Foods': 'groc.frozen',
};

/** Display label for a stored category name in the current app language. */
export function categoryLabel(
  preferredLanguage: string | null | undefined,
  name: string,
): string {
  const key = CATEGORY_KEYS[name];
  if (!key) return name;
  return translate(preferredLanguage, key);
}

export function isBuiltinCategoryName(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(CATEGORY_KEYS, name);
}
