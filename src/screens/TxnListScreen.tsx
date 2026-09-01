import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFinance } from '../FinanceContext';
import { useApp } from '../context/AppContext';
import { requireAuthToSave } from '../authGate';
import { showAppDialog, showAppInfo } from '../appDialog';
import { fmt } from '../theme';
import {
  accountChipLabel,
  bankSideTotals,
  CARD_BILL_CATEGORY,
  creditCardAccountIds,
  cardSideTotals,
  isCardBillTransfer,
  sortAccountsForDisplay,
} from '../cashBooks';
import type { Transaction, ThemeTokens } from '../types';
import { groupItemsByDate } from '../utils/dateGroups';
import { withAlpha } from '../utils/buildTheme';
import { GuestBanner } from '../components/Shared';
import { BottomSheet } from '../components/BottomSheet';
import { CategoryIconPicker } from '../components/CategoryIconPicker';
import { PremiumHeaderFill } from '../components/PremiumChrome';
import {
  PeriodFilterBar,
  PERIOD_ALL,
  defaultPeriodFilter,
  matchesPeriodDate,
  periodMonthKey,
  type PeriodFilterValue,
} from '../components/PeriodFilterBar';
import { RootStackParamList } from '../navigation/types';
import { useT } from '../i18n/useT';
import { txnSourceMessage } from '../lib/txnSource';
import { isHiddenOnHome } from '../lib/splitHomeFold';
import { useSplitSettleHomePrompt } from '../lib/useSplitSettleHomePrompt';
import { SplitTxnPaidBy } from '../components/SplitTxnPaidBy';
import { splitExpenseNoteParts } from '../lib/splitFinanceNote';

type Props = NativeStackScreenProps<RootStackParamList, 'TxnList'>;

