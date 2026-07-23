import React, { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFinance } from '../FinanceContext';
import { useApp } from '../context/AppContext';
import type { ThemeTokens } from '../types';
import { fmt } from '../theme';
import { GuestBanner } from '../components/Shared';
import { BottomSheet } from '../components/BottomSheet';

function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function longMonthLabel(key: string) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

function shortMonthLabel(key: string) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

type BudgetEditor = {
  category: string;
  limit: string;
};

export function ReportsScreen() {
  const { currentMonth, setCurrentMonth, isGuest, setShowAuth, setAuthMode } = useFinance();
  const { finance, setCategoryBudget, removeCategoryBudget, config, expenseCategories, catMeta,
    theme,
  } = useApp();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [editor, setEditor] = useState<BudgetEditor | null>(null);
  const [pickCategory, setPickCategory] = useState(false);

  const spentByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    finance.transactions
      .filter((t) => t.kind === 'expense' && t.date.startsWith(currentMonth))
      .forEach((t) => {
        map[t.category] = (map[t.category] || 0) + t.amount;
      });
    return map;
  }, [finance.transactions, currentMonth]);

  const monthBudgets = useMemo(
    () => (finance.categoryBudgets || []).filter((b) => b.month === currentMonth && b.limit > 0),
    [finance.categoryBudgets, currentMonth],
  );

  const budgetedRows = useMemo(() => {
    return monthBudgets
      .map((b) => {
        const spent = spentByCategory[b.category] || 0;
        const remaining = Math.max(0, b.limit - spent);
        const over = spent > b.limit;
        const meta = catMeta(b.category, 'expense');
        return { ...b, spent, remaining, over, meta };
      })
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [monthBudgets, spentByCategory]);

  const budgetedSet = useMemo(() => new Set(monthBudgets.map((b) => b.category)), [monthBudgets]);

  const notBudgeted = useMemo(() => {
    const spentCats = Object.keys(spentByCategory).filter((c) => !budgetedSet.has(c));
    const rest = expenseCategories.map((c) => c.name).filter(
      (name) => !budgetedSet.has(name) && !spentCats.includes(name),
    );
    // Prioritize categories with spending this month, then the rest
    return [...spentCats, ...rest].map((name) => ({
      name,
      spent: spentByCategory[name] || 0,
      meta: catMeta(name, 'expense'),
    }));
  }, [spentByCategory, budgetedSet, expenseCategories, catMeta]);

  const totals = useMemo(() => {
    const totalBudget = budgetedRows.reduce((s, r) => s + r.limit, 0);
    const totalSpent = budgetedRows.reduce((s, r) => s + r.spent, 0);
    return { totalBudget, totalSpent };
  }, [budgetedRows]);

  const requireAuth = () => {
    if (!isGuest) return true;
    setAuthMode('signup');
    setShowAuth(true);
    return false;
  };

  const openSetBudget = (category: string, existingLimit?: number) => {
    if (!requireAuth()) return;
    setPickCategory(false);
    setEditor({
      category,
      limit: existingLimit && existingLimit > 0 ? String(existingLimit) : '',
    });
  };

  const saveEditor = async () => {
    if (!editor) return;
    if (!requireAuth()) return;
    const limit = parseFloat(editor.limit) || 0;
    if (limit <= 0) {
      Alert.alert('Enter amount', 'Please enter a budget greater than 0.');
      return;
    }
    await setCategoryBudget(currentMonth, editor.category, limit);
    setEditor(null);
  };

  const onMenu = (category: string, limit: number) => {
    Alert.alert(category, undefined, [
      { text: 'Edit budget', onPress: () => openSetBudget(category, limit) },
      {
        text: 'Remove budget',
        style: 'destructive',
        onPress: async () => {
          if (!requireAuth()) return;
          await removeCategoryBudget(currentMonth, category);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={styles.root}>
      <GuestBanner />

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.monthNav}>
          <Pressable onPress={() => setCurrentMonth(shiftMonth(currentMonth, -1))} hitSlop={12}>
            <Text style={styles.monthArrow}>‹</Text>
          </Pressable>
          <Text style={styles.monthTitle}>{longMonthLabel(currentMonth)}</Text>
          <Pressable onPress={() => setCurrentMonth(shiftMonth(currentMonth, 1))} hitSlop={12}>
            <Text style={styles.monthArrow}>›</Text>
          </Pressable>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>TOTAL BUDGET</Text>
            <Text style={styles.summaryValue}>{fmt(totals.totalBudget, config.currency)}</Text>
          </View>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>TOTAL SPENT</Text>
            <Text style={[styles.summaryValue, { color: theme.red }]}>
              {fmt(totals.totalSpent, config.currency)}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>
          Budgeted categories: {shortMonthLabel(currentMonth)}
        </Text>

        {budgetedRows.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No budgets set for this month yet.</Text>
            <Text style={styles.emptySub}>Pick a category below and tap Set Budget.</Text>
          </View>
        ) : (
          budgetedRows.map((row) => {
            const pct = row.limit > 0 ? Math.min(1, row.spent / row.limit) : 0;
            const barColor = row.over ? theme.red : theme.header;
            return (
              <View key={row.category} style={styles.budgetCard}>
                <View style={styles.cardTop}>
                  <View style={[styles.catIcon, { backgroundColor: `${row.meta.color}22` }]}>
                    <Text style={{ fontSize: 22 }}>{row.meta.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.cardTitleRow}>
                      <Text style={styles.catName}>{row.category}</Text>
                      <Pressable onPress={() => onMenu(row.category, row.limit)} hitSlop={10}>
                        <Text style={styles.menuDots}>⋮</Text>
                      </Pressable>
                    </View>
                    <Text style={styles.metaLine}>
                      Limit: <Text style={styles.metaStrong}>{fmt(row.limit, config.currency)}</Text>
                    </Text>
                    <Text style={styles.metaLine}>
                      Spent:{' '}
                      <Text style={{ color: row.over ? theme.red : theme.green, fontWeight: '700' }}>
                        {fmt(row.spent, config.currency)}
                      </Text>
                    </Text>
                    <Text style={styles.metaLine}>
                      Remaining:{' '}
                      <Text
                        style={{
                          color: row.remaining > 0 ? theme.green : theme.red,
                          fontWeight: '700',
                        }}
                      >
                        {fmt(row.remaining, config.currency)}
                      </Text>
                    </Text>
                  </View>
                </View>

                <View style={styles.barMeta}>
                  <Text style={styles.barPeriod}>({shortMonthLabel(currentMonth)})</Text>
                  <View style={styles.flag}>
                    <Text style={styles.flagText}>{fmt(row.limit, config.currency)}</Text>
                  </View>
                </View>
                <View style={styles.track}>
                  <View
                    style={[
                      styles.fill,
                      {
                        width: `${Math.max(row.over ? 100 : pct * 100, row.spent > 0 ? 4 : 0)}%`,
                        backgroundColor: barColor,
                      },
                    ]}
                  />
                </View>
                {row.over ? <Text style={styles.exceeded}>*Limit exceeded</Text> : null}
              </View>
            );
          })
        )}

        <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Not budgeted this month</Text>

        {notBudgeted.slice(0, 12).map((row) => (
          <View key={row.name} style={styles.unbudgetedRow}>
            <View style={[styles.catIconSm, { backgroundColor: `${row.meta.color}18` }]}>
              <Text style={{ fontSize: 18 }}>{row.meta.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.unbudgetedName}>{row.name}</Text>
              {row.spent > 0 ? (
                <Text style={styles.unbudgetedSpent}>
                  Spent {fmt(row.spent, config.currency)} this month
                </Text>
              ) : null}
            </View>
            <Pressable style={styles.setBudgetBtn} onPress={() => openSetBudget(row.name)}>
              <Text style={styles.setBudgetText}>SET BUDGET</Text>
            </Pressable>
          </View>
        ))}

        {notBudgeted.length > 12 ? (
          <Pressable
            style={styles.moreBtn}
            onPress={() => {
              if (!requireAuth()) return;
              setPickCategory(true);
            }}
          >
            <Text style={styles.moreBtnText}>+ More categories</Text>
          </Pressable>
        ) : null}

        <View style={{ height: 100 }} />
      </ScrollView>

      <BottomSheet visible={!!editor} onClose={() => setEditor(null)}>
        {editor ? (
          <>
            <Text style={styles.sheetTitle}>Set budget</Text>
            <View style={styles.sheetCat}>
              <Text style={{ fontSize: 28 }}>{catMeta(editor.category, 'expense').icon}</Text>
              <Text style={styles.sheetCatName}>{editor.category}</Text>
            </View>
            <Text style={styles.sheetHint}>{longMonthLabel(currentMonth)}</Text>
            <TextInput
              style={styles.sheetInput}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={theme.muted}
              value={editor.limit}
              onChangeText={(limit) => setEditor({ ...editor, limit })}
              autoFocus
            />
            <Pressable style={styles.saveBtn} onPress={saveEditor}>
              <Text style={styles.saveBtnText}>Save budget</Text>
            </Pressable>
          </>
        ) : null}
      </BottomSheet>

      <BottomSheet visible={pickCategory} onClose={() => setPickCategory(false)}>
        <Text style={styles.sheetTitle}>Choose category</Text>
        <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
          {notBudgeted.map((row) => (
            <Pressable
              key={row.name}
              style={styles.pickRow}
              onPress={() => openSetBudget(row.name)}
            >
              <Text style={{ fontSize: 20 }}>{row.meta.icon}</Text>
              <Text style={styles.pickName}>{row.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: '#fff' },
    body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
    monthNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 18,
      marginBottom: 16,
      marginTop: 6,
    },
    monthArrow: { fontSize: 28, color: theme.header, fontWeight: '300', paddingHorizontal: 4 },
    monthTitle: { fontSize: 18, fontWeight: '800', color: theme.header },
    summaryRow: {
      flexDirection: 'row',
      marginBottom: 20,
      paddingHorizontal: 4,
    },
    summaryCol: { flex: 1 },
    summaryLabel: {
      color: theme.muted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.4,
      marginBottom: 4,
    },
    summaryValue: { fontSize: 22, fontWeight: '800', color: theme.ink },
    sectionTitle: {
      color: theme.header,
      fontWeight: '800',
      fontSize: 15,
      marginBottom: 10,
    },
    emptyCard: {
      borderWidth: 1,
      borderColor: theme.line,
      borderRadius: 14,
      padding: 18,
      marginBottom: 8,
      backgroundColor: theme.bg,
    },
    emptyText: { fontWeight: '700', color: theme.ink },
    emptySub: { color: theme.muted, marginTop: 4, fontSize: 13 },
    budgetCard: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.line,
      paddingVertical: 14,
    },
    cardTop: { flexDirection: 'row', gap: 12 },
    catIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    catIconSm: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    catName: { flex: 1, fontWeight: '800', fontSize: 16, color: theme.ink },
    menuDots: { fontSize: 22, color: theme.muted, paddingLeft: 8, fontWeight: '700' },
    metaLine: { color: theme.muted, fontSize: 13, marginTop: 1 },
    metaStrong: { color: theme.ink, fontWeight: '700' },
    barMeta: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      marginTop: 12,
      marginBottom: 4,
    },
    barPeriod: { color: theme.muted, fontSize: 11 },
    flag: {
      backgroundColor: theme.header,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 4,
    },
    flagText: { color: '#fff', fontSize: 11, fontWeight: '800' },
    track: {
      height: 10,
      borderRadius: 5,
      backgroundColor: theme.track,
      overflow: 'hidden',
    },
    fill: { height: '100%', borderRadius: 5 },
    exceeded: { color: theme.red, fontSize: 12, fontWeight: '700', marginTop: 6 },
    unbudgetedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.line,
    },
    unbudgetedName: { fontWeight: '800', color: theme.ink, fontSize: 15 },
    unbudgetedSpent: { color: theme.muted, fontSize: 12, marginTop: 2 },
    setBudgetBtn: {
      borderWidth: 1.5,
      borderColor: theme.ink,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    setBudgetText: { fontWeight: '800', fontSize: 11, color: theme.ink, letterSpacing: 0.3 },
    moreBtn: { alignItems: 'center', paddingVertical: 14 },
    moreBtnText: { color: theme.accent, fontWeight: '800' },
    sheetTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: theme.ink,
      textAlign: 'center',
      marginBottom: 14,
    },
    sheetCat: { alignItems: 'center', marginBottom: 6, gap: 6 },
    sheetCatName: { fontWeight: '800', fontSize: 16, color: theme.ink },
    sheetHint: { textAlign: 'center', color: theme.muted, marginBottom: 14, fontWeight: '600' },
    sheetInput: {
      borderWidth: 1.5,
      borderColor: theme.line,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 16,
      fontSize: 28,
      fontWeight: '800',
      textAlign: 'center',
      color: theme.ink,
      backgroundColor: theme.bg,
      marginBottom: 14,
    },
    saveBtn: {
      backgroundColor: theme.header,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
    },
    saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
    pickRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.line,
    },
    pickName: { fontWeight: '700', color: theme.ink, fontSize: 15 },
  });
}

