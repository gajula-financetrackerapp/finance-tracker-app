import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  buildPremiumUpiUrl,
  isPlusFeatureOffered,
  plusAddonPrice,
  plusCartTotal,
  plusFeaturePrice,
} from '../lib/premiumCart';
import { isPremiumFeatureLive } from '../lib/premiumFeatures';
import type { PremiumFeatureKey, ThemeTokens } from '../types';

type Cell = 'unlimited' | 'limited' | 'yes' | 'no';
type CheckoutMode = 'plus' | 'premium';

const FEAT_LABEL: Record<PremiumFeatureKey, TranslationKey> = {
  themes: 'premium.featThemes',
  avatars: 'premium.featAvatars',
  cloud: 'premium.featCloud',
  backup: 'premium.featBackup',
  insights: 'premium.featInsights',
  feedback: 'premium.featFeedback',
  splitExpense: 'premium.featSplit',
};

const FEAT_DESC: Record<PremiumFeatureKey, TranslationKey> = {
  themes: 'premium.descThemes',
  avatars: 'premium.descAvatars',
  cloud: 'premium.descCloud',
  backup: 'premium.descBackup',
  insights: 'premium.descInsights',
  feedback: 'premium.descFeedback',
  splitExpense: 'premium.descSplit',
};

/**
 * Free | Plus (à la carte) | Premium comparison with sticky checkout.
 * Payment still uses UPI + email UTR → admin activates (same as before).
 */
