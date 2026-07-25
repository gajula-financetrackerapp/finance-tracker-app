import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { formatAmountDigits, monthKey } from '../utils';
import { GuestBanner } from '../components/Shared';
import { CategoryDonut } from '../components/CategoryDonut';
import { PremiumHeaderFill } from '../components/PremiumChrome';
import { useT } from '../i18n/useT';
import { dateLocaleForLanguage } from '../i18n/dateLocales';

const APP_START_YEAR = 2026;
const MONTH_WINDOW = 24;

type ChartKind = 'expense' | 'income';
type PeriodPickerKind = 'year' | 'month' | null;

function monthName(monthNum: string, language: string | null | undefined) {
  const m = Number(monthNum);
  if (!m || m < 1 || m > 12) return monthNum;
  return new Date(2000, m - 1, 1).toLocaleDateString(dateLocaleForLanguage(language), {
    month: 'short',
  });
}

/** Rolling last N months ending at `from`, never before Jan 2026. Newest first. */
function buildMonthWindow(from = new Date()): string[] {
  const keys: string[] = [];
  for (let i = 0; i < MONTH_WINDOW; i += 1) {
    const d = new Date(from.getFullYear(), from.getMonth() - i, 1);
    if (d.getFullYear() < APP_START_YEAR) break;
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

export function ChartsScreen() {
  const { finance, config, catMeta, theme } = useApp();
  const { t, catName } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [chartKind, setChartKind] = useState<ChartKind>('expense');
  const [kindPickerOpen, setKindPickerOpen] = useState(false);
  const [periodPicker, setPeriodPicker] = useState<PeriodPickerKind>(null);
  /** Independent of Home — Charts keeps its own selected month. */
  const [viewMonth, setViewMonth] = useState(monthKey());

  // Reset to current month + Expenses whenever Charts is focused again.
  useFocusEffect(
    useCallback(() => {
      setViewMonth(monthKey());
      setChartKind('expense');
      setPeriodPicker(null);
      setKindPickerOpen(false);
    }, []),
  );

  const selectedYear = viewMonth.slice(0, 4);
  const selectedMonth = viewMonth.slice(5, 7);

  const allowedMonths = useMemo(() => buildMonthWindow(), []);

  const yearOptions = useMemo(() => {
    const years = new Set(allowedMonths.map((key) => key.slice(0, 4)));
    return [...years].sort((a, b) => Number(b) - Number(a));
  }, [allowedMonths]);

  const monthOptions = useMemo(() => {
    return allowedMonths
      .filter((key) => key.startsWith(`${selectedYear}-`))
      .map((key) => {
        const value = key.slice(5, 7);
        return { value, label: monthName(value, config.language) };
      });
  }, [allowedMonths, selectedYear, config.language]);

  useEffect(() => {
    if (!allowedMonths.includes(viewMonth)) {
      const sameYear = allowedMonths.find((key) => key.startsWith(`${selectedYear}-`));
      setViewMonth(sameYear || allowedMonths[0]);
      return;
    }
    if (monthOptions.length && !monthOptions.some((o) => o.value === selectedMonth)) {
      setViewMonth(`${selectedYear}-${monthOptions[0].value}`);
    }
  }, [allowedMonths, viewMonth, selectedYear, selectedMonth, monthOptions]);

  const setYear = (year: string) => {
    const match =
      allowedMonths.find((key) => key.startsWith(`${year}-${selectedMonth}`)) ||
      allowedMonths.find((key) => key.startsWith(`${year}-`));
    if (match) setViewMonth(match);
    setPeriodPicker(null);
  };

  const setMonth = (month: string) => {
    const next = `${selectedYear}-${month}`;
    if (allowedMonths.includes(next)) setViewMonth(next);
    setPeriodPicker(null);
  };

  const filteredTxns = useMemo(() => {
    return finance.transactions.filter(
      (txn) => txn.kind === chartKind && txn.date.startsWith(viewMonth),
    );
  }, [finance.transactions, viewMonth, chartKind]);

  const totalAmount = useMemo(
    () => filteredTxns.reduce((s, txn) => s + txn.amount, 0),
    [filteredTxns],
  );

  const byCat = useMemo(() => {
    const map: Record<string, number> = {};
    filteredTxns.forEach((txn) => {
      map[txn.category] = (map[txn.category] || 0) + txn.amount;
    });
    return Object.entries(map)
      .map(([name, total]) => ({ name, total, color: catMeta(name, chartKind).color }))
      .sort((a, b) => b.total - a.total);
  }, [filteredTxns, catMeta, chartKind]);

  const periodLabel = `${monthName(selectedMonth, config.language)} ${selectedYear}`;
  const kindLabel = chartKind === 'expense' ? t('charts.expenses') : t('charts.income');
  const emptyLabel = chartKind === 'expense' ? t('charts.empty') : t('charts.emptyIncome');

  const pickKind = (kind: ChartKind) => {
    setChartKind(kind);
    setKindPickerOpen(false);
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <PremiumHeaderFill />
        <Pressable
          onPress={() => setKindPickerOpen(true)}
          style={styles.titleDrop}
          accessibilityRole="button"
          accessibilityLabel={kindLabel}
        >
          <Text style={styles.title}>{kindLabel}</Text>
          <Text style={styles.titleChevron}>▾</Text>
        </Pressable>
        <View style={styles.monthBox}>
          <Pressable
            onPress={() => setPeriodPicker('year')}
            style={styles.periodDrop}
            accessibilityRole="button"
            accessibilityLabel="Year"
          >
            <Text style={styles.periodDropText}>{selectedYear}</Text>
            <Text style={styles.periodDropChevron}>▾</Text>
          </Pressable>
          <Pressable
            onPress={() => setPeriodPicker('month')}
            style={styles.periodDrop}
            accessibilityRole="button"
            accessibilityLabel="Month"
          >
            <Text style={styles.periodDropText}>
              {monthName(selectedMonth, config.language)}
            </Text>
            <Text style={styles.periodDropChevron}>▾</Text>
          </Pressable>
        </View>
      </View>
      <GuestBanner />

      <Modal
        visible={kindPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setKindPickerOpen(false)}
      >
        <View style={styles.kindBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setKindPickerOpen(false)}
          />
          <View style={[styles.kindCard, { backgroundColor: theme.card }]}>
            {(
              [
                { id: 'expense' as const, label: t('charts.expenses') },
                { id: 'income' as const, label: t('charts.income') },
              ] as const
            ).map((opt) => {
              const on = opt.id === chartKind;
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => pickKind(opt.id)}
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
        visible={periodPicker != null}
        transparent
        animationType="fade"
        onRequestClose={() => setPeriodPicker(null)}
      >
        <View style={styles.kindBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setPeriodPicker(null)}
          />
          <View style={[styles.periodModalCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.periodModalTitle, { color: theme.ink }]}>
              {periodPicker === 'year' ? 'Year' : 'Month'}
            </Text>
            <ScrollView style={styles.periodModalList} keyboardShouldPersistTaps="handled">
              {periodPicker === 'year'
                ? yearOptions.map((year) => {
                    const on = year === selectedYear;
                    return (
                      <Pressable
                        key={year}
                        onPress={() => setYear(year)}
                        style={[
                          styles.periodModalRow,
                          { borderTopColor: theme.line },
                          on && { backgroundColor: theme.accentSoft },
                        ]}
                      >
                        <Text
                          style={[
                            styles.periodModalRowText,
                            { color: theme.ink },
                            on && { color: theme.header, fontWeight: '800' },
                          ]}
                        >
                          {year}
                        </Text>
                        {on ? (
                          <Text style={{ color: theme.header, fontWeight: '800' }}>✓</Text>
                        ) : null}
                      </Pressable>
                    );
                  })
                : monthOptions.map((opt) => {
                    const on = opt.value === selectedMonth;
                    return (
                      <Pressable
                        key={opt.value}
                        onPress={() => setMonth(opt.value)}
                        style={[
                          styles.periodModalRow,
                          { borderTopColor: theme.line },
                          on && { backgroundColor: theme.accentSoft },
                        ]}
                      >
                        <Text
                          style={[
                            styles.periodModalRowText,
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
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.periodRow}>
          <Text style={styles.periodActive}>{periodLabel}</Text>
        </View>

        <View style={styles.chartCard}>
          <CategoryDonut
            slices={byCat.map((c) => ({
              name: catName(c.name),
              value: c.total,
              color: c.color,
            }))}
            currencyCode={config.currency}
            centerLabel={formatAmountDigits(Math.round(totalAmount), config.currency, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })}
          />
          <View style={styles.legendCol}>
            {byCat.length === 0 ? (
              <Text style={{ color: theme.muted }}>{emptyLabel}</Text>
            ) : (
              byCat.map((row) => {
                const pct = totalAmount ? Math.round((row.total / totalAmount) * 100) : 0;
                return (
                  <View key={row.name} style={styles.legendRow}>
                    <View style={[styles.dot, { backgroundColor: row.color }]} />
                    <Text style={styles.legendName} numberOfLines={1}>
                      {catName(row.name)}
                    </Text>
                    <Text style={styles.legendPct}>{pct}%</Text>
                  </View>
                );
              })
            )}
          </View>
        </View>

        {byCat.map((row) => {
          const meta = catMeta(row.name, chartKind);
          const pct = totalAmount ? (row.total / totalAmount) * 100 : 0;
          return (
            <View key={row.name} style={styles.barCard}>
              <View style={styles.barTop}>
                <View style={[styles.catIcon, { backgroundColor: meta.color + '22' }]}>
                  <Text>{meta.icon}</Text>
                </View>
                <Text style={styles.barName}>
                  {catName(row.name)} {Math.round(pct)}%
                </Text>
                <Text style={styles.barAmt}>{fmt(row.total, config.currency)}</Text>
              </View>
              <View style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    { width: `${Math.min(100, pct)}%` as `${number}%`, backgroundColor: meta.color },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bg },
    header: {
      backgroundColor: theme.header,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 16,
      overflow: 'hidden',
    },
    titleDrop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginBottom: 12,
      alignSelf: 'center',
    },
    title: { color: '#fff', fontWeight: '800', fontSize: 18, textAlign: 'center' },
    titleChevron: { color: 'rgba(255,255,255,0.9)', fontWeight: '800', fontSize: 14 },
    monthBox: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
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
    body: { padding: 16, paddingBottom: 110 },
    periodRow: { flexDirection: 'row', marginBottom: 12 },
    periodActive: {
      fontWeight: '800',
      color: theme.header,
      borderBottomWidth: 3,
      borderBottomColor: theme.accent,
      paddingBottom: 6,
    },
    chartCard: {
      backgroundColor: theme.card,
      borderRadius: 18,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
      borderWidth: 1,
      borderColor: theme.line,
      gap: 8,
    },
    legendCol: { flex: 1, gap: 8, paddingLeft: 4 },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    legendName: { flex: 1, fontWeight: '700', color: theme.ink, fontSize: 13 },
    legendPct: { color: theme.muted, fontWeight: '700', fontSize: 13 },
    barCard: {
      backgroundColor: theme.card,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: theme.line,
    },
    barTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 10 },
    catIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    barName: { flex: 1, fontWeight: '700', color: theme.ink },
    barAmt: { fontWeight: '800', color: theme.ink },
    track: { height: 8, backgroundColor: theme.track, borderRadius: 6, overflow: 'hidden' },
    fill: { height: 8, borderRadius: 6 },
  });
}
