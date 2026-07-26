import React, { useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
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
import type { ThemeTokens } from '../types';

type Cell = 'unlimited' | 'limited' | 'yes' | 'no' | string;

type FeatureRow = {
  id: string;
  label: string;
  free: Cell;
  premium: Cell;
  badge?: 'new' | 'popular';
};

type Section = {
  id: string;
  title: string;
  rows: FeatureRow[];
};

/** Free vs Premium comparison + request-to-activate via feedback email. */
export function PremiumCompareScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { theme, config, isPremiumMember, refreshSharedPremiumPlan, refreshPremiumStatus } = useApp();
  const { isGuest, isAdmin, session, setShowAuth, setAuthMode } = useFinance();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const plan = config.premiumPlan;
  const yearlyLabel =
    (plan.priceLabel || '').trim() || `₹${plan.amountInr}/year`;
  const monthlyLabel =
    (plan.monthlyPriceLabel || '').trim() || `₹${plan.monthlyAmountInr}/month`;
  const monthlyOn = plan.monthlyEnabled !== false;
  const [billing, setBilling] = useState<'month' | 'year'>('year');
  const [showPayForm, setShowPayForm] = useState(false);
  const [txnRef, setTxnRef] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const activeLabel = billing === 'month' ? monthlyLabel : yearlyLabel;
  const activeAmount = billing === 'month' ? plan.monthlyAmountInr : plan.amountInr;

  useFocusEffect(
    useCallback(() => {
      void refreshSharedPremiumPlan();
      void refreshPremiumStatus();
    }, [refreshSharedPremiumPlan, refreshPremiumStatus]),
  );

  const sections = useMemo((): Section[] => {
    return [
      {
        id: 'tracking',
        title: t('premium.secTracking'),
        rows: [
          {
            id: 'txns',
            label: t('premium.featTxns'),
            free: 'unlimited',
            premium: 'unlimited',
          },
          {
            id: 'reminders',
            label: t('premium.featReminders'),
            free: 'unlimited',
            premium: 'unlimited',
          },
          {
            id: 'charts',
            label: t('premium.featCharts'),
            free: 'yes',
            premium: 'yes',
          },
        ],
      },
      {
        id: 'premium',
        title: t('premium.secPremium'),
        rows: [
          {
            id: 'themes',
            label: t('premium.featThemes'),
            free: config.premiumFeatures.themes === 'free' ? 'unlimited' : 'limited',
            premium: 'unlimited',
            badge: 'popular',
          },
          {
            id: 'avatars',
            label: t('premium.featAvatars'),
            free: config.premiumFeatures.avatars === 'free' ? 'unlimited' : 'limited',
            premium: 'unlimited',
          },
          {
            id: 'cloud',
            label: t('premium.featCloud'),
            free: config.premiumFeatures.cloud === 'free' ? 'yes' : 'no',
            premium: 'yes',
            badge: 'popular',
          },
          {
            id: 'backup',
            label: t('premium.featBackup'),
            free: config.premiumFeatures.backup === 'free' ? 'yes' : 'no',
            premium: 'yes',
            badge: 'new',
          },
        ],
      },
    ];
  }, [t, config.premiumFeatures]);

  const cellLabel = (cell: Cell) => {
    if (cell === 'unlimited') return t('premium.unlimited');
    if (cell === 'limited') return t('premium.limited');
    if (cell === 'yes') return '✓';
    if (cell === 'no') return '✕';
    return cell;
  };

  const cellStyle = (cell: Cell, premiumCol: boolean) => {
    if (cell === 'unlimited' || cell === 'yes') {
      return {
        bg: theme.green + (premiumCol ? '22' : '18'),
        fg: theme.green,
      };
    }
    if (cell === 'limited') {
      return { bg: theme.track, fg: theme.muted };
    }
    if (cell === 'no') {
      return { bg: theme.red + '14', fg: theme.red };
    }
    return { bg: theme.track, fg: theme.ink };
  };

  const openPayForm = (period: 'month' | 'year' = 'year') => {
    if (isAdmin || isPremiumMember) {
      showAppInfo(t('premium.title'), t('premium.alreadyActive'), '👑');
      return;
    }
    if (isGuest || !requireAuthToSave('request Premium')) return;
    setBilling(period);
    setShowPayForm(true);
  };

  const openUpi = async () => {
    const upi = (plan.upiId || '').trim();
    if (!upi) {
      showAppInfo(t('premium.payTitle'), t('premium.upiMissing'), 'ℹ️');
      return;
    }
    const amount = activeAmount;
    const pn = encodeURIComponent(plan.payeeName || config.appName || 'Pulse Wallet');
    const pa = encodeURIComponent(upi);
    const am = encodeURIComponent(String(amount));
    const tn = encodeURIComponent(
      `${config.appName || 'Pulse Wallet'} Premium (${billing === 'month' ? 'monthly' : 'yearly'})`,
    );
    const url = `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=INR&tn=${tn}`;
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
    const subject = `${app} — Premium activation request (${billing === 'month' ? 'monthly' : 'yearly'})`;
    const body = [
      'Premium activation request',
      '',
      `App: ${app}`,
      `Version: ${version}`,
      `Account email: ${account}`,
      `User id: ${userId}`,
      `Billing: ${billing === 'month' ? 'Monthly' : 'Yearly'}`,
      `Plan: ${activeLabel}`,
      `Amount: ₹${activeAmount}`,
      `Payment reference / UTR: ${ref}`,
      note.trim() ? `Note: ${note.trim()}` : null,
      '',
      'Please verify payment and set is_premium = true for this user.',
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
            { paddingBottom: (monthlyOn && !showPayForm ? 160 : 110) + insets.bottom },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.intro, { color: theme.muted }]}>
            {isAdmin
              ? t('premium.introAdmin')
              : isPremiumMember
                ? t('premium.introMember')
                : t('premium.intro')}
          </Text>

          <View style={[styles.table, { backgroundColor: theme.card, borderColor: theme.line }]}>
            <View style={[styles.tableHead, { borderBottomColor: theme.line }]}>
              <Text style={[styles.colFeature, styles.headText, { color: theme.muted }]}>
                {t('premium.colFeature')}
              </Text>
              <Text style={[styles.colPlan, styles.headText, { color: theme.muted }]}>
                {t('premium.colFree')}
              </Text>
              <Text style={[styles.colPlan, styles.headText, { color: theme.header }]}>
                {t('premium.colPremium')}
              </Text>
            </View>

            {sections.map((sec) => (
              <View key={sec.id}>
                <View style={[styles.sectionBar, { backgroundColor: theme.bg }]}>
                  <Text style={[styles.sectionTitle, { color: theme.ink }]}>{sec.title}</Text>
                </View>
                {sec.rows.map((row) => {
                  const freeTone = cellStyle(row.free, false);
                  const premTone = cellStyle(row.premium, true);
                  return (
                    <View
                      key={row.id}
                      style={[styles.featureRow, { borderBottomColor: theme.line }]}
                    >
                      <View style={styles.colFeature}>
                        <View style={styles.featureLabelRow}>
                          <Text style={[styles.featureLabel, { color: theme.ink }]}>
                            {row.label}
                          </Text>
                          {row.badge === 'new' ? (
                            <Text style={[styles.badge, styles.badgeNew]}>
                              {t('premium.badgeNew')}
                            </Text>
                          ) : null}
                          {row.badge === 'popular' ? (
                            <Text style={[styles.badge, styles.badgePopular]}>
                              {t('premium.badgePopular')}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                      <View style={styles.colPlan}>
                        <View style={[styles.pill, { backgroundColor: freeTone.bg }]}>
                          <Text style={[styles.pillText, { color: freeTone.fg }]}>
                            {cellLabel(row.free)}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.colPlan}>
                        <View style={[styles.pill, { backgroundColor: premTone.bg }]}>
                          <Text style={[styles.pillText, { color: premTone.fg }]}>
                            {cellLabel(row.premium)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
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
              {monthlyOn ? (
                <View style={styles.planRow}>
                  {(
                    [
                      ['month', t('premium.planMonth'), monthlyLabel],
                      ['year', t('premium.planYear'), yearlyLabel],
                    ] as const
                  ).map(([id, label, price]) => {
                    const on = billing === id;
                    return (
                      <Pressable
                        key={id}
                        onPress={() => setBilling(id)}
                        style={[
                          styles.planChip,
                          {
                            backgroundColor: on ? theme.header : theme.bg,
                            borderColor: on ? theme.header : theme.line,
                          },
                        ]}
                      >
                        <Text style={{ color: on ? '#fff' : theme.ink, fontWeight: '800', fontSize: 13 }}>
                          {label}
                        </Text>
                        <Text style={{ color: on ? 'rgba(255,255,255,0.9)' : theme.muted, fontSize: 11, fontWeight: '600', marginTop: 2 }}>
                          {price}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
              <Text style={[styles.payHint, { color: theme.muted }]}>
                {t('premium.payHint')
                  .replace('{price}', activeLabel)
                  .replace('{email}', config.feedback?.email || '')}
              </Text>

              {plan.upiId ? (
                <Pressable
                  onPress={() => void openUpi()}
                  style={[styles.upiBtn, { backgroundColor: theme.header }]}
                >
                  <Text style={styles.upiBtnText}>
                    {t('premium.payUpi').replace('{amount}', `₹${activeAmount}`)}
                  </Text>
                </Pressable>
              ) : null}

              <Text style={[styles.inputLabel, { color: theme.muted }]}>
                {t('premium.refLabel')}
              </Text>
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

              <Text style={[styles.inputLabel, { color: theme.muted }]}>
                {t('premium.noteLabel')}
              </Text>
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
            </View>
          ) : null}
        </ScrollView>

        {!isPremiumMember && !isAdmin ? (
          <View style={[styles.ctaDock, { bottom: Math.max(insets.bottom, 10) }]}>
            {showPayForm ? (
              <View style={[styles.ctaBar, { backgroundColor: theme.header }]}>
                <Pressable
                  onPress={() => {
                    if (!sending) void sendRequest();
                  }}
                  style={styles.ctaBtn}
                >
                  <Text style={styles.ctaText}>
                    {sending ? t('common.saving') : t('premium.sendRequest')}
                  </Text>
                  <Text style={styles.ctaChevron}>›</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.ctaStack}>
                {monthlyOn ? (
                  <View style={[styles.ctaBar, { backgroundColor: theme.header }]}>
                    <Pressable
                      onPress={() => {
                        if (isGuest) {
                          setAuthMode('signup');
                          setShowAuth(true);
                          return;
                        }
                        openPayForm('month');
                      }}
                      style={styles.ctaBtn}
                    >
                      <Text style={styles.ctaText}>
                        {t('premium.ctaMonth').replace('{price}', monthlyLabel)}
                      </Text>
                      <Text style={styles.ctaChevron}>›</Text>
                    </Pressable>
                  </View>
                ) : null}
                <View
                  style={[
                    styles.ctaBar,
                    { backgroundColor: monthlyOn ? theme.primaryDark : theme.header },
                  ]}
                >
                  <Pressable
                    onPress={() => {
                      if (isGuest) {
                        setAuthMode('signup');
                        setShowAuth(true);
                        return;
                      }
                      openPayForm('year');
                    }}
                    style={styles.ctaBtn}
                  >
                    <Text style={styles.ctaText}>
                      {monthlyOn
                        ? t('premium.ctaYear').replace('{price}', yearlyLabel)
                        : t('premium.cta').replace('{price}', yearlyLabel)}
                    </Text>
                    <Text style={styles.ctaChevron}>›</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        ) : (
          <View style={[styles.ctaDock, { bottom: Math.max(insets.bottom, 10) }]}>
            <View style={[styles.ctaBar, { backgroundColor: theme.green }]}>
              <Pressable onPress={() => navigation.goBack()} style={styles.ctaBtn}>
                <Text style={styles.ctaText}>{t('premium.alreadyActive')}</Text>
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    body: { padding: 16 },
    intro: { fontSize: 14, lineHeight: 20, marginBottom: 14, fontWeight: '600' },
    table: {
      borderRadius: 16,
      borderWidth: 1,
      overflow: 'hidden',
      marginBottom: 18,
    },
    tableHead: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headText: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
    sectionBar: { paddingHorizontal: 12, paddingVertical: 8 },
    sectionTitle: { fontSize: 13, fontWeight: '800' },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      gap: 4,
    },
    colFeature: { flex: 1.35, minWidth: 0 },
    colPlan: { flex: 0.85, alignItems: 'center' },
    featureLabelRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
    featureLabel: { fontSize: 13, fontWeight: '700' },
    badge: {
      fontSize: 9,
      fontWeight: '900',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      overflow: 'hidden',
    },
    badgeNew: { backgroundColor: '#F5B700', color: '#1A1A1A' },
    badgePopular: { backgroundColor: '#FF8A3D', color: '#fff' },
    pill: {
      minWidth: 72,
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 999,
      alignItems: 'center',
    },
    pillText: { fontSize: 11, fontWeight: '800' },
    howTitle: { fontSize: 16, fontWeight: '800', marginBottom: 6 },
    howBody: { fontSize: 13, lineHeight: 19, fontWeight: '600', marginBottom: 16 },
    payCard: {
      borderRadius: 16,
      borderWidth: 1,
      padding: 16,
      marginBottom: 12,
    },
    payTitle: { fontSize: 17, fontWeight: '800', marginBottom: 6 },
    planRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    planChip: {
      flex: 1,
      borderRadius: 12,
      borderWidth: 1.5,
      paddingVertical: 10,
      paddingHorizontal: 10,
      alignItems: 'center',
    },
    payHint: { fontSize: 13, lineHeight: 19, fontWeight: '600', marginBottom: 12 },
    upiBtn: {
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      marginBottom: 14,
    },
    upiBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
    inputLabel: {
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
      marginBottom: 6,
    },
    input: {
      borderWidth: 1.5,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 11,
      fontSize: 15,
      fontWeight: '600',
      marginBottom: 12,
    },
    noteInput: { minHeight: 72, textAlignVertical: 'top' },
    ctaDock: {
      position: 'absolute',
      left: 12,
      right: 12,
    },
    ctaStack: { gap: 8 },
    ctaBar: {
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    ctaBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    ctaText: { color: '#fff', fontWeight: '800', fontSize: 15, textAlign: 'center' },
    ctaChevron: { color: '#fff', fontWeight: '900', fontSize: 20 },
  });
}
