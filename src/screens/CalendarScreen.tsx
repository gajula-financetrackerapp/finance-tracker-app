import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { fmt, theme } from '../theme';
import { currencySymbol, monthKey, shiftMonth } from '../utils';
import type { Transaction } from '../types';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function longMonth(key: string) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

function dayKey(year: number, monthIndex: number, day: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shortAmt(n: number) {
  const abs = Math.abs(n);
  if (abs >= 100000) return `${(abs / 100000).toFixed(abs % 100000 === 0 ? 0 : 1)}L`;
  if (abs >= 1000) return `${(abs / 1000).toFixed(abs % 1000 === 0 ? 0 : 1)}k`;
  return abs % 1 === 0 ? String(Math.round(abs)) : abs.toFixed(0);
}

function fullAmt(n: number, currencyCode: string) {
  const locale = currencyCode === 'INR' ? 'en-IN' : 'en-US';
  return Math.abs(n).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatSelectedDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
  return `${weekday} ${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y}`;
}

export function CalendarScreen() {
  const { finance, config, catMeta } = useApp();
  const insets = useSafeAreaInsets();
  const [month, setMonth] = useState(monthKey());
  const today = new Date().toISOString().slice(0, 10);
  const [selected, setSelected] = useState(today.startsWith(month) ? today : `${month}-01`);

  const [y, m] = month.split('-').map(Number);
  const monthIndex = m - 1;
  const daysInMonth = new Date(y, monthIndex + 1, 0).getDate();
  const startWeekday = new Date(y, monthIndex, 1).getDay();

  const byDate = useMemo(() => {
    const map: Record<string, { income: number; expense: number }> = {};
    finance.transactions.forEach((t) => {
      if (!t.date.startsWith(month)) return;
      if (!map[t.date]) map[t.date] = { income: 0, expense: 0 };
      if (t.kind === 'income') map[t.date].income += t.amount;
      else if (t.kind === 'expense') map[t.date].expense += t.amount;
    });
    return map;
  }, [finance.transactions, month]);

  const dayTxns = useMemo(
    () =>
      finance.transactions
        .filter((t) => t.date === selected && t.kind !== 'transfer')
        .sort((a, b) => b.id.localeCompare(a.id)),
    [finance.transactions, selected],
  );

  const dayTotals = byDate[selected] || { income: 0, expense: 0 };
  const dayNet = dayTotals.income - dayTotals.expense;
  const sym = currencySymbol(config.currency);

  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const changeMonth = (delta: number) => {
    const next = shiftMonth(month, delta);
    setMonth(next);
    setSelected(today.startsWith(next) ? today : `${next}-01`);
  };

  const renderTxn = ({ item: t }: { item: Transaction }) => {
    const kind = t.kind === 'income' ? 'income' : 'expense';
    const meta = catMeta(t.category, kind);
    const account = finance.accounts.find((a) => a.id === t.accountId);
    return (
      <View style={styles.txnRow}>
        <View style={[styles.txnIcon, { backgroundColor: `${meta.color}22` }]}>
          <Text style={{ fontSize: 18 }}>{meta.icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.txnTitle}>{t.category}</Text>
          <Text style={styles.txnSub} numberOfLines={1}>
            {account ? account.name : t.note || kind}
            {t.note && account ? ` · ${t.note}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.txnAmt, { color: t.kind === 'income' ? theme.green : theme.red }]}>
            {t.kind === 'income' ? '+' : '-'}
            {fmt(t.amount, config.currency)}
          </Text>
          <Text style={styles.txnDate}>{t.date.slice(5).replace('-', '/')}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      {/* Fixed calendar — no top gap */}
      <View style={styles.calendarBlock}>
        <View style={styles.monthNav}>
          <Pressable onPress={() => changeMonth(-1)} hitSlop={12} style={styles.arrowHit}>
            <Text style={styles.arrow}>‹</Text>
          </Pressable>
          <Text style={styles.monthTitle}>{longMonth(month)}</Text>
          <Pressable onPress={() => changeMonth(1)} hitSlop={12} style={styles.arrowHit}>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        </View>

        <View style={styles.weekRow}>
          {WEEKDAYS.map((w, i) => (
            <Text key={`${w}-${i}`} style={styles.weekday}>
              {w}
            </Text>
          ))}
        </View>

        <View style={styles.grid}>
          {cells.map((day, idx) => {
            if (day == null) {
              return <View key={`e-${idx}`} style={styles.cell} />;
            }
            const iso = dayKey(y, monthIndex, day);
            const totals = byDate[iso];
            const on = selected === iso;
            const isToday = iso === today;
            return (
              <Pressable
                key={iso}
                style={[styles.cell, on && styles.cellOn]}
                onPress={() => setSelected(iso)}
              >
                <View style={styles.dayTop}>
                  <Text style={[styles.dayNum, isToday && styles.dayToday, on && styles.dayNumOn]}>
                    {day}
                  </Text>
                  <View style={styles.dotRow}>
                    {totals?.income ? (
                      <View style={[styles.dot, { backgroundColor: theme.green }]} />
                    ) : null}
                    {totals?.expense ? (
                      <View style={[styles.dot, { backgroundColor: theme.red }]} />
                    ) : null}
                  </View>
                </View>
                {totals?.income ? (
                  <Text style={styles.incomeAmt} numberOfLines={1}>
                    {shortAmt(totals.income)}
                  </Text>
                ) : (
                  <View style={styles.amtSpacer} />
                )}
                {totals?.expense ? (
                  <Text style={styles.expenseAmt} numberOfLines={1}>
                    -{shortAmt(totals.expense)}
                  </Text>
                ) : (
                  <View style={styles.amtSpacer} />
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.detailHead}>
        <Text style={styles.detailDate}>{formatSelectedDate(selected)}</Text>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.detailNet, { color: dayNet >= 0 ? theme.green : theme.red }]}>
            {dayNet < 0 ? '-' : ''}
            {sym}
            {fullAmt(dayNet, config.currency)}
          </Text>
          <View style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: theme.green }]} />
            <Text style={styles.legendText}>
              Income {sym}
              {fullAmt(dayTotals.income, config.currency)}
            </Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: theme.red }]} />
            <Text style={styles.legendText}>
              Expenses -{sym}
              {fullAmt(dayTotals.expense, config.currency)}
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.listLabel}>
        {dayTxns.length === 0
          ? 'No transactions'
          : `${dayTxns.length} transaction${dayTxns.length === 1 ? '' : 's'}`}
      </Text>

      {/* Only this area scrolls */}
      <FlatList
        style={styles.list}
        data={dayTxns}
        keyExtractor={(t) => t.id}
        renderItem={renderTxn}
        ListEmptyComponent={
          <Text style={styles.empty}>Tap a date with activity, or add a transaction</Text>
        }
        contentContainerStyle={{
          paddingHorizontal: 12,
          paddingBottom: Math.max(insets.bottom, 12) + 20,
          flexGrow: dayTxns.length === 0 ? 1 : undefined,
        }}
        showsVerticalScrollIndicator
        nestedScrollEnabled
        bounces
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  calendarBlock: {
    paddingTop: 0,
    paddingHorizontal: 6,
    backgroundColor: '#fff',
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
    paddingBottom: 2,
    gap: 12,
  },
  arrowHit: { paddingHorizontal: 10, paddingVertical: 2 },
  arrow: { fontSize: 24, color: theme.header, fontWeight: '300' },
  monthTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.header,
    minWidth: 130,
    textAlign: 'center',
  },
  weekRow: {
    flexDirection: 'row',
    paddingTop: 2,
    paddingBottom: 2,
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    color: theme.muted,
    fontWeight: '700',
    fontSize: 11,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    height: 54,
    paddingTop: 2,
    paddingHorizontal: 1,
    alignItems: 'center',
  },
  cellOn: {
    backgroundColor: theme.accentSoft,
    borderRadius: 8,
  },
  dayTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minHeight: 18,
  },
  dayNum: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.ink,
  },
  dayToday: { color: theme.accent },
  dayNumOn: { color: theme.header },
  dotRow: {
    flexDirection: 'row',
    gap: 2,
    alignItems: 'center',
  },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  incomeAmt: {
    fontSize: 8,
    fontWeight: '700',
    color: theme.green,
    lineHeight: 10,
    marginTop: 1,
  },
  expenseAmt: {
    fontSize: 8,
    fontWeight: '700',
    color: theme.red,
    lineHeight: 10,
  },
  amtSpacer: { height: 10 },
  detailHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.line,
    backgroundColor: theme.bg,
  },
  detailDate: { fontWeight: '800', fontSize: 14, color: theme.ink },
  detailNet: { fontWeight: '800', fontSize: 16, marginBottom: 2 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  legendText: { color: theme.muted, fontSize: 11, fontWeight: '600' },
  listLabel: {
    color: theme.muted,
    fontWeight: '700',
    fontSize: 12,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
  },
  list: { flex: 1 },
  empty: {
    color: theme.muted,
    textAlign: 'center',
    marginTop: 20,
    fontWeight: '600',
  },
  txnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.line,
  },
  txnIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txnTitle: { fontWeight: '800', color: theme.ink },
  txnSub: { color: theme.muted, fontSize: 12, marginTop: 2 },
  txnAmt: { fontWeight: '800' },
  txnDate: { color: theme.muted, fontSize: 11, marginTop: 2 },
});
