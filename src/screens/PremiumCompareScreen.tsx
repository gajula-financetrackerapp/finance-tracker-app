import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { useFinance } from '../FinanceContext';
import { requireAuthToSave } from '../authGate';
import { showAppInfo } from '../appDialog';
import { Screen } from '../components/ui';
import { RootStackParamList } from '../navigation/types';
import { useT } from '../i18n/useT';
import type { TranslationKey } from '../i18n/translations';
import {
  PLUS_FEATURE_ORDER,
  isPlusFeatureOffered,
  plusIncludedKeys,
  strikeCompareAt,
} from '../lib/premiumCart';
import { isPremiumFeatureLive } from '../lib/premiumFeatures';
import {
  PLAY_BILLING_READY,
  isPlayBillingNativeAvailable,
  usePlayBillingCheckout,
} from '../lib/playBilling';
import type { PremiumFeatureKey, ThemeTokens } from '../types';

type Cell = 'unlimited' | 'limited' | 'yes' | 'no';
type CheckoutMode = 'plus' | 'premium';

const FEAT_LABEL: Record<PremiumFeatureKey, TranslationKey> = {
  themes: 'premium.featThemes',
  avatars: 'premium.featAvatars',
  cloud: 'premium.featCloud',
  backup: 'premium.featBackup',
  insights: 'premium.featInsights',
  splitExpense: 'premium.featSplit',
};

const FEAT_DESC: Record<PremiumFeatureKey, TranslationKey> = {
  themes: 'premium.descThemes',
  avatars: 'premium.descAvatars',
  cloud: 'premium.descCloud',
  backup: 'premium.descBackup',
  insights: 'premium.descInsights',
  splitExpense: 'premium.descSplit',
};

/**
 * Free | Plus (à la carte) | Premium comparison with sticky Google Play checkout.
 */
