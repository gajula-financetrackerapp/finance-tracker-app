import React, { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useFinance } from '../FinanceContext';
import { useApp } from '../context/AppContext';
import type { ThemeTokens } from '../types';
import { fmt } from '../theme';
import { GuestBanner } from '../components/Shared';
import { BottomSheet } from '../components/BottomSheet';
import { showAppDialog, showAppInfo } from '../appDialog';
import {
  PeriodFilterBar,
  defaultPeriodFilter,
  matchesPeriodDate,
  periodMonthKey,
  type PeriodFilterValue,
} from '../components/PeriodFilterBar';
import { useT } from '../i18n/useT';
import { currencySymbol } from '../utils';
import { CATEGORY_ICON_CHOICES } from '../categories/defaults';

const BUDGET_KEYPAD = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', '⌫'],
] as const;

const DEFAULT_NEW_CAT_ICON = '🛍️';

function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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
  const { isGuest, setShowAuth, setAuthMode } = useFinance();
  const { finance, setCategoryBudget, removeCategoryBudget, copyCategoryBudgetsFromMonth, config, expenseCategories, catMeta,
    addCategory,
    theme,
  } = useApp();
  const { t, catName } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [editor, setEditor] = useState<BudgetEditor | null>(null);
  const [pickCategory, setPickCategory] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState(DEFAULT_NEW_CAT_ICON);
  const [savingCat, setSavingCat] = useState(false);
  const [period, setPeriod] = useState<PeriodFilterValue>(defaultPeriodFilter);

  useFocusEffect(
    useCallback(() => {
      setPeriod(defaultPeriodFilter());
    }, []),
  );

  const yearsFromData = useMemo(() => {
    const years: string[] = [];
    for (const txn of finance.transactions) {
      const y = (txn.date || '').slice(0, 4);
      if (/^\d{4}$/.test(y)) years.push(y);
    }
    for (const b of finance.categoryBudgets || []) {
      const y = (b.month || '').slice(0, 4);
      if (/^\d{4}$/.test(y)) years.push(y);
    }
    return years;
  }, [finance.transactions, finance.categoryBudgets]);

  const viewMonth = periodMonthKey(period) || `${period.year}-${defaultPeriodFilter().month}`;

  const onPeriodChange = useCallback((next: PeriodFilterValue) => {
    setPeriod(next);
  }, []);
  const previousMonth = useMemo(() => shiftMonth(viewMonth, -1), [viewMonth]);

  const previousMonthBudgets = useMemo(
    () =>
      (finance.categoryBudgets || []).filter((b) => b.month === previousMonth && b.limit > 0),
    [finance.categoryBudgets, previousMonth],
  );

  const spentByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    finance.transactions
      .filter((t) => !t.homeHidden && t.kind === 'expense' && matchesPeriodDate(t.date, period))
      .forEach((t) => {
        map[t.category] = (map[t.category] || 0) + t.amount;
      });
    return map;
  }, [finance.transactions, period]);

  const monthBudgets = useMemo(
    () => (finance.categoryBudgets || []).filter((b) => b.month === viewMonth && b.limit > 0),
    [finance.categoryBudgets, viewMonth],
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

  const closePickCategory = () => {
    setPickCategory(false);
    setAddingCategory(false);
    setNewCatName('');
    setNewCatIcon(DEFAULT_NEW_CAT_ICON);
    setSavingCat(false);
  };

  const openSetBudget = (category: string, existingLimit?: number) => {
    if (!requireAuth()) return;
    closePickCategory();
    setEditor({
      category,
      limit: existingLimit && existingLimit > 0 ? String(existingLimit) : '',
    });
  };

  const openAddCategory = () => {
    if (!requireAuth()) return;
    setAddingCategory(true);
    setNewCatName('');
    setNewCatIcon(DEFAULT_NEW_CAT_ICON);
  };

  const createCategoryAndSetBudget = async () => {
    if (!requireAuth()) return;
    const name = newCatName.trim();
    if (!name) {
      showAppInfo(t('common.nameRequired'), t('categories.namePlaceholder'), '⚠️');
      return;
    }
    setSavingCat(true);
    const err = await addCategory('expense', { name, icon: newCatIcon || DEFAULT_NEW_CAT_ICON });
    setSavingCat(false);
    if (err) {
      showAppInfo(t('common.couldNotSave'), err, '⚠️');
      return;
    }
    openSetBudget(name);
  };

  const pressBudgetKey = (key: string) => {
    setEditor((prev) => {
      if (!prev) return prev;
      let limit = prev.limit;
      if (key === '⌫') {
        limit = limit.slice(0, -1);
      } else if (key === '.') {
        if (limit.includes('.')) return prev;
        limit = limit ? `${limit}.` : '0.';
      } else if (limit === '0') {
        limit = key;
      } else {
        limit = `${limit}${key}`;
      }
      if (limit.length > 12) return prev;
      return { ...prev, limit };
    });
  };

  const saveEditor = async () => {
    if (!editor) return;
    if (!requireAuth()) return;
    const limit = parseFloat(editor.limit) || 0;
    if (limit <= 0) {
      showAppInfo(t('budget.enterAmountTitle'), t('budget.enterAmountBody'), '⚠️');
      return;
    }
    await setCategoryBudget(viewMonth, editor.category, limit);
    setEditor(null);
  };

  const onMenu = (category: string, limit: number) => {
    showAppDialog({
      title: catName(category),
      message: `${t('budget.limit')}: ${fmt(limit, config.currency)}`,
      icon: '🧾',
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('budget.editBudget'),
          style: 'primary',
          onPress: () => openSetBudget(category, limit),
        },
        {
          text: t('budget.removeBudget'),
          style: 'destructive',
          onPress: () => {
            if (!requireAuth()) return;
            void removeCategoryBudget(viewMonth, category);
          },
        },
      ],
    });
  };

  const copyFromPreviousMonth = () => {
    if (!requireAuth()) return;
    if (previousMonthBudgets.length === 0) {
      showAppInfo(
        t('budget.copyPreviousTitle'),
        t('budget.copyPreviousEmpty').replace('{from}', shortMonthLabel(previousMonth)),
        'ℹ️',
      );
      return;
    }
    const body = [
      t('budget.copyPreviousBody')
        .replace('{from}', shortMonthLabel(previousMonth))
        .replace('{to}', shortMonthLabel(viewMonth)),
      monthBudgets.length > 0
        ? t('budget.copyPreviousReplace').replace('{to}', shortMonthLabel(viewMonth))
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    showAppDialog({
      title: t('budget.copyPreviousTitle'),
      message: body,
      icon: '📋',
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('budget.copyPreviousAction'),
          style: 'primary',
          onPress: () => {
            void (async () => {
              const res = await copyCategoryBudgetsFromMonth(previousMonth, viewMonth);
              if (res.error) {
                showAppInfo(t('budget.copyPreviousTitle'), res.error, '⚠️');
                return;
              }
              showAppInfo(
                t('budget.copyPreviousTitle'),
                t('budget.copyPreviousDone')
                  .replace('{n}', String(res.copied))
                  .replace('{from}', shortMonthLabel(previousMonth)),
                '✅',
              );
            })();
          },
        },
      ],
    });
  };

  return (
    <View style={styles.root}>
      <GuestBanner />

      <View style={styles.filterStrip}>
        <PeriodFilterBar
          value={period}
          onChange={onPeriodChange}
          yearsFromData={yearsFromData}
          language={config.language}
          allowAllMonths={false}
        />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>{t('budget.totalBudget')}</Text>
            <Text style={styles.summaryValue}>{fmt(totals.totalBudget, config.currency)}</Text>
          </View>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>{t('budget.totalSpent')}</Text>
            <Text style={[styles.summaryValue, { color: theme.red }]}>
              {fmt(totals.totalSpent, config.currency)}
            </Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          <Pressable
            style={[styles.actionBtn, styles.actionPrimary]}
            onPress={() => {
              if (!requireAuth()) return;
              setAddingCategory(false);
              setNewCatName('');
              setNewCatIcon(DEFAULT_NEW_CAT_ICON);
              setPickCategory(true);
            }}
          >
            <Text style={styles.actionPrimaryText} numberOfLines={2}>
              {t('budget.setBudget')}
            </Text>
          </Pressable>
          <Pressable style={[styles.actionBtn, styles.actionSecondary]} onPress={copyFromPreviousMonth}>
            <Text style={styles.actionSecondaryText} numberOfLines={2}>
              {t('budget.copyPrevious')}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>
          {t('budget.budgeted')}: {shortMonthLabel(viewMonth)}
        </Text>

        {budgetedRows.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{t('budget.empty')}</Text>
            <Text style={styles.emptySub}>{t('budget.emptySub')}</Text>
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
                      <Text style={styles.catName}>{catName(row.category)}</Text>
                      <Pressable onPress={() => onMenu(row.category, row.limit)} hitSlop={10}>
                        <Text style={styles.menuDots}>⋮</Text>
                      </Pressable>
                    </View>
                    <Text style={styles.metaLine}>
                      {t('budget.limit')}:{' '}
                      <Text style={styles.metaStrong}>{fmt(row.limit, config.currency)}</Text>
                    </Text>
                    <Text style={styles.metaLine}>
                      {t('budget.spent')}:{' '}
                      <Text style={{ color: row.over ? theme.red : theme.green, fontWeight: '700' }}>
                        {fmt(row.spent, config.currency)}
                      </Text>
                    </Text>
                    <Text style={styles.metaLine}>
                      {t('budget.remaining')}:{' '}
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
                  <Text style={styles.barPeriod}>({shortMonthLabel(viewMonth)})</Text>
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
                {row.over ? <Text style={styles.exceeded}>{t('budget.exceeded')}</Text> : null}
              </View>
            );
          })
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <BottomSheet visible={!!editor} onClose={() => setEditor(null)}>
        {editor ? (
          <>
            <Text style={styles.sheetTitle}>{t('budget.setBudget')}</Text>
            <View style={styles.sheetCat}>
              <Text style={{ fontSize: 28 }}>{catMeta(editor.category, 'expense').icon}</Text>
              <Text style={styles.sheetCatName}>{catName(editor.category)}</Text>
            </View>
            <Text style={styles.sheetHint}>{shortMonthLabel(viewMonth)}</Text>
            <View style={styles.amountDisplay}>
              <Text style={styles.amountSym}>{currencySymbol(config.currency)}</Text>
              <Text style={[styles.amountValue, !editor.limit && styles.amountPlaceholder]}>
                {editor.limit || '0'}
              </Text>
            </View>
            <View style={styles.keypad}>
              {BUDGET_KEYPAD.map((row) => (
                <View key={row.join('-')} style={styles.keypadRow}>
                  {row.map((key) => (
                    <Pressable
                      key={key}
                      onPress={() => pressBudgetKey(key)}
                      style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
                    >
                      <Text style={[styles.keyText, key === '⌫' && styles.keyBack]}>{key}</Text>
                    </Pressable>
                  ))}
                </View>
              ))}
            </View>
            <Pressable style={styles.saveBtn} onPress={saveEditor}>
              <Text style={styles.saveBtnText}>{t('budget.saveBudget')}</Text>
            </Pressable>
          </>
        ) : null}
      </BottomSheet>

      <BottomSheet visible={pickCategory} onClose={closePickCategory}>
        {addingCategory ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.addCatScroll}
          >
            <Text style={styles.sheetTitle}>{t('categories.add')}</Text>
            <Text style={styles.addCatLabel}>{t('common.name')}</Text>
            <TextInput
              value={newCatName}
              onChangeText={setNewCatName}
              placeholder={t('categories.namePlaceholder')}
              placeholderTextColor={theme.muted}
              autoCapitalize="words"
              autoFocus
              style={styles.addCatInput}
            />
            <Text style={styles.addCatLabel}>{t('common.icon')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.iconScroll}
              contentContainerStyle={styles.iconScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              {CATEGORY_ICON_CHOICES.map((ic) => (
                <Pressable
                  key={ic}
                  style={[styles.iconPick, newCatIcon === ic && styles.iconPickOn]}
                  onPress={() => setNewCatIcon(ic)}
                >
                  <Text style={{ fontSize: 22 }}>{ic}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              style={[styles.saveBtn, savingCat && { opacity: 0.7 }]}
              onPress={() => {
                if (!savingCat) void createCategoryAndSetBudget();
              }}
            >
              <Text style={styles.saveBtnText}>
                {savingCat ? t('common.saving') : t('budget.addAndSet')}
              </Text>
            </Pressable>
            <Pressable style={styles.addCatBack} onPress={() => setAddingCategory(false)} disabled={savingCat}>
              <Text style={styles.addCatBackText}>{t('common.cancel')}</Text>
            </Pressable>
          </ScrollView>
        ) : (
          <>
            <Text style={styles.sheetTitle}>{t('budget.chooseCategory')}</Text>
            <Pressable style={styles.addCatBtn} onPress={openAddCategory}>
              <Text style={styles.addCatBtnText}>+ {t('categories.add')}</Text>
            </Pressable>
            <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
              {notBudgeted.length === 0 ? (
                <Text style={styles.pickEmpty}>{t('budget.allBudgeted')}</Text>
              ) : (
                notBudgeted.map((row) => (
                  <View key={row.name} style={styles.pickRow}>
                    <View style={[styles.catIconSm, { backgroundColor: `${row.meta.color}18` }]}>
                      <Text style={{ fontSize: 18 }}>{row.meta.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickName}>{catName(row.name)}</Text>
                      {row.spent > 0 ? (
                        <Text style={styles.pickSpent}>
                          {t('budget.spent')} {fmt(row.spent, config.currency)}
                        </Text>
                      ) : null}
                    </View>
                    <Pressable style={styles.setBudgetBtn} onPress={() => openSetBudget(row.name)}>
                      <Text style={styles.setBudgetText}>{t('budget.setBudget')}</Text>
                    </Pressable>
                  </View>
                ))
              )}
            </ScrollView>
          </>
        )}
      </BottomSheet>
    </View>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bg, overflow: 'visible' },
    body: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 },
    filterStrip: {
      backgroundColor: theme.header,
      zIndex: 1,
      elevation: 0,
      overflow: 'visible',
    },
    monthNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      marginBottom: 16,
      marginTop: 6,
    },
    periodDrop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: theme.accentSoft,
      borderWidth: 1.5,
      borderColor: theme.header + '44',
    },
    periodDropText: { color: theme.header, fontWeight: '800', fontSize: 15 },
    periodDropChevron: { color: theme.header, fontSize: 12, fontWeight: '800' },
    periodModalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      paddingHorizontal: 28,
    },
    periodModalCard: {
      borderRadius: 16,
      maxHeight: '70%',
      overflow: 'hidden',
      paddingTop: 14,
    },
    periodModalTitle: {
      fontSize: 16,
      fontWeight: '800',
      paddingHorizontal: 16,
      marginBottom: 6,
    },
    periodModalList: { maxHeight: 360 },
    periodModalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      minHeight: 49,
    },
    periodModalRowText: { fontSize: 15, fontWeight: '600' },
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
    actionRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 18,
    },
    actionBtn: {
      flex: 1,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 10,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
    },
    actionPrimary: {
      backgroundColor: theme.header,
    },
    actionPrimaryText: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 12,
      letterSpacing: 0.3,
      textAlign: 'center',
    },
    actionSecondary: {
      borderWidth: 1.5,
      borderColor: theme.header,
      backgroundColor: theme.accentSoft,
    },
    actionSecondaryText: {
      color: theme.header,
      fontWeight: '800',
      fontSize: 12,
      textAlign: 'center',
    },
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
    setBudgetBtn: {
      borderWidth: 1.5,
      borderColor: theme.ink,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    setBudgetText: { fontWeight: '800', fontSize: 11, color: theme.ink, letterSpacing: 0.3 },
    sheetTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: theme.ink,
      textAlign: 'center',
      marginBottom: 14,
    },
    sheetCat: { alignItems: 'center', marginBottom: 6, gap: 6 },
    sheetCatName: { fontWeight: '800', fontSize: 16, color: theme.ink },
    sheetHint: { textAlign: 'center', color: theme.muted, marginBottom: 10, fontWeight: '600' },
    amountDisplay: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderWidth: 1.5,
      borderColor: theme.line,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: theme.bg,
      marginBottom: 10,
    },
    amountSym: { fontSize: 24, fontWeight: '800', color: theme.muted },
    amountValue: { fontSize: 28, fontWeight: '800', color: theme.ink, minWidth: 40, textAlign: 'center' },
    amountPlaceholder: { color: theme.muted },
    keypad: { marginBottom: 12, gap: 5 },
    keypadRow: { flexDirection: 'row', gap: 5 },
    key: {
      flex: 1,
      height: 42,
      borderRadius: 12,
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
    keyText: { fontSize: 19, fontWeight: '700', color: theme.ink },
    keyBack: { fontSize: 18, color: theme.muted },
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
    pickName: { fontWeight: '800', color: theme.ink, fontSize: 15 },
    pickSpent: { color: theme.muted, fontSize: 12, marginTop: 2 },
    pickEmpty: {
      textAlign: 'center',
      color: theme.muted,
      fontWeight: '600',
      paddingVertical: 24,
      paddingHorizontal: 8,
      lineHeight: 20,
    },
    addCatBtn: {
      alignSelf: 'stretch',
      borderWidth: 1.5,
      borderColor: theme.header,
      borderRadius: 12,
      paddingVertical: 11,
      alignItems: 'center',
      marginBottom: 12,
      backgroundColor: theme.accentSoft,
    },
    addCatBtnText: { color: theme.header, fontWeight: '800', fontSize: 14 },
    addCatScroll: { paddingBottom: 8 },
    addCatLabel: {
      color: theme.muted,
      fontSize: 12,
      fontWeight: '700',
      marginBottom: 6,
      letterSpacing: 0.3,
    },
    addCatInput: {
      borderWidth: 1.5,
      borderColor: theme.line,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      fontWeight: '700',
      color: theme.ink,
      backgroundColor: theme.bg,
      marginBottom: 12,
    },
    iconScroll: { marginBottom: 14, maxHeight: 52 },
    iconScrollContent: { gap: 8, paddingRight: 8 },
    iconPick: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: theme.line,
      backgroundColor: theme.bg,
    },
    iconPickOn: {
      borderColor: theme.header,
      backgroundColor: theme.accentSoft,
    },
    addCatBack: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
    addCatBackText: { color: theme.muted, fontWeight: '700', fontSize: 14 },
  });
}

