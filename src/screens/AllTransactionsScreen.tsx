import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { requireAuthToSave } from '../authGate';
import { showAppDialog, showAppInfo } from '../appDialog';
import {
  PeriodFilterBar,
  defaultPeriodFilter,
  matchesPeriodDate,
  type PeriodFilterValue,
} from '../components/PeriodFilterBar';
import { fmt } from '../theme';
import { dateLocaleForLanguage } from '../i18n/dateLocales';
import { useT } from '../i18n/useT';
import type { ThemeTokens, Transaction } from '../types';

function formatDisplayDate(iso: string, language: string | null | undefined) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(dateLocaleForLanguage(language), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Profile → All transactions: filter by year / month / day, multi-select delete.
 */
export function AllTransactionsScreen() {
  const { theme, finance, config, catMeta, deleteTransaction } = useApp();
  const { t, catName } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const [period, setPeriod] = useState<PeriodFilterValue>(defaultPeriodFilter);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

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
    return years;
  }, [finance.transactions]);

  useEffect(() => {
    setSelected({});
  }, [period]);

  const filtered = useMemo(() => {
    return finance.transactions
      .filter((txn) => matchesPeriodDate(txn.date, period))
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }, [finance.transactions, period]);

  const selectedIds = useMemo(
    () => filtered.map((t) => t.id).filter((id) => selected[id]),
    [filtered, selected],
  );
  const allVisibleSelected =
    filtered.length > 0 && filtered.every((t) => selected[t.id]);

  const toggleOne = (id: string) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleAllVisible = () => {
    if (allVisibleSelected) {
      setSelected({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const t of filtered) next[t.id] = true;
    setSelected(next);
  };

  const rowMeta = (txn: Transaction) => {
    if (txn.kind === 'transfer') {
      return { icon: '↔', color: theme.header, label: t('allTxns.transfer') };
    }
    const kind = txn.kind === 'income' ? 'income' : 'expense';
    const meta = catMeta(txn.category, kind);
    return { icon: meta.icon, color: meta.color, label: catName(txn.category) };
  };

  const confirmDelete = () => {
    if (selectedIds.length === 0) return;
    if (!requireAuthToSave('delete transactions')) return;
    showAppDialog({
      title: t('allTxns.deleteTitle'),
      message: t('allTxns.deleteBody').replace('{count}', String(selectedIds.length)),
      icon: '🗑',
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('home.delete'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              for (const id of selectedIds) {
                await deleteTransaction(id);
              }
              setSelected({});
              showAppInfo(
                t('common.deleted'),
                t('allTxns.deletedOk').replace('{count}', String(selectedIds.length)),
                '🗑',
              );
            })();
          },
        },
      ],
    });
  };

  return (
    <View style={styles.root}>
      <View style={[styles.filters, { borderBottomColor: theme.line }]}>
        <PeriodFilterBar
          value={period}
          onChange={setPeriod}
          yearsFromData={yearsFromData}
          language={config.language}
        />

        <View style={styles.toolbar}>
          <Text style={[styles.count, { color: theme.muted }]}>
            {t('allTxns.count').replace('{count}', String(filtered.length))}
          </Text>
          {filtered.length > 0 ? (
            <Pressable onPress={toggleAllVisible} hitSlop={8}>
              <Text style={[styles.selectAll, { color: theme.header }]}>
                {allVisibleSelected ? t('allTxns.clearSelection') : t('allTxns.selectAll')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: Math.max(insets.bottom, 16) + (selectedIds.length ? 88 : 24),
          flexGrow: 1,
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={[styles.emptyTitle, { color: theme.ink }]}>{t('allTxns.empty')}</Text>
            <Text style={[styles.emptySub, { color: theme.muted }]}>{t('allTxns.emptyHint')}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const meta = rowMeta(item);
          const on = !!selected[item.id];
          const accent =
            item.kind === 'income' ? theme.green : item.kind === 'expense' ? theme.red : theme.ink;
          const sign = item.kind === 'income' ? '+' : item.kind === 'expense' ? '-' : '';
          return (
            <Pressable
              onPress={() => toggleOne(item.id)}
              style={[
                styles.row,
                {
                  backgroundColor: theme.card,
                  borderColor: on ? theme.header : theme.line,
                },
              ]}
            >
              <View
                style={[
                  styles.check,
                  {
                    borderColor: on ? theme.header : theme.line,
                    backgroundColor: on ? theme.header : theme.bg,
                  },
                ]}
              >
                {on ? <Text style={styles.checkMark}>✓</Text> : null}
              </View>
              <View style={[styles.icon, { backgroundColor: `${meta.color}22` }]}>
                <Text style={{ fontSize: 18 }}>{meta.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: theme.ink }]} numberOfLines={1}>
                  {meta.label}
                </Text>
                <Text style={[styles.rowSub, { color: theme.muted }]} numberOfLines={1}>
                  {formatDisplayDate(item.date, config.language)}
                  {item.note ? ` · ${item.note}` : ''}
                </Text>
              </View>
              <Text style={[styles.rowAmt, { color: accent }]}>
                {sign}
                {fmt(item.amount, config.currency)}
              </Text>
            </Pressable>
          );
        }}
      />

      {selectedIds.length > 0 ? (
        <View
          style={[
            styles.deleteBar,
            {
              backgroundColor: theme.card,
              borderTopColor: theme.line,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <Text style={[styles.deleteCount, { color: theme.ink }]}>
            {t('allTxns.selected').replace('{count}', String(selectedIds.length))}
          </Text>
          <Pressable
            onPress={confirmDelete}
            style={[styles.deleteBtn, { backgroundColor: theme.red }]}
          >
            <Text style={styles.deleteBtnText}>{t('allTxns.deleteSelected')}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bg, overflow: 'visible' },
    filters: {
      zIndex: 1,
      elevation: 0,
      overflow: 'visible',
      backgroundColor: theme.header,
    },
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingBottom: 8,
      minHeight: 28,
      backgroundColor: theme.bg,
    },
    count: { fontSize: 12, fontWeight: '700' },
    selectAll: { fontSize: 13, fontWeight: '800' },
    empty: { alignItems: 'center', paddingVertical: 64 },
    emptyIcon: { fontSize: 40, marginBottom: 10, opacity: 0.5 },
    emptyTitle: { fontWeight: '800', fontSize: 16 },
    emptySub: { marginTop: 4, fontSize: 13, textAlign: 'center', paddingHorizontal: 24 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 14,
      padding: 12,
      marginBottom: 10,
      borderWidth: 1.5,
      gap: 10,
    },
    check: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkMark: { color: '#fff', fontWeight: '900', fontSize: 12 },
    icon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowTitle: { fontWeight: '700', fontSize: 14 },
    rowSub: { fontSize: 12, marginTop: 2 },
    rowAmt: { fontWeight: '800', fontSize: 14 },
    deleteBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    deleteCount: { flex: 1, fontWeight: '800', fontSize: 14 },
    deleteBtn: {
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    deleteBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  });
}
