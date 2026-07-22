import { AppConfig, ThemeKey, ThemeTokens } from './types';

export const THEMES: Record<ThemeKey, ThemeTokens> = {
  teal: {
    label: 'Pulse Teal',
    primary: '#1FA7A3',
    primaryDark: '#0F3D3E',
    bg: '#F3F6F5',
    card: '#FFFFFF',
    ink: '#10221F',
    muted: '#6B7C78',
    line: '#E3EBE9',
    green: '#1F9D63',
    red: '#D64545',
  },
  yellow: {
    label: 'Classic Yellow',
    primary: '#FFCD3C',
    primaryDark: '#F5B700',
    bg: '#F6F6F8',
    card: '#FFFFFF',
    ink: '#1A1A1A',
    muted: '#8A8A8E',
    line: '#ECECEE',
    green: '#2E9E5B',
    red: '#D64545',
  },
  dark: {
    label: 'Midnight',
    primary: '#F5B700',
    primaryDark: '#D89C00',
    bg: '#121212',
    card: '#1E1E1E',
    ink: '#F2F2F2',
    muted: '#A0A0A5',
    line: '#2A2A2E',
    green: '#2E9E5B',
    red: '#D64545',
  },
  blue: {
    label: 'Ocean Blue',
    primary: '#4C8DFF',
    primaryDark: '#2F6FE0',
    bg: '#F2F6FC',
    card: '#FFFFFF',
    ink: '#16233F',
    muted: '#6C7A93',
    line: '#E3E9F3',
    green: '#2E9E5B',
    red: '#D64545',
  },
  green: {
    label: 'Fresh Green',
    primary: '#3DBE7B',
    primaryDark: '#289A5E',
    bg: '#F2FBF6',
    card: '#FFFFFF',
    ink: '#103322',
    muted: '#6B8E7C',
    line: '#DFF1E7',
    green: '#2E9E5B',
    red: '#D64545',
  },
  rose: {
    label: 'Rose',
    primary: '#FF7A9C',
    primaryDark: '#E14D6E',
    bg: '#FFF5F7',
    card: '#FFFFFF',
    ink: '#3A1420',
    muted: '#A4818C',
    line: '#FBE3E9',
    green: '#2E9E5B',
    red: '#D64545',
  },
};

export const DEFAULT_CONFIG: AppConfig = {
  appName: 'Pulse Wallet',
  theme: 'teal',
  adminPassword: 'admin123',
  currency: 'INR',
  alarmsEnabled: true,
  medicineTimes: { Morning: '08:00', Afternoon: '13:00', Evening: '19:00' },
  alertTime: '09:00',
  expenseOffsets: [1, 0],
  groceryOffsets: [2, 1, 0],
  alarmDurationSec: 60,
  features: {
    finance: true,
    reminders: true,
    expenseReminder: true,
    medicineReminder: true,
    groceryExpiryReminder: true,
    generalReminder: true,
    financeCharts: true,
    financeReports: true,
    financeAccounts: true,
    shoppingList: true,
  },
};

export const EXPENSE_CATS = [
  { name: 'Groceries', icon: '🛍️' },
  { name: 'Shopping', icon: '🛒' },
  { name: 'Food', icon: '🍔' },
  { name: 'Phone', icon: '📱' },
  { name: 'Entertainment', icon: '🎮' },
  { name: 'Education', icon: '🎓' },
  { name: 'Beauty', icon: '💄' },
  { name: 'Sports', icon: '🏃' },
  { name: 'Social', icon: '🥂' },
  { name: 'Transportation', icon: '🚌' },
  { name: 'Clothing', icon: '👕' },
  { name: 'Car', icon: '🚗' },
  { name: 'Alcohol', icon: '🍷' },
  { name: 'Cigarettes', icon: '🚬' },
  { name: 'Electronics', icon: '💻' },
  { name: 'Travel', icon: '✈️' },
  { name: 'Health', icon: '💊' },
  { name: 'Pets', icon: '🐶' },
  { name: 'Repairs', icon: '🔧' },
  { name: 'Housing', icon: '🏠' },
  { name: 'Home', icon: '🛋️' },
  { name: 'Gifts', icon: '🎁' },
  { name: 'Donations', icon: '🤲' },
  { name: 'Lottery', icon: '🎲' },
  { name: 'Snacks', icon: '🍿' },
  { name: 'Kids', icon: '🍼' },
  { name: 'Vegetables', icon: '🥕' },
  { name: 'Fruits', icon: '🍒' },
  { name: 'Others', icon: '🪙' },
];

