import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFinance } from '../FinanceContext';
import { useApp } from '../context/AppContext';
import { fmt } from '../theme';
import type { ThemeTokens } from '../types';
import { formatAmountDigits } from '../utils';
import { GuestBanner } from '../components/Shared';
import { CategoryDonut } from '../components/CategoryDonut';
import { PremiumHeaderFill } from '../components/PremiumChrome';
import { useT } from '../i18n/useT';

function shiftDays(iso: string, delta: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function ChartsScreen() {
  const { currentMonth } = useFinance();
  const { finance, config, catMeta, theme } = useApp();
  const { t, catName } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [range, setRange] = useState<'week' | 'month' | 'year'>('month');

  const filteredExpenses = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return finance.transactions.filter((t) => {
      if (t.kind !== 'expense') return false;
      if (range === 'month') return t.date.startsWith(currentMonth);
      if (range === 'year') return t.date.startsWith(currentMonth.slice(0, 4));
      // week = last 7 days including today
      const from = shiftDays(today, -6);
      return t.date >= from && t.date <= today;
    });
  }, [finance.transactions, currentMonth, range]);

  const monthExpenses = useMemo(
    () => filteredExpenses.reduce((s, t) => s + t.amount, 0),
    [filteredExpenses],
  );

  const byCat = useMemo(() => {
    const map: Record<string, number> = {};
    filteredExpenses.forEach((t) => {
      map[t.category] = (map[t.category] || 0) + t.amount;
    });
    return Object.entries(map)
      .map(([name, total]) => ({ name, total, color: catMeta(name, 'expense').color }))
      .sort((a, b) => b.total - a.total);
  }, [filteredExpenses, catMeta]);

  const periodLabel =
    range === 'week'
      ? t('charts.thisWeek')
      : range === 'year'
        ? t('charts.thisYear')
        : t('charts.thisMonth');

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <PremiumHeaderFill />
        <Text style={styles.title}>{t('charts.expenses')} ▾</Text>
        <View style={styles.seg}>
          {(['week', 'month', 'year'] as const).map((r) => (
            <Pressable
              key={r}
              onPress={() => setRange(r)}
              style={[styles.segBtn, range === r && styles.segOn]}
            >
              <Text style={[styles.segText, range === r && styles.segTextOn]}>
                {r === 'week'
                  ? t('charts.week')
                  : r === 'year'
                    ? t('charts.year')
                    : t('charts.month')}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <GuestBanner />

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
            centerLabel={formatAmountDigits(Math.round(monthExpenses), config.currency, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })}
          />
          <View style={styles.legendCol}>
            {byCat.length === 0 ? (
              <Text style={{ color: theme.muted }}>{t('charts.empty')}</Text>
            ) : (
              byCat.map((row) => {
                const pct = monthExpenses ? Math.round((row.total / monthExpenses) * 100) : 0;
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
          const meta = catMeta(row.name, 'expense');
          const pct = monthExpenses ? (row.total / monthExpenses) * 100 : 0;
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
    title: { color: '#fff', fontWeight: '800', fontSize: 18, textAlign: 'center', marginBottom: 12 },
    seg: {
      flexDirection: 'row',
      backgroundColor: 'rgba(255,255,255,0.12)',
      borderRadius: 12,
      padding: 4,
    },
    segBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 10 },
    segOn: { backgroundColor: theme.ink },
    segText: { color: '#fff', fontWeight: '700' },
    segTextOn: { color: '#fff' },
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
