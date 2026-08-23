import {
  AppConfig,
  AdBannerConfig,
  FeedbackConfig,
  GoogleAdFormatFlags,
  GoogleAdFormatKey,
  GoogleAdsConfig,
  HomePrefs,
  PremiumFeaturesConfig,
  PremiumPlanConfig,
  ThemeCatalogConfig,
  ThemeKey,
  ThemeTokens,
} from './types';
import { withAppAliases, type ThemeCore } from './utils/buildTheme';
import { DEFAULT_PREMIUM_FEATURES } from './lib/premiumFeatures';
import { defaultPlusFeatures } from './lib/premiumCart';
import { DEFAULT_IMPORT_RULES } from './lib/importRules';

export type { CurrencyDef } from './data/currencies';
export { CURRENCIES, findCurrency, currencyDisplaySymbol } from './data/currencies';

export const DEFAULT_AD_BANNER: AdBannerConfig = {
  enabled: false,
  hideForPremium: true,
  endCardHoldSec: 120,
  items: [],
};

const DEFAULT_AD_FORMAT: GoogleAdFormatFlags = {
  enabled: true,
  hideForPremium: true,
};

export const DEFAULT_GOOGLE_AD_FORMATS: Record<GoogleAdFormatKey, GoogleAdFormatFlags> = {
  banner: { ...DEFAULT_AD_FORMAT },
  native: { ...DEFAULT_AD_FORMAT },
  interstitial: { ...DEFAULT_AD_FORMAT },
  rewarded: { ...DEFAULT_AD_FORMAT },
  rewardedInterstitial: { ...DEFAULT_AD_FORMAT },
  appOpen: { ...DEFAULT_AD_FORMAT },
};

/** AdMob defaults — test IDs until you paste real unit IDs from apps.admob.com */
export const DEFAULT_GOOGLE_ADS: GoogleAdsConfig = {
  enabled: true,
  hideForPremium: true,
  useTestIds: true,
  formats: {
    banner: { ...DEFAULT_AD_FORMAT },
    native: { ...DEFAULT_AD_FORMAT },
    interstitial: { ...DEFAULT_AD_FORMAT },
    rewarded: { ...DEFAULT_AD_FORMAT },
    rewardedInterstitial: { ...DEFAULT_AD_FORMAT },
    appOpen: { ...DEFAULT_AD_FORMAT },
  },
  androidBannerUnitId: '',
  iosBannerUnitId: '',
  androidInterstitialUnitId: '',
  iosInterstitialUnitId: '',
  androidRewardedInterstitialUnitId: '',
  iosRewardedInterstitialUnitId: '',
  androidRewardedUnitId: '',
  iosRewardedUnitId: '',
  androidNativeUnitId: '',
  iosNativeUnitId: '',
  androidAppOpenUnitId: '',
  iosAppOpenUnitId: '',
};

/** Destination is admin-only; defaults ship with the app. */
export const DEFAULT_FEEDBACK: FeedbackConfig = {
  channel: 'email',
  email: 'gajulaallinonefinancetracker@gmail.com',
  whatsapp: '',
};

/**
 * Manual Premium checkout defaults — admin can override in Admin → Premium.
 * User pays, emails payment ref to feedback Gmail; admin sets is_premium.
 */
export const DEFAULT_PREMIUM_PLAN: PremiumPlanConfig = {
  priceLabel: '₹399/year',
  amountInr: 399,
  compareAtAmountInr: 0,
  monthlyEnabled: true,
  monthlyPriceLabel: '₹39/month',
  monthlyAmountInr: 39,
  monthlyCompareAtAmountInr: 0,
  premiumEnabled: true,
  plusEnabled: true,
  plusPriceLabel: '₹199/year',
  plusAmountInr: 199,
  plusCompareAtAmountInr: 0,
  plusMonthlyPriceLabel: '₹19/month',
  plusMonthlyAmountInr: 19,
  plusMonthlyCompareAtAmountInr: 0,
  plusAddonMonthlyInr: 4,
  plusAddonYearlyInr: 20,
  plusFeatures: defaultPlusFeatures(4, 20),
  upiId: '',
  payeeName: 'Kashio Premium',
};