export function PremiumCompareScreen() {
  const insets = useSafeAreaInsets();
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

  const [billing, setBilling] = useState<'month' | 'year'>('month');
  const [checkoutMode, setCheckoutMode] = useState<CheckoutMode>(() =>
    plan.plusEnabled !== false ? 'plus' : 'premium',
  );
  const [selected, setSelected] = useState<Set<PremiumFeatureKey>>(() => new Set());
  const [showPayForm, setShowPayForm] = useState(false);
  const [txnRef, setTxnRef] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const unitPrice = plusAddonPrice(billing, plan, config.features);
  const { count: plusCount, totalInr: plusTotal } = plusCartTotal(
    selected,
    billing,
    plan,
    config.features,
  );
  const premiumAmount = billing === 'month' ? plan.monthlyAmountInr : plan.amountInr;
  const premiumLabel = billing === 'month' ? monthlyLabel : yearlyLabel;
  const payAmount = checkoutMode === 'plus' ? plusTotal : premiumAmount;
  const payLabel =
    checkoutMode === 'plus'
      ? `₹${plusTotal}${billing === 'month' ? '/month' : '/year'}`
      : premiumLabel;

  const planColCount = 1 + (plusEnabled ? 1 : 0) + (premiumEnabled ? 1 : 0);
  const colWidths = useMemo(() => {
    if (planColCount >= 3) return { feature: '38%' as const, plan: '20.66%' as const };
    if (planColCount === 2) return { feature: '46%' as const, plan: '27%' as const };
    return { feature: '58%' as const, plan: '42%' as const };
  }, [planColCount]);

  useEffect(() => {
    if (checkoutMode === 'plus' && !plusEnabled && premiumEnabled) {
      setCheckoutMode('premium');
      setSelected(new Set());
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
        id: 'charts',
        label: t('premium.featCharts'),
        desc: t('premium.descCharts'),
        free: 'yes' as Cell,
        premium: 'yes' as Cell,
        live: flags.finance !== false && flags.financeCharts !== false,
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
              : key === 'backup' || key === 'feedback' || key === 'splitExpense'
                ? ('new' as const)
                : undefined,
        };
      },
    );
  }, [t, config.premiumFeatures, config.features]);

  // Drop cart selections for features the admin turned off.
  useEffect(() => {
    setSelected((prev) => {
      let changed = false;
      const next = new Set<PremiumFeatureKey>();
      for (const key of prev) {
        if (isPlusFeatureOffered(key, plan, config.features)) next.add(key);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [config.features, plan]);

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

  const togglePlus = (key: PremiumFeatureKey) => {
    if (!plusEnabled || !isPlusFeatureOffered(key, plan, config.features)) return;
    if (checkoutMode === 'premium') {
      setCheckoutMode('plus');
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const switchMode = (mode: CheckoutMode) => {
    if (mode === 'plus' && !plusEnabled) return;
    if (mode === 'premium' && !premiumEnabled) return;
    setCheckoutMode(mode);
    if (mode === 'premium') setSelected(new Set());
    setShowPayForm(false);
  };

  const beginCheckout = () => {
    if (isAdmin || isPremiumMember) {
      showAppInfo(t('premium.title'), t('premium.alreadyActive'), '👑');
      return;
    }
    if (!anyOffer) {
      showAppInfo(t('premium.cartTitle'), t('premium.offerUnavailable'), 'ℹ️');
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
    setShowPayForm(true);
  };

  const openUpi = async () => {
    const upi = (plan.upiId || '').trim();
    if (!upi) {
      showAppInfo(t('premium.payTitle'), t('premium.upiMissing'), 'ℹ️');
      return;
    }
    const selectedLabels = [...selected].map((k) => t(FEAT_LABEL[k])).join(', ');
    const tn =
      checkoutMode === 'plus'
        ? `${config.appName || 'Pulse Wallet'} Plus (${billing}): ${selectedLabels}`
        : `${config.appName || 'Pulse Wallet'} Premium (${billing === 'month' ? 'monthly' : 'yearly'})`;
    const url = buildPremiumUpiUrl({
      upiId: upi,
      payeeName: plan.payeeName || config.appName || 'Pulse Wallet',
      amountInr: payAmount,
      note: tn,
    });
    try {
      await Linking.openURL(url);
    } catch {
      showAppInfo(t('premium.payTitle'), t('premium.upiOpenFailed'), '⚠️');
    }
  };

  const sendRequest = async () => {
    if (!requireAuthToSave('request Premium')) return;
    const ref = txnRef.trim();
    if (ref.length < 4) {
      showAppInfo(t('premium.payTitle'), t('premium.refRequired'), '✍️');
      return;
    }
    const email = (config.feedback?.email || '').trim();
    if (!email.includes('@')) {
      showAppInfo(t('premium.payTitle'), t('feedback.notConfigured'), '⚠️');
      return;
    }

    setSending(true);
    const version =
      Constants.expoConfig?.version || Constants.nativeAppVersion || '1.0.0';
    const app = config.appName || 'Pulse Wallet';
    const account = session?.user?.email || 'unknown';
    const userId = session?.user?.id || 'unknown';
    const planKind = checkoutMode === 'plus' ? 'Custom Plus' : 'All-in-One Premium';
    const selectedLines =
      checkoutMode === 'plus'
        ? [...selected].map((k) => `- ${t(FEAT_LABEL[k])}`).join('\n')
        : '- All Premium extras';

    const subject = `${app} — ${planKind} activation (${billing === 'month' ? 'monthly' : 'yearly'})`;
    const body = [
      `${planKind} activation request`,
      '',
      `App: ${app}`,
      `Version: ${version}`,
      `Account email: ${account}`,
      `User id: ${userId}`,
      `Checkout mode: ${planKind}`,
      `Billing: ${billing === 'month' ? 'Monthly' : 'Yearly'}`,
      `Amount: ₹${payAmount}`,
      `Features:`,
      selectedLines,
      `Payment reference / UTR: ${ref}`,
      note.trim() ? `Note: ${note.trim()}` : null,
      '',
      checkoutMode === 'plus'
        ? 'Please verify payment. For now, activate full Premium (is_premium) for this user, or grant the listed extras when per-feature entitlements are available.'
        : 'Please verify payment and set is_premium = true for this user.',
      billing === 'month'
        ? 'Suggested duration: 1 month from payment date.'
        : 'Suggested duration: 12 months from payment date.',
    ]
      .filter(Boolean)
      .join('\n');

    const url = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        showAppInfo(t('premium.payTitle'), t('feedback.sendFailed'), '⚠️');
        return;
      }
      await Linking.openURL(url);
      setTxnRef('');
      setNote('');
      showAppInfo(t('premium.payTitle'), t('premium.requestSent'), '✅');
    } catch {
      showAppInfo(t('premium.payTitle'), t('feedback.sendFailed'), '⚠️');
    } finally {
      setSending(false);
    }
  };

  const renderStatus = (cell: Cell) => {
    const tone = cellTone(cell);
    return (
      <View style={[styles.pill, { backgroundColor: tone.bg }]}>
        <Text style={[styles.pillText, { color: tone.fg }]}>{cellLabel(cell)}</Text>
      </View>
    );
  };

  const dockBottom = Math.max(insets.bottom, 10);

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <ScrollView
          contentContainerStyle={[
            styles.body,
            { paddingBottom: (showPayForm ? 40 : 200) + insets.bottom },
          ]}
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
                      .replace('{addonMo}', String(unitPrice))
                      .replace(
                        '{addonYr}',
                        String(plusAddonPrice('year', plan, config.features)),
                      )
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
                📊 {t('premium.secTracking')}
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
              const featureUnit = plusFeaturePrice(row.key, billing, plan);
              const plusDisabled =
                !plusEnabled ||
                !offeredInPlus ||
                row.isGloballyFree ||
                checkoutMode === 'premium' ||
                isPremiumMember ||
                isAdmin;
              const on = selected.has(row.key);
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
                      {row.isGloballyFree ? (
                        <Text style={[styles.included, { color: theme.green }]}>
                          {t('premium.includedFree')}
                        </Text>
                      ) : !offeredInPlus ? (
                        <Text style={[styles.included, { color: theme.muted }]}>—</Text>
                      ) : (
                        <View style={styles.plusControls}>
                          <Switch
                            value={on}
                            disabled={plusDisabled}
                            onValueChange={() => togglePlus(row.key)}
                            trackColor={{ false: theme.line, true: theme.header }}
                            thumbColor="#fff"
                            style={styles.plusSwitch}
                          />
                          <Text style={[styles.addonPrice, { color: theme.muted }]} numberOfLines={1}>
                            ₹{featureUnit}
                            {billing === 'month' ? '/mo' : '/yr'}
                          </Text>
                        </View>
                      )}
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

          {showPayForm ? (
            <View style={[styles.payCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
              <Text style={[styles.payTitle, { color: theme.ink }]}>{t('premium.payTitle')}</Text>
              <Text style={[styles.payHint, { color: theme.muted }]}>
                {t('premium.payHint')
                  .replace('{price}', payLabel)
                  .replace('{email}', config.feedback?.email || '')}
              </Text>
              {checkoutMode === 'plus' ? (
                <Text style={[styles.payHint, { color: theme.ink, fontWeight: '700' }]}>
                  {t('premium.plusSelected')
                    .replace('{count}', String(plusCount))
                    .replace(
                      '{list}',
                      [...selected].map((k) => t(FEAT_LABEL[k])).join(', '),
                    )}
                </Text>
              ) : null}

              {plan.upiId ? (
                <Pressable
                  onPress={() => void openUpi()}
                  style={[styles.upiBtn, { backgroundColor: theme.header }]}
                >
                  <Text style={styles.upiBtnText}>
                    {t('premium.payUpi').replace('{amount}', `₹${payAmount}`)}
                  </Text>
                </Pressable>
              ) : null}

              <Text style={[styles.inputLabel, { color: theme.muted }]}>{t('premium.refLabel')}</Text>
              <TextInput
                value={txnRef}
                onChangeText={setTxnRef}
                placeholder={t('premium.refPlaceholder')}
                placeholderTextColor={theme.muted}
                autoCapitalize="characters"
                style={[
                  styles.input,
                  { color: theme.ink, borderColor: theme.line, backgroundColor: theme.bg },
                ]}
              />
              <Text style={[styles.inputLabel, { color: theme.muted }]}>{t('premium.noteLabel')}</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder={t('premium.notePlaceholder')}
                placeholderTextColor={theme.muted}
                multiline
                style={[
                  styles.input,
                  styles.noteInput,
                  { color: theme.ink, borderColor: theme.line, backgroundColor: theme.bg },
                ]}
              />
              <Pressable
                onPress={() => {
                  if (!sending) void sendRequest();
                }}
                style={[styles.upiBtn, { backgroundColor: theme.green, marginBottom: 8 }]}
              >
                <Text style={styles.upiBtnText}>
                  {sending ? t('common.saving') : t('premium.sendRequest')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  Keyboard.dismiss();
                  setShowPayForm(false);
                }}
                style={[styles.backPayBtn, { borderColor: theme.line }]}
              >
                <Text style={{ color: theme.ink, fontWeight: '700', textAlign: 'center' }}>
                  {t('common.cancel')}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>

        {!isPremiumMember && !isAdmin && anyOffer && !showPayForm ? (
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

              <View style={styles.footerRow}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.footerTitle}>
                    {checkoutMode === 'plus'
                      ? t('premium.plusTitle').replace('{count}', String(plusCount))
                      : t('premium.premiumTitle')}
                  </Text>
                  <Text style={styles.footerSub}>
                    {checkoutMode === 'plus'
                      ? t('premium.plusSub').replace(
                          '{total}',
                          `₹${plusTotal}${billing === 'month' ? '/mo' : '/yr'}`,
                        )
                      : t('premium.premiumSub')}
                  </Text>
                </View>
                <Pressable
                  onPress={() => beginCheckout()}
                  style={[styles.footerCta, { backgroundColor: theme.green }]}
                >
                  <Text style={styles.footerCtaText}>
                    {checkoutMode === 'plus'
                      ? t('premium.payPlus').replace('{amount}', `₹${plusTotal}`)
                      : t('premium.payPremium').replace('{amount}', `₹${premiumAmount}`)}
                  </Text>
                </Pressable>
              </View>
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
    plusControls: { alignItems: 'center', justifyContent: 'center', gap: 2 },
    plusSwitch: { transform: [{ scaleX: 0.72 }, { scaleY: 0.72 }] },
    addonPrice: { fontSize: 9, fontWeight: '600', textAlign: 'center' },
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
    footerRow: { flexDirection: 'row', alignItems: 'center' },
    footerTitle: { color: '#fff', fontWeight: '800', fontSize: 13 },
    footerSub: { color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 2 },
    footerCta: {
      borderRadius: 8,
      paddingVertical: 10,
      paddingHorizontal: 12,
      maxWidth: '48%',
    },
    footerCtaText: { color: '#fff', fontWeight: '800', fontSize: 12, textAlign: 'center' },
    alreadyBar: {
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
  });
}
