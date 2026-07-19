/**
 * TransactionsScreen — Full transaction list with filter, search, CRUD.
 *
 * Features
 * ────────
 * • Filter bar: All / Income / Expense
 * • Search by category label or note
 * • SectionList grouped by date (Today / Yesterday / date string)
 * • Tap a row → Alert with Edit / Delete options
 * • Edit modal pre-filled with existing data (same form as Add)
 * • FAB to add a new transaction
 * • Empty state when no results
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  Modal,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAppContext } from '../../state/AppContext';
import { getTheme } from '../../constants/colors';
import { EXPENSE_CATS, INCOME_CATS, CURRENCIES } from '../../constants/categories';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getCurrencySymbol(code) {
  return CURRENCIES.find(c => c.code === code)?.symbol ?? '$';
}

function fmtMoney(amount, symbol) {
  const str = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol}${str}`;
}

function getCat(type, catId) {
  const list = type === 'income' ? INCOME_CATS : EXPENSE_CATS;
  return (
    list.find(c => c.id === catId) ?? {
      label: 'Other',
      icon: 'ellipsis-horizontal-circle',
      color: '#94A3B8',
    }
  );
}

function formatSectionDate(dateStr) {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function groupByDate(txs) {
  const map = {};
  const sorted = [...txs].sort((a, b) => {
    const diff = new Date(b.date) - new Date(a.date);
    return diff !== 0 ? diff : new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0);
  });
  sorted.forEach(t => {
    if (!map[t.date]) map[t.date] = [];
    map[t.date].push(t);
  });
  return Object.entries(map).map(([date, data]) => ({
    title: formatSectionDate(date),
    dateKey: date,
    data,
  }));
}

// ─── TransactionModal ─────────────────────────────────────────────────────────

function TransactionModal({ visible, onClose, onSave, initial, accounts, theme, symbol }) {
  const [type, setType] = useState('expense');
  const [category, setCategory] = useState(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date());
  const [accountId, setAccountId] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setType(initial?.type ?? 'expense');
      setCategory(initial?.category ?? null);
      setAmount(initial?.amount != null ? String(initial.amount) : '');
      setNote(initial?.note ?? '');
      setDate(initial?.date ? new Date(initial.date + 'T00:00:00') : new Date());
      setAccountId(initial?.account_id ?? accounts[0]?.id ?? null);
      setShowDatePicker(false);
      setSaving(false);
    }
  }, [visible, initial]);

  const cats = type === 'income' ? INCOME_CATS : EXPENSE_CATS;

  const handleSave = async () => {
    if (!category) {
      Alert.alert('Missing category', 'Please select a category.');
      return;
    }
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount greater than zero.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        type,
        category,
        amount: parsed,
        note: note.trim(),
        date: date.toISOString().split('T')[0],
        account_id: accountId,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: theme.overlay }}
          activeOpacity={1}
          onPress={onClose}
        />
        <View
          style={{
            backgroundColor: theme.card,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: '90%',
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 20,
              borderBottomWidth: 1,
              borderBottomColor: theme.line,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '700', color: theme.ink }}>
              {initial ? 'Edit Transaction' : 'Add Transaction'}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <Ionicons name="close" size={24} color={theme.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ padding: 20 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Type toggle */}
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: theme.inputBg,
                borderRadius: 14,
                padding: 4,
                marginBottom: 18,
              }}
            >
              {['expense', 'income'].map(t => (
                <TouchableOpacity
                  key={t}
                  onPress={() => { setType(t); setCategory(null); }}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    alignItems: 'center',
                    borderRadius: 11,
                    backgroundColor: type === t ? theme.card : 'transparent',
                    shadowColor: type === t ? '#000' : 'transparent',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: type === t ? 0.08 : 0,
                    shadowRadius: 2,
                    elevation: type === t ? 2 : 0,
                  }}
                >
                  <Text
                    style={{
                      color:
                        type === t
                          ? t === 'income'
                            ? theme.green
                            : theme.red
                          : theme.muted,
                      fontWeight: type === t ? '700' : '400',
                      textTransform: 'capitalize',
                      fontSize: 14,
                    }}
                  >
                    {t}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Amount */}
            <Text style={[mStyles.label, { color: theme.muted }]}>AMOUNT</Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: theme.inputBg,
                borderRadius: 12,
                paddingHorizontal: 14,
                marginBottom: 18,
              }}
            >
              <Text style={{ fontSize: 20, color: theme.muted, marginRight: 4 }}>{symbol}</Text>
              <TextInput
                style={{
                  flex: 1,
                  fontSize: 24,
                  fontWeight: '700',
                  color: theme.inputText,
                  paddingVertical: 14,
                }}
                placeholder="0.00"
                placeholderTextColor={theme.placeholderText}
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
              />
            </View>

            {/* Category picker */}
            <Text style={[mStyles.label, { color: theme.muted }]}>CATEGORY</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
              {cats.map(cat => {
                const sel = category === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    onPress={() => setCategory(cat.id)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      paddingHorizontal: 11,
                      paddingVertical: 7,
                      borderRadius: 20,
                      backgroundColor: sel ? cat.color : theme.inputBg,
                      borderWidth: 1.5,
                      borderColor: sel ? cat.color : theme.line,
                    }}
                  >
                    <Ionicons name={cat.icon} size={13} color={sel ? '#fff' : cat.color} />
                    <Text style={{ fontSize: 12, color: sel ? '#fff' : theme.ink }}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Note */}
            <Text style={[mStyles.label, { color: theme.muted }]}>NOTE (OPTIONAL)</Text>
            <TextInput
              style={{
                backgroundColor: theme.inputBg,
                borderRadius: 12,
                padding: 14,
                color: theme.inputText,
                marginBottom: 18,
                fontSize: 14,
              }}
              placeholder="Add a note…"
              placeholderTextColor={theme.placeholderText}
              value={note}
              onChangeText={setNote}
              returnKeyType="done"
            />

            {/* Date */}
            <Text style={[mStyles.label, { color: theme.muted }]}>DATE</Text>
            <TouchableOpacity
              onPress={() => setShowDatePicker(v => !v)}
              style={{
                backgroundColor: theme.inputBg,
                borderRadius: 12,
                padding: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                marginBottom: 10,
              }}
            >
              <Ionicons name="calendar-outline" size={18} color={theme.muted} />
              <Text style={{ color: theme.inputText, fontSize: 14 }}>
                {date.toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Text>
            </TouchableOpacity>

            {showDatePicker && Platform.OS === 'ios' && (
              <View
                style={{
                  backgroundColor: theme.inputBg,
                  borderRadius: 12,
                  overflow: 'hidden',
                  marginBottom: 14,
                }}
              >
                <DateTimePicker
                  value={date}
                  mode="date"
                  display="inline"
                  onChange={(_, d) => d && setDate(d)}
                />
              </View>
            )}
            {showDatePicker && Platform.OS === 'android' && (
              <DateTimePicker
                value={date}
                mode="date"
                display="default"
                onChange={(_, d) => {
                  setShowDatePicker(false);
                  if (d) setDate(d);
                }}
              />
            )}

            {/* Account selector */}
            {accounts.length > 0 && (
              <>
                <Text style={[mStyles.label, { color: theme.muted, marginTop: 8 }]}>
                  ACCOUNT
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginBottom: 18 }}
                  contentContainerStyle={{ gap: 8 }}
                >
                  {accounts.map(acc => {
                    const sel = accountId === acc.id;
                    return (
                      <TouchableOpacity
                        key={acc.id}
                        onPress={() => setAccountId(acc.id)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          paddingHorizontal: 14,
                          paddingVertical: 9,
                          borderRadius: 20,
                          backgroundColor: sel ? theme.primary : theme.inputBg,
                          borderWidth: 1.5,
                          borderColor: sel ? theme.primary : theme.line,
                        }}
                      >
                        <Ionicons
                          name={acc.icon ?? 'wallet'}
                          size={14}
                          color={sel ? theme.buttonText : theme.muted}
                        />
                        <Text
                          style={{
                            color: sel ? theme.buttonText : theme.ink,
                            fontWeight: '500',
                            fontSize: 13,
                          }}
                        >
                          {acc.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}

            {/* Save */}
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              style={{
                backgroundColor: theme.primary,
                borderRadius: 14,
                padding: 16,
                alignItems: 'center',
                marginBottom: 30,
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? (
                <ActivityIndicator color={theme.buttonText} />
              ) : (
                <Text style={{ color: theme.buttonText, fontWeight: '700', fontSize: 16 }}>
                  {initial ? 'Update Transaction' : 'Add Transaction'}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const mStyles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    letterSpacing: 0.4,
  },
});

// ─── TransactionsScreen ───────────────────────────────────────────────────────

const FILTER_TYPES = ['All', 'Income', 'Expense'];

export default function TransactionsScreen({ navigation }) {
  const {
    config,
    accounts,
    transactions,
    loading,
    addTransaction,
    editTransaction,
    removeTransaction,
  } = useAppContext();

  const theme = getTheme(config.theme);
  const symbol = getCurrencySymbol(config.currency);

  const [filterType, setFilterType] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingTx, setEditingTx] = useState(null);

  // ── Filtered + sectioned data ────────────────────────────────────────────
  const sections = useMemo(() => {
    let filtered = transactions;

    // Type filter
    if (filterType === 'Income') filtered = filtered.filter(t => t.type === 'income');
    else if (filterType === 'Expense') filtered = filtered.filter(t => t.type === 'expense');

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(t => {
        const cat = getCat(t.type, t.category);
        return (
          cat.label.toLowerCase().includes(q) ||
          (t.note ?? '').toLowerCase().includes(q) ||
          (t.amount?.toString() ?? '').includes(q)
        );
      });
    }

    return groupByDate(filtered);
  }, [transactions, filterType, searchQuery]);

  // Day totals for section headers
  const daySums = useMemo(() => {
    const map = {};
    sections.forEach(sec => {
      let inc = 0;
      let exp = 0;
      sec.data.forEach(t => {
        if (t.type === 'income') inc += t.amount ?? 0;
        else exp += t.amount ?? 0;
      });
      map[sec.dateKey] = { inc, exp };
    });
    return map;
  }, [sections]);

  // ── CRUD ─────────────────────────────────────────────────────────────────
  const openAdd = () => { setEditingTx(null); setShowModal(true); };
  const openEdit = (tx) => { setEditingTx(tx); setShowModal(true); };

  const handleSave = useCallback(
    async (data) => {
      const result = editingTx
        ? await editTransaction(editingTx.id, data)
        : await addTransaction(data);
      if (result?.error) {
        Alert.alert('Error', result.error.message ?? 'Failed to save.');
        return;
      }
      setShowModal(false);
    },
    [editingTx, addTransaction, editTransaction]
  );

  const handleDelete = useCallback(
    (tx) => {
      Alert.alert(
        'Delete Transaction',
        'This action cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              const { error } = await removeTransaction(tx.id);
              if (error) Alert.alert('Error', error.message ?? 'Failed to delete.');
            },
          },
        ]
      );
    },
    [removeTransaction]
  );

  const handleRowPress = (tx) => {
    const cat = getCat(tx.type, tx.category);
    Alert.alert(cat.label, tx.note || fmtMoney(tx.amount, symbol), [
      { text: 'Edit', onPress: () => openEdit(tx) },
      { text: 'Delete', style: 'destructive', onPress: () => handleDelete(tx) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ── Render helpers ────────────────────────────────────────────────────────
  const renderSectionHeader = ({ section }) => {
    const sums = daySums[section.dateKey] ?? {};
    return (
      <View
        style={[
          styles.sectionHeader,
          { backgroundColor: theme.bg },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: theme.muted }]}>{section.title}</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {sums.inc > 0 && (
            <Text style={{ fontSize: 12, color: theme.green, fontWeight: '600' }}>
              +{fmtMoney(sums.inc, symbol)}
            </Text>
          )}
          {sums.exp > 0 && (
            <Text style={{ fontSize: 12, color: theme.red, fontWeight: '600' }}>
              -{fmtMoney(sums.exp, symbol)}
            </Text>
          )}
        </View>
      </View>
    );
  };

  const renderItem = ({ item: tx }) => {
    const cat = getCat(tx.type, tx.category);
    const acc = accounts.find(a => a.id === tx.account_id);
    return (
      <TouchableOpacity
        onPress={() => handleRowPress(tx)}
        style={[styles.txRow, { backgroundColor: theme.card, borderColor: theme.line }]}
        activeOpacity={0.7}
      >
        <View style={[styles.catIcon, { backgroundColor: cat.color + '22' }]}>
          <Ionicons name={cat.icon} size={20} color={cat.color} />
        </View>

        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ color: theme.ink, fontWeight: '600', fontSize: 14 }} numberOfLines={1}>
            {cat.label}
          </Text>
          {(!!tx.note || !!acc) && (
            <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
              {[tx.note, acc?.name].filter(Boolean).join(' · ')}
            </Text>
          )}
        </View>

        <View style={{ alignItems: 'flex-end', marginLeft: 10 }}>
          <Text
            style={{
              fontWeight: '700',
              fontSize: 15,
              color: tx.type === 'income' ? theme.green : theme.ink,
            }}
          >
            {tx.type === 'income' ? '+' : '-'}
            {fmtMoney(tx.amount, symbol)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Ionicons name="receipt-outline" size={64} color={theme.line} />
      <Text style={[styles.emptyTitle, { color: theme.ink }]}>No transactions</Text>
      <Text style={[styles.emptySubtitle, { color: theme.muted }]}>
        {searchQuery ? 'Try a different search term.' : 'Tap + to add your first transaction.'}
      </Text>
    </View>
  );

  // ── Total for visible results ─────────────────────────────────────────────
  const allVisible = sections.flatMap(s => s.data);
  const visibleIncome = allVisible.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const visibleExpense = allVisible.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]}>
      <StatusBar barStyle={theme.statusBar === 'dark' ? 'dark-content' : 'light-content'} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.headerBg }]}>
        {navigation?.canGoBack?.() && (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{ marginRight: 10, padding: 4 }}
          >
            <Ionicons name="chevron-back" size={24} color={theme.headerText} />
          </TouchableOpacity>
        )}
        <Text style={[styles.headerTitle, { color: theme.headerText }]}>Transactions</Text>
      </View>

      {/* Filter tabs */}
      <View style={[styles.filterBar, { backgroundColor: theme.card, borderBottomColor: theme.line }]}>
        {FILTER_TYPES.map(f => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilterType(f)}
            style={[
              styles.filterTab,
              filterType === f && { backgroundColor: theme.primary },
            ]}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: '600',
                color: filterType === f ? theme.buttonText : theme.muted,
              }}
            >
              {f}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search bar */}
      <View style={[styles.searchBar, { backgroundColor: theme.card, borderBottomColor: theme.line }]}>
        <View style={[styles.searchInput, { backgroundColor: theme.inputBg }]}>
          <Ionicons name="search-outline" size={18} color={theme.muted} style={{ marginRight: 8 }} />
          <TextInput
            style={{ flex: 1, color: theme.inputText, fontSize: 14, paddingVertical: 0 }}
            placeholder="Search transactions…"
            placeholderTextColor={theme.placeholderText}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={theme.muted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Summary strip */}
      {allVisible.length > 0 && (
        <View
          style={[
            styles.summaryStrip,
            { backgroundColor: theme.primaryLight, borderBottomColor: theme.line },
          ]}
        >
          <Text style={{ fontSize: 12, color: theme.muted }}>
            {allVisible.length} transaction{allVisible.length !== 1 ? 's' : ''}
          </Text>
          <View style={{ flexDirection: 'row', gap: 14 }}>
            {visibleIncome > 0 && (
              <Text style={{ fontSize: 12, color: theme.green, fontWeight: '600' }}>
                +{fmtMoney(visibleIncome, symbol)}
              </Text>
            )}
            {visibleExpense > 0 && (
              <Text style={{ fontSize: 12, color: theme.red, fontWeight: '600' }}>
                -{fmtMoney(visibleExpense, symbol)}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* List */}
      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} size="large" color={theme.primary} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          renderSectionHeader={renderSectionHeader}
          renderItem={renderItem}
          ListEmptyComponent={renderEmpty}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 100, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: theme.line, marginLeft: 64 }} />
          )}
          keyboardShouldPersistTaps="handled"
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        onPress={openAdd}
        style={[styles.fab, { backgroundColor: theme.primary, shadowColor: theme.shadow }]}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color={theme.buttonText} />
      </TouchableOpacity>

      {/* Add / Edit Modal */}
      <TransactionModal
        key={editingTx?.id ?? 'new-tx'}
        visible={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleSave}
        initial={editingTx}
        accounts={accounts}
        theme={theme}
        symbol={symbol}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
  },
  filterTab: {
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderRadius: 20,
  },
  searchBar: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  searchInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  summaryStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 6,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 2,
  },
  catIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 22,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