export const INCOME_CATS = [
  { name: 'Salary', icon: '💼' },
  { name: 'Investments', icon: '📈' },
  { name: 'Part-Time', icon: '🤝' },
  { name: 'Bonus', icon: '🏆' },
  { name: 'Gift', icon: '🎁' },
  { name: 'Others', icon: '🪙' },
];

export const ACCOUNT_ICONS = ['💵', '💳', '🏦', '💰', '👛', '🐷', '🔒', '₿', '📊', '📱'];

export const PALETTE = [
  '#F5B700', '#FF7A5C', '#FF5C7C', '#B06DFF', '#5C8DFF', '#26C6DA', '#26D0A0',
  '#8BC34A', '#D4A94C', '#A9745B', '#FF6B6B', '#845EC2', '#4A8FE7', '#E8A33D',
];

export const CURRENCIES = [
  { code: 'INR', sym: '₹', name: 'Indian Rupee' },
  { code: 'USD', sym: '$', name: 'United States Dollar' },
  { code: 'EUR', sym: '€', name: 'Euro' },
  { code: 'GBP', sym: '£', name: 'British Pound' },
  { code: 'JPY', sym: '¥', name: 'Japanese Yen' },
  { code: 'AUD', sym: 'A$', name: 'Australian Dollar' },
];

export const GROCERY_CATEGORIES = [
  {
    name: 'Vegetables',
    icon: '🥦',
    items: [
      { name: 'Tomato', icon: '🍅' },
      { name: 'Potato', icon: '🥔' },
      { name: 'Onion', icon: '🧅' },
      { name: 'Carrot', icon: '🥕' },
      { name: 'Cucumber', icon: '🥒' },
      { name: 'Spinach', icon: '🥬' },
      { name: 'Cabbage', icon: '🥬' },
      { name: 'Cauliflower', icon: '🥦' },
      { name: 'Broccoli', icon: '🥦' },
      { name: 'Bell Pepper', icon: '🫑' },
      { name: 'Garlic', icon: '🧄' },
      { name: 'Ginger', icon: '🫚' },
      { name: 'Green Peas', icon: '🟢' },
      { name: 'Corn', icon: '🌽' },
      { name: 'Beans', icon: '🫘' },
    ],
  },
  {
    name: 'Fruits',
    icon: '🍎',
    items: [
      { name: 'Apple', icon: '🍎' },
      { name: 'Banana', icon: '🍌' },
      { name: 'Orange', icon: '🍊' },
      { name: 'Grapes', icon: '🍇' },
      { name: 'Mango', icon: '🥭' },
      { name: 'Watermelon', icon: '🍉' },
      { name: 'Strawberry', icon: '🍓' },
      { name: 'Pineapple', icon: '🍍' },
      { name: 'Pear', icon: '🍐' },
      { name: 'Lemon', icon: '🍋' },
      { name: 'Papaya', icon: '🟠' },
      { name: 'Kiwi', icon: '🥝' },
      { name: 'Peach', icon: '🍑' },
      { name: 'Avocado', icon: '🥑' },
    ],
  },
  {
    name: 'Pulses & Lentils',
    icon: '🫘',
    items: [
      { name: 'Toor Dal', icon: '🫘' },
      { name: 'Moong Dal', icon: '🫘' },
      { name: 'Chana Dal', icon: '🫘' },
      { name: 'Masoor Dal', icon: '🫘' },
      { name: 'Urad Dal', icon: '🫘' },
      { name: 'Rajma (Kidney Beans)', icon: '🫘' },
      { name: 'Chickpeas (Chana)', icon: '🫘' },
      { name: 'Black-eyed Peas', icon: '🫘' },
      { name: 'Soybeans', icon: '🫘' },
    ],
  },
  {
    name: 'Dairy & Eggs',
    icon: '🥛',
    items: [
      { name: 'Milk', icon: '🥛' },
      { name: 'Curd / Yogurt', icon: '🥣' },
      { name: 'Cheese', icon: '🧀' },
      { name: 'Butter', icon: '🧈' },
      { name: 'Paneer', icon: '🧊' },
      { name: 'Eggs', icon: '🥚' },
      { name: 'Cream', icon: '🥛' },
    ],
  },
  {
    name: 'Meat & Seafood',
    icon: '🍗',
    items: [
      { name: 'Chicken', icon: '🍗' },
      { name: 'Mutton', icon: '🥩' },
      { name: 'Fish', icon: '🐟' },
      { name: 'Shrimp', icon: '🦐' },
      { name: 'Beef', icon: '🥩' },
    ],
  },
  {
    name: 'Grains & Cereals',
    icon: '🌾',
    items: [
      { name: 'Rice', icon: '🍚' },
      { name: 'Wheat Flour', icon: '🌾' },
      { name: 'Oats', icon: '🌾' },
      { name: 'Quinoa', icon: '🌾' },
      { name: 'Semolina (Suji)', icon: '🌾' },
      { name: 'Poha', icon: '🌾' },
      { name: 'Pasta', icon: '🍝' },
    ],
  },
  {
    name: 'Bakery',
    icon: '🍞',
    items: [
      { name: 'Bread', icon: '🍞' },
      { name: 'Buns', icon: '🥯' },
      { name: 'Cookies', icon: '🍪' },
      { name: 'Cake', icon: '🎂' },
    ],
  },
  {
    name: 'Spices & Condiments',
    icon: '🧂',
    items: [
      { name: 'Salt', icon: '🧂' },
      { name: 'Turmeric', icon: '🧂' },
      { name: 'Chili Powder', icon: '🌶️' },
      { name: 'Cumin', icon: '🧂' },
      { name: 'Coriander Powder', icon: '🧂' },
      { name: 'Garam Masala', icon: '🧂' },
      { name: 'Black Pepper', icon: '🧂' },
      { name: 'Mustard Seeds', icon: '🧂' },
      { name: 'Ketchup', icon: '🍅' },
      { name: 'Cooking Oil', icon: '🛢️' },
    ],
  },
  {
    name: 'Beverages',
    icon: '🧃',
    items: [
      { name: 'Juice', icon: '🧃' },
      { name: 'Soft Drinks', icon: '🥤' },
      { name: 'Tea', icon: '🍵' },
      { name: 'Coffee', icon: '☕' },
      { name: 'Water Bottles', icon: '💧' },
    ],
  },
  {
    name: 'Frozen Foods',
    icon: '🧊',
    items: [
      { name: 'Frozen Vegetables', icon: '🧊' },
      { name: 'Ice Cream', icon: '🍦' },
      { name: 'Frozen Peas', icon: '🧊' },
      { name: 'Frozen Fries', icon: '🍟' },
    ],
  },
  {
    name: 'Snacks',
    icon: '🍿',
    items: [
      { name: 'Chips', icon: '🍟' },
      { name: 'Biscuits', icon: '🍪' },
      { name: 'Namkeen', icon: '🥨' },
      { name: 'Popcorn', icon: '🍿' },
    ],
  },
];