/** Free: Pulse Royal. Premium: dual-tone motion packs. Flat accents stay hidden. */
export const DEFAULT_THEME_CATALOG: ThemeCatalogConfig = {
  unlockAllPremium: false,
  access: {
    teal: 'free',
    yellow: 'hidden',
    green: 'hidden',
    blue: 'hidden',
    dark: 'hidden',
    rose: 'hidden',
    sapphire: 'hidden',
    amethyst: 'hidden',
    ember: 'hidden',
    gold: 'hidden',
    inkNavy: 'hidden',
    jade: 'hidden',
    champagne: 'hidden',
    ruby: 'hidden',
    aurora: 'premium',
    sunset: 'premium',
    obsidian: 'premium',
    // Retired as a Premium pack: its palette is now the free colour.
    royal: 'hidden',
    velvet: 'premium',
    lagoon: 'premium',
    sakura: 'premium',
    forest: 'premium',
    copper: 'premium',
    tangerine: 'premium',
  },
};

const THEME_CORES: Record<ThemeKey, ThemeCore> = {
  // Key stays 'teal' because it is the stored value in every existing install
  // and in the admin catalog; only the colour it names has changed.
  teal: {
    label: 'Pulse Royal',
    // Royal, flattened for the free tier: one blue, no second stop, and the
    // biscuit tone carrying the buttons, chips and borders.
    primary: '#E8C39E',
    primaryDark: '#0A2540',
    bg: '#F7F5F1',
    card: '#FFFFFF',
    ink: '#142033',
    muted: '#7A7F8A',
    // A shade deeper than the accent: at full biscuit a hairline on a white
    // card is 1.5:1 and effectively invisible, which is not a border.
    line: '#D6A472',
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
  sapphire: {
    label: 'Sapphire',
    primary: '#2F6BFF',
    primaryDark: '#1E4FD6',
    bg: '#F3F6FF',
    card: '#FFFFFF',
    ink: '#122047',
    muted: '#6B7AA8',
    line: '#E0E7FF',
    green: '#2E9E5B',
    red: '#D64545',
  },
  amethyst: {
    label: 'Amethyst',
    primary: '#7B5CFF',
    primaryDark: '#5E3FE0',
    bg: '#F7F4FF',
    card: '#FFFFFF',
    ink: '#241A4A',
    muted: '#7A7199',
    line: '#E8E1FF',
    green: '#2E9E5B',
    red: '#D64545',
  },
  ember: {
    label: 'Ember',
    primary: '#E85D4C',
    primaryDark: '#C44738',
    bg: '#FFF6F4',
    card: '#FFFFFF',
    ink: '#3A1713',
    muted: '#9A736C',
    line: '#F8E2DE',
    green: '#2E9E5B',
    red: '#D64545',
  },
  gold: {
    label: 'Gold',
    primary: '#C9A227',
    primaryDark: '#A4831A',
    bg: '#FBF8EF',
    card: '#FFFFFF',
    ink: '#2E2610',
    muted: '#8A7E55',
    line: '#F0E8C8',
    green: '#2E9E5B',
    red: '#D64545',
  },
  inkNavy: {
    label: 'Ink Navy',
    primary: '#1B3A57',
    primaryDark: '#12293E',
    bg: '#F3F6F9',
    card: '#FFFFFF',
    ink: '#0E1C2A',
    muted: '#6A7A8A',
    line: '#DCE4EC',
    green: '#2E9E5B',
    red: '#D64545',
  },
  jade: {
    label: 'Jade',
    primary: '#0D9488',
    primaryDark: '#0A7A70',
    bg: '#F1FAF9',
    card: '#FFFFFF',
    ink: '#0C2F2C',
    muted: '#5F857F',
    line: '#D5EDEA',
    green: '#2E9E5B',
    red: '#D64545',
  },
  champagne: {
    label: 'Champagne',
    primary: '#D4A574',
    primaryDark: '#B88755',
    bg: '#FBF7F2',
    card: '#FFFFFF',
    ink: '#3A2A1A',
    muted: '#8F7B66',
    line: '#F0E6DA',
    green: '#2E9E5B',
    red: '#D64545',
  },
  ruby: {
    label: 'Ruby',
    primary: '#C41E3A',
    primaryDark: '#9E1730',
    bg: '#FFF4F6',
    card: '#FFFFFF',
    ink: '#3A1018',
    muted: '#9A6B74',
    line: '#F6DCE2',
    green: '#2E9E5B',
    red: '#D64545',
  },
  aurora: {
    label: 'Aurora',
    primary: '#00D2A0',
    primaryDark: '#1B1464',
    secondary: '#00D2A0',
    headerEnd: '#312E81',
    dualTone: true,
    premiumMotion: true,
    bg: '#F4F6FF',
    card: '#FFFFFF',
    ink: '#12103A',
    muted: '#6B6F99',
    line: '#E0E3F5',
    green: '#2E9E5B',
    red: '#D64545',
  },
  sunset: {
    label: 'Sunset',
    primary: '#FFB300',
    primaryDark: '#C2185B',
    secondary: '#FFB300',
    headerEnd: '#7B1FA2',
    dualTone: true,
    premiumMotion: true,
    bg: '#FFF7F9',
    card: '#FFFFFF',
    ink: '#3A1024',
    muted: '#9A6B7C',
    line: '#F5DCE6',
    green: '#2E9E5B',
    red: '#D64545',
  },
  obsidian: {
    label: 'Obsidian',
    primary: '#7DD3FC',
    primaryDark: '#0B0F14',
    secondary: '#7DD3FC',
    headerEnd: '#1E293B',
    dualTone: true,
    premiumMotion: true,
    bg: '#F3F6F9',
    card: '#FFFFFF',
    ink: '#0E1C2A',
    muted: '#6A7A8A',
    line: '#DCE4EC',
    green: '#2E9E5B',
    red: '#D64545',
  },
  // Retired: this palette is the free colour now (see `teal` above). Kept so
  // saved installs still resolve, and migrated to 'teal' on load.
  royal: {
    label: 'Royal',
    primary: '#E8C39E',
    primaryDark: '#0A2540',
    secondary: '#E8C39E',
    headerEnd: '#1B3A57',
    dualTone: true,
    premiumMotion: true,
    bg: '#F7F5F1',
    card: '#FFFFFF',
    ink: '#142033',
    muted: '#7A7F8A',
    line: '#E5E1D8',
    green: '#2E9E5B',
    red: '#D64545',
  },
  velvet: {
    label: 'Velvet',
    primary: '#C084FC',
    primaryDark: '#3B0764',
    secondary: '#E9D5FF',
    headerEnd: '#6B21A8',
    dualTone: true,
    premiumMotion: true,
    bg: '#FAF5FF',
    card: '#FFFFFF',
    ink: '#2E1065',
    muted: '#7C6B99',
    line: '#EDE4F7',
    green: '#2E9E5B',
    red: '#D64545',
  },
  lagoon: {
    label: 'Lagoon',
    primary: '#22D3EE',
    primaryDark: '#0B3D5C',
    secondary: '#67E8F9',
    headerEnd: '#155E75',
    dualTone: true,
    premiumMotion: true,
    bg: '#F0FBFF',
    card: '#FFFFFF',
    ink: '#0C2A3A',
    muted: '#5F7F8F',
    line: '#D5EEF5',
    green: '#2E9E5B',
    red: '#D64545',
  },
  sakura: {
    label: 'Sakura',
    primary: '#FB7185',
    primaryDark: '#4A044E',
    secondary: '#FDA4AF',
    headerEnd: '#9D174D',
    dualTone: true,
    premiumMotion: true,
    bg: '#FFF5F7',
    card: '#FFFFFF',
    ink: '#3B0A1E',
    muted: '#9A6B7C',
    line: '#F8DEE5',
    green: '#2E9E5B',
    red: '#D64545',
  },
  forest: {
    label: 'Forest',
    primary: '#34D399',
    primaryDark: '#052E16',
    secondary: '#6EE7B7',
    headerEnd: '#14532D',
    dualTone: true,
    premiumMotion: true,
    bg: '#F2FBF6',
    card: '#FFFFFF',
    ink: '#0C2A1A',
    muted: '#5F8574',
    line: '#D8EEE3',
    green: '#2E9E5B',
    red: '#D64545',
  },
  copper: {
    label: 'Copper',
    primary: '#E8A06E',
    primaryDark: '#3D1C0A',
    secondary: '#F5C89A',
    headerEnd: '#7C2D12',
    dualTone: true,
    premiumMotion: true,
    bg: '#FBF6F1',
    card: '#FFFFFF',
    ink: '#2A160C',
    muted: '#8F7460',
    line: '#EFE2D4',
    green: '#2E9E5B',
    red: '#D64545',
  },
  // Brighter and hotter than Copper, which is a muted peach by comparison.
  tangerine: {
    label: 'Tangerine',
    primary: '#FF9A3C',
    primaryDark: '#4A1D06',
    secondary: '#FFC98A',
    headerEnd: '#C2410C',
    dualTone: true,
    premiumMotion: true,
    bg: '#FFF8F2',
    card: '#FFFFFF',
    ink: '#31170A',
    muted: '#836350',
    line: '#F7E4D6',
    green: '#2E9E5B',
    red: '#D64545',
  },
};

export const THEMES: Record<ThemeKey, ThemeTokens> = (Object.keys(THEME_CORES) as ThemeKey[]).reduce(
  (acc, key) => {
    acc[key] = withAppAliases(THEME_CORES[key]);
    return acc;
  },
  {} as Record<ThemeKey, ThemeTokens>,
);

export const DEFAULT_HOME_PREFS: HomePrefs = {
  defaultTab: 'income',
  showSummary: true,
  sortOrder: 'newest',
};

export const DEFAULT_CONFIG: AppConfig = {
  appName: 'Kashio',
  theme: 'teal',
  defaultTheme: 'teal',
  themePicked: false,
  avatarStyle: 'classic',
  adminPassword: 'admin123',
  currency: 'INR',
  language: 'en',
  alarmsEnabled: true,
  alarmSound: true,
  alarmVibration: true,
  alarmToneUri: null,
  alarmToneName: null,
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
    splitExpense: true,
    themes: true,
    avatars: true,
    cloud: true,
    backup: true,
    insights: true,
    smsImport: true,
  },
  homePrefs: { ...DEFAULT_HOME_PREFS },
  adBanner: { ...DEFAULT_AD_BANNER },
  googleAds: { ...DEFAULT_GOOGLE_ADS },
  importRules: { ...DEFAULT_IMPORT_RULES, rules: [] },
  // Off by default: a lock the user did not ask for reads as being locked out.
  appLock: false,
  themeCatalog: {
    unlockAllPremium: DEFAULT_THEME_CATALOG.unlockAllPremium,
    access: { ...DEFAULT_THEME_CATALOG.access },
  },
  feedback: { ...DEFAULT_FEEDBACK },
  premiumPlan: { ...DEFAULT_PREMIUM_PLAN },
  premiumFeatures: { ...DEFAULT_PREMIUM_FEATURES },
  uiFeedbackStyle: 'off',
  uiFeedbackSound: true,
};

