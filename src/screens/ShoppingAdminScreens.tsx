import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { useFinance } from '../FinanceContext';
import { THEMES, DEFAULT_GOOGLE_AD_FORMATS } from '../constants';
import { ShoppingItem, ThemeAccess, ThemeKey, GoogleAdFormatKey, GoogleAdFormatFlags, ImportSourceRule } from '../types';
import { Card, EmptyState, Field, PrimaryButton, Screen } from '../components/ui';
import { DropdownSelect } from '../components/DropdownSelect';
import { todayStr, uid } from '../utils';
import { openAuthModal, requireAuthToSave } from '../authGate';
import { showAppDialog, showAppInfo } from '../appDialog';
import { ProfileAdBanner } from '../components/ProfileAdBanner';
import { clearPersistedAdMedia, pickAdBannerImage, pickAdBannerVideo } from '../utils/adBannerMedia';
import { emptyAdCreative } from '../utils/adCreative';
import { themesForAccess, themeAccessFor } from '../utils/themeAccess';
import type { AdBannerConfig, AdCreative, ThemeTokens } from '../types';
import { useT } from '../i18n/useT';
import { listSignedInProfiles, deleteSignedInUser, type SignedInUserRow } from '../lib/profile';
import { AdminUserDetailsModal } from '../components/AdminUserDetailsModal';
import {
  PREMIUM_FEATURE_KEYS,
  PREMIUM_FEATURE_LABELS,
  featureAccessLabel,
} from '../lib/premiumFeatures';
import { isPremiumCurrentlyActive, userPremiumFilterBucket } from '../lib/premium';
import type { PremiumFeatureAccess, PremiumFeatureKey } from '../types';
import { BUILTIN_IMPORT_RULES } from '../lib/importRules';
import {
  fetchDiamondEconomy,
  normalizeStoreItem,
  saveDiamondEconomy,
} from '../lib/diamonds';

type UsersFilter = 'all' | 'free' | 'month' | 'year';

type DiamondStoreDraft = {
  enabled: boolean;
  perItem: boolean;
  cost: string;
  listCost: string;
  days: string;
};

type DiamondPassDraft = {
  enabled: boolean;
  cost: string;
  listCost: string;
};

/**
 * Pass lengths offered in the editor. A pass is sold only while it is switched
 * on, so turning one off simply drops it from the economy.
 */
const DIAMOND_PASS_DAYS = [1, 7, 30];

/**
 * What diamonds can buy. Avatars and themes are sold one item at a time and are
 * kept for good; the rest unlock a whole feature for a number of days. Button
 * sound & ripples is deliberately absent — it is not sold for diamonds.
 */
const DIAMOND_STORE_ROWS: {
  key: string;
  label: string;
  perItem: boolean;
  unit: string;
}[] = [
  { key: 'avatars', label: PREMIUM_FEATURE_LABELS.avatars, perItem: true, unit: 'Per avatar' },
  { key: 'themes', label: PREMIUM_FEATURE_LABELS.themes, perItem: true, unit: 'Per theme' },
  { key: 'insights', label: PREMIUM_FEATURE_LABELS.insights, perItem: false, unit: 'Timed unlock' },
  { key: 'cloud', label: PREMIUM_FEATURE_LABELS.cloud, perItem: false, unit: 'Timed unlock' },
  { key: 'backup', label: PREMIUM_FEATURE_LABELS.backup, perItem: false, unit: 'Timed unlock' },
  {
    key: 'splitExpense',
    label: PREMIUM_FEATURE_LABELS.splitExpense,
    perItem: false,
    unit: 'Timed unlock',
  },
];

type GoogleAdUnitKey =
  | 'androidBannerUnitId'
  | 'iosBannerUnitId'
  | 'androidInterstitialUnitId'
  | 'iosInterstitialUnitId'
  | 'androidRewardedInterstitialUnitId'
  | 'iosRewardedInterstitialUnitId'
  | 'androidRewardedUnitId'
  | 'iosRewardedUnitId'
  | 'androidNativeUnitId'
  | 'iosNativeUnitId'
  | 'androidAppOpenUnitId'
  | 'iosAppOpenUnitId';

type GoogleAdUnitsDraft = Record<GoogleAdUnitKey, string>;

const GOOGLE_AD_UNIT_GROUPS: {
  format: GoogleAdFormatKey;
  title: string;
  hint: string;
  fields: { key: GoogleAdUnitKey; label: string }[];
}[] = [
  {
    format: 'banner',
    title: 'Banner',
    hint: 'Home (under summary) and Charts / Budget tab bar',
    fields: [
      { key: 'androidBannerUnitId', label: 'Android' },
      { key: 'iosBannerUnitId', label: 'iOS' },
    ],
  },
  {
    format: 'native',
    title: 'Native advanced',
    hint: 'Home (after Explore) and Profile (below Logout)',
    fields: [
      { key: 'androidNativeUnitId', label: 'Android' },
      { key: 'iosNativeUnitId', label: 'iOS' },
    ],
  },
  {
    format: 'interstitial',
    title: 'Interstitial',
    hint: 'Full-screen between actions (not wired yet)',
    fields: [
      { key: 'androidInterstitialUnitId', label: 'Android' },
      { key: 'iosInterstitialUnitId', label: 'iOS' },
    ],
  },
  {
    format: 'rewarded',
    title: 'Rewarded',
    hint: 'Full-screen video for a reward (helper ready)',
    fields: [
      { key: 'androidRewardedUnitId', label: 'Android' },
      { key: 'iosRewardedUnitId', label: 'iOS' },
    ],
  },
  {
    format: 'rewardedInterstitial',
    title: 'Rewarded interstitial',
    hint: 'Full-screen rewarded variant (not wired yet)',
    fields: [
      { key: 'androidRewardedInterstitialUnitId', label: 'Android' },
      { key: 'iosRewardedInterstitialUnitId', label: 'iOS' },
    ],
  },
  {
    format: 'appOpen',
    title: 'App open',
    hint: 'Shown when opening the app (not wired yet)',
    fields: [
      { key: 'androidAppOpenUnitId', label: 'Android' },
      { key: 'iosAppOpenUnitId', label: 'iOS' },
    ],
  },
];

const GOOGLE_AD_UNIT_FIELDS = GOOGLE_AD_UNIT_GROUPS.flatMap((g) => g.fields);

function pickGoogleAdUnits(g?: Partial<GoogleAdUnitsDraft> | null): GoogleAdUnitsDraft {
  const out = {} as GoogleAdUnitsDraft;
  for (const { key } of GOOGLE_AD_UNIT_FIELDS) {
    out[key] = typeof g?.[key] === 'string' ? String(g[key]) : '';
  }
  return out;
}

function pickGoogleAdFormats(
  g?: { formats?: Partial<Record<GoogleAdFormatKey, Partial<GoogleAdFormatFlags>>> } | null,
): Record<GoogleAdFormatKey, GoogleAdFormatFlags> {
  const out = {} as Record<GoogleAdFormatKey, GoogleAdFormatFlags>;
  for (const key of Object.keys(DEFAULT_GOOGLE_AD_FORMATS) as GoogleAdFormatKey[]) {
    const row = g?.formats?.[key];
    const fallback = DEFAULT_GOOGLE_AD_FORMATS[key];
    out[key] = {
      enabled: typeof row?.enabled === 'boolean' ? row.enabled : fallback.enabled,
      hideForPremium:
        typeof row?.hideForPremium === 'boolean'
          ? row.hideForPremium
          : fallback.hideForPremium,
    };
  }
  return out;
}

const UNITS = ['pcs', 'g', 'kg', 'ml', 'l', 'packet', 'dozen'] as const;

