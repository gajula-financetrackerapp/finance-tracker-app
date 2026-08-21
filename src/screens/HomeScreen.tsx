import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFinance } from '../FinanceContext';
import { useApp } from '../context/AppContext';
import { requireAuthToSave } from '../authGate';
import { showAppDialog, showAppInfo } from '../appDialog';
import { hasAskedSmsImportPrompt, markSmsImportPromptAsked } from '../lib/smsImportPrompt';
import { isSmsInboxSupported } from '../lib/smsInbox';
import { buildInviteMessage } from '../lib/referrals';
import {
  GROCERY_CATEGORIES,
  getGroceryItemScope,
  isGroceryFamilyCat,
} from '../constants';
import { fmt } from '../theme';
import { resolveDefaultAccountId, resolvePaidWithAccountId, sortAccountsForDisplay, accountChipLabel, bankAccountId, cardAccountId, isCoreCardAccount, bankSideTotals, cardSideTotals, CARD_BILL_CATEGORY } from '../cashBooks';
import type { GroceryReminder, GroceryTxnItem, Transaction, ThemeTokens } from '../types';
import { currencySymbol, monthKey, todayStr, uid } from '../utils';
import { promptBillImage } from '../utils/billImage';
import { withAlpha } from '../utils/buildTheme';
import { BillImageEditor } from '../components/BillImageEditor';
import { GuestBanner } from '../components/Shared';
import { BottomSheet } from '../components/BottomSheet';
import { DropdownSelect } from '../components/DropdownSelect';
import { DateField } from '../components/DateField';
import { PremiumHeaderFill } from '../components/PremiumChrome';
import { ProfileAdBanner } from '../components/ProfileAdBanner';
import { GoogleAdBanner } from '../components/GoogleAdBanner';
import { GoogleNativeAdCard } from '../components/GoogleNativeAdCard';
import { ReportIssueSheet, RequestFeatureSheet } from '../components/FeedbackSheets';
import { InfoDot, type InfoSum } from '../components/StatInfo';
import { groupCategoriesByPurpose } from '../categories/groups';
import { shouldShowGoogleAds } from '../lib/googleAds';
import { useT } from '../i18n/useT';
import type { TranslationKey } from '../i18n/translations';
import { RootStackParamList } from '../navigation/types';
import {
  listUpiAppsForPicker,
  openUpiApp,
  type UpiAppOption,
} from '../lib/upiPay';

