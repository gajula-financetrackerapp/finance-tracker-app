import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFinance } from '../FinanceContext';
import { catMeta, fmt, theme } from '../theme';
import { Donut, GuestBanner } from '../components/Shared';

export function ChartsScreen() {
  const { transactions, currentMonth, monthSummary } = useFinance();
  const [range, setRange] = useState<'week' | 'month' | 'year'>('month');

  const byCat = useMemo(() => {
    const map: Record<string, number> = {};
    transactions
      .filter((t) => t.kind === 'expense' && t.date.startsWith(currentMonth))
      .forEach((t) => {
        map[t.category] = (map[t.category] || 0) + t.amount;
      });
    return Object.entries(map)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
  }, [transactions, currentMonth]);

  const top = byCat[0];

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Expenses ▾</Text>
        <View style={styles.seg}>
          {(['week', 'month', 'year'] as const).map((r) => (
            <Pressable key={r} onPress={() => setRange(r)} style={[styles.segBtn, range === r && styles.segOn]}>
              <Text style={[styles.segText, range === r && styles.segTextOn]}>
                {r[0].toUpperCase() + r.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <GuestBanner />

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.periodRow}>
          <Text style={styles.periodActive}>This month</Text>
        </View>

        <View style={styles.chartCard}>
          <Donut value={monthSummary.expenses} total={Math.max(monthSummary.expenses, 1)} color={theme.accent} />
          <View style={{ flex: 1, paddingLeft: 8 }}>
            {top ? (
              <View style={styles.legendRow}>
                <View style={[styles.dot, { backgroundColor: catMeta(top.name).color }]} />
                <Text style={styles.legendName}>{top.name}</Text>
                <Text style={styles.legendPct}>
                  {monthSummary.expenses
                    ? Math.round((top.total / monthSummary.expenses) * 100)
                    : 0}
                  %
                </Text>
              </View>
            ) : (
              <Text style={{ color: theme.muted }}>No expense categories yet</Text>
            )}
          </View>
        </View>

        {byCat.map((row) => {
          const meta = catMeta(row.name);
          const pct = monthSummary.expenses ? (row.total / monthSummary.expenses) * 100 : 0;
          return (
            <View key={row.name} style={styles.barCard}>
              <View style={styles.barTop}>
                <View style={[styles.catIcon, { backgroundColor: meta.color + '22' }]}>
                  <Text>{meta.icon}</Text>
                </View>
                <Text style={styles.barName}>
                  {row.name} {Math.round(pct)}%
                </Text>
                <Text style={styles.barAmt}>{fmt(row.total)}</Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${pct}%`, backgroundColor: meta.color }]} />
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  header: { backgroundColor: theme.header, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16 },
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
  segTextOn: { color: theme.accentSoft },
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
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendName: { flex: 1, fontWeight: '700', color: theme.ink },
  legendPct: { color: theme.muted, fontWeight: '700' },
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
