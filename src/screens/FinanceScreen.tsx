import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { showAppDialog } from '../appDialog';
import { Card, EmptyState, Field, PrimaryButton, Screen } from '../components/ui';
import { DateField } from '../components/DateField';
import { fmt, monthKey, monthLabel, shiftMonth } from '../utils';
import { accountChipLabel, resolveDefaultAccountId, sortAccountsForDisplay } from '../cashBooks';
import { accountBalance } from '../utils/accountBalance';
import { DropdownSelect } from '../components/DropdownSelect';

type Subview = 'home' | 'charts' | 'reports' | 'accounts';

export function FinanceScreen() {
  const {
    config,
    theme,
    finance,
    addTransaction,
    deleteTransaction,
    setBudget,
    expenseCategories,
    incomeCategories,
    catMeta,
  } = useApp();
  const [subview, setSubview] = useState<Subview>('home');
  const [currentMonth, setCurrentMonth] = useState(monthKey());
  const [showAdd, setShowAdd] = useState(false);
  const [kind, setKind] = useState<'expense' | 'income' | 'transfer'>('expense');
  const [category, setCategory] = useState('Food');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState(resolveDefaultAccountId(finance) ?? '');
  const [toAccountId, setToAccountId] = useState(finance.accounts[1]?.id ?? resolveDefaultAccountId(finance) ?? '');
  const [budgetInput, setBudgetInput] = useState(String(finance.budget || ''));

  const findIcon = (name: string, k: 'expense' | 'income' = 'expense') =>
    catMeta(name, k).icon;
  const catColor = (name: string) => catMeta(name, 'expense').color;

  const monthTxns = useMemo(
    () => finance.transactions.filter((t) => t.date.slice(0, 7) === currentMonth),
    [finance.transactions, currentMonth],
  );

  const summary = useMemo(() => {
    let income = 0;
    let expense = 0;
    monthTxns.forEach((t) => {
      if (t.kind === 'income') income += t.amount;
      if (t.kind === 'expense') expense += t.amount;
    });
    return { income, expense, balance: income - expense };
  }, [monthTxns]);

  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    monthTxns
      .filter((t) => t.kind === 'expense')
      .forEach((t) => {
        map[t.category] = (map[t.category] || 0) + t.amount;
      });
    return Object.entries(map)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
  }, [monthTxns]);

  const saveTxn = async () => {
    const value = parseFloat(amount);
    if (!value || value <= 0) {
      Alert.alert('Invalid amount', 'Enter a positive number.');
      return;
    }
    if (kind === 'transfer') {
      if (!accountId || !toAccountId || accountId === toAccountId) {
        Alert.alert('Pick two different accounts');
        return;
      }
      await addTransaction({
        kind: 'transfer',
        category: 'Transfer',
        amount: value,
        date,
        note,
        fromAccountId: accountId,
        toAccountId,
      });
    } else {
      await addTransaction({
        kind,
        category,
        amount: value,
        date,
        note,
        accountId: accountId || resolveDefaultAccountId(finance),
      });
    }
    setAmount('');
    setNote('');
    setShowAdd(false);
  };

  const navItems: { id: Subview; label: string; icon: string }[] = [
    { id: 'home', label: 'Home', icon: '🏠' },
    ...(config.features.financeCharts ? [{ id: 'charts' as const, label: 'Charts', icon: '📊' }] : []),
    ...(config.features.financeReports ? [{ id: 'reports' as const, label: 'Reports', icon: '📈' }] : []),
    ...(config.features.financeAccounts ? [{ id: 'accounts' as const, label: 'Accounts', icon: '🏦' }] : []),
  ];

  return (
    <Screen>
      <View style={[styles.monthRow, { borderBottomColor: theme.line }]}>
        <Pressable onPress={() => setCurrentMonth(shiftMonth(currentMonth, -1))}>
          <Text style={[styles.monthBtn, { color: theme.ink }]}>‹</Text>
        </Pressable>
        <Text style={[styles.monthTitle, { color: theme.ink }]}>{monthLabel(currentMonth)}</Text>
        <Pressable onPress={() => setCurrentMonth(shiftMonth(currentMonth, 1))}>
          <Text style={[styles.monthBtn, { color: theme.ink }]}>›</Text>
        </Pressable>
      </View>

      <View style={styles.pills}>
        <Pill label="Income" value={fmt(summary.income, config.currency)} color={theme.green} theme={theme} />
        <Pill label="Expense" value={fmt(summary.expense, config.currency)} color={theme.ink} theme={theme} />
        <Pill label="Balance" value={fmt(summary.balance, config.currency)} color={theme.primaryDark} theme={theme} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.navRow}>
        {navItems.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => setSubview(item.id)}
            style={[
              styles.navBtn,
              {
                backgroundColor: subview === item.id ? theme.primary : theme.card,
                borderColor: theme.line,
              },
            ]}
          >
            <Text style={{ fontWeight: '700', color: theme.ink }}>
              {item.icon} {item.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {subview === 'home' && (
          <>
            <Card>
              <View style={styles.rowBetween}>
                <Text style={[styles.sectionTitle, { color: theme.ink }]}>Monthly Budget</Text>
                <Text style={{ color: theme.muted, fontWeight: '700' }}>
                  {fmt(summary.expense, config.currency)} / {fmt(finance.budget || 0, config.currency)}
                </Text>
              </View>
              <View style={[styles.track, { backgroundColor: theme.line }]}>
                <View
                  style={{
                    width: `${Math.min(100, finance.budget ? (summary.expense / finance.budget) * 100 : 0)}%`,
                    height: 8,
                    borderRadius: 6,
                    backgroundColor: theme.primaryDark,
                  }}
                />
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <View style={{ flex: 1 }}>
                  <Field label="Set budget" value={budgetInput} onChangeText={setBudgetInput} keyboardType="numeric" />
                </View>
                <PrimaryButton
                  title="Save"
                  onPress={() => setBudget(parseFloat(budgetInput) || 0)}
                  style={{ alignSelf: 'flex-end', marginBottom: 12 }}
                />
              </View>
            </Card>

            <Text style={[styles.sectionTitle, { color: theme.ink, marginBottom: 8 }]}>Transactions</Text>
            {monthTxns.length === 0 ? (
              <EmptyState icon="📭" title="No transactions" subtitle="Tap + to add expense or income" />
            ) : (
              monthTxns.map((t) => (
                <Pressable
                  key={t.id}
                  onLongPress={() =>
                    showAppDialog({
                      title: 'Delete transaction?',
                      message: t.category,
                      icon: '🗑',
                      buttons: [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: () => void deleteTransaction(t.id),
                        },
                      ],
                    })
                  }
                >
                  <View style={[styles.txn, { backgroundColor: theme.card, borderColor: theme.line }]}>
                    <View style={[styles.catCircle, { backgroundColor: t.kind === 'transfer' ? '#8A8A8E' : catColor(t.category) }]}>
                      <Text>{t.kind === 'transfer' ? '🔁' : findIcon(t.category, t.kind === 'income' ? 'income' : 'expense')}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.ink, fontWeight: '700' }}>
                        {t.kind === 'transfer' ? 'Transfer' : t.category}
                      </Text>
                      <Text style={{ color: theme.muted, fontSize: 12 }} numberOfLines={1}>
                        {t.note || t.date}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontWeight: '800',
                        color: t.kind === 'income' ? theme.green : theme.ink,
                      }}
                    >
                      {t.kind === 'income' ? '+' : t.kind === 'transfer' ? '' : '-'}
                      {fmt(t.amount, config.currency)}
                    </Text>
                  </View>
                </Pressable>
              ))
            )}
          </>
        )}

        {subview === 'charts' && (
          <Card>
            <Text style={[styles.sectionTitle, { color: theme.ink }]}>Expense by category</Text>
            {byCategory.length === 0 ? (
              <EmptyState icon="📊" title="No chart data" subtitle="Add expenses this month" />
            ) : (
              byCategory.map((row) => {
                const pct = summary.expense ? (row.total / summary.expense) * 100 : 0;
                return (
                  <View key={row.name} style={{ marginBottom: 12 }}>
                    <View style={styles.rowBetween}>
                      <Text style={{ color: theme.ink, fontWeight: '700' }}>
                        {findIcon(row.name)} {row.name}
                      </Text>
                      <Text style={{ color: theme.muted, fontWeight: '700' }}>
                        {pct.toFixed(0)}% · {fmt(row.total, config.currency)}
                      </Text>
                    </View>
                    <View style={[styles.track, { backgroundColor: theme.line }]}>
                      <View
                        style={{
                          width: `${pct}%`,
                          height: 8,
                          borderRadius: 6,
                          backgroundColor: catColor(row.name),
                        }}
                      />
                    </View>
                  </View>
                );
              })
            )}
          </Card>
        )}

        {subview === 'reports' && (
          <Card>
            <Text style={[styles.sectionTitle, { color: theme.ink }]}>Month report</Text>
            <ReportRow label="Total income" value={fmt(summary.income, config.currency)} theme={theme} />
            <ReportRow label="Total expense" value={fmt(summary.expense, config.currency)} theme={theme} />
            <ReportRow label="Net balance" value={fmt(summary.balance, config.currency)} theme={theme} />
            <ReportRow label="Transactions" value={String(monthTxns.length)} theme={theme} />
            <ReportRow
              label="Top category"
              value={byCategory[0] ? `${byCategory[0].name} (${fmt(byCategory[0].total, config.currency)})` : '—'}
              theme={theme}
            />
          </Card>
        )}

        {subview === 'accounts' && (
          <>
            {finance.accounts.map((a) => (
              <Card key={a.id}>
                <View style={styles.rowBetween}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontSize: 28 }}>{a.icon}</Text>
                    <View>
                      <Text style={{ color: theme.ink, fontWeight: '800' }}>{a.name}</Text>
                      <Text style={{ color: theme.muted }}>{a.type}</Text>
                    </View>
                  </View>
                  <Text style={{ color: theme.ink, fontWeight: '800' }}>
                    {fmt(accountBalance(a, finance.transactions), a.currency || config.currency)}
                  </Text>
                </View>
              </Card>
            ))}
            <Text style={{ color: theme.muted, textAlign: 'center', marginTop: 8, fontSize: 12 }}>
              To add or remove accounts (Bank, Card, etc.), open Profile → Accounts.
            </Text>
          </>
        )}
      </ScrollView>

      <Pressable
        style={[styles.fab, { backgroundColor: theme.ink }]}
        onPress={() => {
          setKind('expense');
          setCategory('Food');
          setAccountId(resolveDefaultAccountId(finance) ?? '');
          setShowAdd(true);
        }}
      >
        <Text style={{ color: theme.primary, fontSize: 28, fontWeight: '700' }}>+</Text>
      </Pressable>

      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.bg }]}>
            <Text style={[styles.sectionTitle, { color: theme.ink, marginBottom: 12 }]}>Add transaction</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {(['expense', 'income', 'transfer'] as const).map((k) => (
                <Pressable
                  key={k}
                  onPress={() => {
                    setKind(k);
                    if (k === 'expense') setCategory('Food');
                    if (k === 'income') setCategory('Salary');
                    if (k === 'transfer') setCategory('Transfer');
                  }}
                  style={[
                    styles.kindBtn,
                    {
                      backgroundColor: kind === k ? theme.ink : theme.primary,
                    },
                  ]}
                >
                  <Text style={{ color: kind === k ? theme.primary : theme.ink, fontWeight: '800', fontSize: 12 }}>
                    {k.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>

            {kind !== 'transfer' ? (
              <>
                <Text style={{ color: theme.muted, fontWeight: '700', marginBottom: 8 }}>Category</Text>
                <FlatList
                  data={kind === 'expense' ? expenseCategories : incomeCategories}
                  horizontal
                  keyExtractor={(item) => item.name}
                  showsHorizontalScrollIndicator={false}
                  style={{ marginBottom: 10, maxHeight: 70 }}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => setCategory(item.name)}
                      style={[
                        styles.catChip,
                        {
                          backgroundColor: category === item.name ? theme.primary : theme.card,
                          borderColor: theme.line,
                        },
                      ]}
                    >
                      <Text>
                        {item.icon} {item.name}
                      </Text>
                    </Pressable>
                  )}
                />
              </>
            ) : null}

            <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" />
            <DateField label="Date" value={date} onChange={setDate} />
            <Field label="Note" value={note} onChangeText={setNote} placeholder="Optional note" />

            <DropdownSelect
              label={
                kind === 'transfer'
                  ? 'From account'
                  : kind === 'income'
                    ? 'Received in'
                    : 'Paid with'
              }
              value={accountId}
              placeholder="Select account source"
              options={sortAccountsForDisplay(finance.accounts).map((a) => ({
                value: a.id,
                label: accountChipLabel(a),
              }))}
              onChange={setAccountId}
            />

            {kind === 'transfer' ? (
              <DropdownSelect
                label="To account"
                value={toAccountId}
                placeholder="Select account"
                options={sortAccountsForDisplay(finance.accounts).map((a) => ({
                  value: a.id,
                  label: accountChipLabel(a),
                }))}
                onChange={setToAccountId}
              />
            ) : null}

            <PrimaryButton title="Save" onPress={saveTxn} />
            <PrimaryButton title="Cancel" onPress={() => setShowAdd(false)} danger style={{ marginTop: 10 }} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function Pill({
  label,
  value,
  color,
  theme,
}: {
  label: string;
  value: string;
  color: string;
  theme: { card: string; line: string; muted: string };
}) {
  return (
    <View style={[styles.pill, { backgroundColor: theme.card, borderColor: theme.line }]}>
      <Text style={{ color: theme.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ color, fontWeight: '800', fontSize: 15 }}>{value}</Text>
    </View>
  );
}

function ReportRow({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: { muted: string; ink: string; line: string };
}) {
  return (
    <View style={[styles.rowBetween, { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.line }]}>
      <Text style={{ color: theme.muted }}>{label}</Text>
      <Text style={{ color: theme.ink, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  monthBtn: { fontSize: 28, fontWeight: '700', paddingHorizontal: 8 },
  monthTitle: { fontSize: 18, fontWeight: '800' },
  pills: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 12 },
  pill: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center' },
  navRow: { paddingHorizontal: 12, paddingVertical: 12, gap: 8 },
  navBtn: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginRight: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  track: { height: 8, borderRadius: 6, overflow: 'hidden', marginTop: 8 },
  txn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  catCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 18,
    maxHeight: '92%',
  },
  kindBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10 },
  catChip: {
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
});