export function ShoppingListScreen() {
  const { theme, shoppingList, setShoppingList } = useApp();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { isGuest } = useFinance();

  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [search, setSearch] = useState('');

  const list = useMemo(() => {
    const term = search.trim().toLowerCase();
    return shoppingList
      .filter((it) => !term || it.name.toLowerCase().includes(term))
      .slice()
      .sort((a, b) => (a.bought === b.bought ? 0 : a.bought ? 1 : -1));
  }, [shoppingList, search]);

  const resetAdd = () => {
    setName('');
    setQty('');
    setUnit('pcs');
  };

  const save = async () => {
    if (!requireAuthToSave('save shopping list')) return;
    const itemName = name.trim();
    if (!itemName) {
      showAppInfo('Required', 'Enter an item name', '⚠️');
      return;
    }
    const next: ShoppingItem = {
        id: uid(),
      name: itemName,
      qty: qty.trim(),
      unit: unit || 'pcs',
        price: '',
      expiry: '',
        bought: false,
      addedDate: todayStr(),
      linkedTransactionId: null,
      linkedGroceryId: null,
    };
    await setShoppingList([next, ...shoppingList]);
    resetAdd();
  };

  const patchItem = async (id: string, patch: Partial<ShoppingItem>) => {
    await setShoppingList(shoppingList.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const pendingCount = list.filter((it) => !it.bought).length;
  const pickedCount = list.filter((it) => it.bought).length;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.h1, { color: theme.ink }]}>📝 {t('shop.title')}</Text>
        <Text style={[styles.sub, { color: theme.muted }]}>{t('shop.sub')}</Text>

        <Card>
          {isGuest ? (
            <>
              <Text style={{ color: theme.ink, fontWeight: '700', marginBottom: 8 }}>
                {t('shop.signInTitle')}
              </Text>
              <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 18, marginBottom: 12 }}>
                {t('shop.signInBody')}
              </Text>
              <PrimaryButton
                title={t('shop.loginSignup')}
                onPress={() => {
                  requireAuthToSave('save shopping list');
                }}
              />
            </>
          ) : (
            <>
              <Field
                label={t('shop.itemName')}
                value={name}
                onChangeText={setName}
                placeholder={t('shop.itemPlaceholder')}
              />
              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Field
                    label={t('shop.quantity')}
                    value={qty}
                    onChangeText={setQty}
                    placeholder={t('shop.qtyPlaceholder')}
                  />
                </View>
                <View style={{ width: 120, marginLeft: 8 }}>
                  <DropdownSelect
                    label={t('shop.unit')}
                    value={unit}
                    placeholder="pcs"
                    options={UNITS.map((u) => ({ value: u, label: u }))}
                    onChange={setUnit}
                  />
                </View>
              </View>
              <PrimaryButton title={t('add.addItemBtn')} onPress={save} />
            </>
          )}
        </Card>

        <Field
          label={t('shop.search')}
          value={search}
          onChangeText={setSearch}
          placeholder={`🔍 ${t('shop.searchPlaceholder')}`}
        />

        {shoppingList.length === 0 ? (
          <EmptyState
            icon="📝"
            title={t('shop.emptyTitle')}
            subtitle={t('shop.emptySub')}
          />
        ) : list.length === 0 ? (
          <EmptyState icon="🔍" title={t('shop.noMatch')} />
        ) : (
          <>
            <Text style={[styles.progress, { color: theme.muted }]}>
              {t('shop.progress')
                .replace('{picked}', String(pickedCount))
                .replace('{total}', String(list.length))}
              {pendingCount > 0
                ? ` · ${t('shop.stillToPick').replace('{n}', String(pendingCount))}`
                : ` · ${t('shop.allPicked')}`}
            </Text>

            {list.map((item) => (
              <Card key={item.id} style={{ opacity: item.bought ? 0.72 : 1 }}>
                <View style={styles.itemTop}>
                  <Pressable
                    onPress={() => void patchItem(item.id, { bought: !item.bought })}
                    style={[
                      styles.boughtBtn,
                      item.bought && { backgroundColor: theme.green, borderColor: theme.green },
                    ]}
                    accessibilityLabel={item.bought ? t('shop.picked') : t('shop.markPicked')}
                  >
                    <Text style={{ color: item.bought ? '#fff' : theme.muted, fontWeight: '800' }}>
                      {item.bought ? '✓' : ''}
                    </Text>
                  </Pressable>
                <View style={{ flex: 1 }}>
                    <TextInput
                      value={item.name}
                      onChangeText={(v) => void patchItem(item.id, { name: v })}
                      style={[
                        styles.nameInput,
                        {
                      color: theme.ink,
                      textDecorationLine: item.bought ? 'line-through' : 'none',
                        },
                      ]}
                    />
                    <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2, fontWeight: '600' }}>
                      {item.bought ? t('shop.picked') : t('shop.toPick')}
                  </Text>
                </View>
                <Pressable
                    style={styles.deleteBtn}
                    onPress={() => {
                      showAppDialog({
                        title: t('shop.deleteItem'),
                        message: t('shop.deleteMsg').replace('{name}', item.name),
                        icon: '🗑',
                        buttons: [
                          { text: t('common.cancel'), style: 'cancel' },
                          {
                            text: t('common.delete'),
                            style: 'destructive',
                            onPress: () =>
                              void setShoppingList(shoppingList.filter((x) => x.id !== item.id)),
                          },
                        ],
                      });
                    }}
                  >
                    <Text style={{ color: theme.red, fontWeight: '800' }}>✕</Text>
                </Pressable>
                </View>

                <View style={styles.metaRow}>
                  <TextInput
                    value={item.qty}
                    onChangeText={(v) => void patchItem(item.id, { qty: v })}
                    placeholder={t('shop.qtyShort')}
                    placeholderTextColor={theme.muted}
                    style={[styles.metaField, { color: theme.ink, borderColor: theme.line }]}
                  />
                  <View style={styles.metaFieldWrap}>
                    <DropdownSelect
                      value={item.unit || 'pcs'}
                      placeholder={t('shop.unitShort')}
                      options={UNITS.map((u) => ({ value: u, label: u }))}
                      onChange={(u) => void patchItem(item.id, { unit: u })}
                    />
                  </View>
              </View>
            </Card>
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    h1: { fontSize: 24, fontWeight: '800', marginBottom: 4 },
    sub: { fontSize: 13, marginBottom: 14, lineHeight: 18 },
    progress: { fontSize: 12, fontWeight: '700', marginBottom: 10 },
    row2: { flexDirection: 'row', alignItems: 'flex-start' },
    itemTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    nameInput: { fontWeight: '800', fontSize: 16, padding: 0 },
    boughtBtn: {
      width: 28,
      height: 28,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: theme.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    metaRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
    metaField: {
      flex: 1,
      borderWidth: 1.5,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 10,
      fontWeight: '600',
      fontSize: 13,
    },
    metaFieldWrap: { flex: 1, minWidth: 0 },
    deleteBtn: {
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
  });
}


export function AdminScreen() {
  // Admin login is enough — no extra panel password gate
  const { t } = useT();
  const {
    theme,
    config,
    updateConfig,
    exportBackup,
    importBackup,
    refreshDiamonds,
  } = useApp();
  const { isAdmin, isGuest, session } = useFinance();
  const [appName, setAppName] = useState(config.appName);
  const [importText, setImportText] = useState('');
  const [adEnabled, setAdEnabled] = useState(config.adBanner.enabled);
  const [adHideForPremium, setAdHideForPremium] = useState(
    config.adBanner.hideForPremium !== false,
  );
  const [adHoldSec, setAdHoldSec] = useState(String(config.adBanner.endCardHoldSec || 120));
  const [adItems, setAdItems] = useState<AdCreative[]>(
    config.adBanner.items?.length ? config.adBanner.items : [emptyAdCreative()],
  );
  const [adEditIndex, setAdEditIndex] = useState(0);
  const [gAdsEnabled, setGAdsEnabled] = useState(config.googleAds?.enabled !== false);
  const [gAdsUseTest, setGAdsUseTest] = useState(config.googleAds?.useTestIds !== false);
  const [gAdsFormats, setGAdsFormats] = useState(() => pickGoogleAdFormats(config.googleAds));
  const [gAdsUnits, setGAdsUnits] = useState(() => pickGoogleAdUnits(config.googleAds));
  const [importMonthRange, setImportMonthRange] = useState<'this_month' | 'previous_month'>(
    config.importRules?.smsMonthRange === 'previous_month' ? 'previous_month' : 'this_month',
  );
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleSenders, setNewRuleSenders] = useState('');
  const [newRuleIncludes, setNewRuleIncludes] = useState('');
  const [newRuleCategory, setNewRuleCategory] = useState('Others');
  const [newRuleKind, setNewRuleKind] = useState<'expense' | 'income'>('expense');
  const [adminSection, setAdminSection] = useState<
    | 'app'
    | 'colors'
    | 'ads'
    | 'feedback'
    | 'premium'
    | 'plus'
    | 'diamonds'
    | 'users'
    | 'features'
    | 'import'
    | 'backup'
  >('app');
  const [colorFilter, setColorFilter] = useState<'free' | 'premium' | 'premiumPro'>('free');
  const [fbChannel, setFbChannel] = useState<'email' | 'whatsapp'>(
    config.feedback?.channel === 'whatsapp' ? 'whatsapp' : 'email',
  );
  const [fbEmail, setFbEmail] = useState(config.feedback?.email || '');
  const [fbWhatsapp, setFbWhatsapp] = useState(config.feedback?.whatsapp || '');
  const [premPriceLabel, setPremPriceLabel] = useState(config.premiumPlan?.priceLabel || '');
  const [premAmount, setPremAmount] = useState(String(config.premiumPlan?.amountInr ?? 399));
  const [premCompareAt, setPremCompareAt] = useState(
    String(config.premiumPlan?.compareAtAmountInr ?? 0),
  );
  const [premMonthlyEnabled, setPremMonthlyEnabled] = useState(
    config.premiumPlan?.monthlyEnabled !== false,
  );
  const [premMonthlyLabel, setPremMonthlyLabel] = useState(
    config.premiumPlan?.monthlyPriceLabel || '₹39/month',
  );
  const [premMonthlyAmount, setPremMonthlyAmount] = useState(
    String(config.premiumPlan?.monthlyAmountInr ?? 39),
  );
  const [premMonthlyCompareAt, setPremMonthlyCompareAt] = useState(
    String(config.premiumPlan?.monthlyCompareAtAmountInr ?? 0),
  );
  const [premOfferEnabled, setPremOfferEnabled] = useState(
    config.premiumPlan?.premiumEnabled !== false,
  );
  const [plusOfferEnabled, setPlusOfferEnabled] = useState(
    config.premiumPlan?.plusEnabled !== false,
  );
  const [plusPriceLabel, setPlusPriceLabel] = useState(
    config.premiumPlan?.plusPriceLabel || '₹199/year',
  );
  const [plusAmount, setPlusAmount] = useState(String(config.premiumPlan?.plusAmountInr ?? 199));
  const [plusCompareAt, setPlusCompareAt] = useState(
    String(config.premiumPlan?.plusCompareAtAmountInr ?? 0),
  );
  const [plusMonthlyLabel, setPlusMonthlyLabel] = useState(
    config.premiumPlan?.plusMonthlyPriceLabel || '₹19/month',
  );
  const [plusMonthlyAmount, setPlusMonthlyAmount] = useState(
    String(config.premiumPlan?.plusMonthlyAmountInr ?? 19),
  );
  const [plusMonthlyCompareAt, setPlusMonthlyCompareAt] = useState(
    String(config.premiumPlan?.plusMonthlyCompareAtAmountInr ?? 0),
  );
  const [plusDraft, setPlusDraft] = useState(() =>
    PREMIUM_FEATURE_KEYS.reduce(
      (acc, key) => {
        const row = config.premiumPlan?.plusFeatures?.[key];
        acc[key] = {
          enabled: row?.enabled === true,
          monthly: String(row?.monthlyInr ?? config.premiumPlan?.plusAddonMonthlyInr ?? 4),
          yearly: String(row?.yearlyInr ?? config.premiumPlan?.plusAddonYearlyInr ?? 20),
          compareMonthly: String(row?.compareAtMonthlyInr ?? 0),
          compareYearly: String(row?.compareAtYearlyInr ?? 0),
        };
        return acc;
      },
      {} as Record<
        PremiumFeatureKey,
        {
          enabled: boolean;
          monthly: string;
          yearly: string;
          compareMonthly: string;
          compareYearly: string;
        }
      >,
    ),
  );
  // Diamond economy lives server-side, so it is loaded on entering the tab
  // rather than read from local config.
  const [diaLoading, setDiaLoading] = useState(false);
  const [diaSaving, setDiaSaving] = useState(false);
  const [diaEnabled, setDiaEnabled] = useState(true);
  const [diaPerAd, setDiaPerAd] = useState('1');
  const [diaCap, setDiaCap] = useState('5');
  const [diaStore, setDiaStore] = useState<Record<string, DiamondStoreDraft>>({});
  const [diaPasses, setDiaPasses] = useState<Record<number, DiamondPassDraft>>({});
  const [diaRaw, setDiaRaw] = useState<Record<string, unknown>>({});

  const [premUpi, setPremUpi] = useState(config.premiumPlan?.upiId || '');
  const [premPayee, setPremPayee] = useState(config.premiumPlan?.payeeName || '');
  const [users, setUsers] = useState<SignedInUserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [detailsUser, setDetailsUser] = useState<SignedInUserRow | null>(null);
  const [usersFilter, setUsersFilter] = useState<UsersFilter>('all');

  const filteredUsers = React.useMemo(() => {
    if (usersFilter === 'all') return users;
    return users.filter(
      (u) =>
        userPremiumFilterBucket({
          is_premium: u.is_premium,
          premium_until: u.premium_until,
          premium_billing: u.premium_billing,
        }) === usersFilter,
    );
  }, [users, usersFilter]);

  const usersFilterCounts = React.useMemo(() => {
    const counts = { all: users.length, free: 0, month: 0, year: 0 };
    for (const u of users) {
      const bucket = userPremiumFilterBucket({
        is_premium: u.is_premium,
        premium_until: u.premium_until,
        premium_billing: u.premium_billing,
      });
      counts[bucket] += 1;
    }
    return counts;
  }, [users]);

  const adminNav: {
    id: typeof adminSection;
    label: string;
    icon: string;
  }[] = [
    { id: 'app', label: 'App name', icon: '✏️' },
    { id: 'colors', label: 'Colors', icon: '🎨' },
    { id: 'ads', label: 'Ads', icon: '📣' },
    { id: 'feedback', label: 'Feedback', icon: '✉️' },
    { id: 'premium', label: 'Premium', icon: '👑' },
    { id: 'plus', label: 'Plus', icon: '➕' },
    { id: 'diamonds', label: 'Diamonds', icon: '💎' },
    { id: 'users', label: 'Users', icon: '👤' },
    { id: 'features', label: 'Features', icon: '⚙️' },
    { id: 'import', label: 'Import', icon: '📥' },
    { id: 'backup', label: 'Backup', icon: '💾' },
  ];

  const loadUsers = React.useCallback(async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const res = await listSignedInProfiles();
      setUsers(res.users);
      setUsersError(res.error);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (adminSection === 'users' && isAdmin) {
      void loadUsers();
    }
  }, [adminSection, isAdmin, loadUsers]);

  const loadDiamondEconomy = React.useCallback(async () => {
    setDiaLoading(true);
    try {
      const econ = await fetchDiamondEconomy();
      if (!econ) return;
      setDiaRaw(econ);
      setDiaEnabled(econ.enabled !== false);
      setDiaPerAd(String(econ.perAd ?? 1));
      setDiaCap(String(econ.dailyAdCap ?? 5));
      const store = (econ.store || {}) as Record<string, unknown>;
      const draft: Record<string, DiamondStoreDraft> = {};
      for (const row of DIAMOND_STORE_ROWS) {
        const item = normalizeStoreItem(row.key, store[row.key]);
        draft[row.key] = {
          enabled: item.enabled,
          perItem: row.perItem,
          cost: String(item.cost),
          listCost: String(item.listCost),
          days: String(item.days || (row.perItem ? 30 : 7)),
        };
      }
      setDiaStore(draft);

      const saved = Array.isArray(econ.passes) ? econ.passes : [];
      const passDraft: Record<number, DiamondPassDraft> = {};
      for (const days of DIAMOND_PASS_DAYS) {
        const row = saved.find(
          (p) => Number((p as { days?: unknown })?.days) === days,
        ) as { cost?: unknown; listCost?: unknown } | undefined;
        passDraft[days] = {
          enabled: !!row,
          cost: String(row?.cost ?? ''),
          listCost: String(row?.listCost ?? 0),
        };
      }
      setDiaPasses(passDraft);
    } finally {
      setDiaLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (adminSection === 'diamonds' && isAdmin) {
      void loadDiamondEconomy();
    }
  }, [adminSection, isAdmin, loadDiamondEconomy]);

  const saveDiamondSettings = async () => {
    const perAd = parseInt(diaPerAd, 10);
    const cap = parseInt(diaCap, 10);
    if (!Number.isFinite(perAd) || perAd < 0) {
      showAppInfo('Diamonds', 'Enter a valid number of diamonds per ad.', '⚠️');
      return;
    }
    if (!Number.isFinite(cap) || cap < 0) {
      showAppInfo('Diamonds', 'Enter a valid daily cap.', '⚠️');
      return;
    }
    const store: Record<string, unknown> = {};
    for (const row of DIAMOND_STORE_ROWS) {
      const draft = diaStore[row.key];
      if (!draft) continue;
      const cost = parseInt(draft.cost, 10);
      const listCost = parseInt(draft.listCost, 10);
      const days = parseInt(draft.days, 10);
      if (draft.enabled && (!Number.isFinite(cost) || cost <= 0)) {
        showAppInfo('Diamonds', `Enter a diamond price for ${row.label}.`, '⚠️');
        return;
      }
      const safeList = Number.isFinite(listCost) && listCost > 0 ? listCost : 0;
      if (draft.enabled && safeList > 0 && safeList <= cost) {
        showAppInfo(
          'Diamonds',
          `The struck-out price for ${row.label} must be higher than the real price (or 0 to hide it).`,
          '⚠️',
        );
        return;
      }
      if (draft.enabled && (!Number.isFinite(days) || days < 0)) {
        showAppInfo(
          'Diamonds',
          `Enter how many days ${row.label} stays unlocked, or 0 to keep it forever.`,
          '⚠️',
        );
        return;
      }
      store[row.key] = {
        enabled: draft.enabled,
        perItem: row.perItem,
        cost: Number.isFinite(cost) && cost > 0 ? cost : 0,
        listCost: safeList,
        days: Number.isFinite(days) && days > 0 ? days : 0,
      };
    }

    const passes: { days: number; cost: number; listCost: number }[] = [];
    for (const days of DIAMOND_PASS_DAYS) {
      const draft = diaPasses[days];
      if (!draft?.enabled) continue;
      const cost = parseInt(draft.cost, 10);
      const listCost = parseInt(draft.listCost, 10);
      if (!Number.isFinite(cost) || cost <= 0) {
        showAppInfo('Diamonds', `Enter a diamond price for the ${days}-day Premium pass.`, '⚠️');
        return;
      }
      const safeList = Number.isFinite(listCost) && listCost > 0 ? listCost : 0;
      if (safeList > 0 && safeList <= cost) {
        showAppInfo(
          'Diamonds',
          `The struck-out price for the ${days}-day pass must be higher than the real price (or 0 to hide it).`,
          '⚠️',
        );
        return;
      }
      passes.push({ days, cost, listCost: safeList });
    }

    setDiaSaving(true);
    // Spread the loaded economy so the cap timezone survives an edit here.
    const res = await saveDiamondEconomy({
      ...diaRaw,
      enabled: diaEnabled,
      perAd,
      dailyAdCap: cap,
      passes,
      store,
    });
    setDiaSaving(false);
    if (!res.ok) {
      showAppInfo('Diamonds', res.error || 'Could not save. Please try again.', '⚠️');
      return;
    }
    await refreshDiamonds();
    await loadDiamondEconomy();
    showAppInfo('Diamonds', 'Diamond prices saved for everyone.', '💎');
  };

  const confirmDeleteUser = (u: SignedInUserRow) => {
    const name =
      (u.full_name || '').trim() || (u.email || '').split('@')[0] || 'this user';
    const email = (u.email || '').trim();
    showAppDialog({
      title: 'Delete user?',
      message: `Permanently remove ${name}${email ? ` (${email})` : ''}? Their cloud account and synced data will be deleted. This cannot be undone.`,
      icon: '⚠️',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setDeletingUserId(u.id);
              const res = await deleteSignedInUser(u.id);
              setDeletingUserId(null);
              if (res.error) {
                showAppInfo('Delete failed', res.error, '⚠️');
                return;
              }
              setUsers((prev) => prev.filter((row) => row.id !== u.id));
              showAppInfo('Deleted', `${name} was removed.`, '✅');
            })();
          },
        },
      ],
    });
  };

  const activeAd = adItems[Math.min(adEditIndex, Math.max(0, adItems.length - 1))] || emptyAdCreative();

  const patchActiveAd = (patch: Partial<AdCreative>) => {
    setAdItems((prev) => {
      if (!prev.length) return [emptyAdCreative(patch)];
      const idx = Math.min(adEditIndex, prev.length - 1);
      return prev.map((item, i) => (i === idx ? { ...item, ...patch } : item));
    });
  };

  const buildAdDraft = (enabled: boolean, hideForPremium = adHideForPremium): AdBannerConfig => {
    const hold = Math.max(5, Math.min(3600, parseInt(adHoldSec, 10) || 120));
    return {
      enabled,
      hideForPremium,
      endCardHoldSec: hold,
      items: adItems.map((item) => ({
        ...item,
        title: item.title.trim() || 'Your ad goes here',
        subtitle: item.subtitle.trim() || 'Promote a partner app or offer.',
        icon: item.icon.trim() || '📣',
        buttonLabel: item.buttonLabel.trim() || 'Open',
        buttonUrl: item.buttonUrl.trim() || 'https://example.com',
        appScheme: (item.appScheme || '').trim(),
        mediaUri: item.mediaUri,
        mediaType: item.mediaUri ? item.mediaType : null,
        endImageUri: item.endImageUri,
      })),
    };
  };

  React.useEffect(() => {
    setAppName(config.appName);
    setAdEnabled(config.adBanner.enabled);
    setAdHideForPremium(config.adBanner.hideForPremium !== false);
    setAdHoldSec(String(config.adBanner.endCardHoldSec || 120));
    setAdItems(config.adBanner.items?.length ? config.adBanner.items : [emptyAdCreative()]);
    setAdEditIndex(0);
    setGAdsEnabled(config.googleAds?.enabled !== false);
    setGAdsUseTest(config.googleAds?.useTestIds !== false);
    setGAdsFormats(pickGoogleAdFormats(config.googleAds));
    setGAdsUnits(pickGoogleAdUnits(config.googleAds));
    setImportMonthRange(
      config.importRules?.smsMonthRange === 'previous_month' ? 'previous_month' : 'this_month',
    );
    setFbChannel(config.feedback?.channel === 'whatsapp' ? 'whatsapp' : 'email');
    setFbEmail(config.feedback?.email || '');
    setFbWhatsapp(config.feedback?.whatsapp || '');
    setPremPriceLabel(config.premiumPlan?.priceLabel || '');
    setPremAmount(String(config.premiumPlan?.amountInr ?? 399));
    setPremCompareAt(String(config.premiumPlan?.compareAtAmountInr ?? 0));
    setPremMonthlyEnabled(config.premiumPlan?.monthlyEnabled !== false);
    setPremMonthlyLabel(config.premiumPlan?.monthlyPriceLabel || '₹39/month');
    setPremMonthlyAmount(String(config.premiumPlan?.monthlyAmountInr ?? 39));
    setPremMonthlyCompareAt(String(config.premiumPlan?.monthlyCompareAtAmountInr ?? 0));
    setPremOfferEnabled(config.premiumPlan?.premiumEnabled !== false);
    setPlusOfferEnabled(config.premiumPlan?.plusEnabled !== false);
    setPlusPriceLabel(config.premiumPlan?.plusPriceLabel || '₹199/year');
    setPlusAmount(String(config.premiumPlan?.plusAmountInr ?? 199));
    setPlusCompareAt(String(config.premiumPlan?.plusCompareAtAmountInr ?? 0));
    setPlusMonthlyLabel(config.premiumPlan?.plusMonthlyPriceLabel || '₹19/month');
    setPlusMonthlyAmount(String(config.premiumPlan?.plusMonthlyAmountInr ?? 19));
    setPlusMonthlyCompareAt(String(config.premiumPlan?.plusMonthlyCompareAtAmountInr ?? 0));
    setPlusDraft(
      PREMIUM_FEATURE_KEYS.reduce(
        (acc, key) => {
          const row = config.premiumPlan?.plusFeatures?.[key];
          acc[key] = {
            enabled: row?.enabled === true,
            monthly: String(row?.monthlyInr ?? config.premiumPlan?.plusAddonMonthlyInr ?? 4),
            yearly: String(row?.yearlyInr ?? config.premiumPlan?.plusAddonYearlyInr ?? 20),
            compareMonthly: String(row?.compareAtMonthlyInr ?? 0),
            compareYearly: String(row?.compareAtYearlyInr ?? 0),
          };
          return acc;
        },
        {} as Record<
          PremiumFeatureKey,
          {
            enabled: boolean;
            monthly: string;
            yearly: string;
            compareMonthly: string;
            compareYearly: string;
          }
        >,
      ),
    );
    setPremUpi(config.premiumPlan?.upiId || '');
    setPremPayee(config.premiumPlan?.payeeName || '');
  }, [config]);

  if (!isAdmin) {
    return (
      <Screen>
        <View style={{ padding: 20, marginTop: 40 }}>
          <Card>
            <Text style={{ color: theme.ink, fontWeight: '800', fontSize: 18, marginBottom: 8 }}>
              Admin access only
            </Text>
            <Text style={{ color: theme.muted, lineHeight: 20, marginBottom: 16 }}>
              {isGuest
                ? 'Sign in with an admin account to open settings. Guests and regular users cannot change app settings.'
                : 'Your account is not an admin. Ask an existing admin to promote your email in Supabase profiles.'}
            </Text>
            {isGuest ? (
              <PrimaryButton title="Login as admin" onPress={() => openAuthModal('login')} />
            ) : null}
          </Card>
        </View>
      </Screen>
    );
  }

  const notifySaved = (message: string) => {
    showAppInfo('Saved', message, '✅');
  };

  const toggleFeature = (key: keyof typeof config.features) => {
    const nextOn = !config.features[key];
    const labels: Partial<Record<keyof typeof config.features, string>> = {
      finance: 'Finance tracker',
      reminders: 'Reminders hub',
      expenseReminder: 'Expense reminders',
      medicineReminder: 'Medicine reminders',
      groceryExpiryReminder: 'Grocery expiry',
      generalReminder: 'General reminders',
      shoppingList: 'Shopping list',
      financeCharts: 'Finance charts',
      financeReports: 'Finance reports',
      financeAccounts: 'Accounts',
      splitExpense: 'Split expense',
      themes: 'Exclusive themes',
      avatars: 'Character avatars',
      cloud: 'Multi-device cloud sync',
      backup: 'File backup & restore',
      insights: 'Smart Insights',
      smsImport: 'SMS / paste import',
    };
    void updateConfig({
      features: {
        ...config.features,
        [key]: nextOn,
      },
    }).then((ok) => {
      if (!ok) return;
      notifySaved(
        `${labels[key] || String(key)} turned ${nextOn ? 'on' : 'off'}.`,
      );
    });
  };

  const sectionTitle = adminNav.find((n) => n.id === adminSection)?.label || 'Admin';

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 140, paddingTop: 8 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 8,
            paddingHorizontal: 14,
            paddingBottom: 10,
          }}
        >
          {adminNav.map((item) => {
            const on = adminSection === item.id;
            // Always use a dark selected chip so labels stay readable on light accents (mint/gold/ice).
            const selectedBg = theme.header;
            const selectedFg = '#fff';
            return (
              <Pressable
                key={item.id}
                onPress={() => setAdminSection(item.id)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 12,
                  backgroundColor: on ? selectedBg : theme.card,
                  borderWidth: 1.5,
                  borderColor: on ? theme.header : theme.line,
                }}
              >
                <Text style={{ fontSize: 14 }}>{item.icon}</Text>
                <Text
                  style={{
                    color: on ? selectedFg : theme.ink,
                    fontWeight: '800',
                    fontSize: 13,
                  }}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ paddingHorizontal: 14 }}>
          <Text style={{ color: theme.ink, fontWeight: '900', fontSize: 18, marginBottom: 12 }}>
            {sectionTitle}
          </Text>

          {adminSection === 'app' ? (
        <Card>
          <Field label="App name" value={appName} onChangeText={setAppName} />
              <PrimaryButton
                title="Save app name"
                onPress={() => {
                  const next = appName.trim() || 'Pulse Wallet';
                  void updateConfig({ appName: next }).then((ok) => {
                    if (!ok) return;
                    setAppName(next);
                    showAppInfo('Saved', `App name updated to “${next}”.`, '✅');
                  });
                }}
              />
        </Card>
          ) : null}

          {adminSection === 'feedback' ? (
        <Card>
              <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 18, marginBottom: 12 }}>
                Choose where Share Feedback opens. Users never see the email or WhatsApp number.
              </Text>

              <Text
                style={{
                  color: theme.muted,
                  fontSize: 12,
                  fontWeight: '800',
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}
              >
                Channel
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                {(
                  [
                    ['email', 'Email'],
                    ['whatsapp', 'WhatsApp'],
                  ] as const
                ).map(([id, label]) => {
                  const on = fbChannel === id;
                  return (
              <Pressable
                      key={id}
                      onPress={() => setFbChannel(id)}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: 12,
                        alignItems: 'center',
                        backgroundColor: on ? theme.header : theme.bg,
                        borderWidth: 1.5,
                        borderColor: on ? theme.header : theme.line,
                      }}
                    >
                      <Text
                        style={{
                          fontWeight: '800',
                          fontSize: 13,
                          color: on ? '#fff' : theme.ink,
                        }}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {fbChannel === 'email' ? (
                <Field
                  label="Email ID"
                  value={fbEmail}
                  onChangeText={setFbEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="support@example.com"
                />
              ) : (
                <>
                  <Field
                    label="WhatsApp number"
                    value={fbWhatsapp}
                    onChangeText={setFbWhatsapp}
                    keyboardType="phone-pad"
                    placeholder="9198XXXXXXXX (country code, digits)"
                  />
                  <Text
                    style={{ color: theme.muted, fontSize: 12, lineHeight: 17, marginBottom: 12 }}
                  >
                    Use country code without +. Users never see this number.
                  </Text>
                </>
              )}
              <PrimaryButton
                title="Save feedback destination"
                onPress={() => {
                  const email = fbEmail.trim();
                  const whatsapp = fbWhatsapp.replace(/[^\d]/g, '');
                  if (fbChannel === 'email' && !email.includes('@')) {
                    showAppInfo('Feedback', 'Enter a valid email ID for the Email channel.', '⚠️');
                    return;
                  }
                  if (fbChannel === 'whatsapp' && whatsapp.length < 8) {
                    showAppInfo(
                      'Feedback',
                      'Enter a WhatsApp number with country code (digits only).',
                      '⚠️',
                    );
                    return;
                  }
                  void updateConfig({
                    feedback: {
                      channel: fbChannel,
                      email: email || config.feedback.email,
                      whatsapp,
                    },
                  }).then((ok) => {
                    if (!ok) return;
                    notifySaved(
                      fbChannel === 'whatsapp'
                        ? 'Feedback will open WhatsApp to your number.'
                        : 'Feedback will open email to your address.',
                    );
                  });
                }}
              />
            </Card>
          ) : null}

          {adminSection === 'premium' ? (
            <Card>
              <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 18, marginBottom: 12 }}>
                Controls All-in-One Premium checkout: amounts, enable/disable, UPI ID, and payee
                name. Custom Plus lives in the Plus tab. Users pay, email a UTR to your Feedback
                inbox, then you activate Premium in Users → Details.
              </Text>

              <Pressable
                onPress={() => setPremOfferEnabled((v) => !v)}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingVertical: 12,
                  marginBottom: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.line,
                }}
              >
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={{ color: theme.ink, fontWeight: '700' }}>
                    Enable All-in-One Premium
                  </Text>
                  <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                    {premOfferEnabled
                      ? 'Premium column and checkout are available'
                      : 'Premium checkout is hidden'}
                  </Text>
                </View>
                <View
                  style={{
                    width: 44,
                    height: 25,
                    borderRadius: 20,
                    backgroundColor: premOfferEnabled ? theme.primary : '#e2e2e5',
                    justifyContent: 'center',
                    paddingHorizontal: 2,
                  }}
                >
                  <View
                    style={{
                      width: 21,
                      height: 21,
                      borderRadius: 11,
                      backgroundColor: '#fff',
                      alignSelf: premOfferEnabled ? 'flex-end' : 'flex-start',
                    }}
                  />
                </View>
              </Pressable>

              <Text style={{ color: theme.ink, fontWeight: '800', marginBottom: 8 }}>
                Yearly plan
              </Text>
              <Field
                label="Yearly sale amount (INR)"
                value={premAmount}
                onChangeText={(text) => {
                  setPremAmount(text);
                  const n = parseFloat(text.replace(/,/g, ''));
                  if (Number.isFinite(n) && n > 0) {
                    setPremPriceLabel(`₹${n}/year`);
                  }
                }}
                keyboardType="decimal-pad"
                placeholder="399"
              />
              <Field
                label="Yearly list / strike price (INR)"
                value={premCompareAt}
                onChangeText={setPremCompareAt}
                keyboardType="decimal-pad"
                placeholder="0"
              />
              <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 17, marginBottom: 10 }}>
                Shown struck out when higher than the sale amount (e.g. sale 399, list 999). Use 0 to
                hide.
              </Text>
              <Field
                label="Yearly price label"
                value={premPriceLabel}
                onChangeText={setPremPriceLabel}
                placeholder="₹399/year"
              />

              <Text
                style={{
                  color: theme.ink,
                  fontWeight: '800',
                  marginTop: 16,
                  marginBottom: 8,
                }}
              >
                Monthly plan
              </Text>
              <Pressable
                onPress={() => setPremMonthlyEnabled((v) => !v)}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingVertical: 12,
                  marginBottom: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.line,
                }}
              >
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={{ color: theme.ink, fontWeight: '700' }}>
                    Show monthly billing
                  </Text>
                  <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                    {premMonthlyEnabled
                      ? 'Users can pick Monthly vs Yearly on the cart'
                      : 'Only yearly Premium pricing is shown'}
                  </Text>
                </View>
                <View
                  style={{
                    width: 44,
                    height: 25,
                    borderRadius: 20,
                    backgroundColor: premMonthlyEnabled ? theme.primary : '#e2e2e5',
                    justifyContent: 'center',
                    paddingHorizontal: 2,
                  }}
                >
                  <View
                    style={{
                      width: 21,
                      height: 21,
                      borderRadius: 11,
                      backgroundColor: '#fff',
                      alignSelf: premMonthlyEnabled ? 'flex-end' : 'flex-start',
                    }}
                  />
                </View>
              </Pressable>
              {premMonthlyEnabled ? (
                <>
                  <Field
                    label="Monthly sale amount (INR)"
                    value={premMonthlyAmount}
                    onChangeText={(text) => {
                      setPremMonthlyAmount(text);
                      const n = parseFloat(text.replace(/,/g, ''));
                      if (Number.isFinite(n) && n > 0) {
                        setPremMonthlyLabel(`₹${n}/month`);
                      }
                    }}
                    keyboardType="decimal-pad"
                    placeholder="39"
                  />
                  <Field
                    label="Monthly list / strike price (INR)"
                    value={premMonthlyCompareAt}
                    onChangeText={setPremMonthlyCompareAt}
                    keyboardType="decimal-pad"
                    placeholder="0"
                  />
                  <Text
                    style={{ color: theme.muted, fontSize: 12, lineHeight: 17, marginBottom: 10 }}
                  >
                    Optional. Use 0 to hide the struck-out price on Monthly.
                  </Text>
                  <Field
                    label="Monthly price label"
                    value={premMonthlyLabel}
                    onChangeText={setPremMonthlyLabel}
                    placeholder="₹39/month"
                  />
                </>
              ) : null}

              <Field
                label="UPI ID (optional)"
                value={premUpi}
                onChangeText={setPremUpi}
                autoCapitalize="none"
                placeholder="yourname@upi"
              />
              <Text
                style={{ color: theme.muted, fontSize: 12, lineHeight: 17, marginBottom: 12 }}
              >
                Leave UPI empty to hide “Pay with UPI”. Users can still send a payment reference by
                email. Shared with Custom Plus checkout.
              </Text>
              <Field
                label="Payee name (UPI display)"
                value={premPayee}
                onChangeText={setPremPayee}
                placeholder="Pulse Wallet Premium"
              />
              <PrimaryButton
                title="Save Premium offer"
                onPress={() => {
                  const amount = parseFloat(premAmount.replace(/,/g, ''));
                  if (!Number.isFinite(amount) || amount <= 0) {
                    showAppInfo('Premium', 'Enter a valid yearly amount greater than 0.', '⚠️');
                    return;
                  }
                  const monthlyAmount = parseFloat(premMonthlyAmount.replace(/,/g, ''));
                  if (
                    premMonthlyEnabled &&
                    (!Number.isFinite(monthlyAmount) || monthlyAmount <= 0)
                  ) {
                    showAppInfo('Premium', 'Enter a valid monthly amount greater than 0.', '⚠️');
                    return;
                  }
                  const compareAt = parseFloat(premCompareAt.replace(/,/g, ''));
                  const compareAtAmountInr =
                    Number.isFinite(compareAt) && compareAt > 0 ? compareAt : 0;
                  if (compareAtAmountInr > 0 && compareAtAmountInr <= amount) {
                    showAppInfo(
                      'Premium',
                      'Yearly list price must be higher than the sale amount (or 0 to hide).',
                      '⚠️',
                    );
                    return;
                  }
                  const monthlyCompareAt = parseFloat(premMonthlyCompareAt.replace(/,/g, ''));
                  const monthlyCompareAtAmountInr =
                    Number.isFinite(monthlyCompareAt) && monthlyCompareAt > 0
                      ? monthlyCompareAt
                      : 0;
                  if (
                    premMonthlyEnabled &&
                    monthlyCompareAtAmountInr > 0 &&
                    Number.isFinite(monthlyAmount) &&
                    monthlyCompareAtAmountInr <= monthlyAmount
                  ) {
                    showAppInfo(
                      'Premium',
                      'Monthly list price must be higher than the sale amount (or 0 to hide).',
                      '⚠️',
                    );
                    return;
                  }
                  let priceLabel = premPriceLabel.trim();
                  if (!priceLabel || /^₹?\s*[\d.,]+\s*\/\s*(month|year)$/i.test(priceLabel)) {
                    priceLabel = `₹${amount}/year`;
                  }
                  let monthlyPriceLabel = premMonthlyLabel.trim();
                  if (
                    !monthlyPriceLabel ||
                    /^₹?\s*[\d.,]+\s*\/\s*(month|year)$/i.test(monthlyPriceLabel)
                  ) {
                    monthlyPriceLabel = `₹${
                      Number.isFinite(monthlyAmount) && monthlyAmount > 0 ? monthlyAmount : 39
                    }/month`;
                  }
                  const payeeName = premPayee.trim() || config.appName || 'Pulse Wallet Premium';
                  void updateConfig({
                    premiumPlan: {
                      ...config.premiumPlan,
                      priceLabel,
                      amountInr: amount,
                      compareAtAmountInr,
                      monthlyEnabled: premMonthlyEnabled,
                      monthlyPriceLabel,
                      monthlyAmountInr:
                        Number.isFinite(monthlyAmount) && monthlyAmount > 0
                          ? monthlyAmount
                          : 39,
                      monthlyCompareAtAmountInr,
                      premiumEnabled: premOfferEnabled,
                      upiId: premUpi.trim(),
                      payeeName,
                    },
                  }).then((ok) => {
                    if (!ok) {
                      return;
                    }
                    setPremPriceLabel(priceLabel);
                    setPremAmount(String(amount));
                    setPremCompareAt(String(compareAtAmountInr));
                    setPremMonthlyLabel(monthlyPriceLabel);
                    if (Number.isFinite(monthlyAmount) && monthlyAmount > 0) {
                      setPremMonthlyAmount(String(monthlyAmount));
                    }
                    setPremMonthlyCompareAt(String(monthlyCompareAtAmountInr));
                    setPremPayee(payeeName);
                    notifySaved(
                      premOfferEnabled
                        ? `Premium offer synced: ${priceLabel}${
                            premMonthlyEnabled ? ` + ${monthlyPriceLabel}` : ''
                          }.`
                        : 'Premium checkout disabled.',
                    );
                  });
                }}
              />

              <Text
                style={{
                  color: theme.ink,
                  fontWeight: '800',
                  fontSize: 15,
                  marginTop: 22,
                  marginBottom: 8,
                }}
              >
                Free vs Premium features
              </Text>
              <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 18, marginBottom: 10 }}>
                Mark each extra as Free (everyone) or Premium (members only). Changes sync to all
                devices. Per-feature Plus pricing is in the Plus tab.
              </Text>
              {PREMIUM_FEATURE_KEYS.map((key) => {
                const access = config.premiumFeatures?.[key] || 'premium';
                return (
                  <View
                key={key}
                style={{
                      marginBottom: 12,
                      paddingBottom: 12,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: theme.line,
                    }}
                  >
                    <Text style={{ color: theme.ink, fontWeight: '700', marginBottom: 8 }}>
                      {PREMIUM_FEATURE_LABELS[key]}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {(['free', 'premium'] as PremiumFeatureAccess[]).map((opt) => {
                        const on = access === opt;
                        return (
                          <Pressable
                            key={opt}
                            onPress={() => {
                              const next = {
                                ...config.premiumFeatures,
                                [key as PremiumFeatureKey]: opt,
                              };
                              void updateConfig({ premiumFeatures: next }).then((ok) => {
                                if (!ok) return;
                                notifySaved(
                                  `${PREMIUM_FEATURE_LABELS[key]} → ${featureAccessLabel(opt)}`,
                                );
                              });
                            }}
                            style={{
                              flex: 1,
                              paddingVertical: 10,
                              borderRadius: 10,
                              alignItems: 'center',
                              backgroundColor: on ? theme.header : theme.bg,
                              borderWidth: 1.5,
                              borderColor: on ? theme.header : theme.line,
                            }}
                          >
                            <Text
                              style={{
                                fontWeight: '800',
                                fontSize: 13,
                                color: on ? '#fff' : theme.ink,
                              }}
                            >
                              {featureAccessLabel(opt)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </Card>
          ) : null}

          {adminSection === 'plus' ? (
            <Card>
              <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 18, marginBottom: 12 }}>
                Custom Plus à-la-carte checkout. Turn Plus on/off here, and set monthly / yearly
                price for each feature. Disabled features are hidden from the Plus column.
              </Text>

              <Pressable
                onPress={() => setPlusOfferEnabled((v) => !v)}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingVertical: 12,
                  marginBottom: 16,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.line,
                }}
              >
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={{ color: theme.ink, fontWeight: '700' }}>
                    Enable Custom Plus
                  </Text>
                  <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                    {plusOfferEnabled
                      ? 'Plus column and checkout are available'
                      : 'Plus checkout is hidden'}
                  </Text>
                </View>
                <View
                  style={{
                    width: 44,
                    height: 25,
                    borderRadius: 20,
                    backgroundColor: plusOfferEnabled ? theme.primary : '#e2e2e5',
                    justifyContent: 'center',
                    paddingHorizontal: 2,
                  }}
                >
                  <View
                    style={{
                      width: 21,
                      height: 21,
                      borderRadius: 11,
                      backgroundColor: '#fff',
                      alignSelf: plusOfferEnabled ? 'flex-end' : 'flex-start',
                    }}
                  />
                </View>
              </Pressable>

              <Field
                label="Yearly price label"
                value={plusPriceLabel}
                onChangeText={setPlusPriceLabel}
                placeholder="₹199/year"
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Yearly sale ₹"
                    value={plusAmount}
                    onChangeText={setPlusAmount}
                    keyboardType="decimal-pad"
                    placeholder="199"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Yearly list ₹"
                    value={plusCompareAt}
                    onChangeText={setPlusCompareAt}
                    keyboardType="decimal-pad"
                    placeholder="0"
                  />
                </View>
              </View>
              <Field
                label="Monthly price label"
                value={plusMonthlyLabel}
                onChangeText={setPlusMonthlyLabel}
                placeholder="₹19/month"
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Monthly sale ₹"
                    value={plusMonthlyAmount}
                    onChangeText={setPlusMonthlyAmount}
                    keyboardType="decimal-pad"
                    placeholder="19"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Monthly list ₹"
                    value={plusMonthlyCompareAt}
                    onChangeText={setPlusMonthlyCompareAt}
                    keyboardType="decimal-pad"
                    placeholder="0"
                  />
                </View>
              </View>
              <Text style={{ color: theme.muted, fontSize: 11, marginBottom: 12 }}>
                List prices show struck out when higher than sale. 0 = hide. Monthly follows the
                Premium monthly switch above.
              </Text>

              <Text style={{ color: theme.ink, fontWeight: '800', marginBottom: 4 }}>
                What Plus includes
              </Text>
              <Text style={{ color: theme.muted, fontSize: 11, marginBottom: 10 }}>
                On means a green tick in the Plus column, off means a red cross. Premium always
                includes everything.
              </Text>
              {PREMIUM_FEATURE_KEYS.map((key) => {
                const row = plusDraft[key];
                return (
                  <View
                    key={key}
                    style={{
                      marginBottom: 10,
                      paddingBottom: 10,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: theme.line,
                    }}
                  >
                    <Pressable
                      onPress={() =>
                        setPlusDraft((prev) => ({
                          ...prev,
                          [key]: { ...prev[key], enabled: !prev[key].enabled },
                        }))
                      }
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 8,
                      }}
                    >
                      <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text style={{ color: theme.ink, fontWeight: '700' }}>
                          {PREMIUM_FEATURE_LABELS[key]}
                        </Text>
                        <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                          {row.enabled ? 'Included in Plus' : 'Premium only'}
                        </Text>
                      </View>
                      <View
                        style={{
                          width: 44,
                          height: 25,
                          borderRadius: 20,
                          backgroundColor: row.enabled ? theme.primary : '#e2e2e5',
                          justifyContent: 'center',
                          paddingHorizontal: 2,
                        }}
                      >
                        <View
                          style={{
                            width: 21,
                            height: 21,
                            borderRadius: 11,
                            backgroundColor: '#fff',
                            alignSelf: row.enabled ? 'flex-end' : 'flex-start',
                          }}
                        />
                      </View>
                    </Pressable>
                  </View>
                );
              })}

              <PrimaryButton
                title="Save Plus offer"
                onPress={() => {
                  const plusFeatures = {} as Record<
                    PremiumFeatureKey,
                    {
                      enabled: boolean;
                      monthlyInr: number;
                      yearlyInr: number;
                      compareAtMonthlyInr: number;
                      compareAtYearlyInr: number;
                    }
                  >;
                  // Plus is one price now; the per-feature amounts are kept at
                  // whatever they were so older saved settings still load.
                  for (const key of PREMIUM_FEATURE_KEYS) {
                    const row = plusDraft[key];
                    const saved = config.premiumPlan?.plusFeatures?.[key];
                    plusFeatures[key] = {
                      enabled: row.enabled,
                      monthlyInr: saved?.monthlyInr ?? 4,
                      yearlyInr: saved?.yearlyInr ?? 20,
                      compareAtMonthlyInr: saved?.compareAtMonthlyInr ?? 0,
                      compareAtYearlyInr: saved?.compareAtYearlyInr ?? 0,
                    };
                  }
                  if (
                    plusOfferEnabled &&
                    !PREMIUM_FEATURE_KEYS.some((k) => plusFeatures[k].enabled)
                  ) {
                    showAppInfo('Plus', 'Include at least one feature, or turn Plus off.', '⚠️');
                    return;
                  }
                  const yearly = parseFloat(plusAmount.replace(/,/g, ''));
                  const monthly = parseFloat(plusMonthlyAmount.replace(/,/g, ''));
                  if (plusOfferEnabled && (!Number.isFinite(yearly) || yearly <= 0)) {
                    showAppInfo('Plus', 'Enter a valid yearly amount greater than 0.', '⚠️');
                    return;
                  }
                  if (plusOfferEnabled && (!Number.isFinite(monthly) || monthly <= 0)) {
                    showAppInfo('Plus', 'Enter a valid monthly amount greater than 0.', '⚠️');
                    return;
                  }
                  const cYear = parseFloat(plusCompareAt.replace(/,/g, ''));
                  const cMonth = parseFloat(plusMonthlyCompareAt.replace(/,/g, ''));
                  const plusCompareAtAmountInr = Number.isFinite(cYear) && cYear > 0 ? cYear : 0;
                  const plusMonthlyCompareAtAmountInr =
                    Number.isFinite(cMonth) && cMonth > 0 ? cMonth : 0;
                  if (plusCompareAtAmountInr > 0 && plusCompareAtAmountInr <= yearly) {
                    showAppInfo(
                      'Plus',
                      'Yearly list price must be higher than the sale price (or 0).',
                      '⚠️',
                    );
                    return;
                  }
                  if (
                    plusMonthlyCompareAtAmountInr > 0 &&
                    plusMonthlyCompareAtAmountInr <= monthly
                  ) {
                    showAppInfo(
                      'Plus',
                      'Monthly list price must be higher than the sale price (or 0).',
                      '⚠️',
                    );
                    return;
                  }
                  const priceLabel = plusPriceLabel.trim() || `₹${yearly}/year`;
                  const monthlyPriceLabel = plusMonthlyLabel.trim() || `₹${monthly}/month`;
                  void updateConfig({
                    premiumPlan: {
                      ...config.premiumPlan,
                      plusEnabled: plusOfferEnabled,
                      plusPriceLabel: priceLabel,
                      plusAmountInr: yearly,
                      plusCompareAtAmountInr,
                      plusMonthlyPriceLabel: monthlyPriceLabel,
                      plusMonthlyAmountInr: monthly,
                      plusMonthlyCompareAtAmountInr,
                      plusFeatures,
                    } as typeof config.premiumPlan,
                  }).then((ok) => {
                    if (!ok) return;
                    setPlusDraft(
                      PREMIUM_FEATURE_KEYS.reduce(
                        (acc, key) => {
                          const row = plusFeatures[key];
                          acc[key] = {
                            enabled: row.enabled,
                            monthly: String(row.monthlyInr),
                            yearly: String(row.yearlyInr),
                            compareMonthly: String(row.compareAtMonthlyInr),
                            compareYearly: String(row.compareAtYearlyInr),
                          };
                          return acc;
                        },
                        {} as Record<
                          PremiumFeatureKey,
                          {
                            enabled: boolean;
                            monthly: string;
                            yearly: string;
                            compareMonthly: string;
                            compareYearly: string;
                          }
                        >,
                      ),
                    );
                    notifySaved(
                      plusOfferEnabled
                        ? `Plus synced at ${priceLabel} (${
                            PREMIUM_FEATURE_KEYS.filter((k) => plusFeatures[k].enabled).length
                          } features).`
                        : 'Plus checkout disabled.',
                    );
                  });
                }}
              />
            </Card>
          ) : null}

          {adminSection === 'diamonds' ? (
            <Card>
              <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 18, marginBottom: 12 }}>
                Diamonds are earned by watching rewarded videos and spent here. Prices are stored in
                the cloud and checked on the server, so every device charges the same. A diamond
                unlock never removes ads — only paid Premium does.
              </Text>

              {diaLoading ? (
                <ActivityIndicator color={theme.primary} style={{ marginVertical: 20 }} />
              ) : (
                <>
                  <Pressable
                    onPress={() => setDiaEnabled((v) => !v)}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingVertical: 12,
                      marginBottom: 16,
                      borderBottomWidth: 1,
                      borderBottomColor: theme.line,
                    }}
                  >
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text style={{ color: theme.ink, fontWeight: '700' }}>Enable diamonds</Text>
                      <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                        {diaEnabled
                          ? 'Users can earn and spend diamonds'
                          : 'Earning and spending are both switched off'}
                      </Text>
                    </View>
                    <View
                      style={{
                        width: 44,
                        height: 25,
                        borderRadius: 20,
                        backgroundColor: diaEnabled ? theme.primary : '#e2e2e5',
                        justifyContent: 'center',
                        paddingHorizontal: 2,
                      }}
                    >
                      <View
                        style={{
                          width: 21,
                          height: 21,
                          borderRadius: 11,
                          backgroundColor: '#fff',
                          alignSelf: diaEnabled ? 'flex-end' : 'flex-start',
                        }}
                      />
                    </View>
                  </Pressable>

                  <Text style={{ color: theme.ink, fontWeight: '800', marginBottom: 10 }}>
                    Earning
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Field
                        label="Diamonds per video"
                        value={diaPerAd}
                        onChangeText={setDiaPerAd}
                        keyboardType="number-pad"
                        placeholder="1"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Field
                        label="Max per day"
                        value={diaCap}
                        onChangeText={setDiaCap}
                        keyboardType="number-pad"
                        placeholder="5"
                      />
                    </View>
                  </View>
                  <Text style={{ color: theme.muted, fontSize: 11, marginBottom: 18 }}>
                    The cap is counted from the server clock, so changing the device date cannot earn
                    extra diamonds.
                  </Text>

                  <Text style={{ color: theme.ink, fontWeight: '800', marginBottom: 4 }}>
                    Premium passes
                  </Text>
                  <Text style={{ color: theme.muted, fontSize: 11, marginBottom: 12 }}>
                    A pass unlocks every Premium feature for a while. Redeeming again extends the
                    time already left, and ads keep showing throughout.
                  </Text>

                  {DIAMOND_PASS_DAYS.map((days) => {
                    const draft = diaPasses[days];
                    if (!draft) return null;
                    return (
                      <View
                        key={days}
                        style={{
                          marginBottom: 14,
                          paddingBottom: 14,
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: theme.line,
                        }}
                      >
                        <Pressable
                          onPress={() =>
                            setDiaPasses((prev) => ({
                              ...prev,
                              [days]: { ...prev[days], enabled: !prev[days].enabled },
                            }))
                          }
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 8,
                          }}
                        >
                          <View style={{ flex: 1, paddingRight: 12 }}>
                            <Text style={{ color: theme.ink, fontWeight: '700' }}>
                              {days}-day Premium pass
                            </Text>
                            <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                              {draft.enabled ? 'Offered for diamonds' : 'Not offered'}
                            </Text>
                          </View>
                          <View
                            style={{
                              width: 44,
                              height: 25,
                              borderRadius: 20,
                              backgroundColor: draft.enabled ? theme.primary : '#e2e2e5',
                              justifyContent: 'center',
                              paddingHorizontal: 2,
                            }}
                          >
                            <View
                              style={{
                                width: 21,
                                height: 21,
                                borderRadius: 11,
                                backgroundColor: '#fff',
                                alignSelf: draft.enabled ? 'flex-end' : 'flex-start',
                              }}
                            />
                          </View>
                        </Pressable>
                        {draft.enabled ? (
                          <View style={{ flexDirection: 'row', gap: 10 }}>
                            <View style={{ flex: 1 }}>
                              <Field
                                label="Price 💎"
                                value={draft.cost}
                                onChangeText={(text) =>
                                  setDiaPasses((prev) => ({
                                    ...prev,
                                    [days]: { ...prev[days], cost: text },
                                  }))
                                }
                                keyboardType="number-pad"
                                placeholder={String(days * 9)}
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Field
                                label="Was 💎"
                                value={draft.listCost}
                                onChangeText={(text) =>
                                  setDiaPasses((prev) => ({
                                    ...prev,
                                    [days]: { ...prev[days], listCost: text },
                                  }))
                                }
                                keyboardType="number-pad"
                                placeholder="0"
                              />
                            </View>
                          </View>
                        ) : null}
                      </View>
                    );
                  })}

                  <Text style={{ color: theme.ink, fontWeight: '800', marginBottom: 4 }}>
                    Feature prices
                  </Text>
                  <Text style={{ color: theme.muted, fontSize: 11, marginBottom: 12 }}>
                    “Was” is struck out beside the real price; 0 shows no discount. Days is how long
                    the unlock lasts, and 0 there keeps it for good. Avatars and themes are priced
                    per item, so 30 days means each character or colour lasts a month.
                  </Text>

                  {DIAMOND_STORE_ROWS.map((row) => {
                    const draft = diaStore[row.key];
                    if (!draft) return null;
                    return (
                      <View
                        key={row.key}
                        style={{
                          marginBottom: 14,
                          paddingBottom: 14,
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: theme.line,
                        }}
                      >
                        <Pressable
                          onPress={() =>
                            setDiaStore((prev) => ({
                              ...prev,
                              [row.key]: { ...prev[row.key], enabled: !prev[row.key].enabled },
                            }))
                          }
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 8,
                          }}
                        >
                          <View style={{ flex: 1, paddingRight: 12 }}>
                            <Text style={{ color: theme.ink, fontWeight: '700' }}>{row.label}</Text>
                            <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                              {draft.enabled
                                ? `${row.unit} · ${
                                    Number(draft.days) > 0
                                      ? `${draft.days} day(s)`
                                      : 'kept for good'
                                  }`
                                : 'Not sold for diamonds'}
                            </Text>
                          </View>
                          <View
                            style={{
                              width: 44,
                              height: 25,
                              borderRadius: 20,
                              backgroundColor: draft.enabled ? theme.primary : '#e2e2e5',
                              justifyContent: 'center',
                              paddingHorizontal: 2,
                            }}
                          >
                            <View
                              style={{
                                width: 21,
                                height: 21,
                                borderRadius: 11,
                                backgroundColor: '#fff',
                                alignSelf: draft.enabled ? 'flex-end' : 'flex-start',
                              }}
                            />
                          </View>
                        </Pressable>
                        {draft.enabled ? (
                          <View style={{ flexDirection: 'row', gap: 10 }}>
                            <View style={{ flex: 1 }}>
                              <Field
                                label="Price 💎"
                                value={draft.cost}
                                onChangeText={(text) =>
                                  setDiaStore((prev) => ({
                                    ...prev,
                                    [row.key]: { ...prev[row.key], cost: text },
                                  }))
                                }
                                keyboardType="number-pad"
                                placeholder="5"
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Field
                                label="Was 💎"
                                value={draft.listCost}
                                onChangeText={(text) =>
                                  setDiaStore((prev) => ({
                                    ...prev,
                                    [row.key]: { ...prev[row.key], listCost: text },
                                  }))
                                }
                                keyboardType="number-pad"
                                placeholder="0"
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Field
                                label="Days"
                                value={draft.days}
                                onChangeText={(text) =>
                                  setDiaStore((prev) => ({
                                    ...prev,
                                    [row.key]: { ...prev[row.key], days: text },
                                  }))
                                }
                                keyboardType="number-pad"
                                placeholder={row.perItem ? '30' : '7'}
                              />
                            </View>
                          </View>
                        ) : null}
                      </View>
                    );
                  })}

                  <PrimaryButton
                    title={diaSaving ? 'Saving…' : 'Save diamond prices'}
                    onPress={() => {
                      if (diaSaving) return;
                      void saveDiamondSettings();
                    }}
                  />
                </>
              )}
            </Card>
          ) : null}

          {adminSection === 'colors' ? (
            <Card>
              <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 18, marginBottom: 12 }}>
                Free = Pulse Teal. Premium = dual-tone live packs (Aurora, Sunset, Obsidian, Royal,
                Velvet). Premium Pro = coming later.
              </Text>

              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                {(
                  [
                    ['free', 'Free'],
                    ['premium', 'Premium'],
                    ['premiumPro', 'Premium Pro'],
                  ] as const
                ).map(([id, label]) => {
                  const on = colorFilter === id;
                  return (
                    <Pressable
                      key={id}
                      onPress={() => setColorFilter(id)}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: 12,
                        alignItems: 'center',
                        backgroundColor: on ? theme.header : theme.bg,
                        borderWidth: 1.5,
                        borderColor: on ? theme.header : theme.line,
                      }}
                    >
                      <Text
                        style={{
                          fontWeight: '800',
                          fontSize: 12,
                          color: on ? '#fff' : theme.ink,
                        }}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {colorFilter === 'premium' ? (
                <Pressable
                  onPress={() => {
                    const next = !config.themeCatalog.unlockAllPremium;
                    void updateConfig({
                      themeCatalog: {
                        ...config.themeCatalog,
                        unlockAllPremium: next,
                      },
                    }).then((ok) => {
                      if (!ok) return;
                      notifySaved(
                        next
                          ? 'Premium colors unlocked for everyone.'
                          : 'Premium colors limited to Premium Members.',
                      );
                    });
                  }}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingVertical: 12,
                    marginBottom: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.line,
                  }}
                >
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={{ color: theme.ink, fontWeight: '700' }}>
                      Unlock Premium for all
                    </Text>
                    <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                      {config.themeCatalog.unlockAllPremium
                        ? 'Everyone can use Premium colors right now'
                        : 'Only Premium Members see these colors'}
                    </Text>
                  </View>
                  <View
                    style={{
                      width: 44,
                      height: 25,
                      borderRadius: 20,
                      backgroundColor: config.themeCatalog.unlockAllPremium
                        ? theme.primary
                        : '#e2e2e5',
                      justifyContent: 'center',
                      paddingHorizontal: 2,
                    }}
                  >
                    <View
                      style={{
                        width: 21,
                        height: 21,
                        borderRadius: 11,
                        backgroundColor: '#fff',
                        alignSelf: config.themeCatalog.unlockAllPremium
                          ? 'flex-end'
                          : 'flex-start',
                      }}
                    />
                  </View>
                </Pressable>
              ) : null}

              {colorFilter === 'premiumPro' &&
              themesForAccess(config.themeCatalog, 'premiumPro').length === 0 ? (
                <View
                  style={{
                    padding: 16,
                  borderRadius: 14,
                    borderWidth: 1.5,
                    borderColor: theme.line,
                    backgroundColor: theme.bg,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: theme.ink, fontWeight: '800', marginBottom: 6 }}>
                    Premium Pro — empty for now
                  </Text>
                  <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 18 }}>
                    Tell me which Pro colors to add later. You can still move any color into this
                    tier with the buttons below once colors exist.
                  </Text>
                </View>
              ) : null}

              {themesForAccess(config.themeCatalog, colorFilter).map((key) => {
                const t = THEMES[key];
                const access = themeAccessFor(key, config.themeCatalog);
                const selected = config.theme === key;
                const setAccess = (next: ThemeAccess) => {
                  if (access === next) return;
                  void updateConfig({
                    themeCatalog: {
                      ...config.themeCatalog,
                      access: { ...config.themeCatalog.access, [key]: next },
                    },
                  }).then((ok) => {
                    if (!ok) return;
                    const tier =
                      next === 'free'
                        ? 'Free'
                        : next === 'premium'
                          ? 'Premium'
                          : next === 'premiumPro'
                            ? 'Premium Pro'
                            : 'Hidden';
                    notifySaved(`${t.label} set to ${tier}.`);
                  });
                };
                return (
                  <View
                    key={key}
                    style={{
                      borderWidth: 1.5,
                      borderColor: selected ? theme.primary : theme.line,
                      borderRadius: 14,
                      padding: 12,
                      marginBottom: 10,
                      backgroundColor: theme.card,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        marginBottom: 10,
                      }}
                    >
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          backgroundColor: t.primary,
                          borderWidth: 2,
                          borderColor: t.primaryDark,
                        }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.ink, fontWeight: '800' }}>{t.label}</Text>
                        <Text style={{ color: theme.muted, fontSize: 12 }}>
                          {selected ? 'Active color' : t.primary}
                        </Text>
                      </View>
                      {!selected ? (
                        <Pressable
                          onPress={() => {
                            void updateConfig({ theme: key }).then((ok) => {
                              if (!ok) return;
                              notifySaved(`${t.label} is now the active color.`);
                            });
                          }}
                        >
                          <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 12 }}>
                            Set active
                          </Text>
              </Pressable>
                      ) : (
                        <Text style={{ color: theme.primary, fontWeight: '900' }}>✓</Text>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {(
                        [
                          ['free', 'Free'],
                          ['premium', 'Premium'],
                          ['premiumPro', 'Pro'],
                          ['hidden', 'Hide'],
                        ] as const
                      ).map(([opt, label]) => {
                        const on = access === opt;
                        return (
                          <Pressable
                            key={opt}
                            onPress={() => setAccess(opt)}
                            style={{
                              flex: 1,
                              paddingVertical: 8,
                              borderRadius: 10,
                              alignItems: 'center',
                              backgroundColor: on ? theme.header : theme.bg,
                              borderWidth: 1.5,
                              borderColor: on ? theme.header : theme.line,
                            }}
                          >
                            <Text
                              style={{
                                fontWeight: '800',
                                fontSize: 10,
                                color: on ? '#fff' : theme.ink,
                              }}
                            >
                              {label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </Card>
          ) : null}

          {adminSection === 'ads' ? (
            <>
            <Card>
              <Text style={{ color: theme.ink, fontWeight: '800', fontSize: 16, marginBottom: 8 }}>
                Google AdMob (network ads)
              </Text>
              <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 18, marginBottom: 12 }}>
                Paste unit IDs from AdMob (Apps → Ad units). Use the master switch plus Show /
                Hide for Premium under each format. Banner and Native are live; other formats are
                stored for later. Needs a native build (not Expo Go). Keep “Use test IDs” on until
                you’re ready for live traffic.
              </Text>

              <Pressable
                onPress={() => {
                  const next = !gAdsEnabled;
                  setGAdsEnabled(next);
                  void updateConfig({
                    googleAds: {
                      ...config.googleAds,
                      enabled: next,
                    },
                  }).then((ok) => {
                    if (!ok) setGAdsEnabled(!next);
                    else notifySaved(next ? 'Google Ads on.' : 'Google Ads off.');
                  });
                }}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingVertical: 12,
                  marginBottom: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.line,
                }}
              >
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={{ color: theme.ink, fontWeight: '700' }}>Enable Google Ads</Text>
                  <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                    {gAdsEnabled
                      ? 'Master switch on — use per-format toggles below'
                      : 'Hidden for everyone'}
                  </Text>
                </View>
                <View
                  style={{
                    width: 44,
                    height: 25,
                    borderRadius: 20,
                    backgroundColor: gAdsEnabled ? theme.primary : '#e2e2e5',
                    justifyContent: 'center',
                    paddingHorizontal: 2,
                  }}
                >
                  <View
                    style={{
                      width: 21,
                      height: 21,
                      borderRadius: 11,
                      backgroundColor: '#fff',
                      alignSelf: gAdsEnabled ? 'flex-end' : 'flex-start',
                    }}
                  />
                </View>
              </Pressable>

              <Pressable
                onPress={() => {
                  const next = !gAdsUseTest;
                  setGAdsUseTest(next);
                  void updateConfig({
                    googleAds: { ...config.googleAds, useTestIds: next },
                  }).then((ok) => {
                    if (!ok) setGAdsUseTest(!next);
                    else
                      notifySaved(
                        next ? 'Using Google test ad unit IDs.' : 'Using your AdMob unit IDs.',
                      );
                  });
                }}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingVertical: 12,
                  marginBottom: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.line,
                }}
              >
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={{ color: theme.ink, fontWeight: '700' }}>Use test IDs</Text>
                  <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                    Safe for development builds
                  </Text>
                </View>
                <View
                  style={{
                    width: 44,
                    height: 25,
                    borderRadius: 20,
                    backgroundColor: gAdsUseTest ? theme.primary : '#e2e2e5',
                    justifyContent: 'center',
                    paddingHorizontal: 2,
                  }}
                >
                  <View
                    style={{
                      width: 21,
                      height: 21,
                      borderRadius: 11,
                      backgroundColor: '#fff',
                      alignSelf: gAdsUseTest ? 'flex-end' : 'flex-start',
                    }}
                  />
                </View>
              </Pressable>

              {GOOGLE_AD_UNIT_GROUPS.map((group) => {
                const flags = gAdsFormats[group.format];
                const patchFormat = (
                  nextFlags: GoogleAdFormatFlags,
                  message: string,
                ) => {
                  const nextFormats = {
                    ...gAdsFormats,
                    [group.format]: nextFlags,
                  };
                  setGAdsFormats(nextFormats);
                  void updateConfig({
                    googleAds: {
                      ...config.googleAds,
                      formats: nextFormats,
                    },
                  }).then((ok) => {
                    if (!ok) setGAdsFormats(gAdsFormats);
                    else notifySaved(message);
                  });
                };
                return (
                  <View
                    key={group.format}
                    style={{
                      marginTop: 12,
                      marginBottom: 4,
                      paddingHorizontal: 12,
                      paddingTop: 12,
                      paddingBottom: 6,
                      borderWidth: 1,
                      borderColor: theme.line,
                      borderRadius: 12,
                      backgroundColor: theme.bg,
                    }}
                  >
                    <Text
                      style={{
                        color: theme.ink,
                        fontWeight: '800',
                        fontSize: 14,
                        marginBottom: 2,
                      }}
                    >
                      {group.title}
                    </Text>
                    <Text
                      style={{
                        color: theme.muted,
                        fontSize: 11,
                        fontWeight: '600',
                        lineHeight: 15,
                        marginBottom: 10,
                      }}
                    >
                      {group.hint}
                    </Text>

                    <Pressable
                      onPress={() => {
                        const next = !flags.enabled;
                        patchFormat(
                          { ...flags, enabled: next },
                          next
                            ? `${group.title} ads on.`
                            : `${group.title} ads off.`,
                        );
                      }}
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingVertical: 10,
                        marginBottom: 4,
                      }}
                    >
                      <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text style={{ color: theme.ink, fontWeight: '700' }}>
                          Show {group.title.toLowerCase()}
                        </Text>
                        <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                          {flags.enabled ? 'Offered when master switch is on' : 'Hidden'}
                        </Text>
                      </View>
                      <View
                        style={{
                          width: 44,
                          height: 25,
                          borderRadius: 20,
                          backgroundColor: flags.enabled ? theme.primary : '#e2e2e5',
                          justifyContent: 'center',
                          paddingHorizontal: 2,
                        }}
                      >
                        <View
                          style={{
                            width: 21,
                            height: 21,
                            borderRadius: 11,
                            backgroundColor: '#fff',
                            alignSelf: flags.enabled ? 'flex-end' : 'flex-start',
                          }}
                        />
                      </View>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        const next = !flags.hideForPremium;
                        patchFormat(
                          { ...flags, hideForPremium: next },
                          next
                            ? `${group.title} hidden for Premium.`
                            : `${group.title} also shows for Premium.`,
                        );
                      }}
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingVertical: 10,
                        marginBottom: 8,
                      }}
                    >
                      <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text style={{ color: theme.ink, fontWeight: '700' }}>
                          Hide for Premium
                        </Text>
                        <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                          Recommended
                        </Text>
                      </View>
                      <View
                        style={{
                          width: 44,
                          height: 25,
                          borderRadius: 20,
                          backgroundColor: flags.hideForPremium
                            ? theme.primary
                            : '#e2e2e5',
                          justifyContent: 'center',
                          paddingHorizontal: 2,
                        }}
                      >
                        <View
                          style={{
                            width: 21,
                            height: 21,
                            borderRadius: 11,
                            backgroundColor: '#fff',
                            alignSelf: flags.hideForPremium
                              ? 'flex-end'
                              : 'flex-start',
                          }}
                        />
                      </View>
                    </Pressable>

                    {group.fields.map(({ key, label }) => (
                      <View key={key}>
                        <Text
                          style={{
                            color: theme.muted,
                            fontSize: 12,
                            fontWeight: '700',
                            marginBottom: 6,
                          }}
                        >
                          {label}
                        </Text>
                        <TextInput
                          value={gAdsUnits[key]}
                          onChangeText={(text) =>
                            setGAdsUnits((prev) => ({ ...prev, [key]: text }))
                          }
                          placeholder="ca-app-pub-xxxx/yyyy"
                          placeholderTextColor={theme.muted}
                          autoCapitalize="none"
                          autoCorrect={false}
                          style={{
                            borderWidth: 1,
                            borderColor: theme.line,
                            borderRadius: 10,
                            padding: 12,
                            color: theme.ink,
                            marginBottom: 10,
                            backgroundColor: theme.bg,
                          }}
                        />
                      </View>
            ))}
          </View>
                );
              })}
              <PrimaryButton
                title="Save AdMob unit IDs"
                onPress={() => {
                  const trimmed = {} as GoogleAdUnitsDraft;
                  for (const { key } of GOOGLE_AD_UNIT_FIELDS) {
                    trimmed[key] = gAdsUnits[key].trim();
                  }
                  void updateConfig({
                    googleAds: {
                      ...config.googleAds,
                      enabled: gAdsEnabled,
                      useTestIds: gAdsUseTest,
                      formats: gAdsFormats,
                      ...trimmed,
                    },
                  }).then((ok) => {
                    if (ok) {
                      setGAdsUnits(trimmed);
                      notifySaved('AdMob settings saved.');
                    }
                  });
                }}
              />
        </Card>

        <Card>
          <Text style={{ color: theme.ink, fontWeight: '800', fontSize: 16, marginBottom: 8 }}>
            Profile ad banner
          </Text>
          <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 18, marginBottom: 12 }}>
            Multiple ads play one after another on Profile: video → end card → wait → next ad
            (loops). Only admins can edit this.
          </Text>

              <Pressable
            onPress={() => {
              const next = !adEnabled;
              setAdEnabled(next);
              void updateConfig({ adBanner: buildAdDraft(next) }).then((ok) => {
                if (!ok) {
                  setAdEnabled(!next);
                  return;
                }
                notifySaved(next ? 'Profile ad banner turned on.' : 'Profile ad banner turned off.');
              });
            }}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingVertical: 12,
              marginBottom: 8,
              borderBottomWidth: 1,
              borderBottomColor: theme.line,
            }}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ color: theme.ink, fontWeight: '700' }}>Show banner</Text>
              <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                {adEnabled ? 'Visible on Profile' : 'Hidden on Profile'}
              </Text>
            </View>
            <View
              style={{
                width: 44,
                height: 25,
                borderRadius: 20,
                backgroundColor: adEnabled ? theme.primary : '#e2e2e5',
                justifyContent: 'center',
                paddingHorizontal: 2,
              }}
            >
              <View
                style={{
                  width: 21,
                  height: 21,
                  borderRadius: 11,
                  backgroundColor: '#fff',
                  alignSelf: adEnabled ? 'flex-end' : 'flex-start',
                }}
              />
            </View>
          </Pressable>

          <Pressable
            onPress={() => {
              const next = !adHideForPremium;
              setAdHideForPremium(next);
              void updateConfig({ adBanner: buildAdDraft(adEnabled, next) }).then((ok) => {
                if (!ok) {
                  setAdHideForPremium(!next);
                  return;
                }
                notifySaved(
                  next
                    ? 'Ads hidden for Premium members.'
                    : 'Ads will also show for Premium members.',
                );
              });
            }}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingVertical: 12,
              marginBottom: 8,
              borderBottomWidth: 1,
              borderBottomColor: theme.line,
            }}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ color: theme.ink, fontWeight: '700' }}>
                Hide ads for Premium
              </Text>
              <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                {adHideForPremium
                  ? 'Premium members never see Profile ads'
                  : 'Premium members see ads too'}
              </Text>
            </View>
            <View
              style={{
                width: 44,
                height: 25,
                borderRadius: 20,
                backgroundColor: adHideForPremium ? theme.primary : '#e2e2e5',
                justifyContent: 'center',
                paddingHorizontal: 2,
              }}
            >
              <View
                style={{
                  width: 21,
                  height: 21,
                  borderRadius: 11,
                  backgroundColor: '#fff',
                  alignSelf: adHideForPremium ? 'flex-end' : 'flex-start',
                }}
              />
            </View>
          </Pressable>

          <Field
            label="Seconds between ads (after end card)"
            value={adHoldSec}
            onChangeText={setAdHoldSec}
            keyboardType="number-pad"
          />
          <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 17, marginBottom: 12 }}>
            Default 120 (2 minutes). After an end card shows, the next ad starts after this delay.
          </Text>

          <Text style={{ color: theme.ink, fontWeight: '700', marginBottom: 8 }}>Playlist</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            {adItems.map((item, i) => (
              <Pressable
                key={item.id}
                onPress={() => setAdEditIndex(i)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                  borderWidth: 1.5,
                  borderColor: adEditIndex === i ? theme.primary : theme.line,
                  backgroundColor: adEditIndex === i ? theme.primary : theme.card,
                }}
              >
                <Text
                  style={{
                    fontWeight: '700',
                    color: adEditIndex === i ? '#fff' : theme.ink,
                    fontSize: 13,
                  }}
                >
                  Ad {i + 1}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
            <View style={{ flex: 1 }}>
              <PrimaryButton
                title="Add ad"
                onPress={() => {
                  const next = emptyAdCreative({ title: `Ad ${adItems.length + 1}` });
                  setAdItems((prev) => [...prev, next]);
                  setAdEditIndex(adItems.length);
                }}
              />
            </View>
            {adItems.length > 1 ? (
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title="Delete this ad"
                  danger
                  onPress={() => {
                    const removing = activeAd;
                    showAppDialog({
                      title: 'Delete ad',
                      message: `Remove “${removing.title || 'this ad'}” from the playlist?`,
                      icon: '🗑',
                      buttons: [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: () => {
                            if (removing.mediaUri) void clearPersistedAdMedia(removing.mediaUri);
                            if (removing.endImageUri) {
                              void clearPersistedAdMedia(removing.endImageUri);
                            }
                            setAdItems((prev) => {
                              const next = prev.filter((_, i) => i !== adEditIndex);
                              return next.length ? next : [emptyAdCreative()];
                            });
                            setAdEditIndex((i) => Math.max(0, i - 1));
                          },
                        },
                      ],
                    });
                  }}
                />
              </View>
            ) : null}
          </View>

          <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '800', marginBottom: 8 }}>
            EDITING AD {Math.min(adEditIndex, adItems.length - 1) + 1} OF {adItems.length}
          </Text>

          <Field
            label="Icon (emoji)"
            value={activeAd.icon}
            onChangeText={(v) => patchActiveAd({ icon: v })}
          />
          <Field
            label="Title"
            value={activeAd.title}
            onChangeText={(v) => patchActiveAd({ title: v })}
          />
          <Field
            label="Subtitle (shown if app not installed)"
            value={activeAd.subtitle}
            onChangeText={(v) => patchActiveAd({ subtitle: v })}
            multiline
            style={{ minHeight: 64, textAlignVertical: 'top' }}
          />
          <Field
            label="Button label (fallback)"
            value={activeAd.buttonLabel}
            onChangeText={(v) => patchActiveAd({ buttonLabel: v })}
          />
          <Field
            label="Store / web URL (Install)"
            value={activeAd.buttonUrl}
            onChangeText={(v) => patchActiveAd({ buttonUrl: v })}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Field
            label="App scheme (optional, e.g. myapp://)"
            value={activeAd.appScheme || ''}
            onChangeText={(v) => patchActiveAd({ appScheme: v })}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 17, marginBottom: 10 }}>
            Leave blank to always use the button label. If the scheme opens on the device, Profile
            shows “Installed” + Open; otherwise Install uses the store URL.
          </Text>

          <Text style={{ color: theme.ink, fontWeight: '700', marginBottom: 8, marginTop: 4 }}>
            1) Intro video (muted by default)
          </Text>
          <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 17, marginBottom: 10 }}>
            Plays first with sound off (user can unmute). When it ends, the end-card image appears.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <PrimaryButton
                title={
                  activeAd.mediaType === 'video' && activeAd.mediaUri
                    ? 'Change video'
                    : 'Upload video'
                }
                onPress={() => {
                  void pickAdBannerVideo().then((picked) => {
                    if (!picked) return;
                    const prev =
                      activeAd.mediaType === 'video' ? activeAd.mediaUri : null;
                    patchActiveAd({ mediaUri: picked.uri, mediaType: 'video' });
                    if (prev && prev !== picked.uri) void clearPersistedAdMedia(prev);
                  });
                }}
              />
            </View>
            {activeAd.mediaType === 'video' && activeAd.mediaUri ? (
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title="Remove video"
                  danger
                  onPress={() => {
                    const prev = activeAd.mediaUri;
                    patchActiveAd({ mediaUri: null, mediaType: null });
                    if (prev) void clearPersistedAdMedia(prev);
                  }}
                />
              </View>
            ) : null}
          </View>
          {activeAd.mediaType === 'video' && activeAd.mediaUri ? (
            <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 10 }}>Video selected</Text>
          ) : null}

          <Text style={{ color: theme.ink, fontWeight: '700', marginBottom: 8, marginTop: 4 }}>
            2) End-card image (after video)
          </Text>
          <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 17, marginBottom: 10 }}>
            Shown when the video finishes (or immediately if you skip video). Includes Open /
            Install.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <PrimaryButton
                title={activeAd.endImageUri ? 'Change end image' : 'Upload end image'}
                onPress={() => {
                  void pickAdBannerImage().then((picked) => {
                    if (!picked) return;
                    const prev = activeAd.endImageUri;
                    patchActiveAd({ endImageUri: picked.uri });
                    if (prev && prev !== picked.uri) void clearPersistedAdMedia(prev);
                  });
                }}
              />
            </View>
            {activeAd.endImageUri ? (
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title="Remove end image"
                  danger
                  onPress={() => {
                    const prev = activeAd.endImageUri;
                    patchActiveAd({ endImageUri: null });
                    if (prev) void clearPersistedAdMedia(prev);
                  }}
                />
              </View>
            ) : null}
          </View>
          {activeAd.endImageUri ? (
            <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 10 }}>
              End-card image selected
            </Text>
          ) : null}

          <PrimaryButton
            title="Save & show on Profile"
            onPress={() => {
              const draft = buildAdDraft(true);
              for (const item of draft.items) {
                const url = item.buttonUrl.trim();
                if (url && !/^https?:\/\//i.test(url)) {
                  showAppInfo(
                    'Invalid URL',
                    `“${item.title}”: store / web URL must start with http:// or https://`,
                    '⚠️',
                  );
                  return;
                }
              }
              const missingEnd = draft.items.find(
                (item) => item.mediaType === 'video' && item.mediaUri && !item.endImageUri,
              );
              if (missingEnd) {
                showAppDialog({
                  title: 'End-card image recommended',
                  message: `“${missingEnd.title}” has a video but no end-card image. Save anyway?`,
                  icon: '🖼️',
                  buttons: [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Save anyway',
                      style: 'primary',
                      onPress: () => {
                        setAdEnabled(true);
                        void updateConfig({ adBanner: draft }).then((ok) => {
                          if (ok) {
                            showAppInfo(
                              'Saved',
                              `${draft.items.length} ad(s) on. After each end card, the next starts in ${draft.endCardHoldSec}s.`,
                              '✅',
                            );
                          }
                        });
                      },
                    },
                  ],
                });
                return;
              }
              setAdEnabled(true);
              void updateConfig({ adBanner: draft }).then((ok) => {
                if (!ok) return;
                showAppInfo(
                  'Saved',
                  `${draft.items.length} ad(s) on. Profile plays each video → end card → waits ${draft.endCardHoldSec}s → next ad.`,
                  '✅',
                );
              });
            }}
          />

          <View style={{ marginTop: 14 }}>
            <Text style={{ color: theme.muted, fontSize: 11, fontWeight: '800', marginBottom: 8 }}>
              PREVIEW (current ad only — rotation runs on Profile)
            </Text>
            <ProfileAdBanner
              config={buildAdDraft(adEnabled)}
              previewIndex={Math.min(adEditIndex, Math.max(0, adItems.length - 1))}
              preview
            />
            {!adEnabled ? (
              <Text style={{ color: theme.muted, fontSize: 12, marginTop: 10, lineHeight: 17 }}>
                Banner is currently hidden. Tap “Save & show on Profile” or turn on Show banner.
              </Text>
            ) : null}
          </View>
        </Card>
            </>
          ) : null}

          {adminSection === 'users' ? (
        <Card>
              <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 18, marginBottom: 12 }}>
                Signed-in accounts (name and email). Either admin can delete users and the other
                admin. You can’t delete your own account, and the last admin can’t be removed.
              </Text>

              <PrimaryButton
                title={usersLoading ? 'Loading…' : 'Refresh users'}
                onPress={() => {
                  if (!usersLoading) void loadUsers();
                }}
              />

              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginTop: 14,
                  marginBottom: 4,
                }}
              >
                {(
                  [
                    ['all', 'All'],
                    ['free', 'Free'],
                    ['month', 'Monthly'],
                    ['year', 'Yearly'],
                  ] as const
                ).map(([id, label]) => {
                  const on = usersFilter === id;
                  const count = usersFilterCounts[id];
                  return (
                    <Pressable
                      key={id}
                      onPress={() => setUsersFilter(id)}
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 999,
                        borderWidth: 1.5,
                        borderColor: on ? theme.header : theme.line,
                        backgroundColor: on ? theme.header : theme.bg,
                      }}
                    >
                      <Text
                        style={{
                          color: on ? '#fff' : theme.ink,
                          fontWeight: '800',
                          fontSize: 12,
                        }}
                      >
                        {label} ({count})
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 17, marginTop: 6 }}>
                Monthly / Yearly come from Plan type when you activate Premium in Details (from the
                payment email).
              </Text>

              {usersLoading ? (
                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                  <ActivityIndicator color={theme.header} />
                </View>
              ) : null}

              {usersError ? (
                <Text
                  style={{
                    color: theme.red,
                    fontSize: 13,
                    lineHeight: 18,
                    marginTop: 12,
                    fontWeight: '600',
                  }}
                >
                  {usersError}
                </Text>
              ) : null}

              {!usersLoading && !usersError && users.length === 0 ? (
                <Text style={{ color: theme.muted, marginTop: 14, lineHeight: 18 }}>
                  No signed-in users found yet.
                </Text>
              ) : null}

              {!usersLoading &&
              !usersError &&
              users.length > 0 &&
              filteredUsers.length === 0 ? (
                <Text style={{ color: theme.muted, marginTop: 14, lineHeight: 18 }}>
                  No users in this filter.
                </Text>
              ) : null}

              {filteredUsers.map((u) => {
                const name =
                  (u.full_name || '').trim() ||
                  (u.email || '').split('@')[0] ||
                  'User';
                const email = (u.email || '').trim() || '—';
                const isYou = !!session?.user?.id && session.user.id === u.id;
                const busy = deletingUserId === u.id;
                const premiumActive = isPremiumCurrentlyActive({
                  is_premium: u.is_premium,
                  premium_until: u.premium_until,
                });
                const bucket = userPremiumFilterBucket({
                  is_premium: u.is_premium,
                  premium_until: u.premium_until,
                  premium_billing: u.premium_billing,
                });
                const planBadge =
                  bucket === 'month' ? 'Monthly' : bucket === 'year' ? 'Yearly' : null;
                return (
                  <View
                    key={u.id}
                    style={{
                      marginTop: 12,
                      paddingVertical: 12,
                      paddingHorizontal: 12,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: theme.line,
                      backgroundColor: theme.bg,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 4,
                      }}
                    >
                      <Text
                        style={{
                          color: theme.ink,
                          fontWeight: '800',
                          fontSize: 15,
                          flex: 1,
                          paddingRight: 8,
                        }}
                        numberOfLines={1}
                      >
                        {name}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                        {premiumActive && planBadge ? (
                          <Text
                            style={{
                              color: theme.green,
                              fontWeight: '800',
                              fontSize: 11,
                              textTransform: 'uppercase',
                            }}
                          >
                            {planBadge}
                          </Text>
                        ) : !premiumActive ? (
                          <Text
                            style={{
                              color: theme.muted,
                              fontWeight: '800',
                              fontSize: 11,
                              textTransform: 'uppercase',
                            }}
                          >
                            Free
                          </Text>
                        ) : null}
                        {u.role === 'admin' || isYou ? (
                          <Text
                            style={{
                              color: theme.header,
                              fontWeight: '800',
                              fontSize: 11,
                              textTransform: 'uppercase',
                            }}
                          >
                            {u.role === 'admin' ? 'Admin' : isYou ? 'You' : ''}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <Text style={{ color: theme.muted, fontSize: 13, fontWeight: '600' }}>
                      {email}
                    </Text>
                    {premiumActive && u.premium_until ? (
                      <Text style={{ color: theme.muted, fontSize: 12, marginTop: 4 }}>
                        Until {String(u.premium_until).slice(0, 10)}
                      </Text>
                    ) : null}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                      <Pressable
                        onPress={() => setDetailsUser(u)}
                        style={{
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderRadius: 10,
                          borderWidth: 1.5,
                          borderColor: theme.header + '88',
                          backgroundColor: theme.header + '14',
                        }}
                      >
                        <Text style={{ color: theme.header, fontWeight: '800', fontSize: 13 }}>
                          Details
                        </Text>
                      </Pressable>
                      {!isYou ? (
                        <Pressable
                          onPress={() => {
                            if (!busy && !deletingUserId) confirmDeleteUser(u);
                          }}
                          disabled={busy || !!deletingUserId}
                          style={{
                            paddingVertical: 8,
                            paddingHorizontal: 12,
                            borderRadius: 10,
                            borderWidth: 1.5,
                            borderColor: theme.red + '88',
                            backgroundColor: theme.red + '14',
                            opacity: busy || deletingUserId ? 0.5 : 1,
                          }}
                        >
                          {busy ? (
                            <ActivityIndicator color={theme.red} />
                          ) : (
                            <Text style={{ color: theme.red, fontWeight: '800', fontSize: 13 }}>
                              Delete user
                            </Text>
                          )}
                        </Pressable>
                      ) : (
                        <Text
                          style={{
                            color: theme.muted,
                            fontSize: 12,
                            fontWeight: '600',
                            alignSelf: 'center',
                          }}
                        >
                          Your account
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </Card>
          ) : null}

          <AdminUserDetailsModal
            user={detailsUser}
            visible={!!detailsUser}
            onClose={() => setDetailsUser(null)}
            onUpdated={(next) => {
              const apply = (prev: SignedInUserRow[]) =>
                prev.map((row) => (row.id === next.id ? { ...row, ...next } : row));
              setUsers(apply);
              setDetailsUser((prev) =>
                prev && prev.id === next.id ? { ...prev, ...next } : prev,
              );
              // Re-apply after refresh: older list_signed_in_profiles can shadow
              // is_premium and return every user as free even when DB is correct.
              void loadUsers().then(() => {
                setUsers(apply);
              });
            }}
          />

          {adminSection === 'features' ? (
        <>
        <Card>
          <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 18, marginBottom: 10 }}>
            Core modules. Hidden items leave the workspace switcher, tabs, search, and alarms.
          </Text>
          {(
            [
              ['finance', 'Finance tracker'],
              ['reminders', 'Reminders hub'],
              ['expenseReminder', 'Expense reminders'],
              ['medicineReminder', 'Medicine reminders'],
              ['groceryExpiryReminder', 'Grocery expiry'],
              ['generalReminder', 'General reminders'],
              ['shoppingList', 'Shopping list'],
              ['financeCharts', 'Finance charts'],
              ['financeReports', 'Finance reports'],
              ['financeAccounts', 'Accounts'],
            ] as const
          ).map(([key, label]) => (
            <Pressable
              key={key}
              onPress={() => toggleFeature(key)}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: theme.line,
              }}
            >
              <Text style={{ color: theme.ink, fontWeight: '600' }}>{label}</Text>
              <View
                style={{
                  width: 44,
                  height: 25,
                  borderRadius: 20,
                  backgroundColor: config.features[key] ? theme.primary : '#e2e2e5',
                  justifyContent: 'center',
                  paddingHorizontal: 2,
                }}
              >
                <View
                  style={{
                    width: 21,
                    height: 21,
                    borderRadius: 11,
                    backgroundColor: '#fff',
                    alignSelf: config.features[key] ? 'flex-end' : 'flex-start',
                  }}
                />
              </View>
            </Pressable>
          ))}
        </Card>

        <Card>
          <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 18, marginBottom: 10 }}>
            Free / Premium extras. Off hides them from the app and the Premium comparison table
            (even if marked Free or Premium elsewhere).
          </Text>
          {(
            [
              ['themes', 'Exclusive themes'],
              ['avatars', 'Character avatars'],
              ['cloud', 'Multi-device cloud sync'],
              ['backup', 'File backup & restore'],
              ['insights', 'Smart Insights'],
              ['splitExpense', 'Split expense'],
              ['smsImport', 'SMS / paste / screenshot import'],
            ] as const
          ).map(([key, label]) => (
            <Pressable
              key={key}
              onPress={() => toggleFeature(key)}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: theme.line,
              }}
            >
              <Text style={{ color: theme.ink, fontWeight: '600' }}>{label}</Text>
              <View
                style={{
                  width: 44,
                  height: 25,
                  borderRadius: 20,
                  backgroundColor: config.features[key] ? theme.primary : '#e2e2e5',
                  justifyContent: 'center',
                  paddingHorizontal: 2,
                }}
              >
                <View
                  style={{
                    width: 21,
                    height: 21,
                    borderRadius: 11,
                    backgroundColor: '#fff',
                    alignSelf: config.features[key] ? 'flex-end' : 'flex-start',
                  }}
                />
              </View>
            </Pressable>
          ))}
        </Card>
        </>
          ) : null}

          {adminSection === 'import' ? (
            <>
              <Card>
                <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 18, marginBottom: 12 }}>
                  Built-in UPI + delivery rules, plus custom packs. Users import from Home → Import
                  (SMS on Android, paste, or screenshot text).
                </Text>
                <Pressable
                  onPress={() => {
                    const next = !(config.importRules?.enabled !== false);
                    void updateConfig({
                      importRules: {
                        ...config.importRules,
                        enabled: next,
                        rules: config.importRules?.rules || [],
                      },
                    }).then((ok) => {
                      if (ok) notifySaved(next ? 'Import rules on.' : 'Import rules off.');
                    });
                  }}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    paddingVertical: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.line,
                  }}
                >
                  <Text style={{ color: theme.ink, fontWeight: '600' }}>Enable rule matching</Text>
                  <View
                    style={{
                      width: 44,
                      height: 25,
                      borderRadius: 20,
                      backgroundColor:
                        config.importRules?.enabled !== false ? theme.primary : '#e2e2e5',
                      justifyContent: 'center',
                      paddingHorizontal: 2,
                    }}
                  >
                    <View
                      style={{
                        width: 21,
                        height: 21,
                        borderRadius: 11,
                        backgroundColor: '#fff',
                        alignSelf:
                          config.importRules?.enabled !== false ? 'flex-end' : 'flex-start',
                      }}
                    />
                  </View>
                </Pressable>
                <Text style={{ color: theme.ink, fontWeight: '700', marginTop: 14, marginBottom: 6 }}>
                  SMS scan month
                </Text>
                <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 17, marginBottom: 10 }}>
                  Import reads the Android inbox for one calendar month so Home month totals stay
                  complete.
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  {(
                    [
                      { id: 'this_month' as const, label: 'This month' },
                      { id: 'previous_month' as const, label: 'Previous month' },
                    ] as const
                  ).map((opt) => {
                    const on = importMonthRange === opt.id;
                    return (
                      <Pressable
                        key={opt.id}
                        onPress={() => setImportMonthRange(opt.id)}
                        style={{
                          flex: 1,
                          paddingVertical: 10,
                          borderRadius: 10,
                          borderWidth: 1.5,
                          borderColor: on ? theme.primary : theme.line,
                          backgroundColor: on ? theme.bg : theme.card,
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ color: theme.ink, fontWeight: '800', fontSize: 13 }}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <PrimaryButton
                  title="Save SMS month"
                  onPress={() => {
                    void updateConfig({
                      importRules: {
                        ...config.importRules,
                        smsMonthRange: importMonthRange,
                        rules: config.importRules?.rules || [],
                      },
                    }).then((ok) => {
                      if (ok) {
                        notifySaved(
                          importMonthRange === 'previous_month'
                            ? 'SMS scan set to previous month.'
                            : 'SMS scan set to this month.',
                        );
                      }
                    });
                  }}
                />
              </Card>

              <Card>
                <Text style={{ color: theme.ink, fontWeight: '700', marginBottom: 8 }}>
                  Active rules
                </Text>
                {(config.importRules?.rules || []).map((rule) => {
                  const isBuiltin = BUILTIN_IMPORT_RULES.some((b) => b.id === rule.id);
                  return (
                    <View
                      key={rule.id}
                      style={{
                        paddingVertical: 12,
                        borderBottomWidth: 1,
                        borderBottomColor: theme.line,
                      }}
                    >
                      <Pressable
                        onPress={() => {
                          const nextRules = (config.importRules?.rules || []).map((r) =>
                            r.id === rule.id ? { ...r, enabled: !r.enabled } : r,
                          );
                          void updateConfig({
                            importRules: {
                              ...config.importRules,
                              rules: nextRules,
                            },
                          }).then((ok) => {
                            if (ok) {
                              notifySaved(
                                `${rule.name} ${!rule.enabled ? 'enabled' : 'disabled'}.`,
                              );
                            }
                          });
                        }}
                        style={{ flexDirection: 'row', justifyContent: 'space-between' }}
                      >
                        <View style={{ flex: 1, paddingRight: 12 }}>
                          <Text style={{ color: theme.ink, fontWeight: '700' }}>
                            {rule.name}{' '}
                            <Text style={{ color: theme.muted, fontWeight: '500' }}>
                              ({isBuiltin ? 'built-in' : 'custom'})
                            </Text>
                          </Text>
                          <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                            {rule.kind} · {rule.category} · senders:{' '}
                            {(rule.senders || []).slice(0, 3).join(', ') || 'any'}
                          </Text>
                        </View>
                        <View
                          style={{
                            width: 44,
                            height: 25,
                            borderRadius: 20,
                            backgroundColor: rule.enabled !== false ? theme.primary : '#e2e2e5',
                            justifyContent: 'center',
                            paddingHorizontal: 2,
                            alignSelf: 'center',
                          }}
                        >
                          <View
                            style={{
                              width: 21,
                              height: 21,
                              borderRadius: 11,
                              backgroundColor: '#fff',
                              alignSelf: rule.enabled !== false ? 'flex-end' : 'flex-start',
                            }}
                          />
                        </View>
                      </Pressable>
                      {!isBuiltin ? (
                        <Pressable
                          onPress={() => {
                            showAppDialog({
                              title: 'Delete rule?',
                              message: `Remove custom rule “${rule.name}”?`,
                              icon: '⚠️',
                              buttons: [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                  text: 'Delete',
                                  style: 'destructive',
                                  onPress: () => {
                                    const nextRules = (config.importRules?.rules || []).filter(
                                      (r) => r.id !== rule.id,
                                    );
                                    void updateConfig({
                                      importRules: {
                                        ...config.importRules,
                                        rules: nextRules,
                                      },
                                    }).then((ok) => {
                                      if (ok) notifySaved('Custom rule deleted.');
                                    });
                                  },
                                },
                              ],
                            });
                          }}
                          style={{ marginTop: 8 }}
                        >
                          <Text style={{ color: theme.red, fontWeight: '600' }}>Delete</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })}
              </Card>

              <Card>
                <Text style={{ color: theme.ink, fontWeight: '700', marginBottom: 8 }}>
                  Add custom rule
                </Text>
                <Field label="Name" value={newRuleName} onChangeText={setNewRuleName} />
                <Field
                  label="Senders (comma-separated)"
                  value={newRuleSenders}
                  onChangeText={setNewRuleSenders}
                  placeholder="AD-MYAPP, VM-MYAPP"
                />
                <Field
                  label="Body must include (comma-separated)"
                  value={newRuleIncludes}
                  onChangeText={setNewRuleIncludes}
                  placeholder="order, paid, ₹"
                />
                <Field
                  label="Category"
                  value={newRuleCategory}
                  onChangeText={setNewRuleCategory}
                />
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                  {(['expense', 'income'] as const).map((k) => {
                    const on = newRuleKind === k;
                    return (
                      <Pressable
                        key={k}
                        onPress={() => setNewRuleKind(k)}
                        style={{
                          flex: 1,
                          paddingVertical: 10,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: on ? theme.primary : theme.line,
                          backgroundColor: on ? theme.primary : theme.card,
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ color: on ? '#fff' : theme.ink, fontWeight: '700' }}>
                          {k}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <PrimaryButton
                  title="Add rule"
                  onPress={() => {
                    const name = newRuleName.trim();
                    if (!name) {
                      showAppInfo('Import rules', 'Enter a rule name.', 'ℹ️');
                      return;
                    }
                    const id = `custom-${uid()}`;
                    const rule: ImportSourceRule = {
                      id,
                      name,
                      enabled: true,
                      senders: newRuleSenders
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                      bodyIncludes: newRuleIncludes
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                      kind: newRuleKind,
                      category: newRuleCategory.trim() || 'Others',
                      notePrefix: name,
                      priority: 50,
                    };
                    const nextRules = [...(config.importRules?.rules || []), rule];
                    void updateConfig({
                      importRules: {
                        ...config.importRules,
                        rules: nextRules,
                      },
                    }).then((ok) => {
                      if (!ok) return;
                      setNewRuleName('');
                      setNewRuleSenders('');
                      setNewRuleIncludes('');
                      notifySaved(`Added rule “${name}”.`);
                    });
                  }}
                />
              </Card>
            </>
          ) : null}

          {adminSection === 'backup' ? (
        <Card>
          <PrimaryButton
            title="Export / Share backup JSON"
            onPress={async () => {
              await Share.share({ message: exportBackup(), title: 'Pulse Wallet Backup' });
              notifySaved('Backup JSON is ready to share.');
            }}
          />
          <Field
            label="Paste backup JSON to import"
            value={importText}
            onChangeText={setImportText}
            multiline
            style={{ minHeight: 90, textAlignVertical: 'top' }}
          />
          <PrimaryButton
            title="Import backup"
            onPress={() => {
              if (!importText.trim()) {
                showAppInfo('Import', 'Paste backup JSON first.', '⚠️');
                return;
              }
              showAppDialog({
                title: t('settings.restoreWarnTitle'),
                message: t('settings.restoreWarnBody'),
                icon: '⚠️',
                buttons: [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('settings.restoreReplace'),
                    style: 'primary',
                    onPress: () => {
                      showAppDialog({
                        title: t('settings.restoreRemindersTitle'),
                        message: t('settings.restoreRemindersBody'),
                        icon: '⏰',
                        buttons: [
                          {
                            text: t('settings.restoreRemindersNo'),
                            style: 'cancel',
                            onPress: () => {
                              void (async () => {
                                const ok = await importBackup(importText, {
                                  replaceReminders: false,
                                });
                                if (ok) {
                                  setImportText('');
                                  showAppInfo(t('settings.restore'), t('settings.restoredOk'), '✅');
                                } else {
                                  showAppInfo(
                                    t('common.couldNotSave'),
                                    t('settings.restoreFailed'),
                                    '⚠️',
                                  );
                                }
                              })();
                            },
                          },
                          {
                            text: t('settings.restoreRemindersYes'),
                            style: 'primary',
                            onPress: () => {
                              void (async () => {
                                const ok = await importBackup(importText, {
                                  replaceReminders: true,
                                });
                                if (ok) {
                                  setImportText('');
                                  showAppInfo(t('settings.restore'), t('settings.restoredOk'), '✅');
                                } else {
                                  showAppInfo(
                                    t('common.couldNotSave'),
                                    t('settings.restoreFailed'),
                                    '⚠️',
                                  );
                                }
                              })();
                            },
                          },
                        ],
                      });
                    },
                  },
                ],
              });
            }}
          />
        </Card>
          ) : null}
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