export function TxnListScreen({ route }: Props) {
  const initialKind = route.params?.kind === 'income' ? 'income' : 'expense';
  const { setCurrentMonth, setShowAdd, setEditingTxn } = useFinance();
  const {
    finance,
    config,
    deleteTransaction,
    updateTransaction,
    catMeta,
    expenseCategories,
    incomeCategories,
    theme,
  } = useApp();
  const { t, catName } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const homePrefs = config.homePrefs;
  useSplitSettleHomePrompt();
  const listRef = useRef<SectionList<Transaction> | FlatList<Transaction>>(null);

  const [period, setPeriod] = useState<PeriodFilterValue>(defaultPeriodFilter);
  const [listKind, setListKind] = useState<'income' | 'expense'>(initialKind);
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
  const [iconTxn, setIconTxn] = useState<Transaction | null>(null);
  const [expenseAccountFilter, setExpenseAccountFilter] = useState<string>('all');

  const scrollListToTop = useCallback(() => {
    const list = listRef.current as
      | { scrollToOffset?: (opts: { offset: number; animated?: boolean }) => void }
      | null;
    list?.scrollToOffset?.({ offset: 0, animated: false });
  }, []);

  useFocusEffect(
    useCallback(() => {
      setListKind(route.params?.kind === 'income' ? 'income' : 'expense');
      const next = defaultPeriodFilter();
      setPeriod(next);
      setCurrentMonth(`${next.year}-${next.month}`);
      scrollListToTop();
    }, [route.params?.kind, setCurrentMonth, scrollListToTop]),
  );

  const yearsFromData = useMemo(() => {
    const years: string[] = [];
    for (const txn of finance.transactions) {
      const y = (txn.date || '').slice(0, 4);
      if (/^\d{4}$/.test(y)) years.push(y);
    }
    return years;
  }, [finance.transactions]);

  const onPeriodChange = useCallback(
    (next: PeriodFilterValue) => {
      setPeriod(next);
      const key = periodMonthKey(next);
      if (key) setCurrentMonth(key);
      else setCurrentMonth(`${next.year}-01`);
      scrollListToTop();
    },
    [setCurrentMonth, scrollListToTop],
  );

  useEffect(() => {
    setExpenseAccountFilter('all');
  }, [period, listKind]);

  useEffect(() => {
    scrollListToTop();
  }, [listKind, scrollListToTop]);

  const accountFilterOptions = useMemo(() => {
    const accounts = sortAccountsForDisplay(finance.accounts).filter((a) => !a.excluded);
    return [
      { id: 'all', label: t('home.filterAllAccounts') },
      ...accounts.map((a) => ({ id: a.id, label: accountChipLabel(a) })),
    ];
  }, [finance.accounts, t]);

  const periodTxns = useMemo(
    () =>
      finance.transactions.filter(
        (txn) => !isHiddenOnHome(txn) && matchesPeriodDate(txn.date, period),
      ),
    [finance.transactions, period],
  );

  const cardIds = useMemo(
    () => creditCardAccountIds(finance.accounts),
    [finance.accounts],
  );

  const cardSummary = useMemo(
    () => cardSideTotals(finance.accounts, periodTxns, () => true),
    [finance.accounts, periodTxns],
  );

  // The bank side only, exactly as Home reads it; the card has its own row.
  const monthSummary = useMemo(
    () => bankSideTotals(finance.accounts, periodTxns, () => true),
    [finance.accounts, periodTxns],
  );

  const filteredTxns = useMemo(() => {
    // A bill the bank paid belongs on the card as income, not in bank expenses.
    // All is every account, so card credits sit next to bank income there.
    const cardIncomeView =
      listKind === 'income' &&
      (expenseAccountFilter === 'all' || cardIds.has(expenseAccountFilter));
    const cardBillCredit = (txn: Transaction) =>
      txn.kind === 'income' &&
      txn.category === CARD_BILL_CATEGORY &&
      !!txn.accountId &&
      cardIds.has(txn.accountId);
    let list = periodTxns.filter(
      (txn) =>
        (txn.kind === listKind &&
          !(listKind === 'expense' && txn.category === CARD_BILL_CATEGORY) &&
          !(listKind === 'income' && !cardIncomeView && cardBillCredit(txn))) ||
        (cardIncomeView && isCardBillTransfer(txn, cardIds)),
    );
    if (listKind === 'expense' || listKind === 'income') {
      if (expenseAccountFilter !== 'all') {
        list = list.filter((txn) =>
          txn.kind === 'transfer'
            ? (cardIncomeView ? txn.toAccountId : txn.fromAccountId) === expenseAccountFilter
            : txn.accountId === expenseAccountFilter,
        );
      }
    }
    const indexOf = new Map(finance.transactions.map((txn, i) => [txn.id, i]));
    const byLatest = (a: Transaction, b: Transaction) => {
      const byDate = b.date.localeCompare(a.date);
      if (byDate !== 0) return byDate;
      return (indexOf.get(a.id) ?? 0) - (indexOf.get(b.id) ?? 0);
    };
    const byOldest = (a: Transaction, b: Transaction) => -byLatest(a, b);
    switch (homePrefs.sortOrder) {
      case 'oldest':
        return [...list].sort(byOldest);
      case 'amount_high':
        return [...list].sort((a, b) => b.amount - a.amount || byLatest(a, b));
      case 'amount_low':
        return [...list].sort((a, b) => a.amount - b.amount || byLatest(a, b));
      case 'newest':
      default:
        return [...list].sort(byLatest);
    }
  }, [
    periodTxns,
    listKind,
    homePrefs.sortOrder,
    expenseAccountFilter,
    finance.transactions,
    cardIds,
  ]);

  const filteredListTotal = useMemo(() => {
    return filteredTxns.reduce((s, txn) => s + (Math.abs(txn.amount) || 0), 0);
  }, [filteredTxns]);

  const accountFilterActive = expenseAccountFilter !== 'all';

  const groupByDay =
    period.day === PERIOD_ALL &&
    (homePrefs.sortOrder === 'newest' || homePrefs.sortOrder === 'oldest');

  const daySections = useMemo(() => {
    if (!groupByDay) return null;
    return groupItemsByDate(
      filteredTxns,
      (txn) => txn.date,
      config.language,
      { today: t('common.today'), yesterday: t('common.yesterday') },
    );
  }, [groupByDay, filteredTxns, config.language, t]);

  const periodHint =
    period.day !== PERIOD_ALL
      ? t('home.thisDay')
      : period.month !== PERIOD_ALL
        ? t('home.thisMonth')
        : t('home.thisYear');

  // Spell out the bank, since the card is reported on its own row below.
  const bankHint = cardSummary.count > 0 ? `${t('home.bank')} · ${periodHint}` : periodHint;

  /** Whole rupees, as on Home: paise cost width the summary needs for the figure. */
  const fmtWhole = (amount: number) => fmt(Math.round(amount), config.currency);

  const listHeader = (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterChipRow}
        style={styles.filterChipScroll}
      >
        {accountFilterOptions.map((opt) => {
          const on = expenseAccountFilter === opt.id;
          return (
            <Pressable
              key={opt.id}
              onPress={() => setExpenseAccountFilter(opt.id)}
              style={[
                styles.filterChip,
                {
                  borderColor: on ? theme.header : theme.line,
                  backgroundColor: on ? theme.accentSoft : theme.card,
                },
              ]}
            >
              <Text
                style={[styles.filterChipText, { color: on ? theme.header : theme.ink }]}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={styles.listTitle}>
        {listKind === 'income' ? t('home.income') : t('home.expenses')} ·{' '}
        {filteredTxns.length} {t('home.records')}
      </Text>
      {accountFilterActive ? (
        <Text style={styles.filterTotal}>
          {t('home.filterTotal')}: {fmt(filteredListTotal, config.currency)}
        </Text>
      ) : null}
    </View>
  );

  const listEmpty = (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>{listKind === 'income' ? '💰' : '🧾'}</Text>
      <Text style={styles.emptyTitle}>
        {listKind === 'income' ? t('home.noIncome') : t('home.noExpenses')}
      </Text>
      <Text style={styles.emptySub}>{t('home.tapAdd')}</Text>
    </View>
  );

  const renderTxnRow = (item: Transaction, hideDate: boolean) => {
    const kind = item.kind === 'income' ? 'income' : 'expense';
    const meta = catMeta(item.category, kind);
    const isBill = isCardBillTransfer(item, cardIds);
    // Read from the card, a bill payment is money arriving, so it reads green.
    const incoming = item.kind === 'income' || (isBill && listKind === 'income');
    // A bill payment leaves the paying account, so show that one.
    const acctId = isBill ? item.fromAccountId : item.accountId;
    const acct = acctId ? finance.accounts.find((a) => a.id === acctId) : undefined;
    const acctLabel = acct ? accountChipLabel(acct) : null;
    const noteBody = splitExpenseNoteParts(item.note).body;
    const row = (
      <>
        <Pressable
          onPress={() => {
            if (isBill || item.kind === 'transfer') return;
            if (!requireAuthToSave('edit transactions')) return;
            setIconTxn(item);
          }}
          hitSlop={6}
          style={[styles.icon, { backgroundColor: meta.color + '22' }]}
        >
          <Text style={{ fontSize: 18 }}>{meta.icon}</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>
            {isBill ? t('home.cardBillPayment') : catName(item.category)}
          </Text>
          <Text style={styles.rowSub}>
            {[acctLabel, hideDate ? null : item.date, noteBody].filter(Boolean).join(' · ')}
          </Text>
          <SplitTxnPaidBy note={item.note} style={styles.rowPaidBy} />
        </View>
        {item.billImageUri ? <Text style={styles.billBadge}>🧾</Text> : null}
        <Text style={[styles.rowAmt, { color: incoming ? theme.green : theme.red }]}>
          {incoming ? '+' : '-'}
          {fmt(item.amount, config.currency)}
        </Text>
      </>
    );

    if (item.kind === 'expense' || item.kind === 'income' || isBill) {
      return (
        <Pressable style={styles.row} onPress={() => setSelectedTxn(item)}>
          {row}
        </Pressable>
      );
    }
    return <View style={styles.row}>{row}</View>;
  };

  const listContentStyle = {
    padding: 16,
    paddingBottom: Math.max(insets.bottom, 16) + 24,
    flexGrow: 1,
  };

  return (
    <View style={styles.root}>
      <GuestBanner />

      <View style={styles.filterStrip}>
        <PeriodFilterBar
          value={period}
          onChange={onPeriodChange}
          yearsFromData={yearsFromData}
          language={config.language}
        />
      </View>

      <View style={styles.summaryBand}>
        <PremiumHeaderFill />
        <View style={styles.statsRow}>
          <Pressable
            style={[styles.statTab, listKind === 'expense' && styles.statTabOn]}
            onPress={() => setListKind('expense')}
          >
            <Text
              style={[styles.statLabel, listKind === 'expense' && styles.statLabelOn]}
              numberOfLines={1}
            >
              {t('home.expenses')}
            </Text>
            <Text
              style={[styles.statValue, listKind === 'expense' && styles.statValueOn]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {fmtWhole(monthSummary.expenses)}
            </Text>
            <Text
              style={[
                styles.statHint,
                listKind === 'expense' && { color: 'rgba(255,255,255,0.75)' },
              ]}
              numberOfLines={1}
            >
              {bankHint}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.statTab, listKind === 'income' && styles.statTabOn]}
            onPress={() => setListKind('income')}
          >
            <Text
              style={[styles.statLabel, listKind === 'income' && styles.statLabelOn]}
              numberOfLines={1}
            >
              {t('home.income')}
            </Text>
            <Text
              style={[styles.statValue, listKind === 'income' && styles.statValueOn]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {fmtWhole(monthSummary.income)}
            </Text>
            <Text
              style={[
                styles.statHint,
                listKind === 'income' && { color: 'rgba(255,255,255,0.75)' },
              ]}
              numberOfLines={1}
            >
              {bankHint}
            </Text>
          </Pressable>

          <View style={styles.statBalance}>
            <Text style={styles.statLabel} numberOfLines={1}>
              {t('home.balance')}
            </Text>
            <Text
              style={styles.statValue}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {fmtWhole(monthSummary.balance)}
            </Text>
            <Text style={styles.statHint} numberOfLines={1}>
              {bankHint}
            </Text>
          </View>
        </View>

        {cardSummary.count > 0 ? (
          <View style={styles.cardStatsRow}>
            {[
              { key: 'expenses', label: t('home.cardExpenses'), value: cardSummary.expenses },
              { key: 'billPaid', label: t('home.cardBillPaid'), value: cardSummary.billPaid },
            ].map((item) => (
              <View key={item.key} style={styles.cardStat}>
                <Text style={styles.cardStatLabel} numberOfLines={1}>
                  {item.label}
                </Text>
                <Text
                  style={styles.cardStatValue}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {fmtWhole(item.value)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {daySections ? (
        <SectionList
          ref={listRef as React.RefObject<SectionList<Transaction>>}
          sections={daySections}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={listContentStyle}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator
          ListHeaderComponent={listHeader}
          ListEmptyComponent={listEmpty}
          renderSectionHeader={({ section }) =>
            section.data.length ? (
              <Text style={styles.dayHeader}>{section.title}</Text>
            ) : null
          }
          renderItem={({ item }) => renderTxnRow(item, true)}
        />
      ) : (
        <FlatList
          ref={listRef as React.RefObject<FlatList<Transaction>>}
          data={filteredTxns}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={listContentStyle}
          showsVerticalScrollIndicator
          ListHeaderComponent={listHeader}
          ListEmptyComponent={listEmpty}
          renderItem={({ item }) => renderTxnRow(item, false)}
        />
      )}

      <TxnDetailSheet
        txn={selectedTxn}
        currency={config.currency}
        onClose={() => setSelectedTxn(null)}
        onChangeIcon={() => {
          if (!selectedTxn) return;
          if (selectedTxn.kind === 'transfer') return;
          if (!requireAuthToSave('edit transactions')) return;
          setIconTxn(selectedTxn);
        }}
        onEdit={() => {
          if (!selectedTxn) return;
          if (!requireAuthToSave('edit transactions')) return;
          const txn = selectedTxn;
          setSelectedTxn(null);
          setEditingTxn(txn);
          setShowAdd(true);
        }}
        onDelete={() => {
          if (!selectedTxn) return;
          if (!requireAuthToSave('delete transactions')) return;
          const txn = selectedTxn;
          showAppDialog({
            title: t('home.deleteTxn'),
            message: `${catName(txn.category)} · ${fmt(txn.amount, config.currency)}`,
            icon: '🗑',
            buttons: [
              { text: t('home.cancel'), style: 'cancel' },
              {
                text: t('home.delete'),
                style: 'destructive',
                onPress: () => {
                  void deleteTransaction(txn.id).then(() => {
                    setSelectedTxn(null);
                    showAppInfo(t('common.deleted'), t('home.txnDeleted'), '🗑');
                  });
                },
              },
            ],
          });
        }}
      />
      <CategoryIconPicker
        visible={!!iconTxn}
        current={iconTxn?.category || ''}
        categories={(iconTxn?.kind === 'income' ? incomeCategories : expenseCategories).filter(
          (c) => c.name !== CARD_BILL_CATEGORY || iconTxn?.category === CARD_BILL_CATEGORY,
        )}
        onClose={() => setIconTxn(null)}
        onPick={(name) => {
          const txn = iconTxn;
          if (!txn || txn.kind === 'transfer') return;
          const next = { ...txn, category: name };
          void updateTransaction(next).then(() => {
            setIconTxn(null);
            setSelectedTxn((prev) => (prev?.id === txn.id ? next : prev));
          });
        }}
      />
    </View>
  );
}

function TxnDetailSheet({
  txn,
  currency,
  onClose,
  onChangeIcon,
  onEdit,
  onDelete,
}: {
  txn: Transaction | null;
  currency: string;
  onClose: () => void;
  onChangeIcon: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { finance, catMeta, theme } = useApp();
  const { t, catName } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const isExpense = txn?.kind === 'expense';
  const catKind = txn?.kind === 'income' ? 'income' : 'expense';
  const meta = txn ? catMeta(txn.category, catKind) : null;
  const sourceMessage = txn ? txnSourceMessage(txn) : null;
  const account = txn?.accountId
    ? finance.accounts.find((a) => a.id === txn.accountId)
    : null;
  const fromAccount =
    txn?.kind === 'transfer' && txn.fromAccountId
      ? finance.accounts.find((a) => a.id === txn.fromAccountId)
      : null;
  const toAccount =
    txn?.kind === 'transfer' && txn.toAccountId
      ? finance.accounts.find((a) => a.id === txn.toAccountId)
      : null;

  const noteParts = splitExpenseNoteParts(txn?.note);
  const itemFromNote = noteParts.body;

  const items =
    isExpense && txn?.groceryItems && txn.groceryItems.length > 0
      ? txn.groceryItems.map((g) => ({
          key: g.id,
          label: `${g.icon || '🛒'} ${g.name}`,
          qty: g.quantity?.trim() || '—',
        }))
      : isExpense && txn && (txn.itemName?.trim() || txn.quantity?.trim() || itemFromNote)
        ? [
            {
              key: 'single',
              label: txn.itemName?.trim() || itemFromNote || txn.category,
              qty: txn.quantity?.trim() || '—',
            },
          ]
        : isExpense && txn
          ? [
              {
                key: 'single',
                label: txn.category,
                qty: txn.quantity?.trim() || '—',
              },
            ]
          : [];

  return (
    <BottomSheet visible={!!txn} onClose={onClose} style={styles.detailSheet}>
      {!txn ? null : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.detailHeader}>
            {meta ? (
              <Pressable
                onPress={onChangeIcon}
                disabled={txn.kind === 'transfer'}
                hitSlop={6}
                style={[styles.detailIcon, { backgroundColor: meta.color + '22' }]}
              >
                <Text style={{ fontSize: 22 }}>{meta.icon}</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={onChangeIcon}
              disabled={txn.kind === 'transfer'}
              style={{ flex: 1 }}
            >
              <Text style={styles.detailTitle}>{catName(txn.category)}</Text>
            </Pressable>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.headerBtn}>{t('home.close')}</Text>
            </Pressable>
          </View>

          {isExpense ? (
            txn.billImageUri ? (
              <Image source={{ uri: txn.billImageUri }} style={styles.billImage} resizeMode="cover" />
            ) : (
              <View style={styles.billPlaceholder}>
                <Text style={styles.billPlaceholderIcon}>🧾</Text>
                <Text style={styles.billPlaceholderText}>{t('home.noBill')}</Text>
              </View>
            )
          ) : null}

          <View style={styles.detailMeta}>
            <Text style={styles.detailMetaLabel}>{t('home.txnDate')}</Text>
            <Text style={styles.detailMetaValue}>{txn.date}</Text>
          </View>
          <View style={styles.detailMeta}>
            <Text style={styles.detailMetaLabel}>{t('home.amount')}</Text>
            <Text
              style={[
                styles.detailMetaValue,
                { color: txn.kind === 'income' ? theme.green : theme.red },
              ]}
            >
              {txn.kind === 'income' ? '+' : '−'}
              {fmt(txn.amount, currency)}
            </Text>
          </View>

          {txn.kind === 'transfer' ? (
            <View style={styles.detailMeta}>
              <Text style={styles.detailMetaLabel}>{t('home.transfer')}</Text>
              <Text style={styles.detailMetaValue}>
                {fromAccount ? accountChipLabel(fromAccount) : '—'}
                {' → '}
                {toAccount ? accountChipLabel(toAccount) : '—'}
              </Text>
            </View>
          ) : (
            <View style={styles.detailMeta}>
              <Text style={styles.detailMetaLabel}>
                {txn.kind === 'income' ? t('home.receivedIn') : t('home.paidWith')}
              </Text>
              <Text style={styles.detailMetaValue}>
                {account ? accountChipLabel(account) : t('home.noAccount')}
              </Text>
            </View>
          )}

          {isExpense ? (
            <>
              <Text style={styles.itemsHeading}>{t('home.items')}</Text>
              <View style={styles.itemsTableHead}>
                <Text style={[styles.itemsColItem, styles.itemsHeadText]}>{t('home.item')}</Text>
                <Text style={[styles.itemsColQty, styles.itemsHeadText]}>{t('home.qty')}</Text>
              </View>
              {items.map((it) => (
                <View key={it.key} style={styles.itemsRow}>
                  <Text style={styles.itemsColItem}>{it.label}</Text>
                  <Text style={styles.itemsColQty}>{it.qty}</Text>
                </View>
              ))}
            </>
          ) : txn.note?.trim() ? (
            <View style={styles.detailMeta}>
              <Text style={styles.detailMetaLabel}>{t('home.note')}</Text>
              <Text style={styles.detailMetaValue}>{txn.note}</Text>
            </View>
          ) : null}

          {sourceMessage ? (
            <View style={styles.detailMeta}>
              <Text style={styles.detailMetaLabel}>{t('home.message')}</Text>
              <Text selectable style={styles.sourceMessage}>
                {sourceMessage}
              </Text>
            </View>
          ) : null}

          <SplitTxnPaidBy note={txn.note} style={styles.detailPaidBy} />

          <View style={styles.detailActions}>
            <Pressable style={[styles.detailBtn, { backgroundColor: theme.header }]} onPress={onEdit}>
              <Text style={styles.detailBtnText}>{t('home.edit')}</Text>
            </Pressable>
            <Pressable style={[styles.detailBtn, { backgroundColor: theme.red }]} onPress={onDelete}>
              <Text style={styles.detailBtnText}>{t('home.delete')}</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </BottomSheet>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bg },
    filterStrip: {
      backgroundColor: theme.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.line,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    // Kept compact on purpose: every line the summary gives up is another
    // transaction visible in the list underneath.
    summaryBand: {
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 8,
      overflow: 'hidden',
    },
    statsRow: { flexDirection: 'row', gap: 6 },
    statTab: {
      flex: 1,
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.08)',
      borderRadius: 12,
      paddingVertical: 7,
      paddingHorizontal: 5,
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
      paddingVertical: 7,
      paddingHorizontal: 5,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: withAlpha(theme.primary, '99'),
    },
    statLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 10, marginBottom: 2, fontWeight: '600' },
    statLabelOn: { color: '#fff', fontWeight: '800' },
    statValue: { color: 'rgba(255,255,255,0.85)', fontWeight: '800', fontSize: 13 },
    statValueOn: { color: '#fff' },
    statHint: {
      color: 'rgba(255,255,255,0.5)',
      fontSize: 9,
      fontWeight: '600',
      marginTop: 1,
    },
    cardStatsRow: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 6,
      paddingTop: 6,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: 'rgba(255,255,255,0.18)',
    },
    cardStat: { flex: 1, alignItems: 'center' },
    cardStatLabel: {
      color: 'rgba(255,255,255,0.55)',
      fontSize: 9,
      fontWeight: '600',
      marginBottom: 1,
    },
    cardStatValue: { color: 'rgba(255,255,255,0.9)', fontWeight: '800', fontSize: 11 },
    list: { flex: 1 },
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
    icon: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowTitle: { fontWeight: '700', color: theme.ink },
    rowSub: { color: theme.muted, fontSize: 12, marginTop: 2 },
    rowPaidBy: { color: theme.ink, fontSize: 12, fontWeight: '700', marginTop: 4 },
    rowAmt: { fontWeight: '800' },
    billBadge: { fontSize: 14 },
    detailSheet: { maxHeight: '88%' },
    detailHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
      gap: 10,
    },
    detailIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    detailTitle: { fontSize: 18, fontWeight: '800', color: theme.ink, flex: 1, paddingRight: 12 },
    headerBtn: { color: theme.accent, fontWeight: '700', fontSize: 15 },
    billImage: {
      width: '100%',
      height: 180,
      borderRadius: 12,
      marginBottom: 12,
      backgroundColor: theme.line,
    },
    billPlaceholder: {
      height: 120,
      borderRadius: 12,
      backgroundColor: theme.bg,
      borderWidth: 1,
      borderColor: theme.line,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    billPlaceholderIcon: { fontSize: 28, marginBottom: 6, opacity: 0.5 },
    billPlaceholderText: { color: theme.muted, fontWeight: '600', fontSize: 13 },
    detailMeta: { marginBottom: 10 },
    detailMetaLabel: {
      color: theme.muted,
      fontWeight: '700',
      fontSize: 11,
      textTransform: 'uppercase',
      marginBottom: 2,
    },
    detailMetaValue: { color: theme.ink, fontWeight: '700', fontSize: 15 },
    detailPaidBy: {
      color: theme.ink,
      fontWeight: '800',
      fontSize: 14,
      marginBottom: 14,
      marginTop: 4,
    },
    sourceMessage: {
      color: theme.ink,
      fontWeight: '600',
      fontSize: 14,
      lineHeight: 20,
      backgroundColor: theme.bg,
      borderWidth: 1,
      borderColor: theme.line,
      borderRadius: 12,
      padding: 12,
    },
    itemsHeading: {
      color: theme.ink,
      fontWeight: '800',
      fontSize: 14,
      marginTop: 6,
      marginBottom: 8,
    },
    itemsTableHead: { flexDirection: 'row', marginBottom: 4 },
    itemsHeadText: { color: theme.muted, fontWeight: '700', fontSize: 11 },
    itemsRow: {
      flexDirection: 'row',
      paddingVertical: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.line,
    },
    itemsColItem: { flex: 1, color: theme.ink, fontWeight: '600', fontSize: 13 },
    itemsColQty: { width: 64, textAlign: 'right', color: theme.ink, fontWeight: '700', fontSize: 13 },
    detailActions: { flexDirection: 'row', gap: 10, marginTop: 16, marginBottom: 8 },
    detailBtn: {
      flex: 1,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
    },
    detailBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  });
}