export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { setCurrentMonth, isAdmin, isGuest, session } = useFinance();
  const {
    finance,
    config,
    theme,
    isAdFreeMember,
    isPremiumMember,
    diamonds,
    referrals,
    refreshReferrals,
  } = useApp();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const homePrefs = config.homePrefs;
  const [adDismissed, setAdDismissed] = useState(false);
  const [feedbackSheet, setFeedbackSheet] = useState<'issue' | 'feature' | null>(null);
  const smsPromptShown = useRef(false);

  useFocusEffect(
    useCallback(() => {
      setCurrentMonth(monthKey());
      void refreshReferrals();
    }, [setCurrentMonth, refreshReferrals]),
  );

  const adProgressPct = useMemo(() => {
    const cap = diamonds.dailyAdCap || 0;
    if (cap <= 0) return 0;
    return Math.min(100, Math.round((diamonds.earnedToday / cap) * 100));
  }, [diamonds.earnedToday, diamonds.dailyAdCap]);


  const currentMonth = monthKey();

  const monthSummary = useMemo(
    () =>
      bankSideTotals(finance.accounts, finance.transactions, (txn) =>
        txn.date.startsWith(currentMonth),
      ),
    [finance.transactions, finance.accounts, currentMonth],
  );

  const cardSummary = useMemo(
    () =>
      cardSideTotals(finance.accounts, finance.transactions, (txn) =>
        txn.date.startsWith(currentMonth),
      ),
    [finance.accounts, finance.transactions, currentMonth],
  );

  const goStack = useCallback(
    (screen: keyof RootStackParamList, params?: object) => {
      const parent = navigation.getParent() ?? navigation;
      // @ts-expect-error dynamic stack navigate
      parent.navigate(screen, params);
    },
    [navigation],
  );

  const inviteFriends = useCallback(() => {
    if (isGuest) {
      goStack('Diamonds');
      return;
    }
    void (async () => {
      try {
        await Share.share({
          message: buildInviteMessage(config.appName, referrals),
          title: t('home.rewardsReferral'),
        });
      } catch {
        showAppInfo(t('home.rewardsInvite'), t('home.rewardsShareFailed'), '📤');
      }
    })();
  }, [config.appName, referrals, isGuest, goStack, t]);

  // One-time after sign-in: ask to scan SMS (Android). Confirm-before-save stays on Import.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (isGuest || !session?.user?.id) return;
    if (config.features.smsImport === false || config.features.finance === false) return;
    if (!isSmsInboxSupported()) return;
    if (smsPromptShown.current) return;

    const userId = session.user.id;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const asked = await hasAskedSmsImportPrompt(userId);
        if (cancelled || asked) return;
        smsPromptShown.current = true;
        await markSmsImportPromptAsked(userId);
        if (cancelled) return;
        showAppDialog({
          title: t('import.promptTitle'),
          message: t('import.promptBody'),
          icon: '📥',
          buttons: [
            { text: t('import.promptLater'), style: 'cancel' },
            {
              text: t('import.promptScan'),
              onPress: () => goStack('ImportTransactions'),
            },
          ],
        });
      })();
    }, 900);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    isGuest,
    session?.user?.id,
    config.features.smsImport,
    config.features.finance,
    goStack,
    t,
  ]);

  const openTxnList = (kind: 'expense' | 'income') => {
    goStack('TxnList', { kind });
  };

  const showPromoBanner =
    config.adBanner?.enabled !== false &&
    (config.adBanner?.items?.length || 0) > 0 &&
    !adDismissed &&
    !(config.adBanner?.hideForPremium && (isAdFreeMember || isAdmin));

  const showHomeAdMob = shouldShowGoogleAds({
    config: config.googleAds,
    isAdFreeMember,
    format: 'banner',
  });

  const showHomeNativeAd = shouldShowGoogleAds({
    config: config.googleAds,
    isAdFreeMember,
    format: 'native',
  });

  /** Summary tiles are read at a glance, so drop the paisa and show whole units. */
  const fmtWhole = (amount: number) => fmt(Math.round(amount), config.currency);

  /**
   * The bank expense figure written out, and then the whole month's outgo: what
   * left the bank, cards included, plus what the cards are still holding.
   */
  const expenseSums = useMemo<InfoSum[]>(() => {
    const ownSpending = Math.max(0, monthSummary.expenses - monthSummary.cardBills);
    return [
      {
        rows: [
          { value: fmtWhole(ownSpending), label: t('home.sumSpentFromBank') },
          { op: '+', value: fmtWhole(monthSummary.cardBills), label: t('home.sumCardBillsPaid') },
        ],
        totalValue: fmtWhole(monthSummary.expenses),
        totalLabel: t('home.sumBankExpensesShown'),
        note: monthSummary.cardBills > 0 ? t('home.sumBankExpensesNote') : undefined,
      },
      {
        rows: [
          { value: fmtWhole(monthSummary.expenses), label: t('home.sumBankExpensesShown') },
          { op: '+', value: fmtWhole(cardSummary.expenses), label: t('home.sumSpentOnCards') },
        ],
        totalValue: fmtWhole(monthSummary.expenses + cardSummary.expenses),
        totalLabel: t('home.sumEverythingSpent'),
        note: monthSummary.cardBills > 0 ? t('home.sumEverythingSpentNote') : undefined,
      },
    ];
    // fmtWhole and t follow the currency and language already in the deps.
  }, [monthSummary, cardSummary.expenses, config.currency, t]);

  /** The balance, which is only ever the two figures beside it, subtracted. */
  const balanceSums = useMemo<InfoSum[]>(
    () => [
      {
        rows: [
          { value: fmtWhole(monthSummary.income), label: t('home.sumArrivedInBank') },
          { op: '−', value: fmtWhole(monthSummary.expenses), label: t('home.sumLeftBank') },
        ],
        totalValue: fmtWhole(monthSummary.balance),
        totalLabel: t('home.sumBalanceShown'),
        note: monthSummary.cardBills > 0 ? t('home.sumBalanceNote') : undefined,
      },
    ],
    [monthSummary, config.currency, t],
  );

  const shortcuts = [
    {
      key: 'txns',
      icon: '📋',
      tint: theme.primary,
      title: t('home.hubTransactions'),
      subtitle: t('home.hubTransactionsSub'),
      onPress: () => openTxnList(homePrefs.defaultTab === 'income' ? 'income' : 'expense'),
      live: config.features.finance !== false,
    },
    {
      key: 'accounts',
      icon: '🏦',
      tint: theme.green,
      title: t('accounts.title'),
      subtitle: t('home.hubAccountsSub'),
      onPress: () => goStack('Accounts'),
      live: config.features.financeAccounts !== false && config.features.finance !== false,
    },
    {
      key: 'import',
      icon: '📥',
      tint: theme.header,
      title: t('home.hubImport'),
      subtitle: t('home.hubImportSub'),
      onPress: () => goStack('ImportTransactions'),
      live: config.features.smsImport !== false && config.features.finance !== false,
    },
  ].filter((item) => item.live);

  return (
    <View style={styles.root}>
      <GuestBanner />

      <View style={styles.summaryBand}>
        <PremiumHeaderFill />
        {homePrefs.showSummary ? (
          <>
            <View style={styles.statsRow}>
              <Pressable style={styles.statTab} onPress={() => openTxnList('expense')}>
                <View style={styles.statLabelRow}>
                  <Text
                    style={styles.statLabel}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {t('home.expenses')}
                    <Text style={styles.statPeriodInline}> · {t('home.thisMonth')}</Text>
                  </Text>
                  <InfoDot
                    tone="onDark"
                    icon="🏦"
                    title={t('home.bankExpensesInfoTitle')}
                    sums={expenseSums}
                    body={[
                      t('home.bankExpensesInfoBody1'),
                      t('home.bankExpensesInfoBody2'),
                      t('home.bankExpensesInfoBody3'),
                      t('home.bankExpensesInfoBody4'),
                      t('home.bankExpensesInfoBody5'),
                    ]}
                  />
                </View>
                <View style={styles.statSubRow}>
                  <Text style={styles.statSubLabel}>{t('home.bank')}</Text>
                  <Text
                    style={styles.statSubValue}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {fmtWhole(monthSummary.expenses)}
                  </Text>
                </View>
              </Pressable>

              <Pressable style={styles.statTab} onPress={() => openTxnList('income')}>
                <View style={styles.statLabelRow}>
                  <Text
                    style={styles.statLabel}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {t('home.income')}
                    <Text style={styles.statPeriodInline}> · {t('home.thisMonth')}</Text>
                  </Text>
                  <InfoDot
                    tone="onDark"
                    icon="💰"
                    title={t('home.bankIncomeInfoTitle')}
                    body={[
                      t('home.bankIncomeInfoBody1'),
                      t('home.bankIncomeInfoBody2'),
                      t('home.bankIncomeInfoBody3'),
                    ]}
                  />
                </View>
                <View style={styles.statSubRow}>
                  <Text style={styles.statSubLabel}>{t('home.bank')}</Text>
                  <Text
                    style={styles.statSubValue}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {fmtWhole(monthSummary.income)}
                  </Text>
                </View>
              </Pressable>

              <View style={styles.statBalance}>
                <View style={styles.statLabelRow}>
                  <Text
                    style={styles.statLabel}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {t('home.balance')}
                    <Text style={styles.statPeriodInline}> · {t('home.thisMonth')}</Text>
                  </Text>
                  <InfoDot
                    tone="onDark"
                    icon="⚖️"
                    title={t('home.bankBalanceInfoTitle')}
                    sums={balanceSums}
                    body={[
                      t('home.bankBalanceInfoBody1'),
                      t('home.bankBalanceInfoBody2'),
                      t('home.bankBalanceInfoBody3'),
                    ]}
                  />
                </View>
                <View style={styles.statSubRow}>
                  <Text style={styles.statSubLabel}>{t('home.bank')}</Text>
                  <Text
                    style={styles.statSubValue}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {fmtWhole(monthSummary.balance)}
                  </Text>
                </View>
              </View>
            </View>

            {/* The card's own row: what it was charged on the left, what was paid
                towards it on the right, and the card named in between. */}
            {cardSummary.count > 0 ? (
              <View style={styles.cardStatsRow}>
                <View style={styles.cardStat}>
                  <View style={styles.cardStatLabelRow}>
                    <Text style={styles.cardStatLabel} numberOfLines={1}>
                      {t('home.expenses')}
                    </Text>
                    <InfoDot
                      tone="onDark"
                      icon="💳"
                      title={t('home.cardExpensesInfoTitle')}
                      body={[t('home.cardExpensesInfoBody1'), t('home.cardExpensesInfoBody2')]}
                    />
                  </View>
                  <Text
                    style={styles.cardStatValue}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {fmtWhole(cardSummary.expenses)}
                  </Text>
                </View>
                {/* Rules on both sides so a long amount can't run into the name. */}
                <View style={styles.cardStatRule} />
                <View style={styles.cardStatMid}>
                  <Text
                    style={styles.cardStatTitle}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                  >
                    {t('home.card')}
                  </Text>
                  <Text
                    style={styles.cardStatPeriod}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                  >
                    {t('home.thisMonth')}
                  </Text>
                </View>
                <View style={styles.cardStatRule} />
                <View style={[styles.cardStat, styles.cardStatRight]}>
                  <View style={styles.cardStatLabelRow}>
                    <Text style={styles.cardStatLabel} numberOfLines={1}>
                      {t('home.billPaid')}
                    </Text>
                    <InfoDot
                      tone="onDark"
                      icon="🧾"
                      title={t('home.billPaidInfoTitle')}
                      body={[
                        t('home.billPaidInfoBody1'),
                        t('home.billPaidInfoBody2'),
                        t('home.billPaidInfoBody3'),
                      ]}
                    />
                  </View>
                  <Text
                    style={styles.cardStatValue}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {fmtWhole(cardSummary.billPaid)}
                  </Text>
                </View>
              </View>
            ) : null}
          </>
        ) : (
          <View style={styles.compactTabs}>
            {(['expense', 'income'] as const).map((k) => (
              <Pressable
                key={k}
                onPress={() => openTxnList(k)}
                style={styles.compactTab}
              >
                <Text style={styles.compactTabText}>
                  {k === 'expense' ? t('home.expenses') : t('home.income')}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {showHomeAdMob ? (
        <View style={styles.homeAdMobSlot}>
          <GoogleAdBanner />
        </View>
      ) : null}

      <ScrollView
        style={styles.list}
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom, 16) + 100,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hubBody}>
          {showPromoBanner ? (
            <View style={styles.bannerWrap}>
              <ProfileAdBanner
                config={config.adBanner}
                onDismiss={() => setAdDismissed(true)}
                style={styles.homeBanner}
              />
            </View>
          ) : null}

          <Text style={[styles.hubSectionTitle, { color: theme.ink }]}>
            {t('home.hubExplore')}
          </Text>
          <View style={styles.shortcutRow}>
            {shortcuts.map((item) => (
              <Pressable
                key={item.key}
                onPress={item.onPress}
                style={[
                  styles.shortcutCard,
                  { backgroundColor: theme.card, borderColor: theme.line },
                ]}
              >
                <View style={[styles.shortcutAccent, { backgroundColor: item.tint }]} />
                <View style={[styles.shortcutIconWrap, { backgroundColor: item.tint + '1F' }]}>
                  <Text style={styles.shortcutIcon}>{item.icon}</Text>
                </View>
                <Text style={[styles.shortcutTitle, { color: theme.ink }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={[styles.shortcutSub, { color: theme.muted }]} numberOfLines={2}>
                  {item.subtitle}
                </Text>
              </Pressable>
            ))}
          </View>

          {isPremiumMember ? null : (
            <PromoRow
              theme={theme}
              styles={styles}
              icon="⚡"
              title={t('home.premiumPitch', { price: config.premiumPlan.priceLabel })}
              sub={t('home.premiumPitchSub')}
              cta={t('home.premiumUpgrade')}
              onPress={() => goStack('PremiumCompare')}
            />
          )}

          <View style={[styles.rewardCard, { backgroundColor: theme.primaryDark }]}>
            <View style={styles.rewardHead}>
              <View style={styles.rewardHeadMain}>
                <Text style={styles.rewardHeadTitle}>{t('home.rewardsHub')}</Text>
                <View style={styles.rewardBalanceRow}>
                  <Text style={styles.rewardBalance}>💎 {diamonds.balance}</Text>
                  <Text style={styles.rewardBalanceLabel}>{t('home.rewardsBalanceLabel')}</Text>
                </View>
              </View>
              <Pressable
                onPress={() => goStack('Diamonds')}
                style={[styles.rewardRedeem, { backgroundColor: theme.primary }]}
              >
                <Text style={[styles.rewardRedeemText, { color: theme.onPrimary }]}>
                  {t('home.rewardsRedeem')}
                </Text>
              </Pressable>
            </View>

            <View style={styles.rewardTileRow}>
              <Pressable onPress={inviteFriends} style={styles.rewardTile}>
                <Text style={styles.rewardTileIcon}>🧑‍🤝‍🧑</Text>
                <Text style={styles.rewardTileTitle} numberOfLines={1}>
                  {t('home.rewardsReferralShort')}
                </Text>
                <Text style={styles.rewardTileSub} numberOfLines={2}>
                  {t('home.rewardsReferralSub', {
                    invited: String(referrals.invitedCount),
                    diamonds: String(referrals.diamondsEarned),
                  })}
                </Text>
                <View style={[styles.rewardTileCta, { backgroundColor: theme.primary }]}>
                  <Text style={[styles.rewardTileCtaText, { color: theme.onPrimary }]}>
                    {t('home.rewardsInvite')}
                  </Text>
                </View>
              </Pressable>

              <Pressable onPress={() => goStack('Diamonds')} style={styles.rewardTile}>
                <Text style={styles.rewardTileIcon}>📺</Text>
                <Text style={styles.rewardTileTitle} numberOfLines={1}>
                  {t('home.rewardsTasks')}
                </Text>
                <Text style={styles.rewardTileSub} numberOfLines={2}>
                  {t('home.rewardsTasksDone', {
                    done: String(diamonds.earnedToday),
                    total: String(diamonds.dailyAdCap),
                  })}
                </Text>
                <View style={styles.rewardTrack}>
                  <View
                    style={[
                      styles.rewardFill,
                      { backgroundColor: theme.primary, width: `${adProgressPct}%` },
                    ]}
                  />
                </View>
                <View style={[styles.rewardTileCta, { backgroundColor: theme.primary }]}>
                  <Text style={[styles.rewardTileCtaText, { color: theme.onPrimary }]}>
                    {t('home.rewardsEarnNow')}
                  </Text>
                </View>
              </Pressable>
            </View>
          </View>

          <PromoRow
            theme={theme}
            styles={styles}
            icon="❓"
            title={t('home.howItWorksPitch')}
            sub={t('home.howItWorksSub')}
            cta={t('home.howItWorksCta')}
            onPress={() => goStack('LegalDocument', { kind: 'terms' })}
          />

          {/* Two quiet doors out of the app: one for what's broken, one for
              what's missing. Paired so neither reads as the louder ask. */}
          <View style={styles.feedbackRow}>
            <Pressable style={styles.feedbackTab} onPress={() => setFeedbackSheet('issue')}>
              <Text style={styles.feedbackIcon}>🐞</Text>
              <Text style={styles.feedbackTabText} numberOfLines={2}>
                {t('feedbackHub.issueTab')}
              </Text>
            </Pressable>
            <Pressable style={styles.feedbackTab} onPress={() => setFeedbackSheet('feature')}>
              <Text style={styles.feedbackIcon}>💡</Text>
              <Text style={styles.feedbackTabText} numberOfLines={2}>
                {t('feedbackHub.featureTab')}
              </Text>
            </Pressable>
          </View>

          {showHomeNativeAd ? (
            <View style={styles.homeNativeAdWrap}>
              <GoogleNativeAdCard />
            </View>
          ) : null}
        </View>
      </ScrollView>

      <ReportIssueSheet
        open={feedbackSheet === 'issue'}
        onClose={() => setFeedbackSheet(null)}
      />
      <RequestFeatureSheet
        open={feedbackSheet === 'feature'}
        onClose={() => setFeedbackSheet(null)}
      />
    </View>
  );
}

/**
 * One-line pitch: round badge, the pitch itself, then the action on the right.
 * Premium and How it works share it so the pair reads as one family.
 */
function PromoRow({
  theme,
  styles,
  icon,
  title,
  sub,
  cta,
  onPress,
}: {
  theme: ThemeTokens;
  styles: ReturnType<typeof makeStyles>;
  icon: string;
  title: string;
  sub: string;
  cta: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.promoCard,
        {
          // A wash of the chosen accent, so the card shifts with the theme
          // instead of sitting on the same neutral card colour as everything else.
          backgroundColor: theme.accentSoft,
          borderColor: withAlpha(theme.primary, '66'),
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View style={[styles.promoBadge, { backgroundColor: theme.card }]}>
        <Text style={styles.promoBadgeIcon}>{icon}</Text>
      </View>
      <View style={styles.promoMain}>
        <Text style={[styles.promoTitle, { color: theme.ink }]} numberOfLines={2}>
          {title}
        </Text>
        <Text style={[styles.promoSub, { color: theme.muted }]} numberOfLines={2}>
          {sub}
        </Text>
      </View>
      <View style={[styles.promoCta, { backgroundColor: theme.primaryDark }]}>
        <Text style={[styles.promoCtaText, { color: theme.onPrimaryDark }]}>{cta}</Text>
        <Text style={[styles.promoCtaChevron, { color: theme.onPrimaryDark }]}>›</Text>
      </View>
    </Pressable>
  );
}

const KEYPAD = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', '⌫'],
] as const;

/**
 * Beyond plain expense/income:
 * - 'card' is the tab itself, a chooser for the card actions.
 * - 'cardBill' posts a bank → card transfer. The spends it pays off are already
 *   expenses on the card, so booking it as an expense too would count the same
 *   money twice; a transfer moves it out of the bank and stays out of totals.
 * A card expense is just an expense, charged to the card instead of the bank.
 */
type AddKind = 'expense' | 'income' | 'card' | 'cardBill';

/** Bill payments are filed under this category so lists don't just read "Transfer". */

/** Same viewport height for Expense and Income category grids. */
const CAT_SCROLL_HEIGHT = 360;

/** Matches HTML: step1 (category) → step2 (amount + details). */
export function AddModal() {
  const {
    showAdd,
    setShowAdd,
    isGuest,
    setShowAuth,
    setAuthMode,
    editingTxn,
    setEditingTxn,
    pendingAddKind,
    setPendingAddKind,
    pendingAddAccountId,
    setPendingAddAccountId,
  } = useFinance();
  const {
    finance,
    addTransaction,
    updateTransaction,
    config,
    groceryReminders,
    setGroceryReminders,
    expenseCategories,
    incomeCategories,
    catMeta,
    theme,
    upsertAccount,
  } = useApp();
  const { t, catName } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [step, setStep] = useState<1 | 2>(1);
  const [kind, setKind] = useState<AddKind>('expense');
  const [category, setCategory] = useState<string | null>(null);
  const [amountStr, setAmountStr] = useState('0');
  const [amountSel, setAmountSel] = useState({ start: 1, end: 1 });
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [accountId, setAccountId] = useState('');
  /** Destination card, used only by the bill-payment transfer. */
  const [toAccountId, setToAccountId] = useState('');
  /** Card to charge when the expense was started from the Credit card tab. */
  const [lockedAccountId, setLockedAccountId] = useState<string | null>(null);
  const [billImageUri, setBillImageUri] = useState<string | null>(null);
  const [billEditUri, setBillEditUri] = useState<string | null>(null);
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [groceryItems, setGroceryItems] = useState<GroceryTxnItem[]>([]);
  const [grocSubcat, setGrocSubcat] = useState('');
  const [grocItem, setGrocItem] = useState('');
  const [grocCustom, setGrocCustom] = useState('');
  const [grocQty, setGrocQty] = useState('');
  const [grocExpiry, setGrocExpiry] = useState('');
  const [showUpiPicker, setShowUpiPicker] = useState(false);
  const [upiApps, setUpiApps] = useState<UpiAppOption[]>([]);
  const [upiLoading, setUpiLoading] = useState(false);
  const [softKeyboardOpen, setSoftKeyboardOpen] = useState(false);
  const awaitingPayReturn = useRef(false);
  const appStateRef = useRef(AppState.currentState);

  const isEditing = !!editingTxn;
  // Card bills live under the Credit card tab, so they are not a spend to pick.
  const cats =
    kind === 'income'
      ? incomeCategories
      : expenseCategories.filter((c) => c.name !== CARD_BILL_CATEGORY);
  const catSections = useMemo(
    () => groupCategoriesByPurpose(cats, kind === 'income' ? 'income' : 'expense'),
    [cats, kind],
  );

  /** Card accounts from the Accounts tab — the only targets for a limit. */
  const creditCards = useMemo(
    () =>
      sortAccountsForDisplay(finance.accounts).filter(
        (a) => !a.excluded && isCoreCardAccount(a),
      ),
    [finance.accounts],
  );
  /** Everything a bill can be paid from — i.e. not the card being paid off. */
  const payFromAccounts = useMemo(
    () =>
      sortAccountsForDisplay(finance.accounts).filter(
        (a) => !a.excluded && !isCoreCardAccount(a),
      ),
    [finance.accounts],
  );
  const kindTabs = useMemo<AddKind[]>(
    () =>
      creditCards.length > 0 ? ['expense', 'income', 'card'] : ['expense', 'income'],
    [creditCards.length],
  );
  const isCardHub = kind === 'card';
  const isCardBill = kind === 'cardBill';
  /** Which tab reads as selected while a card action is open. */
  const activeTab: AddKind = isCardBill ? 'card' : kind;

  const currencySym = currencySymbol(config.currency);
  const amountValue = parseFloat(amountStr) || 0;
  const canSave =
    amountValue > 0 &&
    (!isCardBill || (!!accountId && !!toAccountId && accountId !== toAccountId));
  const showGrocery = !!category && isGroceryFamilyCat(category);
  const groceryScope = category ? getGroceryItemScope(category) : null;
  const selectedMeta = category
    ? catMeta(category, kind === 'income' ? 'income' : 'expense')
    : null;

  const resetForm = () => {
    setStep(1);
    setKind('expense');
    setCategory(null);
    setAmountStr('0');
    setAmountSel({ start: 1, end: 1 });
    setDate(todayStr());
    setNote('');
    setAccountId(resolvePaidWithAccountId(finance) ?? '');
    setToAccountId('');
    setLockedAccountId(null);
    setBillImageUri(null);
    setBillEditUri(null);
    setItemName('');
    setQuantity('');
    setGroceryItems([]);
    setGrocSubcat('');
    setGrocItem('');
    setGrocCustom('');
    setGrocQty('');
    setGrocExpiry('');
    setShowUpiPicker(false);
    setUpiApps([]);
    awaitingPayReturn.current = false;
  };

  const loadTxn = (t: Transaction) => {
    // A transfer reopened as an expense would silently change its meaning.
    const k: AddKind =
      t.kind === 'transfer' ? 'cardBill' : t.kind === 'income' ? 'income' : 'expense';
    setKind(k);
    setCategory(t.category);
    setAmountStr(String(t.amount));
    setAmountSel({ start: String(t.amount).length, end: String(t.amount).length });
    setDate(t.date || todayStr());
    setNote(t.note || '');
    setToAccountId(t.toAccountId || '');
    setAccountId(
      (k === 'cardBill' ? t.fromAccountId : t.accountId) ||
        (k === 'expense'
          ? resolvePaidWithAccountId(finance)
          : resolveDefaultAccountId(finance)) ||
        '',
    );
    setBillImageUri(t.billImageUri || null);
    setItemName(t.itemName || '');
    setQuantity(t.quantity || '');
    setGroceryItems(t.groceryItems ? t.groceryItems.map((g) => ({ ...g })) : []);
    setGrocSubcat('');
    setGrocItem('');
    setGrocCustom('');
    setGrocQty('');
    setGrocExpiry('');
    setStep(2);
  };

  useEffect(() => {
    if (!showAdd) return;
    if (isGuest) {
      setShowAdd(false);
      setEditingTxn(null);
      requireAuthToSave(editingTxn ? 'edit transactions' : 'add transactions');
      return;
    }
    if (editingTxn) loadTxn(editingTxn);
    else {
      resetForm();
      if (pendingAddKind === 'cardBill') {
        setKind('cardBill');
        setStep(2);
        setCategory(CARD_BILL_CATEGORY);
        // The card being paid is the destination; the money leaves the bank.
        setToAccountId(
          pendingAddAccountId || cardAccountId(finance.accounts) || '',
        );
        setAccountId(bankAccountId(finance.accounts) || '');
      } else if (pendingAddKind === 'income') {
        setKind('income');
        setAccountId(pendingAddAccountId || resolveDefaultAccountId(finance) || '');
      } else if (pendingAddAccountId) {
        setAccountId(pendingAddAccountId);
      }
      setPendingAddKind(null);
      setPendingAddAccountId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open/edit only
  }, [showAdd, editingTxn?.id, isGuest]);

  useEffect(() => {
    if (!showAdd) {
      setSoftKeyboardOpen(false);
      return;
    }
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvt, () => setSoftKeyboardOpen(true));
    const onHide = Keyboard.addListener(hideEvt, () => setSoftKeyboardOpen(false));
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [showAdd]);

  const onClose = () => {
    awaitingPayReturn.current = false;
    setShowUpiPicker(false);
    setShowAdd(false);
    setEditingTxn(null);
    resetForm();
  };

  const openPayFlow = async () => {
    if (Platform.OS !== 'android') {
      showAppInfo(t('add.pay'), t('add.payAndroidOnly'), '📱');
      return;
    }
    if (!canSave) {
      showAppInfo(t('common.amount'), t('add.payNeedAmount'), '⚠️');
      return;
    }
    if (!requireAuthToSave('add transactions')) return;
    setUpiLoading(true);
    setShowUpiPicker(true);
    try {
      const apps = await listUpiAppsForPicker();
      setUpiApps(apps);
    } finally {
      setUpiLoading(false);
    }
  };

  const launchUpi = async (app: UpiAppOption | 'any') => {
    const result = await openUpiApp(app);
    if (!result.ok) {
      showAppInfo(t('add.pay'), result.error || t('add.payOpenFailed'), '⚠️');
      return;
    }
    setShowUpiPicker(false);
    awaitingPayReturn.current = true;
  };

  const primaryCardId = () => cardAccountId(finance.accounts) || creditCards[0]?.id || '';

  const switchKind = (k: AddKind) => {
    setKind(k);
    setCategory(null);
    setGroceryItems([]);
    setStep(1);
    setAmountStr('0');
    setAmountSel({ start: 1, end: 1 });
    setLockedAccountId(null);
    if (k === 'card') {
      setAccountId(primaryCardId());
      return;
    }
    setAccountId(
      (k === 'expense'
        ? resolvePaidWithAccountId(finance)
        : resolveDefaultAccountId(finance)) ?? '',
    );
  };

  /** The Credit card tab's actions. */
  const openCardExpense = () => {
    // Charging the card is an ordinary expense, so it still needs a category.
    setKind('expense');
    setCategory(null);
    setLockedAccountId(primaryCardId());
    setAccountId(primaryCardId());
    setStep(1);
  };

  const openCardBill = () => {
    setKind('cardBill');
    setCategory(CARD_BILL_CATEGORY);
    setAmountStr('0');
    setAmountSel({ start: 1, end: 1 });
    setToAccountId(primaryCardId());
    setAccountId(bankAccountId(finance.accounts) || payFromAccounts[0]?.id || '');
    setStep(2);
  };

  const cardActions = [
    {
      key: 'expense',
      icon: '🧾',
      title: t('add.cardActionExpense'),
      sub: t('add.cardActionExpenseSub'),
      onPress: () => openCardExpense(),
    },
    {
      key: 'bill',
      icon: '✅',
      title: t('add.cardActionBill'),
      sub: t('add.cardActionBillSub'),
      onPress: () => openCardBill(),
    },
  ];

  const backToCardHub = () => {
    setKind('card');
    setCategory(null);
    setLockedAccountId(null);
    setStep(1);
  };

  const pickCategory = (name: string) => {
    setCategory(name);
    if (!isGroceryFamilyCat(name)) setGroceryItems([]);
    setGrocSubcat('');
    setGrocItem('');
    setGrocCustom('');
    setGrocQty('');
    setGrocExpiry('');
    // Expenses & income: default source to Bank (first in Received in / Paid with),
    // unless we arrived here to charge a specific card.
    setAccountId(lockedAccountId || resolvePaidWithAccountId(finance) || '');
    setStep(2);
  };

  const pressKey = (key: string) => {
    const prev = amountStr;
    let start = Math.min(amountSel.start, amountSel.end);
    let end = Math.max(amountSel.start, amountSel.end);
    // Clamp to current string (selection can lag behind).
    start = Math.max(0, Math.min(start, prev.length));
    end = Math.max(0, Math.min(end, prev.length));

    if (key === '⌫') {
      let next: string;
      let caret: number;
      if (start !== end) {
        next = prev.slice(0, start) + prev.slice(end);
        caret = start;
      } else if (start > 0) {
        next = prev.slice(0, start - 1) + prev.slice(start);
        caret = start - 1;
      } else {
        return;
      }
      if (!next.length) {
        setAmountStr('0');
        setAmountSel({ start: 1, end: 1 });
        return;
      }
      setAmountStr(next);
      setAmountSel({ start: caret, end: caret });
      return;
    }

    if (key === '.') {
      if (prev.includes('.')) return;
      const next = `${prev.slice(0, start)}.${prev.slice(end)}`;
      const caret = start + 1;
      setAmountStr(next.length > 12 ? next.slice(0, 12) : next);
      setAmountSel({ start: Math.min(caret, 12), end: Math.min(caret, 12) });
      return;
    }

    // Digit — replace bare "0" when typing at the end/on the zero.
    if (prev === '0' && start <= 1 && end <= 1 && !prev.includes('.')) {
      setAmountStr(key);
      setAmountSel({ start: 1, end: 1 });
      return;
    }

    const next = `${prev.slice(0, start)}${key}${prev.slice(end)}`;
    const clipped = next.length > 12 ? next.slice(0, 12) : next;
    const caret = Math.min(start + 1, clipped.length);
    setAmountStr(clipped);
    setAmountSel({ start: caret, end: caret });
  };

  const buildPendingGroceryItem = (): GroceryTxnItem | null => {
    if (!groceryScope) return null;
    let itemCategory = '';
    let name = '';
    let icon = '🥡';

    if (groceryScope.mode === 'subcategory') {
      if (!grocSubcat) return null;
      itemCategory = grocSubcat;
      const cat = GROCERY_CATEGORIES.find((c) => c.name === grocSubcat);
      if (grocItem === '__others__') {
        name = grocCustom.trim();
        icon = '🥡';
      } else {
        name = grocItem;
        icon = cat?.items.find((i) => i.name === grocItem)?.icon || '🥡';
      }
    } else {
      itemCategory = groceryScope.categoryName;
      if (grocItem === '__others__') {
        name = grocCustom.trim();
        icon = '🥡';
      } else {
        name = grocItem;
        icon = groceryScope.items.find((i) => i.name === grocItem)?.icon || groceryScope.icon;
      }
    }

    if (!name) return null;
    return {
      id: uid(),
      name,
      category: itemCategory,
      icon,
      quantity: grocQty.trim() || undefined,
      expiryDate: grocExpiry.trim() || undefined,
      groceryReminderId: null,
    };
  };

  const addGroceryChip = () => {
    if (!groceryScope) return;
    if (groceryScope.mode === 'subcategory' && !grocSubcat) {
      showAppInfo(t('add.category'), t('add.chooseCategoryFirst'), '⚠️');
      return;
    }
    const pending = buildPendingGroceryItem();
    if (!pending) {
      showAppInfo(t('add.item'), t('add.chooseItemName'), '⚠️');
      return;
    }
    setGroceryItems((list) => [...list, pending]);
    setGrocCustom('');
    setGrocQty('');
    setGrocExpiry('');
  };

  const removeGroceryChip = (id: string) => {
    setGroceryItems((list) => list.filter((p) => p.id !== id));
  };

  const save = async () => {
    if (!requireAuthToSave('add transactions')) return;
    if (!canSave) {
      showAppInfo(t('common.amount'), t('add.enterAmount'), '⚠️');
      return;
    }

    // A bill payment moves money instead of spending it: the bank drops and the
    // card is settled, and it stays out of the month's expense total because the
    // spends it clears were already counted on the card.
    if (isCardBill) {
      if (!accountId || !toAccountId || accountId === toAccountId) {
        showAppInfo(t('add.cardBillTitle'), t('add.cardBillNeedAccounts'), '⚠️');
        return;
      }
      const billPayload = {
        id: editingTxn?.id || uid(),
        kind: 'transfer' as const,
        category: CARD_BILL_CATEGORY,
        amount: amountValue,
        date,
        note: note.trim(),
        fromAccountId: accountId,
        toAccountId,
      };
      const wasEditingBill = !!editingTxn;
      if (wasEditingBill) await updateTransaction(billPayload);
      else await addTransaction(billPayload);
      onClose();
      showAppInfo(
        wasEditingBill ? t('common.updated') : t('common.saved'),
        wasEditingBill ? t('home.txnUpdated') : t('home.txnSaved'),
        '✅',
      );
      return;
    }

    // Only the plain kinds post a transaction from here; 'card' is just a chooser.
    if (kind !== 'expense' && kind !== 'income') return;

    const txnId = editingTxn?.id || uid();
    if (!category) return;

    // Include a grocery row still sitting in the form (user filled qty/item but didn't tap + Add).
    let itemsForSave = groceryItems;
    if (kind === 'expense' && isGroceryFamilyCat(category)) {
      const pending = buildPendingGroceryItem();
      if (pending) {
        itemsForSave = [...groceryItems, pending];
      }
    }

    let linkedItems: GroceryTxnItem[] | undefined;
    const newReminders: GroceryReminder[] = [];

    if (kind === 'expense' && isGroceryFamilyCat(category) && itemsForSave.length > 0) {
      linkedItems = itemsForSave.map((p) => {
        if (!p.expiryDate || p.groceryReminderId) return { ...p };
        const rid = uid();
        newReminders.push({
          id: rid,
          category: p.category || 'Others',
          item: p.name,
          icon: p.icon || '🥡',
          expiryDate: p.expiryDate,
          quantity: p.quantity,
          offsets: config.groceryOffsets,
          mode: 'default',
          fromTransactionId: txnId,
        });
        return { ...p, groceryReminderId: rid };
      });
    }

    // Prefer line-item quantities; also keep a simple quantity when only one item / non-grocery.
    const simpleQty =
      quantity.trim() ||
      (linkedItems?.length === 1 ? linkedItems[0].quantity : undefined) ||
      undefined;
    const simpleItem =
      itemName.trim() ||
      (linkedItems?.length === 1 ? linkedItems[0].name : undefined) ||
      undefined;

    const payload = {
      id: txnId,
      kind,
      category,
      amount: amountValue,
      date,
      note: note.trim(),
      accountId:
        accountId ||
        (kind === 'expense'
          ? resolvePaidWithAccountId(finance)
          : resolveDefaultAccountId(finance)),
      groceryItems: linkedItems,
      billImageUri: billImageUri || undefined,
      billImagePath:
        billImageUri && editingTxn?.billImageUri === billImageUri
          ? editingTxn.billImagePath
          : undefined,
      itemName: simpleItem,
      quantity: simpleQty,
    };

    const wasEditing = !!editingTxn;
    const saveResult = wasEditing
      ? await updateTransaction(payload)
      : await addTransaction(payload);

    if (newReminders.length) {
      await setGroceryReminders([...newReminders, ...groceryReminders]);
    }
    onClose();
    if (billImageUri && saveResult?.imageError) {
      showAppInfo(
        wasEditing ? t('common.updated') : t('common.saved'),
        `Transaction saved on this phone, but the bill was not uploaded to cloud:\n${saveResult.imageError}`,
        '⚠️',
      );
    } else if (billImageUri && saveResult?.imagePath) {
      showAppInfo(
        wasEditing ? t('common.updated') : t('common.saved'),
        `${wasEditing ? t('home.txnUpdated') : t('home.txnSaved')}\n\nBill uploaded to cloud.`,
        '✅',
      );
    } else {
      showAppInfo(
        wasEditing ? t('common.updated') : t('common.saved'),
        wasEditing ? t('home.txnUpdated') : t('home.txnSaved'),
        '✅',
      );
    }
  };

  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (
        awaitingPayReturn.current &&
        (prev === 'background' || prev === 'inactive') &&
        next === 'active'
      ) {
        awaitingPayReturn.current = false;
        setTimeout(() => {
          showAppDialog({
            title: t('add.payConfirmTitle'),
            message: t('add.payConfirmBody'),
            icon: '💸',
            buttons: [
              { text: t('add.payNo'), style: 'cancel' },
              {
                text: t('add.payYes'),
                style: 'primary',
                onPress: () => {
                  void saveRef.current();
                },
              },
            ],
          });
        }, 350);
      }
    });
    return () => sub.remove();
  }, [t]);

  const headerTitle = isCardHub
    ? t('add.cardTab')
    : step === 1
        ? isEditing
          ? t('home.edit')
          : t('home.add')
        : category
          ? catName(category)
          : isEditing
            ? t('home.edit')
            : t('home.add');
  const saveLabel = isGuest
    ? t('add.signUpSave')
    : isEditing
      ? t('add.update')
      : t('home.save');

  const itemChoices =
    groceryScope?.mode === 'direct'
      ? groceryScope.items
      : groceryScope?.mode === 'subcategory' && grocSubcat
        ? GROCERY_CATEGORIES.find((c) => c.name === grocSubcat)?.items || []
        : [];

  const categoryDropdownOptions =
    groceryScope?.mode === 'subcategory'
      ? groceryScope.subcats.map((c) => ({
          value: c.name,
          label: `${c.icon} ${catName(c.name)}`,
        }))
      : [];

  const itemDropdownOptions = [
    ...itemChoices.map((it) => ({
      value: it.name,
      label: `${it.icon} ${it.name}`,
    })),
    { value: '__others__', label: `➕ ${t('add.othersType')}` },
  ];

  return (
    <>
    <BottomSheet visible={showAdd} onClose={onClose} style={styles.addSheet}>
      <View style={styles.sheetHeader}>
        {step === 2 ? (
          <Pressable
            // Card actions are reached from the Credit card tab, so return there.
            onPress={isCardBill ? backToCardHub : () => setStep(1)}
            hitSlop={8}
          >
            <Text style={styles.headerBtn}>‹ {t('home.back')}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.headerBtn}>{t('home.cancel')}</Text>
          </Pressable>
        )}
        <Text style={styles.modalTitle}>{headerTitle}</Text>
        {step === 2 ? (
          <Pressable onPress={save} hitSlop={8}>
            <Text style={[styles.headerBtn, styles.headerSave]}>
              {isGuest ? t('add.signUp') : isEditing ? t('add.update') : t('home.save')}
            </Text>
          </Pressable>
        ) : (
          <View style={{ width: 56 }} />
        )}
      </View>

      {step === 1 ? (
        <>
          <View style={styles.kindTabs}>
            {kindTabs.map((k) => (
              <Pressable
                key={k}
                style={[styles.kindTab, activeTab === k && styles.kindTabOn]}
                onPress={() => switchKind(k)}
              >
                <Text
                  style={[styles.kindTabText, activeTab === k && styles.kindTabTextOn]}
                  numberOfLines={1}
                >
                  {k === 'expense'
                    ? t('home.expenses')
                    : k === 'income'
                      ? t('home.income')
                      : t('add.cardTab')}
                </Text>
              </Pressable>
            ))}
          </View>

          {isCardHub ? (
            <View style={[styles.catScroll, { height: CAT_SCROLL_HEIGHT }]}>
              <View style={styles.cardActionRow}>
                {cardActions.map((action) => (
                  <Pressable
                    key={action.key}
                    onPress={action.onPress}
                    style={styles.cardActionCell}
                  >
                    <View style={styles.cardActionIcon}>
                      <Text style={{ fontSize: 22 }}>{action.icon}</Text>
                    </View>
                    <Text style={styles.cardActionTitle} numberOfLines={2}>
                      {action.title}
                    </Text>
                    <Text style={styles.cardActionSub} numberOfLines={3}>
                      {action.sub}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            <ScrollView
              style={[styles.catScroll, { height: CAT_SCROLL_HEIGHT }]}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {catSections.map((section) => (
                <View key={section.id} style={styles.catSection}>
                  <Text style={styles.catSectionTitle}>
                    {t(section.titleKey as TranslationKey)}
                  </Text>
                  <View style={styles.catGrid}>
                    {section.data.map((c) => (
                      <Pressable
                        key={c.name}
                        onPress={() => pickCategory(c.name)}
                        style={styles.catCell}
                      >
                        <View style={[styles.catIcon, { backgroundColor: `${c.color}22` }]}>
                          <Text style={{ fontSize: 20 }}>{c.icon}</Text>
                        </View>
                        <Text style={styles.catLabel} numberOfLines={1}>
                          {catName(c.name)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          contentContainerStyle={{ paddingBottom: softKeyboardOpen ? 24 : 8 }}
        >
          <Pressable
            onPress={() => {
              Keyboard.dismiss();
              setSoftKeyboardOpen(false);
            }}
          >
            <View style={styles.amountDisplay}>
              <View style={styles.catTag}>
                <View
                  style={[
                    styles.tagIc,
                    { backgroundColor: selectedMeta?.color || theme.accent },
                  ]}
                >
                  <Text style={{ fontSize: 14 }}>{selectedMeta?.icon}</Text>
                </View>
                <Text style={styles.catTagText}>
                  {category ? catName(category) : ''}
                </Text>
              </View>
              <View style={styles.amountRow}>
                <Text style={styles.amountSym}>{currencySym}</Text>
                <TextInput
                  value={amountStr}
                  onChangeText={() => {}}
                  selection={amountSel}
                  onSelectionChange={(e) => setAmountSel(e.nativeEvent.selection)}
                  showSoftInputOnFocus={false}
                  caretHidden={false}
                  cursorColor={theme.accent}
                  selectionColor={theme.accentSoft}
                  autoFocus
                  onFocus={() => {
                    Keyboard.dismiss();
                    setSoftKeyboardOpen(false);
                  }}
                  style={styles.amountInput}
                  accessibilityLabel="Amount"
                />
              </View>
            </View>
          </Pressable>

          {!softKeyboardOpen ? (
            <View style={styles.keypad}>
              {KEYPAD.map((row) => (
                <View key={row.join('-')} style={styles.keypadRow}>
                  {row.map((key) => (
                    <Pressable
                      key={key}
                      onPress={() => pressKey(key)}
                      style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
                    >
                      <Text style={[styles.keyText, key === '⌫' && styles.keyBack]}>{key}</Text>
                    </Pressable>
                  ))}
                </View>
              ))}
            </View>
          ) : (
            <Pressable
              onPress={() => {
                Keyboard.dismiss();
                setSoftKeyboardOpen(false);
              }}
              style={styles.keypadCollapsed}
            >
              <Text style={styles.keypadCollapsedText}>{t('add.showKeypad')}</Text>
            </Pressable>
          )}

          {kind === 'expense' ? (
            <View style={styles.datePayRow}>
              <View style={styles.datePayFields}>
                <DateField
                  compact
                  label={t('add.date')}
                  value={date}
                  onChange={setDate}
                />
                <DropdownSelect
                  compact
                  label={t('home.paidWith')}
                  value={accountId}
                  placeholder={t('home.selectSource')}
                  options={sortAccountsForDisplay(finance.accounts)
                    .filter((a) => !a.excluded)
                    .map((a) => ({
                      value: a.id,
                      label: accountChipLabel(a),
                    }))}
                  onChange={setAccountId}
                />
              </View>
              <View style={styles.datePaySlot}>
                <Pressable
                  style={[styles.payBtn, !canSave && styles.payBtnDisabled]}
                  onPress={() => {
                    void openPayFlow();
                  }}
                >
                  <Text style={styles.payBtnText}>{t('add.pay')}</Text>
                </Pressable>
              </View>
            </View>
          ) : isCardBill ? (
            <>
              <DateField label={t('add.date')} value={date} onChange={setDate} />
              <DropdownSelect
                label={t('add.cardBillFrom')}
                value={accountId}
                placeholder={t('home.selectSource')}
                options={payFromAccounts.map((a) => ({
                  value: a.id,
                  label: accountChipLabel(a),
                }))}
                onChange={setAccountId}
              />
              <DropdownSelect
                label={t('add.cardBillTo')}
                value={toAccountId}
                placeholder={t('add.cardPick')}
                options={creditCards.map((a) => ({
                  value: a.id,
                  label: accountChipLabel(a),
                }))}
                onChange={setToAccountId}
              />
            </>
          ) : (
            <>
              <DateField label={t('add.date')} value={date} onChange={setDate} />
              <DropdownSelect
                label={t('home.receivedIn')}
                value={accountId}
                placeholder={t('home.selectSource')}
                options={sortAccountsForDisplay(finance.accounts)
                  .filter((a) => !a.excluded)
                  .map((a) => ({
                    value: a.id,
                    label: accountChipLabel(a),
                  }))}
                onChange={setAccountId}
              />
            </>
          )}
          <Text style={[styles.fieldHint, { color: theme.muted, marginTop: kind === 'expense' ? 4 : -4 }]}>
            {isCardBill
              ? t('add.cardBillHint')
              : kind === 'income'
                ? t('add.sourceIncomeHint')
                : t('add.sourceExpenseHint')}
          </Text>

          <Text style={styles.fieldLabel}>{t('home.note')}</Text>
          <View style={styles.noteRow}>
            <TextInput
              style={[styles.fieldInput, styles.noteInputFlex]}
              value={note}
              onChangeText={setNote}
              placeholder={t('add.notePlaceholder')}
              placeholderTextColor={theme.muted}
            />
            <Pressable
              style={styles.cameraBtn}
              onPress={() => promptBillImage((uri) => setBillEditUri(uri))}
            >
              <Text style={styles.cameraBtnIcon}>📷</Text>
            </Pressable>
          </View>
          {billImageUri ? (
            <View style={styles.billPreviewRow}>
              <Image source={{ uri: billImageUri }} style={styles.billThumb} />
              <View style={{ flex: 1 }}>
                <Text style={styles.billAttached}>{t('add.billAttached')}</Text>
                <Pressable onPress={() => setBillImageUri(null)}>
                  <Text style={styles.removeBill}>{t('home.remove')}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {kind === 'expense' && !showGrocery ? (
            <>
              <Text style={styles.fieldLabel}>{t('add.item')}</Text>
              <TextInput
                style={styles.fieldInput}
                value={itemName}
                onChangeText={setItemName}
                placeholder={t('add.itemPlaceholder')}
                placeholderTextColor={theme.muted}
              />
              <Text style={styles.fieldLabel}>{t('add.quantity')}</Text>
              <TextInput
                style={styles.fieldInput}
                value={quantity}
                onChangeText={setQuantity}
                placeholder={t('add.qtyPlaceholder')}
                placeholderTextColor={theme.muted}
              />
            </>
          ) : null}

          {showGrocery && groceryScope ? (
            <View style={styles.groceryCard}>
              <Text style={styles.groceryTitle}>🛒 {t('add.addItems')}</Text>
              <Text style={styles.groceryHint}>{t('add.groceryHint')}</Text>

              {groceryScope.mode === 'subcategory' ? (
                <DropdownSelect
                  label={t('add.category')}
                  value={grocSubcat}
                  placeholder={t('add.selectCategory')}
                  options={categoryDropdownOptions}
                  onChange={(v) => {
                    setGrocSubcat(v);
                    setGrocItem('');
                    setGrocCustom('');
                  }}
                />
              ) : null}

              <DropdownSelect
                label={t('add.item')}
                value={grocItem}
                placeholder={
                  groceryScope.mode === 'subcategory' && !grocSubcat
                    ? t('add.selectCategory')
                    : t('add.selectItem')
                }
                options={
                  groceryScope.mode === 'subcategory' && !grocSubcat ? [] : itemDropdownOptions
                }
                disabled={groceryScope.mode === 'subcategory' && !grocSubcat}
                onChange={(v) => {
                  setGrocItem(v);
                  if (v !== '__others__') setGrocCustom('');
                }}
              />

              {grocItem === '__others__' ? (
                <TextInput
                  style={styles.fieldInput}
                  value={grocCustom}
                  onChangeText={setGrocCustom}
                  placeholder={t('add.itemPlaceholder')}
                  placeholderTextColor={theme.muted}
                />
              ) : null}

              <Text style={styles.fieldLabel}>{t('add.qtyOptional')}</Text>
              <TextInput
                style={styles.fieldInput}
                value={grocQty}
                onChangeText={setGrocQty}
                placeholder={t('add.qtyPlaceholder')}
                placeholderTextColor={theme.muted}
              />

              <Text style={styles.fieldLabel}>{t('add.expiryOptional')}</Text>
              <View style={styles.expiryRow}>
                <DateField
                  compact
                  clearable
                  value={grocExpiry}
                  onChange={setGrocExpiry}
                  placeholder={t('add.selectExpiry')}
                />
                <Pressable style={styles.addItemBtn} onPress={addGroceryChip}>
                  <Text style={styles.addItemBtnText}>{t('add.addItemBtn')}</Text>
                </Pressable>
              </View>

              <View style={styles.chipWrap}>
                {groceryItems.length === 0 ? (
                  <Text style={styles.groceryHint}>{t('add.noItemsYet')}</Text>
                ) : (
                  groceryItems.map((p) => (
                    <View key={p.id} style={styles.perishableChip}>
                      <Text style={styles.perishableChipText}>
                        {p.icon} {p.name}
                        {p.quantity ? ` · ×${p.quantity}` : ''}
                        {p.expiryDate ? ` · 🔔 ${p.expiryDate.slice(5)}` : ''}
                      </Text>
                      <Pressable onPress={() => removeGroceryChip(p.id)} hitSlop={6}>
                        <Text style={styles.chipX}>✕</Text>
                      </Pressable>
                    </View>
                  ))
                )}
              </View>
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.saveBtn,
              !canSave && !isGuest && styles.saveBtnDisabled,
              { backgroundColor: theme.header, opacity: pressed ? 0.85 : 1 },
            ]}
            onPress={() => {
              void save();
            }}
          >
            <Text style={styles.saveText}>{saveLabel}</Text>
          </Pressable>
        </ScrollView>
      )}
    </BottomSheet>
    <BillImageEditor
      visible={!!billEditUri}
      uri={billEditUri}
      onCancel={() => setBillEditUri(null)}
      onSave={(uri) => {
        setBillImageUri(uri);
        setBillEditUri(null);
      }}
    />
    <Modal
      visible={showUpiPicker}
      transparent
      animationType="fade"
      onRequestClose={() => setShowUpiPicker(false)}
    >
      <Pressable style={styles.upiBackdrop} onPress={() => setShowUpiPicker(false)}>
        <Pressable style={[styles.upiCard, { backgroundColor: theme.card }]} onPress={() => {}}>
          <Text style={[styles.upiTitle, { color: theme.ink }]}>{t('add.payUpiTitle')}</Text>
          <Text style={[styles.upiHint, { color: theme.muted }]}>{t('add.payUpiHint')}</Text>
          {upiLoading ? (
            <Text style={{ color: theme.muted, marginBottom: 8 }}>{t('common.loading')}</Text>
          ) : (
            <ScrollView style={styles.upiList} keyboardShouldPersistTaps="handled">
              {upiApps.map((app) => (
                <Pressable
                  key={app.id}
                  style={[styles.upiAppRow, { borderColor: theme.line }]}
                  onPress={() => {
                    void launchUpi(app);
                  }}
                >
                  <Text style={[styles.upiAppName, { color: theme.ink }]}>{app.name}</Text>
                  <Text style={{ color: theme.accent, fontWeight: '800' }}>›</Text>
                </Pressable>
              ))}
              <Pressable
                style={[styles.upiAppRow, { borderColor: theme.line }]}
                onPress={() => {
                  void launchUpi('any');
                }}
              >
                <Text style={[styles.upiAppName, { color: theme.ink }]}>{t('add.payAnyUpi')}</Text>
                <Text style={{ color: theme.accent, fontWeight: '800' }}>›</Text>
              </Pressable>
            </ScrollView>
          )}
          <Pressable style={styles.upiCancel} onPress={() => setShowUpiPicker(false)}>
            <Text style={{ color: theme.muted, fontWeight: '700' }}>{t('common.cancel')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
    </>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bg, overflow: 'visible' },
    filterStrip: {
      backgroundColor: theme.header,
      zIndex: 1,
      elevation: 0,
      overflow: 'visible',
    },
    summaryBand: {
      backgroundColor: theme.header,
      paddingHorizontal: 4,
      paddingTop: 2,
      paddingBottom: 8,
      overflow: 'hidden',
    },
    monthBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
      marginTop: 2,
    },
    periodDrop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: 'rgba(255,255,255,0.14)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.22)',
    },
    periodDropText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    periodDropChevron: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '800' },
    periodModalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      paddingHorizontal: 28,
    },
    periodModalCard: {
      borderRadius: 16,
      maxHeight: '70%',
      overflow: 'hidden',
      paddingTop: 14,
    },
    periodModalTitle: {
      fontSize: 16,
      fontWeight: '800',
      paddingHorizontal: 16,
      marginBottom: 6,
    },
    periodModalList: { maxHeight: 360 },
    periodModalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      minHeight: 49,
    },
    periodModalRowText: { fontSize: 15, fontWeight: '600' },
    // A touch more room than before so the three outlines do not crowd.
    statsRow: { flexDirection: 'row', gap: 5 },
    cardStatsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 4,
      paddingVertical: 2,
      paddingHorizontal: 8,
      backgroundColor: 'rgba(255,255,255,0.08)',
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: withAlpha(theme.primary, '99'),
    },
    // Label over amount: the name in the middle leaves too little width for
    // both to share a line once the figures grow.
    cardStat: { flex: 1, alignItems: 'flex-start' },
    cardStatRight: { alignItems: 'flex-end' },
    cardStatRule: {
      width: 1,
      alignSelf: 'stretch',
      marginVertical: 1,
      backgroundColor: 'rgba(255,255,255,0.28)',
    },
    // The name and its period stack too, so the middle stays as short as the
    // label-over-amount columns beside it.
    cardStatMid: { flexShrink: 1, alignItems: 'center', paddingHorizontal: 2 },
    cardStatTitle: {
      color: 'rgba(255,255,255,0.65)',
      fontSize: 11,
      lineHeight: 13,
      fontWeight: '700',
      textAlign: 'center',
      maxWidth: '100%',
    },
    cardStatPeriod: {
      color: 'rgba(255,255,255,0.45)',
      fontSize: 9,
      lineHeight: 11,
      fontWeight: '600',
      textAlign: 'center',
      maxWidth: '100%',
    },
    cardStatLabel: {
      color: 'rgba(255,255,255,0.65)',
      fontSize: 10,
      lineHeight: 12,
      fontWeight: '600',
      maxWidth: '100%',
      flexShrink: 1,
    },
    cardStatLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    cardStatValue: {
      color: 'rgba(255,255,255,0.9)',
      fontWeight: '800',
      fontSize: 14,
      lineHeight: 17,
      maxWidth: '100%',
    },
    compactTabs: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 2,
    },
    compactTab: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: 'rgba(255,255,255,0.08)',
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    compactTabOn: {
      backgroundColor: 'rgba(255,255,255,0.18)',
      borderColor: theme.accentSoft,
    },
    compactTabText: { color: 'rgba(255,255,255,0.7)', fontWeight: '700', fontSize: 12 },
    compactTabTextOn: { color: '#fff', fontWeight: '800' },
    statTab: {
      flex: 1,
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.08)',
      borderRadius: 10,
      paddingVertical: 6,
      paddingHorizontal: 2,
      borderWidth: 1.5,
      // The theme's own accent, faded so the selected tile still leads.
      borderColor: withAlpha(theme.primary, '99'),
    },
    statTabOn: {
      backgroundColor: 'rgba(255,255,255,0.18)',
      borderColor: theme.primary,
    },
    // Balance is a readout rather than a button, so it is outlined but unfilled.
    statBalance: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: 2,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: withAlpha(theme.primary, '99'),
    },
    statLabel: {
      color: 'rgba(255,255,255,0.65)',
      fontSize: 12,
      marginBottom: 2,
      fontWeight: '600',
      flexShrink: 1,
    },
    /** The label and its "i" share the line the label used to have to itself. */
    statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: '100%' },
    /** Sits inside the label, so it borrows the label's line rather than taking one. */
    statPeriodInline: {
      color: 'rgba(255,255,255,0.45)',
      fontSize: 9,
      fontWeight: '600',
    },
    statLabelOn: { color: '#fff', fontWeight: '800' },
    statValue: { color: 'rgba(255,255,255,0.85)', fontWeight: '800', fontSize: 15 },
    statValueOn: { color: '#fff' },
    statSubRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      gap: 2,
      marginTop: 1,
    },
    statSubLabel: {
      color: 'rgba(255,255,255,0.55)',
      fontSize: 10,
      fontWeight: '600',
      flexShrink: 0,
    },
    statSubValue: {
      color: 'rgba(255,255,255,0.9)',
      fontWeight: '800',
      fontSize: 15,
      flexShrink: 1,
      textAlign: 'right',
    },
    statHint: {
      color: 'rgba(255,255,255,0.5)',
      fontSize: 9,
      fontWeight: '600',
      marginTop: 1,
    },
    list: { flex: 1 },
    homeAdMobSlot: {
      width: '100%',
      backgroundColor: theme.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.line,
    },
    hubBody: { paddingHorizontal: 16, paddingTop: 12 },
    hubSectionTitle: {
      fontWeight: '800',
      fontSize: 15,
      marginBottom: 10,
    },
    bannerWrap: { marginBottom: 16 },
    homeBanner: { borderRadius: 14, overflow: 'hidden' },
    homeNativeAdWrap: { marginTop: 16, marginBottom: 8 },
    shortcutRow: {
      flexDirection: 'row',
      gap: 8,
    },
    shortcutCard: {
      flex: 1,
      borderRadius: 16,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingTop: 12,
      paddingBottom: 11,
      overflow: 'hidden',
    },
    // A hairline of the card's own colour along the top edge.
    shortcutAccent: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 3,
    },
    shortcutIconWrap: {
      width: 30,
      height: 30,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    shortcutIcon: { fontSize: 16 },
    shortcutTitle: { fontWeight: '800', fontSize: 12, marginBottom: 3 },
    shortcutSub: { fontSize: 10, lineHeight: 13, fontWeight: '600' },

    promoCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 12,
      borderRadius: 14,
      borderWidth: 1,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    promoBadge: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    promoBadgeIcon: { fontSize: 19 },
    promoMain: { flex: 1 },
    promoTitle: { fontWeight: '900', fontSize: 14, lineHeight: 18 },
    promoSub: { fontSize: 11, lineHeight: 15, fontWeight: '600', marginTop: 2 },
    // The action sits inline rather than filling a panel down the right edge.
    promoCta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      borderRadius: 999,
      paddingLeft: 12,
      paddingRight: 9,
      paddingVertical: 7,
    },
    promoCtaText: { fontSize: 12, fontWeight: '900' },
    promoCtaChevron: { fontSize: 15, fontWeight: '900', marginTop: -2 },

    feedbackRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    feedbackTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: withAlpha(theme.primary, '66'),
      backgroundColor: theme.accentSoft,
      paddingHorizontal: 12,
      paddingVertical: 11,
    },
    feedbackIcon: { fontSize: 16 },
    feedbackTabText: {
      flex: 1,
      color: theme.header,
      fontSize: 12.5,
      lineHeight: 16,
      fontWeight: '800',
    },

    rewardCard: {
      marginTop: 14,
      borderRadius: 18,
      padding: 14,
    },
    rewardHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    rewardHeadMain: { flex: 1 },
    rewardHeadTitle: {
      color: 'rgba(255,255,255,0.8)',
      fontWeight: '900',
      fontSize: 11,
      letterSpacing: 1.2,
    },
    rewardRedeem: {
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 7,
    },
    rewardRedeemText: { fontWeight: '900', fontSize: 12, letterSpacing: 0.6 },
    // The count leads and its unit sits beside it, so the card opens on one line
    // instead of a headline stacked above the balance.
    rewardBalanceRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 6,
      marginTop: 2,
    },
    rewardBalance: { color: '#fff', fontSize: 26, fontWeight: '900' },
    rewardBalanceLabel: {
      color: 'rgba(255,255,255,0.7)',
      fontSize: 11,
      fontWeight: '700',
    },
    // Two ways to earn, side by side and equal, rather than a numbered list.
    rewardTileRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    rewardTile: {
      flex: 1,
      backgroundColor: 'rgba(255,255,255,0.14)',
      borderRadius: 14,
      padding: 11,
    },
    rewardTileIcon: { fontSize: 20 },
    rewardTileTitle: { color: '#fff', fontWeight: '900', fontSize: 13, marginTop: 6 },
    rewardTileSub: {
      color: 'rgba(255,255,255,0.75)',
      fontSize: 11,
      lineHeight: 15,
      fontWeight: '600',
      marginTop: 2,
      minHeight: 30,
    },
    rewardTileCta: {
      borderRadius: 999,
      paddingVertical: 7,
      alignItems: 'center',
      marginTop: 9,
    },
    rewardTileCtaText: { fontWeight: '900', fontSize: 12 },
    rewardTrack: {
      height: 5,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.25)',
      marginTop: 6,
      overflow: 'hidden',
    },
    rewardFill: { height: 5, borderRadius: 999 },
    filterChipScroll: { marginBottom: 10, marginHorizontal: -4 },
    filterChipRow: { gap: 8, paddingHorizontal: 4, paddingBottom: 2 },
    filterChip: {
      borderWidth: 1.5,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    filterChipText: { fontWeight: '800', fontSize: 12 },
    filterTotal: {
      color: theme.ink,
      fontWeight: '800',
      fontSize: 14,
      marginBottom: 10,
      marginTop: -4,
    },
    listTitle: {
      color: theme.muted,
      fontWeight: '700',
      fontSize: 12,
      marginBottom: 10,
    },
    dayHeader: {
      color: theme.muted,
      fontWeight: '800',
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: 0.35,
      marginTop: 4,
      marginBottom: 8,
    },
    noteCard: {
      backgroundColor: theme.accentSoft,
      borderRadius: 14,
      padding: 14,
      marginBottom: 14,
    },
    noteTitle: { fontWeight: '800', color: theme.header, marginBottom: 4 },
    noteBody: { color: theme.header, lineHeight: 18, fontSize: 13 },
    empty: { alignItems: 'center', paddingVertical: 70 },
    emptyIcon: { fontSize: 42, marginBottom: 10, opacity: 0.5 },
    emptyTitle: { fontWeight: '800', fontSize: 16, color: theme.ink },
    emptySub: { color: theme.muted, marginTop: 4 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.card,
      borderRadius: 14,
      padding: 12,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: theme.line,
      gap: 12,
    },
    icon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
    rowTitle: { fontWeight: '700', color: theme.ink },
    rowSub: { color: theme.muted, fontSize: 12, marginTop: 2 },
    rowAmt: { fontWeight: '800' },
    billBadge: { fontSize: 14, marginRight: 4 },
    detailSheet: { paddingBottom: 12 },
    detailHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    detailTitle: { fontSize: 18, fontWeight: '800', color: theme.ink, flex: 1 },
    billImage: {
      width: '100%',
      height: 220,
      borderRadius: 14,
      backgroundColor: theme.bg,
      marginBottom: 14,
    },
    billPlaceholder: {
      height: 140,
      borderRadius: 14,
      backgroundColor: theme.bg,
      borderWidth: 1.5,
      borderColor: theme.line,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    billPlaceholderIcon: { fontSize: 28, marginBottom: 6, opacity: 0.6 },
    billPlaceholderText: { color: theme.muted, fontWeight: '600', fontSize: 13 },
    detailMeta: { marginBottom: 10 },
    detailMetaLabel: { color: theme.muted, fontWeight: '700', fontSize: 12, marginBottom: 2 },
    detailMetaValue: { color: theme.ink, fontWeight: '800', fontSize: 15 },
    itemsHeading: {
      fontWeight: '800',
      color: theme.ink,
      fontSize: 14,
      marginTop: 6,
      marginBottom: 8,
    },
    itemsTableHead: {
      flexDirection: 'row',
      paddingBottom: 6,
      borderBottomWidth: 1,
      borderBottomColor: theme.line,
      marginBottom: 4,
    },
    itemsRow: {
      flexDirection: 'row',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.line,
    },
    itemsColItem: { flex: 1, color: theme.ink, fontWeight: '600', fontSize: 14 },
    itemsColQty: { width: 72, textAlign: 'right', color: theme.ink, fontWeight: '700', fontSize: 14 },
    itemsHeadText: { color: theme.muted, fontWeight: '800', fontSize: 12 },
    editBtn: {
      marginTop: 18,
      backgroundColor: theme.header,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
    },
    editBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    deleteBtn: {
      marginTop: 10,
      backgroundColor: theme.bg,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: theme.red,
    },
    deleteBtnText: { color: theme.red, fontWeight: '800', fontSize: 15 },
    addSheet: { paddingBottom: 10 },
    datePayRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: 10,
      marginBottom: 6,
    },
    datePayFields: {
      flex: 1,
      minWidth: 0,
      gap: 10,
    },
    datePaySlot: {
      flex: 1,
      minWidth: 0,
      justifyContent: 'center',
      alignItems: 'center',
    },
    payBtn: {
      backgroundColor: theme.header,
      borderRadius: 12,
      paddingHorizontal: 28,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 96,
      alignSelf: 'center',
    },
    payBtnDisabled: { opacity: 0.45 },
    payBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    upiBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    upiCard: {
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 28,
      maxHeight: '72%',
    },
    upiTitle: { fontSize: 17, fontWeight: '800', marginBottom: 6 },
    upiHint: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
    upiList: { maxHeight: 280 },
    upiAppRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    upiAppName: { fontSize: 15, fontWeight: '700' },
    upiCancel: { alignItems: 'center', paddingTop: 14 },
    noteRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    noteInputFlex: { flex: 1, marginBottom: 0 },
    cameraBtn: {
      width: 46,
      height: 46,
      borderRadius: 12,
      backgroundColor: theme.accentSoft,
      borderWidth: 1.5,
      borderColor: theme.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cameraBtnIcon: { fontSize: 20 },
    billPreviewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 12,
      backgroundColor: theme.bg,
      borderRadius: 12,
      padding: 8,
    },
    billThumb: { width: 56, height: 56, borderRadius: 10 },
    billAttached: { fontWeight: '800', color: theme.ink, fontSize: 13 },
    removeBill: { color: theme.red, fontWeight: '700', fontSize: 12, marginTop: 4 },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    headerBtn: { color: theme.accent, fontWeight: '700', fontSize: 15, minWidth: 56 },
    headerSave: { fontWeight: '800', textAlign: 'right' },
    modalTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: theme.ink,
      textAlign: 'center',
      flex: 1,
    },
    kindTabs: {
      flexDirection: 'row',
      borderWidth: 1.5,
      borderColor: theme.ink,
      borderRadius: 10,
      overflow: 'hidden',
      marginBottom: 12,
    },
    kindTab: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      backgroundColor: theme.accentSoft,
    },
    cardActionRow: { flexDirection: 'row', gap: 10, paddingTop: 4 },
    cardActionCell: {
      flex: 1,
      alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.line,
      backgroundColor: theme.card,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 8,
    },
    cardActionIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.accentSoft,
      marginBottom: 8,
    },
    cardActionTitle: {
      color: theme.ink,
      fontWeight: '800',
      fontSize: 12,
      textAlign: 'center',
    },
    cardActionSub: {
      color: theme.muted,
      fontSize: 10,
      lineHeight: 13,
      fontWeight: '600',
      textAlign: 'center',
      marginTop: 4,
    },
    kindTabOn: { backgroundColor: theme.header },
    kindTabText: { fontWeight: '700', fontSize: 13.5, color: theme.ink },
    kindTabTextOn: { color: '#fff' },
    fieldLabel: {
      color: theme.muted,
      fontWeight: '700',
      fontSize: 12,
      marginBottom: 6,
      marginTop: 4,
    },
    fieldHint: {
      fontSize: 11,
      fontWeight: '600',
      marginBottom: 8,
      marginTop: -2,
      lineHeight: 15,
    },
    fieldInput: {
      borderWidth: 1.5,
      borderColor: theme.line,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 10,
      color: theme.ink,
      backgroundColor: theme.bg,
      fontSize: 14,
    },
    amountDisplay: { alignItems: 'center', marginBottom: 8 },
    amountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      maxWidth: '100%',
    },
    amountSym: {
      fontSize: 36,
      fontWeight: '800',
      color: theme.ink,
      letterSpacing: -0.5,
      marginRight: 2,
    },
    amountInput: {
      fontSize: 36,
      fontWeight: '800',
      color: theme.ink,
      letterSpacing: -0.5,
      padding: 0,
      margin: 0,
      minWidth: 48,
      maxWidth: 260,
      textAlign: 'left',
    },
    catTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    tagIc: {
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    catTagText: { fontWeight: '800', color: theme.ink, fontSize: 15 },
    catScroll: { flexGrow: 0 },
    catSection: { marginBottom: 8 },
    catSectionTitle: {
      color: theme.muted,
      fontWeight: '800',
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 8,
      marginLeft: 4,
    },
    catGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    catCell: {
      width: '25%',
      alignItems: 'center',
      marginBottom: 12,
      paddingHorizontal: 2,
    },
    catIcon: {
      width: 52,
      height: 52,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 5,
    },
    catLabel: { fontSize: 10, fontWeight: '700', color: theme.muted, textAlign: 'center' },
    accountScroll: { marginBottom: 8, maxHeight: 42 },
    accountChip: {
      borderWidth: 1.5,
      borderColor: theme.line,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: theme.bg,
      marginRight: 8,
    },
    accountChipOn: {
      backgroundColor: theme.header,
      borderColor: theme.header,
    },
    accountChipText: { fontWeight: '700', color: theme.ink, fontSize: 13 },
    accountChipTextOn: { color: '#fff' },
    keypad: {
      marginTop: 2,
      marginBottom: 8,
      gap: 5,
    },
    keypadCollapsed: {
      alignSelf: 'flex-start',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: theme.bg,
      borderWidth: 1,
      borderColor: theme.line,
      marginBottom: 10,
    },
    keypadCollapsedText: {
      color: theme.header,
      fontWeight: '800',
      fontSize: 12,
    },
    keypadRow: {
      flexDirection: 'row',
      gap: 5,
    },
    key: {
      flex: 1,
      height: 42,
      borderRadius: 12,
      backgroundColor: theme.bg,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.line,
    },
    keyPressed: {
      backgroundColor: theme.accentSoft,
      borderColor: theme.accent,
    },
    keyText: {
      fontSize: 19,
      fontWeight: '700',
      color: theme.ink,
    },
    keyBack: {
      fontSize: 18,
      color: theme.muted,
    },
    groceryCard: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.line,
      borderRadius: 14,
      padding: 14,
      marginTop: 6,
      marginBottom: 8,
    },
    groceryTitle: { fontWeight: '800', fontSize: 13.5, color: theme.ink, marginBottom: 2 },
    groceryHint: { fontSize: 12, color: theme.muted, marginBottom: 10, lineHeight: 16 },
    expiryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    addItemBtn: {
      borderWidth: 1.5,
      borderColor: theme.header,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    addItemBtnText: { fontWeight: '800', color: theme.header },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    perishableChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: theme.bg,
      borderRadius: 20,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: theme.line,
    },
    perishableChipText: { fontSize: 12, fontWeight: '700', color: theme.ink },
    chipX: { color: theme.muted, fontWeight: '800', fontSize: 12 },
    saveBtn: {
      backgroundColor: theme.header,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      alignSelf: 'stretch',
    },
    saveBtnDisabled: {
      opacity: 0.45,
    },
    saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  });
}