/** Top-level expense cats that tag items directly (no nested subcategory step). */
export const GROCERY_DIRECT_EXPENSE_CATS = ['Vegetables', 'Fruits', 'Snacks'] as const;
export const GROCERY_FAMILY_CATS = ['Groceries', ...GROCERY_DIRECT_EXPENSE_CATS] as const;

export type GroceryItemScope =
  | {
      mode: 'direct';
      items: { name: string; icon: string }[];
      icon: string;
      categoryName: string;
    }
  | {
      mode: 'subcategory';
      subcats: (typeof GROCERY_CATEGORIES)[number][];
    };

export function getGroceryItemScope(category: string): GroceryItemScope | null {
  if ((GROCERY_DIRECT_EXPENSE_CATS as readonly string[]).includes(category)) {
    const cat = GROCERY_CATEGORIES.find((c) => c.name === category);
    return cat
      ? { mode: 'direct', items: cat.items, icon: cat.icon, categoryName: cat.name }
      : null;
  }
  if (category === 'Groceries') {
    const subcats = GROCERY_CATEGORIES.filter(
      (c) => !(GROCERY_DIRECT_EXPENSE_CATS as readonly string[]).includes(c.name),
    );
    return { mode: 'subcategory', subcats };
  }
  return null;
}

export function isGroceryFamilyCat(category: string) {
  return (GROCERY_FAMILY_CATS as readonly string[]).includes(category);
}

export const STORAGE_KEYS = {
  config: 'aio_config',
  finance: 'aio_finance_v2',
  expenseReminders: 'aio_expreminders',
  medReminders: 'aio_medreminders',
  groceryReminders: 'aio_groceryreminders',
  shoppingList: 'aio_shoppinglist',
  generalReminders: 'aio_generalreminders',
} as const;