export const EXPENSE_CATS = [
  { name: 'Groceries', icon: '🛍️' },
  { name: 'Vegetables', icon: '🥕' },
  { name: 'Fruits', icon: '🍒' },
  { name: 'Food', icon: '🍔' },
  { name: 'Snacks', icon: '🍿' },
  { name: 'Alcohol', icon: '🍷' },
  { name: 'Cigarettes', icon: '🚬' },
  { name: 'Split', icon: '🤝' },
  { name: 'Split settle', icon: '💸' },
  { name: 'Clothing', icon: '👕' },
  { name: 'Beauty', icon: '💄' },
  { name: 'Electronics', icon: '💻' },
  { name: 'Kids', icon: '🍼' },
  { name: 'Transportation', icon: '🚌' },
  { name: 'Car', icon: '🚗' },
  { name: 'Travel', icon: '✈️' },
  { name: 'Housing', icon: '🏠' },
  { name: 'Home', icon: '🛋️' },
  { name: 'Repairs', icon: '🔧' },
  { name: 'Phone', icon: '📱' },
  { name: 'Pets', icon: '🐶' },
  { name: 'Health', icon: '💊' },
  { name: 'Education', icon: '🎓' },
  { name: 'Sports', icon: '🏃' },
  { name: 'Entertainment', icon: '🎮' },
  { name: 'Social', icon: '🥂' },
  { name: 'Lottery', icon: '🎲' },
  { name: 'Gifts', icon: '🎁' },
  { name: 'Donations', icon: '🤲' },
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

export const ACCOUNT_TYPES = ['Bank', 'Card'] as const;

/** 'Card' is stored, but it reads as "Credit Card" so it can't be taken for a debit card. */
export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  Bank: 'Bank / Cash / Debit Card',
  Card: 'Credit Card',
};

export const PALETTE = [
  '#F5B700', '#FF7A5C', '#FF5C7C', '#B06DFF', '#5C8DFF', '#26C6DA', '#26D0A0',
  '#8BC34A', '#D4A94C', '#A9745B', '#FF6B6B', '#845EC2', '#4A8FE7', '#E8A33D',
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
  categories: 'aio_categories_v1',
  categorySeeds: 'aio_category_seeds_v1',
  migrations: 'aio_migrations_v1',
  premiumMember: 'aio_premium_member_v1',
} as const;
