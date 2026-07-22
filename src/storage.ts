import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_CONFIG } from './constants';
import { STORAGE_KEYS } from './constants';
import { AppConfig, FinanceState } from './types';
import { uid } from './utils';

export function defaultFinance(currency = DEFAULT_CONFIG.currency): FinanceState {
  return {
    accounts: [
      {
        id: uid(),
        name: 'Cash',
        type: 'Default',
        currency,
        amount: 0,
        icon: '💵',
        excluded: false,
      },
    ],
    transactions: [],
    budget: 0,
  };
}

export function mergeConfig(saved: Partial<AppConfig> | null): AppConfig {
  const merged: AppConfig = {
    ...DEFAULT_CONFIG,
    ...(saved || {}),
    features: {
      ...DEFAULT_CONFIG.features,
      ...(saved?.features || {}),
    },
    medicineTimes: {
      ...DEFAULT_CONFIG.medicineTimes,
      ...(saved?.medicineTimes || {}),
    },
    expenseOffsets:
      saved?.expenseOffsets?.length ? saved.expenseOffsets : DEFAULT_CONFIG.expenseOffsets,
    groceryOffsets:
      saved?.groceryOffsets?.length ? saved.groceryOffsets : DEFAULT_CONFIG.groceryOffsets,
  };
  return merged;
}

async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function persist(key: string, value: unknown) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function loadAll() {
  const config = mergeConfig(await readJSON(STORAGE_KEYS.config, null));
  let finance = await readJSON<FinanceState | null>(STORAGE_KEYS.finance, null);
  if (!finance || !Array.isArray(finance.accounts) || finance.accounts.length === 0) {
    finance = defaultFinance(config.currency);
  }
  finance.transactions = Array.isArray(finance.transactions) ? finance.transactions : [];
  if (typeof finance.budget !== 'number' || Number.isNaN(finance.budget)) finance.budget = 0;

  const expenseReminders = await readJSON(STORAGE_KEYS.expenseReminders, []);
  const medReminders = await readJSON(STORAGE_KEYS.medReminders, []);
  const groceryReminders = await readJSON(STORAGE_KEYS.groceryReminders, []);
  const shoppingList = await readJSON(STORAGE_KEYS.shoppingList, []);
  const generalReminders = await readJSON(STORAGE_KEYS.generalReminders, []);

  return {
    config,
    finance,
    expenseReminders: Array.isArray(expenseReminders) ? expenseReminders : [],
    medReminders: Array.isArray(medReminders) ? medReminders : [],
    groceryReminders: Array.isArray(groceryReminders) ? groceryReminders : [],
    shoppingList: Array.isArray(shoppingList) ? shoppingList : [],
    generalReminders: Array.isArray(generalReminders) ? generalReminders : [],
  };
}

export async function clearAllData() {
  await Promise.all(Object.values(STORAGE_KEYS).map((key) => AsyncStorage.removeItem(key)));
}