export function PremiumCompareScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { theme, config, isPremiumMember, refreshSharedPremiumPlan, refreshPremiumStatus } =
    useApp();
  const { isGuest, isAdmin, session, setShowAuth, setAuthMode } = useFinance();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const plan = config.premiumPlan;
  const yearlyLabel = (plan.priceLabel || '').trim() || `₹${plan.amountInr}/year`;
  const monthlyLabel =
    (plan.monthlyPriceLabel || '').trim() || `₹${plan.monthlyAmountInr}/month`;
  const monthlyOn = plan.monthlyEnabled !== false;
  const plusEnabled = plan.plusEnabled !== false;
  const premiumEnabled = plan.premiumEnabled !== false;
  const anyOffer = plusEnabled || premiumEnabled;

  const [billing, setBilling] = useState<'month' | 'year'>(() =>
    plan.monthlyEnabled !== false ? 'month' : 'year',
  );
  const [checkoutMode, setCheckoutMode] = useState<CheckoutMode>(() =>
    plan.plusEnabled !== false ? 'plus' : 'premium',
  );
  const play = usePlayBillingCheckout({
    enabled: PLAY_BILLING_READY,
    userId: session?.user?.id ?? null,
    onEntitlement: refreshPremiumStatus,
    onCheckoutGranted: () => {
      showAppInfo(t('premium.title'), t('premium.playSuccess'), '✅');
    },
    onFulfillError: (message, pending) => {
      if (pending) {
        showAppInfo(t('premium.title'), t('premium.playPending'), 'ℹ️');
        return;
      }
      if (/already linked/i.test(message)) {
        showAppInfo(t('premium.title'), t('premium.playTokenTaken'), '⚠️');
        return;
      }
      showAppInfo(t('premium.title'), t('premium.playGrantFailed'), '⚠️');
    },
  });

  // Plus is one tier at one price, like Premium; its feature list is fixed.
  const plusKeys = plusIncludedKeys(plan, config.features);
  const plusCount = plusKeys.length;
  const plusMonthTotal = plan.plusMonthlyAmountInr;
  const plusYearTotal = plan.plusAmountInr;
  const plusMonthCompareAt = strikeCompareAt(
    plusMonthTotal,
    plan.plusMonthlyCompareAtAmountInr,
  );
  const plusYearCompareAt = strikeCompareAt(plusYearTotal, plan.plusCompareAtAmountInr);
  const premiumMonthAmount = plan.monthlyAmountInr;
  const premiumYearAmount = plan.amountInr;
  const premiumMonthCompareAt = strikeCompareAt(
    premiumMonthAmount,
    plan.monthlyCompareAtAmountInr,
  );
  const premiumYearCompareAt = strikeCompareAt(premiumYearAmount, plan.compareAtAmountInr);

  useEffect(() => {
    if (!monthlyOn && billing === 'month') setBilling('year');
  }, [monthlyOn, billing]);

  const planColCount = 1 + (plusEnabled ? 1 : 0) + (premiumEnabled ? 1 : 0);
  const colWidths = useMemo(() => {
    if (planColCount >= 3) return { feature: '38%' as const, plan: '20.66%' as const };
    if (planColCount === 2) return { feature: '46%' as const, plan: '27%' as const };
    return { feature: '58%' as const, plan: '42%' as const };
  }, [planColCount]);

  useEffect(() => {
    if (checkoutMode === 'plus' && !plusEnabled && premiumEnabled) {
      setCheckoutMode('premium');
    } else if (checkoutMode === 'premium' && !premiumEnabled && plusEnabled) {
      setCheckoutMode('plus');
    }
  }, [checkoutMode, plusEnabled, premiumEnabled]);

  useFocusEffect(
    useCallback(() => {
      void refreshSharedPremiumPlan();
      void refreshPremiumStatus();
    }, [refreshSharedPremiumPlan, refreshPremiumStatus]),
  );

  const trackingRows = useMemo(() => {
    const flags = config.features;
    const rows = [
      {
        id: 'localStorage',
        label: t('premium.featLocalStorage'),
        desc: t('premium.descLocalStorage'),
        free: 'unlimited' as Cell,
        premium: 'unlimited' as Cell,
        live: true,
      },
      {
        id: 'ads',
        label: t('premium.featAds'),
        desc: t('premium.descAds'),
        free: 'yes' as Cell,
        premium: 'no' as Cell,
        live: true,
      },
      {
        id: 'txns',
        label: t('premium.featTxns'),
        desc: t('premium.descTxns'),
        free: 'unlimited' as Cell,
        premium: 'unlimited' as Cell,
        live: flags.finance !== false,
      },
      {
        id: 'reminders',
        label: t('premium.featReminders'),
        desc: t('premium.descReminders'),
        free: 'unlimited' as Cell,
        premium: 'unlimited' as Cell,
        live: flags.reminders !== false,
      },
      {
        id: 'accounts',
        label: t('premium.featAccounts'),
        desc: t('premium.descAccounts'),
        free: 'unlimited' as Cell,
        premium: 'unlimited' as Cell,
        live: flags.finance !== false && flags.financeAccounts !== false,
      },
      {
        id: 'cards',
        label: t('premium.featCards'),
        desc: t('premium.descCards'),
        free: 'yes' as Cell,
        premium: 'yes' as Cell,
        live: flags.finance !== false && flags.financeAccounts !== false,
      },
      {
        id: 'categories',
        label: t('premium.featCategories'),
        desc: t('premium.descCategories'),
        free: 'unlimited' as Cell,
        premium: 'unlimited' as Cell,
        live: flags.finance !== false,
      },
      {
        id: 'budgets',
        label: t('premium.featBudgets'),
        desc: t('premium.descBudgets'),
        free: 'yes' as Cell,
        premium: 'yes' as Cell,
        // financeReports is the flag behind the Budget tab, despite the name.
        live: flags.finance !== false && flags.financeReports !== false,
      },
      {
        id: 'charts',
        label: t('premium.featCharts'),
        desc: t('premium.descCharts'),
        free: 'yes' as Cell,
        premium: 'yes' as Cell,
        live: flags.finance !== false && flags.financeCharts !== false,
      },
      {
        id: 'calendar',
        label: t('premium.featCalendar'),
        desc: t('premium.descCalendar'),
        free: 'yes' as Cell,
        premium: 'yes' as Cell,
        live: flags.finance !== false,
      },
      {
        id: 'import',
        label: t('premium.featImport'),
        desc: t('premium.descImport'),
        free: 'unlimited' as Cell,
        premium: 'unlimited' as Cell,
        live: flags.finance !== false && flags.smsImport !== false,
      },
      {
        id: 'books',
        label: t('premium.featBooks'),
        desc: t('premium.descBooks'),
        free: 'unlimited' as Cell,
        premium: 'unlimited' as Cell,
        live: flags.finance !== false,
      },
      {
        id: 'bills',
        label: t('premium.featBills'),
        desc: t('premium.descBills'),
        free: 'yes' as Cell,
        premium: 'yes' as Cell,
        live: flags.finance !== false,
      },
      {
        id: 'search',
        label: t('premium.featSearch'),
        desc: t('premium.descSearch'),
        free: 'yes' as Cell,
        premium: 'yes' as Cell,
        live: flags.finance !== false,
      },
      {
        id: 'shopping',
        label: t('premium.featShopping'),
        desc: t('premium.descShopping'),
        free: 'unlimited' as Cell,
        premium: 'unlimited' as Cell,
        live: flags.shoppingList !== false,
      },
      {
        id: 'currency',
        label: t('premium.featCurrency'),
        desc: t('premium.descCurrency'),
        free: 'yes' as Cell,
        premium: 'yes' as Cell,
        live: true,
      },
      {
        id: 'languages',
        label: t('premium.featLanguages'),
        desc: t('premium.descLanguages'),
        free: 'yes' as Cell,
        premium: 'yes' as Cell,
        live: true,
      },
      {
        id: 'diamonds',
        label: t('premium.featDiamonds'),
        desc: t('premium.descDiamonds'),
        free: 'yes' as Cell,
        premium: 'yes' as Cell,
        live: true,
      },
      {
        id: 'invite',
        label: t('premium.featInvite'),
        desc: t('premium.descInvite'),
        free: 'yes' as Cell,
        premium: 'yes' as Cell,
        live: true,
      },
    ] as const;
    return rows.filter((row) => row.live);
  }, [t, config.features]);

  const plusRows = useMemo(() => {
    return PLUS_FEATURE_ORDER.filter((key) => isPremiumFeatureLive(key, config.features)).map(
      (key) => {
        const isGloballyFree = config.premiumFeatures[key] === 'free';
        const freeCell: Cell =
          key === 'themes' || key === 'avatars'
            ? isGloballyFree
              ? 'unlimited'
              : 'limited'
            : isGloballyFree
              ? 'yes'
              : 'no';
        const premiumCell: Cell =
          key === 'themes' || key === 'avatars' ? 'unlimited' : 'yes';
        return {
          key,
          label: t(FEAT_LABEL[key]),
          desc: t(FEAT_DESC[key]),
          isGloballyFree,
          free: freeCell,
          premium: premiumCell,
          badge:
            key === 'themes' || key === 'cloud' || key === 'insights'
              ? ('popular' as const)
              : key === 'backup' || key === 'splitExpense'
                ? ('new' as const)
                : undefined,
        };
      },
    );
  }, [t, config.premiumFeatures, config.features]);

  const cellLabel = (cell: Cell) => {
    if (cell === 'unlimited') return t('premium.unlimited');
    if (cell === 'limited') return t('premium.limited');
    if (cell === 'yes') return '✓';
    if (cell === 'no') return '✕';
    return cell;
  };

  const cellTone = (cell: Cell) => {
    if (cell === 'unlimited' || cell === 'yes') {
      return { bg: theme.green + '22', fg: theme.green };
    }
    if (cell === 'limited') return { bg: theme.track, fg: theme.muted };
    if (cell === 'no') return { bg: theme.red + '14', fg: theme.red };
    return { bg: theme.track, fg: theme.ink };
  };

  const switchMode = (mode: CheckoutMode) => {
    if (mode === 'plus' && !plusEnabled) return;
    if (mode === 'premium' && !premiumEnabled) return;
    setCheckoutMode(mode);
  };

  const explainPlayBlock = () => {
    if (Platform.OS !== 'android') {
      showAppInfo(t('premium.title'), t('premium.playNeedAndroid'), 'ℹ️');
      return;
    }
    if (!isPlayBillingNativeAvailable()) {
      showAppInfo(t('premium.title'), t('premium.playNeedNative'), 'ℹ️');
      return;
    }
    if (play.status === 'missingProducts' || play.status === 'connecting') {
      showAppInfo(t('premium.title'), t('premium.playProductsMissing'), 'ℹ️');
      return;
    }
    showAppInfo(t('premium.title'), t('premium.playStoreOnly'), 'ℹ️');
  };

  const beginCheckout = (period: 'month' | 'year' = billing) => {
    if (play.busy) return;
    if (isAdmin || isPremiumMember) {
      showAppInfo(t('premium.title'), t('premium.alreadyActive'), '👑');
      return;
    }
    if (!anyOffer) {
      showAppInfo(t('premium.cartTitle'), t('premium.offerUnavailable'), 'ℹ️');
      return;
    }
    if (period === 'month' && !monthlyOn) {
      showAppInfo(t('premium.cartTitle'), t('premium.offerUnavailable'), 'ℹ️');
      return;
    }
    if (!PLAY_BILLING_READY) {
      showAppInfo(t('premium.title'), t('premium.playStoreOnly'), 'ℹ️');
      return;
    }
    if (isGuest) {
      setAuthMode('signup');
      setShowAuth(true);
      return;
    }
    if (!requireAuthToSave('request Premium')) return;
    if (checkoutMode === 'plus' && plusCount === 0) {
      showAppInfo(t('premium.cartTitle'), t('premium.plusNeedOne'), '🛒');
      return;
    }
    if (!play.native || play.status !== 'ready') {
      explainPlayBlock();
      return;
    }
    setBilling(period);
    void (async () => {
      const result = await play.subscribe(checkoutMode, period);
      if (result.ok) {
        if (result.restored) {
          showAppInfo(t('premium.title'), t('premium.playRestored'), '✅');
        }
        return;
      }
      if (result.reason === 'cancelled') return;
      if (result.reason === 'signedOut') {
        setAuthMode('signup');
        setShowAuth(true);
        return;
      }
      if (result.reason === 'missingProducts' || result.reason === 'unavailable') {
        explainPlayBlock();
        return;
      }
      if (result.reason === 'restoreNone') {
        showAppInfo(t('premium.title'), t('premium.playRestoreNone'), 'ℹ️');
        return;
      }
      showAppInfo(
        t('premium.title'),
        t('premium.playPurchaseFailed').replace('{detail}', result.detail || t('premium.playGrantFailed')),
        '⚠️',
      );
    })();
  };

  const restorePurchases = () => {
    if (play.busy) return;
    if (isGuest) {
      setAuthMode('login');
      setShowAuth(true);
      return;
    }
    if (!requireAuthToSave('restore Premium')) return;
    if (!play.native) {
      explainPlayBlock();
      return;
    }
    void (async () => {
      const result = await play.restore();
      if (result.ok) {
        showAppInfo(t('premium.title'), t('premium.playRestored'), '✅');
        return;
      }
      showAppInfo(t('premium.title'), t('premium.playRestoreNone'), 'ℹ️');
    })();
  };

  const renderStatus = (cell: Cell) => {
    const tone = cellTone(cell);
    return (
      <View style={[styles.pill, { backgroundColor: tone.bg }]}>
        <Text style={[styles.pillText, { color: tone.fg }]}>{cellLabel(cell)}</Text>
      </View>
    );
  };

  const dockBottom = 10;

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: 240 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.intro, { color: theme.muted }]}>
            {isAdmin
              ? t('premium.introAdmin')
              : isPremiumMember
                ? t('premium.introMember')
                : !anyOffer
                  ? t('premium.offerUnavailable')
                  : t('premium.cartIntro')
                      .replace('{addonMo}', String(plusMonthTotal))
                      .replace('{addonYr}', String(plusYearTotal))
                      .replace('{premMo}', monthlyLabel)
                      .replace('{premYr}', yearlyLabel)}
          </Text>

          {monthlyOn && anyOffer ? (
            <View style={[styles.billingToggle, { backgroundColor: theme.track }]}>
              {(
                [
                  ['month', t('premium.planMonth')],
                  ['year', t('premium.planYear')],
                ] as const
              ).map(([id, label]) => {
                const on = billing === id;
                return (
                  <Pressable
                    key={id}
                    onPress={() => setBilling(id)}
                    style={[
                      styles.billingBtn,
                      on && { backgroundColor: theme.card, shadowOpacity: 0.08 },
                    ]}
                  >
                    <Text
                      style={{
                        color: on ? theme.header : theme.muted,
                        fontWeight: '800',
                        fontSize: 13,
                      }}
                    >
                      {label}
                      {id === 'year' ? (
                        <Text style={{ color: theme.green, fontSize: 10 }}>
                          {' '}
                          {t('premium.saveBadge')}
                        </Text>
                      ) : null}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <View style={[styles.table, { backgroundColor: theme.card, borderColor: theme.line }]}>
            <View style={[styles.tableHead, { backgroundColor: theme.bg, borderBottomColor: theme.line }]}>
              <View style={[styles.colFeature, { width: colWidths.feature }]}>
                <Text style={[styles.headText, { color: theme.muted }]}>
                  {t('premium.colFeature')}
                </Text>
              </View>
              <View style={[styles.colPlan, { width: colWidths.plan }]}>
                <Text style={[styles.headText, { color: theme.muted, textAlign: 'center' }]}>
                  {t('premium.colFree')}
                </Text>
              </View>
              {plusEnabled ? (
                <View style={[styles.colPlan, { width: colWidths.plan }]}>
                  <Text style={[styles.headText, { color: theme.header, textAlign: 'center' }]}>
                    {t('premium.colPlus')}
                  </Text>
                </View>
              ) : null}
              {premiumEnabled ? (
                <View style={[styles.colPlan, { width: colWidths.plan }]}>
                  <Text style={[styles.headText, { color: theme.header, textAlign: 'center' }]}>
                    {t('premium.colPremium')}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={[styles.sectionBar, { backgroundColor: theme.bg }]}>
              <Text style={[styles.sectionTitle, { color: theme.ink }]}>
                🎁 {t('premium.secTracking')}
              </Text>
              <Text style={[styles.sectionHint, { color: theme.muted }]}>
                {t('premium.secTrackingHint')}
              </Text>
            </View>
            {trackingRows.map((row) => (
              <View key={row.id} style={[styles.featureRow, { borderBottomColor: theme.line }]}>
                <View style={[styles.colFeature, { width: colWidths.feature }]}>
                  <Text style={[styles.featureLabel, { color: theme.ink }]}>{row.label}</Text>
                  <Text style={[styles.featureDesc, { color: theme.muted }]}>{row.desc}</Text>
                </View>
                <View style={[styles.colPlan, { width: colWidths.plan }]}>
                  {renderStatus(row.free)}
                </View>
                {plusEnabled ? (
                  <View style={[styles.colPlan, { width: colWidths.plan }]}>
                    {renderStatus(row.free)}
                  </View>
                ) : null}
                {premiumEnabled ? (
                  <View style={[styles.colPlan, { width: colWidths.plan }]}>
                    {renderStatus(row.premium)}
                  </View>
                ) : null}
              </View>
            ))}

            <View style={[styles.sectionBar, { backgroundColor: theme.bg }]}>
              <Text style={[styles.sectionTitle, { color: theme.ink }]}>
                ⭐ {t('premium.secPremium')}
              </Text>
            </View>
            {plusRows.map((row) => {
              const offeredInPlus = isPlusFeatureOffered(row.key, plan, config.features);
              return (
                <View key={row.key} style={[styles.featureRow, { borderBottomColor: theme.line }]}>
                  <View style={[styles.colFeature, { width: colWidths.feature }]}>
                    <View style={styles.featureLabelRow}>
                      <Text style={[styles.featureLabel, { color: theme.ink }]}>{row.label}</Text>
                      {row.badge === 'new' ? (
                        <Text style={[styles.badge, styles.badgeNew]}>{t('premium.badgeNew')}</Text>
                      ) : null}
                      {row.badge === 'popular' ? (
                        <Text style={[styles.badge, styles.badgePopular]}>
                          {t('premium.badgePopular')}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={[styles.featureDesc, { color: theme.muted }]}>{row.desc}</Text>
                  </View>
                  <View style={[styles.colPlan, { width: colWidths.plan }]}>
                    {renderStatus(row.free)}
                  </View>
                  {plusEnabled ? (
                    <View style={[styles.colPlan, { width: colWidths.plan }]}>
                      {row.isGloballyFree
                        ? renderStatus(row.premium)
                        : renderStatus(offeredInPlus ? row.premium : 'no')}
                    </View>
                  ) : null}
                  {premiumEnabled ? (
                    <View style={[styles.colPlan, { width: colWidths.plan }]}>
                      {renderStatus(row.premium)}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>

          {!isPremiumMember && !isAdmin ? (
            <>
              <Text style={[styles.howTitle, { color: theme.ink }]}>{t('premium.howTitle')}</Text>
              <Text style={[styles.howBody, { color: theme.muted }]}>{t('premium.howBody')}</Text>
            </>
          ) : null}
        </ScrollView>

        {!isPremiumMember && !isAdmin && anyOffer ? (
          <View style={[styles.ctaDock, { bottom: dockBottom }]}>
            <View style={[styles.footerCard, { backgroundColor: theme.ink }]}>
              {plusEnabled && premiumEnabled ? (
                <View style={styles.modeTabs}>
                  <Pressable
                    onPress={() => switchMode('plus')}
                    style={[
                      styles.modeTab,
                      checkoutMode === 'plus' && { backgroundColor: '#fff' },
                    ]}
                  >
                    <Text
                      style={{
                        color: checkoutMode === 'plus' ? theme.ink : 'rgba(255,255,255,0.7)',
                        fontWeight: '800',
                        fontSize: 12,
                        textAlign: 'center',
                      }}
                    >
                      {t('premium.tabPlus')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => switchMode('premium')}
                    style={[
                      styles.modeTab,
                      checkoutMode === 'premium' && { backgroundColor: '#fff' },
                    ]}
                  >
                    <Text
                      style={{
                        color: checkoutMode === 'premium' ? theme.ink : 'rgba(255,255,255,0.7)',
                        fontWeight: '800',
                        fontSize: 12,
                        textAlign: 'center',
                      }}
                    >
                      {t('premium.tabPremium')}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              <View>
                <Text style={styles.footerTitle}>
                  {checkoutMode === 'plus'
                    ? t('premium.plusTitle').replace('{count}', String(plusCount))
                    : t('premium.premiumTitle')}
                </Text>
                <Text style={styles.footerSub}>
                  {play.busy
                    ? t('premium.playPurchasing')
                    : checkoutMode === 'plus'
                      ? t('premium.plusSub').replace(
                          '{total}',
                          monthlyOn
                            ? `${play.displayPrice('plus', 'month') || `₹${plusMonthTotal}/mo`} · ${
                                play.displayPrice('plus', 'year') || `₹${plusYearTotal}/yr`
                              }`
                            : play.displayPrice('plus', 'year') || `₹${plusYearTotal}/yr`,
                        )
                      : monthlyOn
                        ? `${play.displayPrice('premium', 'month') || monthlyLabel} · ${
                            play.displayPrice('premium', 'year') || yearlyLabel
                          }`
                        : play.displayPrice('premium', 'year') || yearlyLabel}
                </Text>
              </View>

              <View style={styles.planBtnRow}>
                {monthlyOn ? (
                  <Pressable
                    onPress={() => beginCheckout('month')}
                    disabled={play.busy}
                    style={[
                      styles.planBtn,
                      {
                        backgroundColor: billing === 'month' ? theme.green : 'rgba(255,255,255,0.14)',
                        borderColor:
                          billing === 'month' ? theme.green : 'rgba(255,255,255,0.28)',
                        opacity: play.busy ? 0.7 : 1,
                      },
                    ]}
                  >
                    {play.busy && billing === 'month' ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Text style={styles.planBtnPeriod}>{t('premium.planMonth')}</Text>
                        <Text style={styles.planBtnAmount}>
                          {play.displayPrice(checkoutMode, 'month') ||
                            `₹${checkoutMode === 'plus' ? plusMonthTotal : premiumMonthAmount}`}
                        </Text>
                        {(checkoutMode === 'plus' ? plusMonthCompareAt : premiumMonthCompareAt) !=
                        null ? (
                          <Text style={styles.planBtnStrike}>
                            ₹{checkoutMode === 'plus' ? plusMonthCompareAt : premiumMonthCompareAt}
                          </Text>
                        ) : (
                          <Text style={styles.planBtnHint}>/ month</Text>
                        )}
                      </>
                    )}
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => beginCheckout('year')}
                  disabled={play.busy}
                  style={[
                    styles.planBtn,
                    {
                      backgroundColor: billing === 'year' ? theme.green : 'rgba(255,255,255,0.14)',
                      borderColor: billing === 'year' ? theme.green : 'rgba(255,255,255,0.28)',
                      flex: monthlyOn ? 1 : undefined,
                      opacity: play.busy ? 0.7 : 1,
                    },
                  ]}
                >
                  {play.busy && billing === 'year' ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Text style={styles.planBtnPeriod}>
                        {t('premium.planYear')}
                        {monthlyOn ? (
                          <Text style={{ color: billing === 'year' ? '#FFFFFF' : '#86efac' }}>
                            {' '}
                            · {t('premium.saveBadge')}
                          </Text>
                        ) : null}
                      </Text>
                      <Text style={styles.planBtnAmount}>
                        {play.displayPrice(checkoutMode, 'year') ||
                          `₹${checkoutMode === 'plus' ? plusYearTotal : premiumYearAmount}`}
                      </Text>
                      {(checkoutMode === 'plus' ? plusYearCompareAt : premiumYearCompareAt) !=
                      null ? (
                        <Text style={styles.planBtnStrike}>
                          ₹{checkoutMode === 'plus' ? plusYearCompareAt : premiumYearCompareAt}
                        </Text>
                      ) : (
                        <Text style={styles.planBtnHint}>
                          {checkoutMode === 'plus'
                            ? '/ year'
                            : `@ ₹${Math.max(1, Math.round(premiumYearAmount / 12))}/month`}
                        </Text>
                      )}
                    </>
                  )}
                </Pressable>
              </View>

              <Pressable onPress={restorePurchases} disabled={play.busy} hitSlop={8}>
                <Text style={styles.restoreText}>{t('premium.playRestore')}</Text>
              </Pressable>
            </View>
          </View>
        ) : isPremiumMember || isAdmin ? (
          <View style={[styles.ctaDock, { bottom: dockBottom }]}>
            <Pressable
              onPress={() => navigation.goBack()}
              style={[styles.alreadyBar, { backgroundColor: theme.green }]}
            >
              <Text style={styles.footerCtaText}>{t('premium.alreadyActive')}</Text>
            </Pressable>
            {PLAY_BILLING_READY && !isAdmin ? (
              <Pressable onPress={restorePurchases} disabled={play.busy} style={styles.restoreAfter}>
                <Text style={styles.restoreOnGreen}>{t('premium.playRestore')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    body: { padding: 16 },
    intro: { fontSize: 13, lineHeight: 19, marginBottom: 14 },
    billingToggle: {
      flexDirection: 'row',
      alignSelf: 'center',
      borderRadius: 20,
      padding: 4,
      gap: 4,
      marginBottom: 14,
    },
    billingBtn: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 16,
    },
    table: {
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
    },
    tableHead: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
    sectionBar: { paddingHorizontal: 12, paddingVertical: 8 },
    sectionTitle: { fontWeight: '800', fontSize: 13 },
    sectionHint: { fontSize: 11, fontWeight: '600', marginTop: 2 },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    colFeature: {
      flexGrow: 0,
      flexShrink: 0,
      paddingRight: 6,
    },
    colPlan: {
      flexGrow: 0,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 2,
    },
    featureLabelRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
    featureLabel: { fontWeight: '700', fontSize: 12 },
    featureDesc: { fontSize: 10, marginTop: 2, lineHeight: 13 },
    badge: {
      fontSize: 8,
      fontWeight: '800',
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: 4,
      overflow: 'hidden',
    },
    badgeNew: { backgroundColor: '#ecfdf5', color: '#059669' },
    badgePopular: { backgroundColor: '#fff7ed', color: '#c2410c' },
    pill: {
      borderRadius: 8,
      paddingHorizontal: 5,
      paddingVertical: 2,
      maxWidth: '100%',
    },
    pillText: { fontSize: 9, fontWeight: '700', textAlign: 'center' },
    included: { fontSize: 9, fontWeight: '700', textAlign: 'center' },
    addonStrike: {
      fontSize: 8,
      fontWeight: '600',
      textAlign: 'center',
      textDecorationLine: 'line-through',
    },
    howTitle: { fontWeight: '800', fontSize: 15, marginTop: 18, marginBottom: 6 },
    howBody: { fontSize: 13, lineHeight: 19, marginBottom: 12 },
    payCard: {
      marginTop: 14,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      padding: 14,
    },
    payTitle: { fontWeight: '800', fontSize: 16, marginBottom: 8 },
    payHint: { fontSize: 12, lineHeight: 18, marginBottom: 10 },
    upiBtn: {
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
      marginBottom: 12,
    },
    upiBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
    backPayBtn: {
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      marginBottom: 4,
    },
    inputLabel: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      marginBottom: 6,
    },
    input: {
      borderWidth: 1.5,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      marginBottom: 10,
    },
    noteInput: { minHeight: 70, textAlignVertical: 'top' },
    ctaDock: {
      position: 'absolute',
      left: 12,
      right: 12,
    },
    footerCard: {
      borderRadius: 14,
      padding: 12,
      gap: 10,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
    },
    modeTabs: {
      flexDirection: 'row',
      backgroundColor: 'rgba(255,255,255,0.12)',
      borderRadius: 8,
      padding: 3,
      gap: 3,
    },
    modeTab: {
      flex: 1,
      borderRadius: 6,
      paddingVertical: 7,
      paddingHorizontal: 4,
    },
    footerTitle: { color: '#fff', fontWeight: '800', fontSize: 13 },
    footerSub: { color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 2, marginBottom: 2 },
    planBtnRow: { flexDirection: 'row', gap: 8 },
    planBtn: {
      flex: 1,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderWidth: 1.5,
      alignItems: 'center',
    },
    planBtnPeriod: {
      color: 'rgba(255,255,255,0.8)',
      fontWeight: '700',
      fontSize: 10,
      textTransform: 'uppercase',
      marginBottom: 2,
    },
    planBtnAmount: { color: '#fff', fontWeight: '800', fontSize: 18, textAlign: 'center' },
    planBtnStrike: {
      color: 'rgba(255,255,255,0.55)',
      fontWeight: '600',
      fontSize: 12,
      textAlign: 'center',
      textDecorationLine: 'line-through',
      marginTop: 1,
    },
    planBtnHint: {
      color: 'rgba(255,255,255,0.55)',
      fontWeight: '600',
      fontSize: 10,
      textAlign: 'center',
      marginTop: 1,
    },
    footerCtaText: { color: '#fff', fontWeight: '800', fontSize: 12, textAlign: 'center' },
    alreadyBar: {
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    restoreText: {
      color: 'rgba(255,255,255,0.75)',
      fontWeight: '700',
      fontSize: 12,
      textAlign: 'center',
      paddingTop: 4,
    },
    restoreAfter: { marginTop: 8, alignItems: 'center', paddingVertical: 6 },
    restoreOnGreen: {
      color: theme.muted,
      fontWeight: '700',
      fontSize: 12,
      textAlign: 'center',
    },
  });
}
