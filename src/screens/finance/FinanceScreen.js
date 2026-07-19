/**
 * FinanceScreen — Main finance hub
 *
 * Shows a month navigator, income/expense/balance pills, top-tab content
 * (Home dashboard | Charts | Reports), and a FAB to add transactions.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  FlatList,
  KeyboardAvoidingView,
  SafeAreaView,
  StatusBar,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Svg, Path, Circle } from 'react-native-svg';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAppContext } from '../../state/AppContext';
import { getTheme } from '../../constants/colors';
import {
  EXPENSE_CATS,
  INCOME_CATS,
  CURRENCIES,
  ACCOUNT_ICONS,
} from '../../constants/categories';

const { width: SCREEN_W } = Dimensions.get('window');
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

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

function formatDateLabel(dateStr) {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// ─── SVG Donut helpers ────────────────────────────────────────────────────────

function polarToXY(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutArcPath(cx, cy, outerR, innerR, startDeg, endDeg) {
  const o1 = polarToXY(cx, cy, outerR, startDeg);
  const o2 = polarToXY(cx, cy, outerR, endDeg);
  const i2 = polarToXY(cx, cy, innerR, endDeg);
  const i1 = polarToXY(cx, cy, innerR, startDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${o1.x.toFixed(2)} ${o1.y.toFixed(2)}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${o2.x.toFixed(2)} ${o2.y.toFixed(2)}`,
    `L ${i2.x.toFixed(2)} ${i2.y.toFixed(2)}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${i1.x.toFixed(2)} ${i1.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

// ─── DonutChart ───────────────────────────────────────────────────────────────

function DonutChart({ monthTransactions, size, theme, symbol }) {
  const sz = size ?? 180;
  const cx = sz / 2;
  const cy = sz / 2;
  const outerR = sz / 2 - 10;
  const innerR = outerR * 0.62;

  const expenses = monthTransactions.filter(t => t.type === 'expense');
  const total = expenses.reduce((s, t) => s + (t.amount ?? 0), 0);

  const catMap = {};
  expenses.forEach(t => {
    catMap[t.category] = (catMap[t.category] ?? 0) + (t.amount ?? 0);
  });

  const slices = Object.entries(catMap)
    .map(([id, amount]) => {
      const cat = EXPENSE_CATS.find(c => c.id === id);
      return { id, amount, color: cat?.color ?? '#94A3B8' };
    })
    .sort((a, b) => b.amount - a.amount);

  if (total === 0) {
    return (
      <View style={{ width: sz, height: sz, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={sz} height={sz}>
          <Circle
            cx={cx}
            cy={cy}
            r={(outerR + innerR) / 2}
            fill="none"
            stroke={theme.line}
            strokeWidth={outerR - innerR}
          />
        </Svg>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 12, color: theme.muted }}>No expenses</Text>
          </View>
        </View>
      </View>
    );
  }

  // Single slice — render as full ring
  if (slices.length === 1) {
    const ringR = (outerR + innerR) / 2;
    return (
      <View style={{ width: sz, height: sz, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={sz} height={sz}>
          <Circle
            cx={cx}
            cy={cy}
            r={ringR}
            fill="none"
            stroke={slices[0].color}
            strokeWidth={outerR - innerR}
          />
        </Svg>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: theme.ink }}>
              {symbol}{total.toFixed(0)}
            </Text>
            <Text style={{ fontSize: 11, color: theme.muted, marginTop: 2 }}>Expenses</Text>
          </View>
        </View>
      </View>
    );
  }

  let startDeg = 0;
  const paths = slices.map(({ id, amount, color }) => {
    const sweep = (amount / total) * 360;
    const endDeg = startDeg + Math.max(sweep, 0.5);
    const d = donutArcPath(cx, cy, outerR, innerR, startDeg, endDeg);
    startDeg = endDeg;
    return { id, color, d };
  });

  return (
    <View style={{ width: sz, height: sz, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={sz} height={sz}>
        {paths.map(p => (
          <Path key={p.id} d={p.d} fill={p.color} />
        ))}
        <Circle cx={cx} cy={cy} r={innerR - 1} fill={theme.card} />
      </Svg>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: theme.ink }}>
            {symbol}{total.toFixed(0)}
          </Text>
          <Text style={{ fontSize: 11, color: theme.muted, marginTop: 2 }}>Expenses</Text>
        </View>
      </View>
    </View>
  );
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

  // Reset or pre-fill when modal opens
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
            maxHeight: '88%',
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
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
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
                    shadowColor: type === t ? theme.shadow : 'transparent',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: type === t ? 1 : 0,
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
            <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '600', marginBottom: 6 }}>
              AMOUNT
            </Text>
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

            {/* Category */}
            <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '600', marginBottom: 8 }}>
              CATEGORY
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
              {cats.map(cat => {
                const selected = category === cat.id;
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
                      backgroundColor: selected ? cat.color : theme.inputBg,
                      borderWidth: 1.5,
                      borderColor: selected ? cat.color : theme.line,
                    }}
                  >
                    <Ionicons
                      name={cat.icon}
                      size={13}
                      color={selected ? '#fff' : cat.color}
                    />
                    <Text style={{ fontSize: 12, color: selected ? '#fff' : theme.ink }}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Note */}
            <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '600', marginBottom: 6 }}>
              NOTE (OPTIONAL)
            </Text>
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
            <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '600', marginBottom: 6 }}>
              DATE
            </Text>
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
                <Text
                  style={{
                    color: theme.muted,
                    fontSize: 12,
                    fontWeight: '600',
                    marginBottom: 8,
                    marginTop: 8,
                  }}
                >
                  ACCOUNT
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginBottom: 18 }}
                  contentContainerStyle={{ gap: 8 }}
                >
                  {accounts.map(acc => {
                    const selected = accountId === acc.id;
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
                          backgroundColor: selected ? theme.primary : theme.inputBg,
                          borderWidth: 1.5,
                          borderColor: selected ? theme.primary : theme.line,
                        }}
                      >
                        <Ionicons
                          name={acc.icon ?? 'wallet'}
                          size={14}
                          color={selected ? theme.buttonText : theme.muted}
                        />
                        <Text
                          style={{
                            color: selected ? theme.buttonText : theme.ink,
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

// ─── FinanceScreen ────────────────────────────────────────────────────────────

const TABS = ['Home', 'Charts', 'Reports'];

export default function FinanceScreen({ navigation }) {
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

  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [activeTab, setActiveTab] = useState('Home');
  const [showModal, setShowModal] = useState(false);
  const [editingTx, setEditingTx] = useState(null);

  // ── Month navigation ─────────────────────────────────────────────────────
  const goPrev = () =>
    setCurrentMonth(d => {
      const nd = new Date(d);
      nd.setMonth(nd.getMonth() - 1);
      return nd;
    });

  const goNext = () =>
    setCurrentMonth(d => {
      const nd = new Date(d);
      nd.setMonth(nd.getMonth() + 1);
      return nd;
    });

  const monthLabel = `${MONTH_NAMES[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;

  // ── Filtered data ────────────────────────────────────────────────────────
  const monthTransactions = useMemo(() => {
    const y = currentMonth.getFullYear();
    const m = currentMonth.getMonth();
    return transactions.filter(t => {
      const d = new Date(t.date + 'T00:00:00');
      return d.getFullYear() === y && d.getMonth() === m;
    });
  }, [transactions, currentMonth]);

  const { income, expense } = useMemo(() => {
    let income = 0;
    let expense = 0;
    monthTransactions.forEach(t => {
      if (t.type === 'income') income += t.amount ?? 0;
      else expense += t.amount ?? 0;
    });
    return { income, expense };
  }, [monthTransactions]);

  const balance = income - expense;

  // Top expense categories
  const catBreakdown = useMemo(() => {
    const map = {};
    monthTransactions
      .filter(t => t.type === 'expense')
      .forEach(t => {
        map[t.category] = (map[t.category] ?? 0) + (t.amount ?? 0);
      });
    return Object.entries(map)
      .map(([id, total]) => {
        const cat = EXPENSE_CATS.find(c => c.id === id) ?? {
          label: 'Other',
          icon: 'ellipsis-horizontal-circle',
          color: '#94A3B8',
        };
        return { ...cat, total };
      })
      .sort((a, b) => b.total - a.total);
  }, [monthTransactions]);

  const maxCatAmount = catBreakdown[0]?.total ?? 1;

  const recentTx = useMemo(
    () => [...monthTransactions].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5),
    [monthTransactions]
  );

  // Income data for Charts tab (must be top-level — no hooks inside render fns)
  const incomeData = useMemo(() => {
    const map = {};
    monthTransactions
      .filter(t => t.type === 'income')
      .forEach(t => { map[t.category] = (map[t.category] ?? 0) + (t.amount ?? 0); });
    return Object.entries(map)
      .map(([id, total]) => {
        const cat = INCOME_CATS.find(c => c.id === id) ?? { label: 'Other', icon: 'ellipsis-horizontal-circle', color: '#94A3B8' };
        return { ...cat, total };
      })
      .sort((a, b) => b.total - a.total);
  }, [monthTransactions]);

  const maxIncome = incomeData[0]?.total ?? 1;

  // Daily grouping for Reports tab
  const txByDate = useMemo(() => {
    const sorted = [...monthTransactions].sort((a, b) => new Date(b.date) - new Date(a.date));
    const map = {};
    sorted.forEach(t => {
      if (!map[t.date]) map[t.date] = [];
      map[t.date].push(t);
    });
    return Object.entries(map);
  }, [monthTransactions]);

  // Budget indicator
  const budgetAmount = config?.budget?.amount ?? 0;
  const budgetPct = budgetAmount > 0 ? Math.min(expense / budgetAmount, 1) : 0;

  // ── CRUD handlers ─────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditingTx(null);
    setShowModal(true);
  };

  const openEdit = (tx) => {
    setEditingTx(tx);
    setShowModal(true);
  };

  const handleSave = useCallback(
    async (data) => {
      let result;
      if (editingTx) {
        result = await editTransaction(editingTx.id, data);
      } else {
        result = await addTransaction(data);
      }
      if (result?.error) {
        Alert.alert('Error', result.error.message ?? 'Failed to save transaction.');
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
        'Are you sure you want to delete this transaction?',
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

  const handleTxPress = (tx) => {
    Alert.alert(tx.note || getCat(tx.type, tx.category).label, '', [
      { text: 'Edit', onPress: () => openEdit(tx) },
      { text: 'Delete', style: 'destructive', onPress: () => handleDelete(tx) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ── Sub-views ─────────────────────────────────────────────────────────────
  const renderHome = () => (
    <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
      {/* Budget bar */}
      {budgetAmount > 0 && (
        <View
          style={[
            styles.card,
            { backgroundColor: theme.card, shadowColor: theme.shadow, borderColor: theme.line },
          ]}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ color: theme.ink, fontWeight: '600', fontSize: 13 }}>
              Monthly Budget
            </Text>
            <Text style={{ color: theme.muted, fontSize: 12 }}>
              {fmtMoney(expense, symbol)} / {fmtMoney(budgetAmount, symbol)}
            </Text>
          </View>
          <View
            style={{
              height: 8,
              backgroundColor: theme.line,
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: `${budgetPct * 100}%`,
                height: '100%',
                backgroundColor: budgetPct >= 1 ? theme.red : theme.primary,
                borderRadius: 4,
              }}
            />
          </View>
          {budgetPct >= 0.9 && (
            <Text style={{ color: theme.red, fontSize: 11, marginTop: 6 }}>
              {budgetPct >= 1
                ? 'Budget exceeded!'
                : `${Math.round(budgetPct * 100)}% of budget used`}
            </Text>
          )}
        </View>
      )}

      {/* Donut + categories */}
      <View
        style={[
          styles.card,
          { backgroundColor: theme.card, shadowColor: theme.shadow, borderColor: theme.line },
        ]}
      >
        <Text style={[styles.cardTitle, { color: theme.ink }]}>Expense Breakdown</Text>
        <View style={{ alignItems: 'center', paddingVertical: 10 }}>
          <DonutChart
            monthTransactions={monthTransactions}
            size={180}
            theme={theme}
            symbol={symbol}
          />
        </View>

        {catBreakdown.length === 0 ? (
          <Text style={{ color: theme.muted, textAlign: 'center', padding: 12, fontSize: 13 }}>
            No expenses this month
          </Text>
        ) : (
          catBreakdown.slice(0, 6).map(cat => {
            const pct = expense > 0 ? cat.total / expense : 0;
            return (
              <View key={cat.id} style={{ marginBottom: 12 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginBottom: 4,
                  }}
                >
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      backgroundColor: cat.color + '22',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 8,
                    }}
                  >
                    <Ionicons name={cat.icon} size={14} color={cat.color} />
                  </View>
                  <Text style={{ flex: 1, color: theme.ink, fontSize: 13 }}>{cat.label}</Text>
                  <Text style={{ color: theme.muted, fontSize: 12, marginRight: 8 }}>
                    {Math.round(pct * 100)}%
                  </Text>
                  <Text style={{ color: theme.ink, fontSize: 13, fontWeight: '600' }}>
                    {fmtMoney(cat.total, symbol)}
                  </Text>
                </View>
                <View
                  style={{
                    height: 5,
                    backgroundColor: theme.line,
                    borderRadius: 3,
                    overflow: 'hidden',
                    marginLeft: 36,
                  }}
                >
                  <View
                    style={{
                      width: `${pct * 100}%`,
                      height: '100%',
                      backgroundColor: cat.color,
                      borderRadius: 3,
                    }}
                  />
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* Recent transactions */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.card,
            shadowColor: theme.shadow,
            borderColor: theme.line,
            marginBottom: 100,
          },
        ]}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[styles.cardTitle, { color: theme.ink }]}>Recent</Text>
          {navigation && (
            <TouchableOpacity onPress={() => navigation.navigate('Transactions')}>
              <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '600' }}>
                See All
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {recentTx.length === 0 ? (
          <Text style={{ color: theme.muted, textAlign: 'center', paddingVertical: 24, fontSize: 13 }}>
            No transactions this month
          </Text>
        ) : (
          recentTx.map(tx => {
            const cat = getCat(tx.type, tx.category);
            return (
              <TouchableOpacity
                key={tx.id}
                onPress={() => handleTxPress(tx)}
                style={styles.txRow}
              >
                <View
                  style={[
                    styles.txIcon,
                    { backgroundColor: cat.color + '22' },
                  ]}
                >
                  <Ionicons name={cat.icon} size={18} color={cat.color} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ color: theme.ink, fontWeight: '600', fontSize: 14 }}>
                    {cat.label}
                  </Text>
                  {!!tx.note && (
                    <Text style={{ color: theme.muted, fontSize: 12, marginTop: 1 }}>
                      {tx.note}
                    </Text>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text
                    style={{
                      fontWeight: '700',
                      fontSize: 14,
                      color: tx.type === 'income' ? theme.green : theme.ink,
                    }}
                  >
                    {tx.type === 'income' ? '+' : '-'}
                    {fmtMoney(tx.amount, symbol)}
                  </Text>
                  <Text style={{ color: theme.muted, fontSize: 11, marginTop: 1 }}>
                    {formatDateLabel(tx.date)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </ScrollView>
  );

  const renderCharts = () => {
    return (
      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
        {/* Income vs Expense */}
        <View
          style={[
            styles.card,
            { backgroundColor: theme.card, shadowColor: theme.shadow, borderColor: theme.line },
          ]}
        >
          <Text style={[styles.cardTitle, { color: theme.ink }]}>Income vs Expenses</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
            {[
              { label: 'Income', amount: income, color: theme.green },
              { label: 'Expenses', amount: expense, color: theme.red },
            ].map(({ label, amount: amt, color }) => {
              const maxVal = Math.max(income, expense, 1);
              return (
                <View key={label} style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 8 }}>{label}</Text>
                  <View
                    style={{
                      width: '100%',
                      height: 120,
                      backgroundColor: theme.inputBg,
                      borderRadius: 10,
                      overflow: 'hidden',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <View
                      style={{
                        height: `${(amt / maxVal) * 100}%`,
                        backgroundColor: color,
                        borderTopLeftRadius: 8,
                        borderTopRightRadius: 8,
                        minHeight: 4,
                      }}
                    />
                  </View>
                  <Text
                    style={{ color: theme.ink, fontWeight: '700', fontSize: 13, marginTop: 6 }}
                  >
                    {fmtMoney(amt, symbol)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Expense categories bar */}
        <View
          style={[
            styles.card,
            { backgroundColor: theme.card, shadowColor: theme.shadow, borderColor: theme.line },
          ]}
        >
          <Text style={[styles.cardTitle, { color: theme.ink }]}>Top Expenses</Text>
          {catBreakdown.length === 0 ? (
            <Text style={{ color: theme.muted, textAlign: 'center', padding: 16, fontSize: 13 }}>
              No expense data
            </Text>
          ) : (
            catBreakdown.slice(0, 8).map(cat => (
              <View key={cat.id} style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name={cat.icon} size={13} color={cat.color} />
                    <Text style={{ color: theme.ink, fontSize: 13 }}>{cat.label}</Text>
                  </View>
                  <Text style={{ color: theme.ink, fontSize: 13, fontWeight: '600' }}>
                    {fmtMoney(cat.total, symbol)}
                  </Text>
                </View>
                <View
                  style={{
                    height: 8,
                    backgroundColor: theme.line,
                    borderRadius: 4,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      width: `${(cat.total / maxCatAmount) * 100}%`,
                      height: '100%',
                      backgroundColor: cat.color,
                      borderRadius: 4,
                    }}
                  />
                </View>
              </View>
            ))
          )}
        </View>

        {/* Income categories bar */}
        {incomeData.length > 0 && (
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.card,
                shadowColor: theme.shadow,
                borderColor: theme.line,
                marginBottom: 100,
              },
            ]}
          >
            <Text style={[styles.cardTitle, { color: theme.ink }]}>Income Sources</Text>
            {incomeData.map(cat => (
              <View key={cat.id} style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ color: theme.ink, fontSize: 13 }}>{cat.label}</Text>
                  <Text style={{ color: theme.green, fontSize: 13, fontWeight: '600' }}>
                    {fmtMoney(cat.total, symbol)}
                  </Text>
                </View>
                <View
                  style={{ height: 8, backgroundColor: theme.line, borderRadius: 4, overflow: 'hidden' }}
                >
                  <View
                    style={{
                      width: `${(cat.total / maxIncome) * 100}%`,
                      height: '100%',
                      backgroundColor: cat.color,
                      borderRadius: 4,
                    }}
                  />
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    );
  };

  const renderReports = () => {
    return (
      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
        {/* Summary */}
        <View
          style={[
            styles.card,
            { backgroundColor: theme.card, shadowColor: theme.shadow, borderColor: theme.line },
          ]}
        >
          <Text style={[styles.cardTitle, { color: theme.ink }]}>Monthly Summary</Text>
          {[
            { label: 'Total Income', amount: income, color: theme.green },
            { label: 'Total Expenses', amount: expense, color: theme.red },
            { label: 'Net Balance', amount: balance, color: balance >= 0 ? theme.green : theme.red },
            { label: 'Transactions', amount: monthTransactions.length, isCount: true, color: theme.ink },
          ].map(row => (
            <View
              key={row.label}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: theme.line,
              }}
            >
              <Text style={{ color: theme.muted, fontSize: 14 }}>{row.label}</Text>
              <Text style={{ color: row.color, fontWeight: '700', fontSize: 14 }}>
                {row.isCount ? row.amount : fmtMoney(row.amount, symbol)}
              </Text>
            </View>
          ))}
        </View>

        {/* Daily breakdown */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.card,
              shadowColor: theme.shadow,
              borderColor: theme.line,
              marginBottom: 100,
            },
          ]}
        >
          <Text style={[styles.cardTitle, { color: theme.ink }]}>Daily Breakdown</Text>
          {txByDate.length === 0 ? (
            <Text style={{ color: theme.muted, textAlign: 'center', padding: 16, fontSize: 13 }}>
              No transactions this month
            </Text>
          ) : (
            txByDate.map(([date, txs]) => {
              const dayIncome = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
              const dayExpense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
              return (
                <View
                  key={date}
                  style={{
                    paddingVertical: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.line,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: theme.ink, fontWeight: '600', fontSize: 13 }}>
                      {formatDateLabel(date)}
                    </Text>
                    <Text style={{ color: theme.muted, fontSize: 12 }}>
                      {txs.length} txn{txs.length !== 1 ? 's' : ''}
                    </Text>
                  </View>
                  <View
                    style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}
                  >
                    {dayIncome > 0 && (
                      <Text style={{ color: theme.green, fontSize: 12 }}>
                        +{fmtMoney(dayIncome, symbol)}
                      </Text>
                    )}
                    {dayExpense > 0 && (
                      <Text style={{ color: theme.red, fontSize: 12 }}>
                        -{fmtMoney(dayExpense, symbol)}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]}>
      <StatusBar barStyle={theme.statusBar === 'dark' ? 'dark-content' : 'light-content'} />

      {/* ── Header ── */}
      <View style={[styles.header, { backgroundColor: theme.headerBg }]}>
        <Text style={[styles.headerTitle, { color: theme.headerText }]}>Finance</Text>
        {navigation && (
          <TouchableOpacity
            onPress={() => navigation.navigate('Accounts')}
            style={styles.headerBtn}
          >
            <Ionicons name="wallet-outline" size={22} color={theme.headerText} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Month navigator ── */}
      <View style={[styles.monthNav, { backgroundColor: theme.card, borderBottomColor: theme.line }]}>
        <TouchableOpacity onPress={goPrev} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
          <Ionicons name="chevron-back" size={22} color={theme.ink} />
        </TouchableOpacity>
        <Text style={{ fontSize: 15, fontWeight: '700', color: theme.ink }}>{monthLabel}</Text>
        <TouchableOpacity onPress={goNext} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
          <Ionicons name="chevron-forward" size={22} color={theme.ink} />
        </TouchableOpacity>
      </View>

      {/* ── Stats pills ── */}
      <View style={[styles.statsRow, { backgroundColor: theme.card, borderBottomColor: theme.line }]}>
        <View style={[styles.pill, { backgroundColor: theme.greenLight }]}>
          <Text style={[styles.pillLabel, { color: theme.green }]}>Income</Text>
          <Text style={[styles.pillValue, { color: theme.green }]}>
            {fmtMoney(income, symbol)}
          </Text>
        </View>
        <View style={[styles.pill, { backgroundColor: theme.redLight }]}>
          <Text style={[styles.pillLabel, { color: theme.red }]}>Expense</Text>
          <Text style={[styles.pillValue, { color: theme.red }]}>
            {fmtMoney(expense, symbol)}
          </Text>
        </View>
        <View
          style={[
            styles.pill,
            { backgroundColor: balance >= 0 ? theme.primaryLight : theme.redLight },
          ]}
        >
          <Text
            style={[
              styles.pillLabel,
              { color: balance >= 0 ? theme.primaryDark : theme.red },
            ]}
          >
            Balance
          </Text>
          <Text
            style={[
              styles.pillValue,
              { color: balance >= 0 ? theme.primaryDark : theme.red },
            ]}
          >
            {balance < 0 ? '-' : ''}
            {fmtMoney(Math.abs(balance), symbol)}
          </Text>
        </View>
      </View>

      {/* ── Tab bar ── */}
      <View style={[styles.tabBar, { backgroundColor: theme.card, borderBottomColor: theme.line }]}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={styles.tabItem}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: activeTab === tab ? '700' : '500',
                color: activeTab === tab ? theme.primary : theme.muted,
                paddingBottom: 10,
                borderBottomWidth: activeTab === tab ? 2.5 : 0,
                borderBottomColor: theme.primary,
              }}
            >
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
        {navigation && (
          <TouchableOpacity
            onPress={() => navigation.navigate('Transactions')}
            style={styles.tabItem}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: '500',
                color: theme.muted,
                paddingBottom: 10,
              }}
            >
              All Txns
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Tab content ── */}
      {loading ? (
        <ActivityIndicator
          style={{ flex: 1 }}
          size="large"
          color={theme.primary}
        />
      ) : (
        <View style={{ flex: 1, paddingHorizontal: 14, paddingTop: 8 }}>
          {activeTab === 'Home' && renderHome()}
          {activeTab === 'Charts' && renderCharts()}
          {activeTab === 'Reports' && renderReports()}
        </View>
      )}

      {/* ── FAB ── */}
      <TouchableOpacity
        onPress={openAdd}
        style={[styles.fab, { backgroundColor: theme.primary, shadowColor: theme.shadow }]}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color={theme.buttonText} />
      </TouchableOpacity>

      {/* ── Add / Edit Modal ── */}
      <TransactionModal
        key={editingTx?.id ?? 'new-finance'}
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
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerBtn: {
    padding: 4,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
  },
  pill: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  pillLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 3,
  },
  pillValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  tabItem: {
    marginRight: 20,
    paddingTop: 10,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
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
