import React, { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFinance } from '../FinanceContext';
import { useApp } from '../context/AppContext';
import { fmt, monthLabel, theme } from '../theme';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'TxnList'>;

function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function TxnListScreen({ route }: Props) {
  const { kind } = route.params;
  const { currentMonth, setCurrentMonth } = useFinance();
  const { finance, config, catMeta } = useApp();
  const insets = useSafeAreaInsets();

  const isExpense = kind === 'expense';
  const accent = isExpense ? theme.red : theme.green;

  const txns = useMemo(
    () =>
      finance.transactions
        .filter((t) => t.kind === kind && t.date.startsWith(currentMonth))
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    [finance.transactions, kind, currentMonth],
  );

  const total = useMemo(() => txns.reduce((s, t) => s + t.amount, 0), [txns]);

  return (
    <View style={styles.root}>
      <View style={[styles.band, { backgroundColor: isExpense ? theme.header : theme.header }]}>
        <View style={styles.monthBox}>
          <Pressable onPress={() => setCurrentMonth(shiftMonth(currentMonth, -1))} hitSlop={10}>
            <Text style={styles.monthNav}>‹</Text>
          </Pressable>
          <Text style={styles.month}>{monthLabel(currentMonth)}</Text>
          <Pressable onPress={() => setCurrentMonth(shiftMonth(currentMonth, 1))} hitSlop={10}>
            <Text style={styles.monthNav}>›</Text>
          </Pressable>
        </View>
        <Text style={styles.totalLabel}>{isExpense ? 'Total expenses' : 'Total income'}</Text>
        <Text style={[styles.totalValue, { color: accent }]}>
          {isExpense ? '-' : '+'}
          {fmt(total, config.currency)}
        </Text>
        <Text style={styles.count}>
          {txns.length} record{txns.length === 1 ? '' : 's'}
        </Text>
      </View>

      <FlatList
        data={txns}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: Math.max(insets.bottom, 16) + 24,
          flexGrow: 1,
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>{isExpense ? '🧾' : '💰'}</Text>
            <Text style={styles.emptyTitle}>
              No {isExpense ? 'expenses' : 'income'} this month
            </Text>
            <Text style={styles.emptySub}>Tap + on Home to add one</Text>
          </View>
        }
        renderItem={({ item: t }) => {
          const meta = catMeta(t.category, kind);
          return (
            <View style={styles.row}>
              <View style={[styles.icon, { backgroundColor: `${meta.color}22` }]}>
                <Text style={{ fontSize: 18 }}>{meta.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{t.category}</Text>
                <Text style={styles.rowSub}>{t.note || t.date}</Text>
              </View>
              <Text style={[styles.rowAmt, { color: accent }]}>
                {isExpense ? '-' : '+'}
                {fmt(t.amount, config.currency)}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  band: {
    backgroundColor: theme.header,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 18,
    alignItems: 'center',
  },
  monthBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 12,
  },
  month: { color: '#fff', fontWeight: '800', fontSize: 16 },
  monthNav: { color: '#fff', fontSize: 24, paddingHorizontal: 4 },
  totalLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  totalValue: {
    fontSize: 28,
    fontWeight: '800',
    marginTop: 4,
    color: '#fff',
  },
  count: { color: 'rgba(255,255,255,0.65)', marginTop: 4, fontWeight: '600', fontSize: 12 },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 40, marginBottom: 10, opacity: 0.5 },
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
});
