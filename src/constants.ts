import { AppConfig, ThemeKey, ThemeTokens } from './types';

export const THEMES: Record<ThemeKey, ThemeTokens> = {
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
  appName: 'Finance Tracker',
  theme: 'yellow',
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
  { name: 'Health', icon: '💊' },
  { name: 'Housing', icon: '🏠' },
  { name: 'Travel', icon: '✈️' },
  { name: 'Gifts', icon: '🎁' },
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
      { name: 'Spinach', icon: '🥬' },
    ],
  },
  {
    name: 'Fruits',
    icon: '🍎',
    items: [
      { name: 'Apple', icon: '🍎' },
      { name: 'Banana', icon: '🍌' },
      { name: 'Orange', icon: '🍊' },
      { name: 'Mango', icon: '🥭' },
      { name: 'Grapes', icon: '🍇' },
    ],
  },
  {
    name: 'Dairy & Eggs',
    icon: '🥛',
    items: [
      { name: 'Milk', icon: '🥛' },
      { name: 'Curd / Yogurt', icon: '🥣' },
      { name: 'Cheese', icon: '🧀' },
      { name: 'Eggs', icon: '🥚' },
    ],
  },
  {
    name: 'Grains & Cereals',
    icon: '🌾',
    items: [
      { name: 'Rice', icon: '🍚' },
      { name: 'Wheat Flour', icon: '🌾' },
      { name: 'Oats', icon: '🌾' },
      { name: 'Pasta', icon: '🍝' },
    ],
  },
];

export const STORAGE_KEYS = {
  config: 'aio_config',
  finance: 'aio_finance',
  expenseReminders: 'aio_expreminders',
  medReminders: 'aio_medreminders',
  groceryReminders: 'aio_groceryreminders',
  shoppingList: 'aio_shoppinglist',
  generalReminders: 'aio_generalreminders',
} as const;
