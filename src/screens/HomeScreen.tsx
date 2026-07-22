import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFinance } from '../FinanceContext';
import { useApp } from '../context/AppContext';
import { EXPENSE_CATS, INCOME_CATS, catMeta, fmt, monthLabel, theme } from '../theme';
import { currencySymbol } from '../utils';
import { GuestBanner } from '../components/Shared';
import { BottomSheet } from '../components/BottomSheet';

function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function HomeScreen() {
  const { currentMonth, setCurrentMonth, isGuest } = useFinance();
  const { finance, config } = useApp();
  const insets = useSafeAreaInsets();
  /** Income is the default tab */
  const [listKind, setListKind] = useState<'income' | 'expense'>('income');

  const monthTxns = useMemo(
    () => finance.transactions.filter((t) => t.date.startsWith(currentMonth)),
    [finance.transactions, currentMonth],
  );

  const monthSummary = useMemo(() => {
    let expenses = 0;
    let income = 0;
    monthTxns.forEach((t) => {
      if (t.kind === 'expense') expenses += t.amount;
      else if (t.kind === 'income') income += t.amount;
    });
    return { expenses, income, balance: income - expenses };
  }, [monthTxns]);

  const filteredTxns = useMemo(
    () =>
      monthTxns
        .filter((t) => t.kind === listKind)
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    [monthTxns, listKind],
  );

  return (
    <View style={styles.root}>
      <GuestBanner />

      <View style={styles.summaryBand}>
        <View style={styles.monthBox}>
          <Text style={styles.year}>{currentMonth.slice(0, 4)}</Text>
          <Pressable onPress={() => setCurrentMonth(shiftMonth(currentMonth, -1))} hitSlop={8}>
            <Text style={styles.monthNav}>‹</Text>
          </Pressable>
          <Text style={styles.month}>{monthLabel(currentMonth).split(' ')[0]}</Text>
          <Pressable onPress={() => setCurrentMonth(shiftMonth(currentMonth, 1))} hitSlop={8}>
            <Text style={styles.monthNav}>›</Text>
          </Pressable>
        </View>

        <View style={styles.statsRow}>
          <Pressable
            style={[styles.statTab, listKind === 'expense' && styles.statTabOn]}
            onPress={() => setListKind('expense')}
          >
            <Text style={[styles.statLabel, listKind === 'expense' && styles.statLabelOn]}>
              Expenses
            </Text>
            <Text style={[styles.statValue, listKind === 'expense' && styles.statValueOn]}>
              {fmt(monthSummary.expenses, config.currency)}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.statTab, listKind === 'income' && styles.statTabOn]}
            onPress={() => setListKind('income')}
          >
            <Text style={[styles.statLabel, listKind === 'income' && styles.statLabelOn]}>
              Income
            </Text>
            <Text style={[styles.statValue, listKind === 'income' && styles.statValueOn]}>
              {fmt(monthSummary.income, config.currency)}
            </Text>
          </Pressable>

          <View style={styles.statBalance}>
            <Text style={styles.statLabel}>Balance</Text>
            <Text style={styles.statValue}>{fmt(monthSummary.balance, config.currency)}</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={filteredTxns}
        keyExtractor={(t) => t.id}
        style={styles.list}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: Math.max(insets.bottom, 16) + 100,
          flexGrow: 1,
        }}
        showsVerticalScrollIndicator
        ListHeaderComponent={
          isGuest ? (
            <View style={styles.noteCard}>
              <Text style={styles.noteTitle}>Guest mode</Text>
              <Text style={styles.noteBody}>
                Everything starts at zero. Sign up from Profile (or when saving) to keep your own
                records.
              </Text>
            </View>
          ) : (
            <Text style={styles.listTitle}>
              {listKind === 'income' ? 'Income' : 'Expenses'} · {filteredTxns.length} record
              {filteredTxns.length === 1 ? '' : 's'}
            </Text>
          )
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>{listKind === 'income' ? '💰' : '🧾'}</Text>
            <Text style={styles.emptyTitle}>
              No {listKind === 'income' ? 'income' : 'expenses'} this month
            </Text>
            <Text style={styles.emptySub}>Tap + to add one</Text>
          </View>
        }
        renderItem={({ item: t }) => {
          const kind = t.kind === 'income' ? 'income' : 'expense';
          const meta = catMeta(t.category, kind);
          return (
            <View style={styles.row}>
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
                  { color: t.kind === 'income' ? theme.green : theme.red },
                ]}
              >
                {t.kind === 'income' ? '+' : '-'}
                {fmt(t.amount, config.currency)}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const KEYPAD = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', '⌫'],
] as const;

