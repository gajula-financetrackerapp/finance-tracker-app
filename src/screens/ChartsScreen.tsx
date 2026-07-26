import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { fmt } from '../theme';
import type { ThemeTokens } from '../types';
import { formatAmountDigits } from '../utils';
import { GuestBanner } from '../components/Shared';
import { CategoryDonut } from '../components/CategoryDonut';
import { PremiumHeaderFill } from '../components/PremiumChrome';
import {
  SpendingTrendsPanel,
  type GraphType,
} from '../components/SpendingTrendsPanel';
import { MonthComparePanel } from '../components/MonthComparePanel';
import { SmartInsightsButton } from '../components/SmartInsightsPanel';
import {
  PeriodFilterBar,
  defaultPeriodFilter,
  matchesPeriodDate,
  periodMonthKey,
  type PeriodFilterValue,
} from '../components/PeriodFilterBar';
import { useT } from '../i18n/useT';

type MoneyKind = 'expense' | 'income';
type ViewMode = 'categories' | GraphType;
type OpenPicker = 'money' | 'graph' | null;

export function ChartsScreen() {
  const { finance, config, catMeta, theme } = useApp();
  const { t, catName } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const scrollRef = useRef<ScrollView>(null);
  const [moneyKind, setMoneyKind] = useState<MoneyKind>('expense');
  const [viewMode, setViewMode] = useState<ViewMode>('categories');
  const [openPicker, setOpenPicker] = useState<OpenPicker>(null);
  const [period, setPeriod] = useState<PeriodFilterValue>(defaultPeriodFilter);

  useFocusEffect(
    useCallback(() => {
      setPeriod(defaultPeriodFilter());
      setMoneyKind('expense');
      setViewMode('categories');
      setOpenPicker(null);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, []),
  );

  const yearsFromData = useMemo(() => {
    const years: string[] = [];
    for (const txn of finance.transactions) {
      const y = (txn.date || '').slice(0, 4);
      if (/^\d{4}$/.test(y)) years.push(y);
    }
    return years;
  }, [finance.transactions]);

  const showGraphs = viewMode !== 'categories';

  const onPeriodChange = useCallback(
    (next: PeriodFilterValue) => {
      if (showGraphs && next.month === 'all') {
        setPeriod({ ...next, month: defaultPeriodFilter().month, day: 'all' });
        return;
      }
      setPeriod(next);
    },
    [showGraphs],
  );

  const pickMoney = (kind: MoneyKind) => {
    setMoneyKind(kind);
    setOpenPicker(null);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const pickView = (mode: ViewMode) => {
    setViewMode(mode);
    setOpenPicker(null);
    if (mode !== 'categories') {
      setPeriod((prev) =>
        prev.month === 'all'
          ? { ...prev, month: defaultPeriodFilter().month, day: 'all' }
          : prev,
      );
    }
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const filteredTxns = useMemo(() => {
    if (showGraphs) return [];
    return finance.transactions.filter(
      (txn) => txn.kind === moneyKind && matchesPeriodDate(txn.date, period),
    );
  }, [finance.transactions, period, moneyKind, showGraphs]);

  const totalAmount = useMemo(
    () => filteredTxns.reduce((s, txn) => s + txn.amount, 0),
    [filteredTxns],
  );

  const byCat = useMemo(() => {
    if (showGraphs) return [];
    const map: Record<string, { total: number; count: number }> = {};
    filteredTxns.forEach((txn) => {
      const cur = map[txn.category] || { total: 0, count: 0 };
      cur.total += txn.amount;
      cur.count += 1;
      map[txn.category] = cur;
    });
    return Object.entries(map)
      .map(([name, { total, count }]) => ({
        name,
        total,
        count,
        color: catMeta(name, moneyKind).color,
        icon: catMeta(name, moneyKind).icon,
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredTxns, catMeta, moneyKind, showGraphs]);

  const moneyLabel = moneyKind === 'expense' ? t('charts.expenses') : t('charts.income');
  const paceLabel =
    moneyKind === 'income' ? t('charts.graphPaceIncome') : t('charts.graphPace');
  const dailyLabel =
    moneyKind === 'income' ? t('charts.graphDailyIncome') : t('charts.graphDaily');
  const graphLabel =
    viewMode === 'categories'
      ? t('charts.categories')
      : viewMode === 'pace'
        ? paceLabel
        : viewMode === 'daily'
          ? dailyLabel
          : t('charts.graphCompare');
  const emptyLabel = moneyKind === 'expense' ? t('charts.empty') : t('charts.emptyIncome');

  const txnCountLabel = (count: number) =>
    count === 1
      ? t('charts.txnCountOne')
      : t('charts.txnCount').replace('{count}', String(count));

  const trendsMonth =
    periodMonthKey(period) || `${period.year}-${defaultPeriodFilter().month}`;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <PremiumHeaderFill />
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => setOpenPicker('money')}
            style={styles.headerDrop}
            accessibilityRole="button"
            accessibilityLabel={moneyLabel}
          >
            <Text style={styles.headerDropText} numberOfLines={1}>
              {moneyLabel}
            </Text>
            <Text style={styles.headerChevron}>▾</Text>
          </Pressable>

          <Pressable
            onPress={() => setOpenPicker('graph')}
            style={[styles.headerDrop, styles.headerDropRight]}
            accessibilityRole="button"
            accessibilityLabel={graphLabel}
          >
            <Text style={styles.headerDropText} numberOfLines={1}>
              {graphLabel}
            </Text>
            <Text style={styles.headerChevron}>▾</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.filterStrip}>
        <PeriodFilterBar
          value={period}
          onChange={onPeriodChange}
          yearsFromData={yearsFromData}
          language={config.language}
          allowAllMonths={!showGraphs}
        />
      </View>
      <GuestBanner />

      <SmartInsightsButton monthKey={trendsMonth} />

      <Modal
        visible={openPicker === 'money'}
        transparent
        animationType="fade"
        onRequestClose={() => setOpenPicker(null)}
      >
        <View style={styles.kindBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setOpenPicker(null)}
          />
          <View style={[styles.kindCard, { backgroundColor: theme.card }]}>
            {(
              [
                { id: 'expense' as const, label: t('charts.expenses') },
                { id: 'income' as const, label: t('charts.income') },
              ] as const
            ).map((opt) => {
              const on = opt.id === moneyKind;
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => pickMoney(opt.id)}
                  style={[
                    styles.kindRow,
                    { borderTopColor: theme.line },
                    on && { backgroundColor: theme.accentSoft },
                  ]}
                >
                  <Text
                    style={[
                      styles.kindRowText,
                      { color: theme.ink },
                      on && { color: theme.header, fontWeight: '800' },
                    ]}
                  >
                    {opt.label}
                  </Text>
                  {on ? (
                    <Text style={{ color: theme.header, fontWeight: '800' }}>✓</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>

      <Modal
        visible={openPicker === 'graph'}
        transparent
        animationType="fade"
        onRequestClose={() => setOpenPicker(null)}
      >
        <View style={styles.kindBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setOpenPicker(null)}
          />
          <View style={[styles.kindCard, { backgroundColor: theme.card }]}>
            {(
              [
                { id: 'categories' as const, label: t('charts.categories') },
                { id: 'pace' as const, label: paceLabel },
                { id: 'daily' as const, label: dailyLabel },
                { id: 'compare' as const, label: t('charts.graphCompare') },
              ] as const
            ).map((opt) => {
              const on = opt.id === viewMode;
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => pickView(opt.id)}
                  style={[
                    styles.kindRow,
                    { borderTopColor: theme.line },
                    on && { backgroundColor: theme.accentSoft },
                  ]}
                >
                  <Text
                    style={[
                      styles.kindRowText,
                      { color: theme.ink },
                      on && { color: theme.header, fontWeight: '800' },
                    ]}
                  >
                    {opt.label}
                  </Text>
                  {on ? (
                    <Text style={{ color: theme.header, fontWeight: '800' }}>✓</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>

      <ScrollView ref={scrollRef} contentContainerStyle={styles.body}>
        {showGraphs ? (
          viewMode === 'compare' ? (
            <MonthComparePanel
              endMonthKey={trendsMonth}
              transactions={finance.transactions}
              currencyCode={config.currency}
              language={config.language}
              moneyKind={moneyKind}
            />
          ) : (
            <SpendingTrendsPanel
              monthKey={trendsMonth}
              transactions={finance.transactions}
              currencyCode={config.currency}
              language={config.language}
              graphType={viewMode === 'pace' || viewMode === 'daily' ? viewMode : 'pace'}
              moneyKind={moneyKind}
            />
          )
        ) : (
          <>
            <View style={styles.chartWindow}>
              {byCat.length === 0 ? (
                <Text style={styles.emptyHint}>{emptyLabel}</Text>
              ) : (
                <CategoryDonut
                  slices={byCat.map((c) => ({
                    name: catName(c.name),
                    value: c.total,
                    color: c.color,
                    icon: c.icon,
                  }))}
                  size={176}
                  strokeWidth={24}
                  showCallouts
                  currencyCode={config.currency}
                  centerLabel={formatAmountDigits(Math.round(totalAmount), config.currency, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                />
              )}
            </View>

            {byCat.map((row) => {
              const pct = totalAmount ? Math.round((row.total / totalAmount) * 100) : 0;
              const amountColor = moneyKind === 'expense' ? theme.red : theme.green;
              const amountText =
                moneyKind === 'expense'
                  ? `−${fmt(row.total, config.currency)}`
                  : `+${fmt(row.total, config.currency)}`;
              return (
                <View key={row.name} style={styles.catRow}>
                  <View style={[styles.catIcon, { backgroundColor: row.color + '22' }]}>
                    <Text style={styles.catIconText}>{row.icon}</Text>
                  </View>
                  <View style={styles.catMeta}>
                    <Text style={styles.catName} numberOfLines={1}>
                      {catName(row.name)}
                    </Text>
                    <Text style={styles.catCount}>{txnCountLabel(row.count)}</Text>
                  </View>
                  <View style={styles.catRight}>
                    <Text style={[styles.catAmt, { color: amountColor }]}>{amountText}</Text>
                    <Text style={styles.catPct}>{pct}%</Text>
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
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
    header: {
      backgroundColor: theme.header,
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 8,
      overflow: 'hidden',
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    headerDrop: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: 4,
      minWidth: 0,
      paddingVertical: 4,
      paddingHorizontal: 4,
    },
    headerDropRight: {
      justifyContent: 'flex-end',
    },
    headerDropText: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 16,
      flexShrink: 1,
    },
    headerChevron: { color: 'rgba(255,255,255,0.9)', fontWeight: '800', fontSize: 13 },
    kindBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      paddingHorizontal: 28,
    },
    kindCard: {
      borderRadius: 16,
      overflow: 'hidden',
      paddingVertical: 4,
      marginHorizontal: 12,
    },
    kindRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 16,
      paddingHorizontal: 18,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    kindRowText: { fontSize: 16, fontWeight: '700' },
    body: { padding: 16, paddingBottom: 110 },
    chartWindow: {
      backgroundColor: theme.card,
      borderRadius: 20,
      paddingVertical: 18,
      paddingHorizontal: 8,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: theme.line,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 240,
    },
    emptyHint: {
      color: theme.muted,
      fontWeight: '600',
      textAlign: 'center',
      paddingVertical: 36,
    },
    catRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.card,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: theme.line,
      gap: 12,
    },
    catIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    catIconText: { fontSize: 20 },
    catMeta: { flex: 1, minWidth: 0 },
    catName: { fontWeight: '800', color: theme.ink, fontSize: 15 },
    catCount: { marginTop: 2, color: theme.muted, fontWeight: '600', fontSize: 12 },
    catRight: { alignItems: 'flex-end' },
    catAmt: { fontWeight: '800', fontSize: 14 },
    catPct: { marginTop: 2, color: theme.muted, fontWeight: '700', fontSize: 12 },
  });
}
