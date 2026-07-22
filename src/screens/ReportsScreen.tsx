import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFinance } from '../FinanceContext';
import { fmt, monthLabel, theme } from '../theme';
import { Donut, GuestBanner } from '../components/Shared';

export function ReportsScreen() {
  const { monthSummary, budget, setBudget, currentMonth } = useFinance();
  const [tab, setTab] = useState<'analytics' | 'accounts'>('analytics');
  const [budgetInput, setBudgetInput] = useState(budget ? String(budget) : '');
  const remaining = budget - monthSummary.expenses;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Reports</Text>
        <View style={styles.seg}>
          <Pressable
            style={[styles.segBtn, tab === 'analytics' && styles.segOn]}
            onPress={() => setTab('analytics')}
          >
            <Text style={[styles.segText, tab === 'analytics' && styles.segTextOn]}>Analytics</Text>
          </Pressable>
          <Pressable
            style={[styles.segBtn, tab === 'accounts' && styles.segOn]}
            onPress={() => setTab('accounts')}
          >
            <Text style={[styles.segText, tab === 'accounts' && styles.segTextOn]}>Accounts</Text>
          </Pressable>
        </View>
      </View>
      <GuestBanner />

      <View style={styles.body}>
        {tab === 'analytics' ? (
          <>
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle}>Monthly Statistics</Text>
                <Text style={styles.chev}>›</Text>
              </View>
              <Text style={styles.month}>{monthLabel(currentMonth).split(' ')[0]}</Text>
              <View style={styles.row3}>
                <Mini label="Expenses" value={fmt(monthSummary.expenses)} />
                <Mini label="Income" value={fmt(monthSummary.income)} />
                <Mini label="Balance" value={fmt(monthSummary.balance)} />
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle}>Monthly Budget</Text>
                <Text style={styles.chev}>›</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <Donut
                  value={budget ? Math.min(monthSummary.expenses, budget) : 0}
                  total={budget || 1}
                  color={budget ? theme.accent : theme.track}
                  size={100}
                />
                <View style={{ flex: 1 }}>
                  <Mini label="Remaining" value={fmt(remaining)} align="left" />
                  <Mini label="Budget" value={fmt(budget)} align="left" />
                  <Mini label="Expenses" value={fmt(monthSummary.expenses)} align="left" />
                </View>
              </View>
              <View style={styles.budgetRow}>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  placeholder="Set budget"
                  placeholderTextColor={theme.muted}
                  value={budgetInput}
                  onChangeText={setBudgetInput}
                />
                <Pressable
                  style={styles.save}
                  onPress={() => setBudget(parseFloat(budgetInput) || 0)}
                >
                  <Text style={styles.saveText}>Save</Text>
                </Pressable>
              </View>
            </View>
          </>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Cash</Text>
            <Text style={styles.accountAmt}>{fmt(monthSummary.balance)}</Text>
            <Text style={{ color: theme.muted, marginTop: 6 }}>Default account</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function Mini({
  label,
  value,
  align = 'center',
}: {
  label: string;
  value: string;
  align?: 'center' | 'left';
}) {
  return (
    <View style={{ flex: 1, alignItems: align === 'center' ? 'center' : 'flex-start', marginBottom: 8 }}>
      <Text style={styles.miniLabel}>{label}</Text>
      <Text style={styles.miniValue}>{value}</Text>
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
  body: { padding: 16 },
  card: {
    backgroundColor: theme.card,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.line,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  cardTitle: { fontWeight: '800', color: theme.ink, fontSize: 16 },
  chev: { color: theme.muted, fontSize: 22 },
  month: { color: theme.muted, marginBottom: 12, fontWeight: '700' },
  row3: { flexDirection: 'row' },
  miniLabel: { color: theme.muted, fontSize: 12, marginBottom: 4 },
  miniValue: { color: theme.ink, fontWeight: '800', fontSize: 15 },
  budgetRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: theme.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.ink,
  },
  save: {
    backgroundColor: theme.header,
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  saveText: { color: '#fff', fontWeight: '800' },
  accountAmt: { fontSize: 28, fontWeight: '800', color: theme.ink, marginTop: 8 },
});