export function AddModal() {
  const { showAdd, setShowAdd, isGuest, setShowAuth, setAuthMode } = useFinance();
  const { finance, addTransaction, config } = useApp();
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [category, setCategory] = useState('Shopping');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [accountId, setAccountId] = useState('');

  const cats = kind === 'expense' ? EXPENSE_CATS : INCOME_CATS;
  const currencySym = currencySymbol(config.currency);
  const selected = catMeta(category, kind);
  const amountValue = parseFloat(amount) || 0;
  const canSave = amountValue > 0;

  const resetForm = () => {
    setKind('expense');
    setCategory('Shopping');
    setAmount('');
    setNote('');
    setShowNote(false);
    setAccountId(finance.accounts[0]?.id ?? '');
  };

  useEffect(() => {
    if (showAdd) {
      setAmount('');
      setNote('');
      setShowNote(false);
      setKind('expense');
      setCategory('Shopping');
      setAccountId(finance.accounts[0]?.id ?? '');
    }
  }, [showAdd, finance.accounts]);

  const onClose = () => {
    setShowAdd(false);
    resetForm();
  };

  const pressKey = (key: string) => {
    if (key === '⌫') {
      setAmount((v) => v.slice(0, -1));
      return;
    }
    if (key === '.') {
      if (amount.includes('.')) return;
      setAmount((v) => (v ? `${v}.` : '0.'));
      return;
    }
    setAmount((v) => {
      if (v === '0') return key;
      const [whole, frac] = v.split('.');
      if (frac !== undefined && frac.length >= 2) return v;
      if ((whole?.length ?? 0) >= 9) return v;
      return `${v}${key}`;
    });
  };

  const save = async () => {
    if (isGuest) {
      setAuthMode('signup');
      setShowAuth(true);
      return;
    }
    if (!canSave) return;

    await addTransaction({
      kind,
      category,
      amount: amountValue,
      date: new Date().toISOString().slice(0, 10),
      note: note.trim(),
      accountId: accountId || finance.accounts[0]?.id,
    });
    onClose();
  };

  const amountDisplay = amount
    ? amount.includes('.')
      ? amount
      : Number(amount).toLocaleString('en-IN')
    : '0';

  return (
    <BottomSheet visible={showAdd} onClose={onClose} style={styles.addSheet}>
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
            <Text style={[styles.tabText, kind === k && styles.tabTextOn]}>{k}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.selectedRow}>
        <View style={[styles.selectedIcon, { backgroundColor: `${selected.color}22` }]}>
          <Text style={{ fontSize: 22 }}>{selected.icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.selectedLabel}>Category</Text>
          <Text style={styles.selectedName}>{category}</Text>
        </View>
        <Text style={[styles.kindBadge, { color: kind === 'expense' ? theme.red : theme.green }]}>
          {kind === 'expense' ? '−' : '+'}
        </Text>
      </View>

      <View style={styles.amountWrap}>
        <Text style={styles.currencySym}>{currencySym}</Text>
        <Text style={[styles.amountText, !amount && styles.amountPlaceholder]} numberOfLines={1}>
          {amountDisplay}
        </Text>
      </View>

      <ScrollView
        style={styles.catScroll}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.catGrid}>
          {cats.map((c) => {
            const on = category === c.name;
            return (
              <Pressable key={c.name} onPress={() => setCategory(c.name)} style={styles.catCell}>
                <View
                  style={[
                    styles.catIcon,
                    on && {
                      backgroundColor: `${c.color}22`,
                      borderColor: c.color,
                    },
                  ]}
                >
                  <Text style={{ fontSize: 20 }}>{c.icon}</Text>
                </View>
                <Text style={[styles.catLabel, on && { color: theme.header }]} numberOfLines={1}>
                  {c.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {showNote ? (
        <TextInput
          style={styles.noteInput}
          placeholder="Add a note…"
          placeholderTextColor={theme.muted}
          value={note}
          onChangeText={setNote}
          returnKeyType="done"
          blurOnSubmit
        />
      ) : (
        <Pressable onPress={() => setShowNote(true)} style={styles.noteLink}>
          <Text style={styles.noteLinkText}>+ Add note</Text>
        </Pressable>
      )}

      {finance.accounts.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.accountScroll}>
          {finance.accounts.map((a) => (
            <Pressable
              key={a.id}
              onPress={() => setAccountId(a.id)}
              style={[styles.accountChip, accountId === a.id && styles.accountChipOn]}
            >
              <Text style={styles.accountChipText}>
                {a.icon} {a.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.keypad}>
        {KEYPAD.map((row) => (
          <View key={row.join('-')} style={styles.keypadRow}>
            {row.map((key) => (
              <Pressable
                key={key}
                onPress={() => pressKey(key)}
                style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
              >
                <Text style={[styles.keyText, key === '⌫' && styles.keyBack]}>{key}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>

      <Pressable
        style={[styles.saveBtn, !canSave && !isGuest && styles.saveBtnDisabled]}
        onPress={save}
      >
        <Text style={styles.saveText}>{isGuest ? 'Sign up to save' : 'Save'}</Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  summaryBand: {
    backgroundColor: theme.header,
    paddingHorizontal: 12,
    paddingTop: 0,
    paddingBottom: 12,
  },
  monthBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    marginTop: 2,
  },
  year: { color: 'rgba(255,255,255,0.7)', fontWeight: '700', marginRight: 6 },
  month: { color: '#fff', fontWeight: '800', fontSize: 16 },
  monthNav: { color: '#fff', fontSize: 22, paddingHorizontal: 6 },
  statsRow: { flexDirection: 'row', gap: 8 },
  statTab: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  statTabOn: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: theme.accentSoft,
  },
  statBalance: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  statLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginBottom: 4, fontWeight: '600' },
  statLabelOn: { color: '#fff', fontWeight: '800' },
  statValue: { color: 'rgba(255,255,255,0.85)', fontWeight: '800', fontSize: 15 },
  statValueOn: { color: '#fff' },
  list: { flex: 1 },
  listTitle: {
    color: theme.muted,
    fontWeight: '700',
    fontSize: 12,
    marginBottom: 10,
  },
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
  addSheet: { paddingBottom: 10 },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.ink,
    marginBottom: 12,
    textAlign: 'center',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: theme.bg,
    borderRadius: 12,
    padding: 4,
    marginBottom: 14,
  },
  tab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 10 },
  tabOn: { backgroundColor: theme.header },
  tabText: { fontWeight: '700', color: theme.muted, textTransform: 'capitalize', fontSize: 13 },
  tabTextOn: { color: '#fff' },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.bg,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.line,
  },
  selectedIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedLabel: { color: theme.muted, fontSize: 11, fontWeight: '700' },
  selectedName: { color: theme.ink, fontWeight: '800', fontSize: 16, marginTop: 1 },
  kindBadge: { fontSize: 28, fontWeight: '800', paddingHorizontal: 4 },
  amountWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginBottom: 10,
    gap: 4,
    minHeight: 52,
  },
  currencySym: { fontSize: 24, fontWeight: '800', color: theme.header, marginBottom: 6 },
  amountText: {
    fontSize: 40,
    fontWeight: '800',
    color: theme.ink,
    letterSpacing: -0.5,
  },
  amountPlaceholder: { color: theme.muted },
  catScroll: { maxHeight: 148, marginBottom: 6 },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  catCell: {
    width: '25%',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  catIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: theme.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
    borderWidth: 1.5,
    borderColor: theme.line,
  },
  catLabel: { fontSize: 10, fontWeight: '700', color: theme.muted, textAlign: 'center' },
  noteLink: { alignSelf: 'center', paddingVertical: 6, marginBottom: 4 },
  noteLinkText: { color: theme.accent, fontWeight: '700', fontSize: 13 },
  noteInput: {
    borderWidth: 1.5,
    borderColor: theme.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    color: theme.ink,
    backgroundColor: theme.bg,
    fontSize: 14,
  },
  accountScroll: { marginBottom: 8, maxHeight: 42 },
  accountChip: {
    borderWidth: 1.5,
    borderColor: theme.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.bg,
    marginRight: 8,
  },
  accountChipOn: {
    backgroundColor: theme.accentSoft,
    borderColor: theme.accent,
  },
  accountChipText: { fontWeight: '700', color: theme.ink, fontSize: 13 },
  keypad: {
    marginTop: 4,
    marginBottom: 10,
    gap: 6,
  },
  keypadRow: {
    flexDirection: 'row',
    gap: 6,
  },
  key: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: theme.bg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.line,
  },
  keyPressed: {
    backgroundColor: theme.accentSoft,
    borderColor: theme.accent,
  },
  keyText: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.ink,
  },
  keyBack: {
    fontSize: 20,
    color: theme.muted,
  },
  saveBtn: {
    backgroundColor: theme.header,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.45,
  },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
