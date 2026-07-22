import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFinance } from '../FinanceContext';
import { EXPENSE_CATS, INCOME_CATS, catMeta, fmt, monthLabel, theme } from '../theme';
import { GuestBanner } from '../components/Shared';

function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function HomeScreen() {
  const { currentMonth, setCurrentMonth, monthSummary, transactions, isGuest } = useFinance();

  const monthTxns = useMemo(
    () => transactions.filter((t) => t.date.startsWith(currentMonth)),
    [transactions, currentMonth],
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.menu}>☰</Text>
        <Text style={styles.appName}>Pulse Wallet</Text>
        <Text style={styles.headerIcon}>⌕</Text>
      </View>
      <GuestBanner />

      <View style={styles.summaryBand}>
        <View style={styles.monthBox}>
          <Text style={styles.year}>{currentMonth.slice(0, 4)}</Text>
          <Pressable onPress={() => setCurrentMonth(shiftMonth(currentMonth, -1))}>
            <Text style={styles.monthNav}>‹</Text>
          </Pressable>
          <Text style={styles.month}>{monthLabel(currentMonth).split(' ')[0]}</Text>
          <Pressable onPress={() => setCurrentMonth(shiftMonth(currentMonth, 1))}>
            <Text style={styles.monthNav}>›</Text>
          </Pressable>
        </View>
        <View style={styles.statsRow}>
          <Stat label="Expenses" value={fmt(monthSummary.expenses)} />
          <Stat label="Income" value={fmt(monthSummary.income)} />
          <Stat label="Balance" value={fmt(monthSummary.balance)} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {isGuest ? (
          <View style={styles.noteCard}>
            <Text style={styles.noteTitle}>Preview data</Text>
            <Text style={styles.noteBody}>
              You’re browsing sample numbers. Sign up from Profile (or when adding) to save your own
              records.
            </Text>
          </View>
        ) : null}

        {monthTxns.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🧾</Text>
            <Text style={styles.emptyTitle}>No records</Text>
            <Text style={styles.emptySub}>Tap + to add your first expense or income</Text>
          </View>
        ) : (
          monthTxns.map((t) => {
            const meta = catMeta(t.category, t.kind);
            return (
              <View key={t.id} style={styles.row}>
                <View style={[styles.icon, { backgroundColor: meta.color + '22' }]}>
                  <Text style={{ fontSize: 18 }}>{meta.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{t.category}</Text>
                  <Text style={styles.rowSub}>{t.note || t.date}</Text>
                </View>
                <Text
                  style={[
                    styles.rowAmt,
                    { color: t.kind === 'income' ? theme.green : theme.ink },
                  ]}
                >
                  {t.kind === 'income' ? '+' : '-'}
                  {fmt(t.amount)}
                </Text>
              </View>
            );
          })
        )}
      </ScrollView>

    </View>
  );
}

export function AddModal() {
  const { showAdd, setShowAdd, addTransaction } = useFinance();
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [category, setCategory] = useState('Shopping');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const cats = kind === 'expense' ? EXPENSE_CATS : INCOME_CATS;
  const onClose = () => setShowAdd(false);

  const save = async () => {
    const value = parseFloat(amount);
    if (!value || value <= 0) return;
    const ok = await addTransaction({
      kind,
      category,
      amount: value,
      date: new Date().toISOString().slice(0, 10),
      note,
    });
    if (ok) {
      setAmount('');
      setNote('');
      onClose();
    }
  };

  return (
    <Modal visible={showAdd} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Add transaction</Text>
          <View style={styles.tabs}>
            {(['expense', 'income'] as const).map((k) => (
              <Pressable
                key={k}
                style={[styles.tab, kind === k && styles.tabOn]}
                onPress={() => {
                  setKind(k);
                  setCategory(k === 'expense' ? 'Shopping' : 'Salary');
                }}
              >
                <Text style={styles.tabText}>{k}</Text>
              </Pressable>
            ))}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            {cats.map((c) => (
              <Pressable
                key={c.name}
                onPress={() => setCategory(c.name)}
                style={[styles.chip, category === c.name && { backgroundColor: theme.accentSoft }]}
              >
                <Text>
                  {c.icon} {c.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            placeholder="Amount"
            placeholderTextColor={theme.muted}
            value={amount}
            onChangeText={setAmount}
          />
          <TextInput
            style={styles.input}
            placeholder="Note (optional)"
            placeholderTextColor={theme.muted}
            value={note}
            onChangeText={setNote}
          />
          <Pressable style={styles.saveBtn} onPress={save}>
            <Text style={styles.saveText}>Save</Text>
          </Pressable>
          <Pressable onPress={onClose} style={{ alignItems: 'center', padding: 12 }}>
            <Text style={{ color: theme.muted, fontWeight: '700' }}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  header: {
    backgroundColor: theme.header,
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menu: { color: '#fff', fontSize: 22, width: 28 },
  appName: { color: '#fff', fontWeight: '800', fontSize: 18 },
  headerIcon: { color: '#fff', fontSize: 18, width: 28, textAlign: 'right' },
  summaryBand: {
    backgroundColor: theme.header,
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  monthBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  year: { color: 'rgba(255,255,255,0.7)', fontWeight: '700', marginRight: 6 },
  month: { color: '#fff', fontWeight: '800', fontSize: 16 },
  monthNav: { color: '#fff', fontSize: 22, paddingHorizontal: 6 },
  statsRow: { flexDirection: 'row' },
  statLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 4 },
  statValue: { color: '#fff', fontWeight: '800', fontSize: 16 },
  body: { padding: 16, paddingBottom: 120 },
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
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: theme.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    paddingBottom: 28,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: theme.ink, marginBottom: 12 },
  tabs: {
    flexDirection: 'row',
    borderWidth: 1.5,
    borderColor: theme.header,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabOn: { backgroundColor: theme.accentSoft },
  tabText: { fontWeight: '700', color: theme.ink, textTransform: 'capitalize' },
  chip: {
    borderWidth: 1,
    borderColor: theme.line,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  input: {
    borderWidth: 1.5,
    borderColor: theme.line,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    color: theme.ink,
  },
  saveBtn: {
    backgroundColor: theme.header,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  saveText: { color: '#fff', fontWeight: '800' },
});
