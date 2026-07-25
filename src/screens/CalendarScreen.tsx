import React, { useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { fmt } from '../theme';
import { currencySymbol, monthKey } from '../utils';
import type { Transaction, ThemeTokens } from '../types';
import { useT } from '../i18n/useT';
import { resolveLanguageCode } from '../i18n/translations';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const YEAR_MIN = 1950;
const YEAR_MAX = 2100;

/** Maps app language codes to BCP-47 locales for date formatting. */
const CALENDAR_LOCALE_BY_LANG: Record<string, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  kn: 'kn-IN',
  ml: 'ml-IN',
  mr: 'mr-IN',
  bn: 'bn-IN',
  gu: 'gu-IN',
};

function calendarLocale(language: string | null | undefined): string {
  return CALENDAR_LOCALE_BY_LANG[resolveLanguageCode(language)] || 'en-IN';
}

function monthName(monthNum: string, language: string | null | undefined) {
  const m = Number(monthNum);
  if (!m || m < 1 || m > 12) return monthNum;
  return new Date(2000, m - 1, 1).toLocaleDateString(calendarLocale(language), {
    month: 'short',
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

type PeriodPickerKind = 'year' | 'month' | null;

const YEAR_ROW_HEIGHT = 49;

const YEAR_OPTIONS = (() => {
  const years: string[] = [];
  for (let y = YEAR_MAX; y >= YEAR_MIN; y -= 1) years.push(String(y));
  return years;
})();

export function CalendarScreen() {
  const { finance, config, catMeta, theme } = useApp();
  const { t, catName } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [month, setMonth] = useState(monthKey());
  const today = new Date().toISOString().slice(0, 10);
  const [selected, setSelected] = useState(today.startsWith(month) ? today : `${month}-01`);
  const [periodPicker, setPeriodPicker] = useState<PeriodPickerKind>(null);
  const yearListRef = useRef<FlatList<string>>(null);

  const selectedYear = month.slice(0, 4);
  const selectedMonth = month.slice(5, 7);
  const [y, m] = month.split('-').map(Number);
  const monthIndex = m - 1;
  const daysInMonth = new Date(y, monthIndex + 1, 0).getDate();
  const startWeekday = new Date(y, monthIndex, 1).getDay();

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const value = String(i + 1).padStart(2, '0');
        return { value, label: monthName(value, config.language) };
      }),
    [config.language],
  );

  const byDate = useMemo(() => {
    const map: Record<string, { income: number; expense: number }> = {};
    finance.transactions.forEach((txn) => {
      if (!txn.date.startsWith(month)) return;
      if (!map[txn.date]) map[txn.date] = { income: 0, expense: 0 };
      if (txn.kind === 'income') map[txn.date].income += txn.amount;
      else if (txn.kind === 'expense') map[txn.date].expense += txn.amount;
    });
    return map;
  }, [finance.transactions, month]);

  const dayTxns = useMemo(
    () =>
      finance.transactions
        .filter((txn) => txn.date === selected && txn.kind !== 'transfer')
        .sort((a, b) => b.id.localeCompare(a.id)),
    [finance.transactions, selected],
  );

  const monthTotals = useMemo(() => {
    let income = 0;
    let expense = 0;
    finance.transactions.forEach((txn) => {
      if (!txn.date.startsWith(month)) return;
      if (txn.kind === 'income') income += txn.amount;
      else if (txn.kind === 'expense') expense += txn.amount;
    });
    return { income, expense };
  }, [finance.transactions, month]);

  const dayTotals = byDate[selected] || { income: 0, expense: 0 };
  const dayNet = dayTotals.income - dayTotals.expense;
  const sym = currencySymbol(config.currency);

  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const applyPeriod = (year: string, monthNum: string) => {
    const yearN = Math.min(YEAR_MAX, Math.max(YEAR_MIN, Number(year) || YEAR_MIN));
    const monthN = Math.min(12, Math.max(1, Number(monthNum) || 1));
    const next = `${yearN}-${String(monthN).padStart(2, '0')}`;
    setMonth(next);
    if (today.startsWith(next)) {
      setSelected(today);
    } else {
      const maxDay = new Date(yearN, monthN, 0).getDate();
      const curDay = Math.min(Number(selected.slice(8, 10)) || 1, maxDay);
      setSelected(`${next}-${String(curDay).padStart(2, '0')}`);
    }
    setPeriodPicker(null);
  };

  const renderTxn = ({ item }: { item: Transaction }) => {
    const kind = item.kind === 'income' ? 'income' : 'expense';
    const meta = catMeta(item.category, kind);
    const account = finance.accounts.find((a) => a.id === item.accountId);
    return (
      <View style={styles.txnRow}>
        <View style={[styles.txnIcon, { backgroundColor: `${meta.color}22` }]}>
          <Text style={{ fontSize: 18 }}>{meta.icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.txnTitle}>{catName(item.category)}</Text>
          <Text style={styles.txnSub} numberOfLines={1}>
            {account ? account.name : item.note || kind}
            {item.note && account ? ` · ${item.note}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.txnAmt, { color: item.kind === 'income' ? theme.green : theme.red }]}>
            {item.kind === 'income' ? '+' : '-'}
            {fmt(item.amount, config.currency)}
          </Text>
          <Text style={styles.txnDate}>{item.date.slice(5).replace('-', '/')}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      {/* Fixed calendar — no top gap */}
      <View style={styles.calendarBlock}>
        <View style={styles.monthNav}>
          <Pressable
            onPress={() => setPeriodPicker('year')}
            style={styles.periodDrop}
            accessibilityRole="button"
            accessibilityLabel="Year"
          >
            <Text style={styles.periodDropText}>{selectedYear}</Text>
            <Text style={styles.periodDropChevron}>▾</Text>
          </Pressable>
          <Pressable
            onPress={() => setPeriodPicker('month')}
            style={styles.periodDrop}
            accessibilityRole="button"
            accessibilityLabel="Month"
          >
            <Text style={styles.periodDropText}>
              {monthName(selectedMonth, config.language)}
            </Text>
            <Text style={styles.periodDropChevron}>▾</Text>
          </Pressable>
        </View>

        <Modal
          visible={periodPicker != null}
          transparent
          animationType="fade"
          onRequestClose={() => setPeriodPicker(null)}
        >
          <View style={styles.periodModalBackdrop}>
            <Pressable
              style={StyleSheet.absoluteFillObject}
              onPress={() => setPeriodPicker(null)}
            />
            <View style={[styles.periodModalCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.periodModalTitle, { color: theme.ink }]}>
                {periodPicker === 'year' ? 'Year' : 'Month'}
              </Text>
              {periodPicker === 'year' ? (
                <FlatList
                  ref={yearListRef}
                  key={`year-list-${selectedYear}`}
                  style={styles.periodModalList}
                  data={YEAR_OPTIONS}
                  keyExtractor={(year) => year}
                  keyboardShouldPersistTaps="handled"
                  initialNumToRender={20}
                  windowSize={11}
                  getItemLayout={(_, index) => ({
                    length: YEAR_ROW_HEIGHT,
                    offset: YEAR_ROW_HEIGHT * index,
                    index,
                  })}
                  // Keep a few years above the selected one so neighbors stay visible.
                  initialScrollIndex={Math.max(
                    0,
                    YEAR_OPTIONS.indexOf(selectedYear) - 3,
                  )}
                  onScrollToIndexFailed={(info) => {
                    setTimeout(() => {
                      yearListRef.current?.scrollToOffset({
                        offset: Math.max(0, info.index * YEAR_ROW_HEIGHT),
                        animated: false,
                      });
                    }, 50);
                  }}
                  renderItem={({ item: year }) => {
                    const on = year === selectedYear;
                    return (
                      <Pressable
                        onPress={() => applyPeriod(year, selectedMonth)}
                        style={[
                          styles.periodModalRow,
                          { borderTopColor: theme.line },
                          on && { backgroundColor: theme.accentSoft },
                        ]}
                      >
                        <Text
                          style={[
                            styles.periodModalRowText,
                            { color: theme.ink },
                            on && { color: theme.header, fontWeight: '800' },
                          ]}
                        >
                          {year}
                        </Text>
                        {on ? (
                          <Text style={{ color: theme.header, fontWeight: '800' }}>✓</Text>
                        ) : null}
                      </Pressable>
                    );
                  }}
                />
              ) : (
                <ScrollView style={styles.periodModalList} keyboardShouldPersistTaps="handled">
                  {monthOptions.map((opt) => {
                    const on = opt.value === selectedMonth;
                    return (
                      <Pressable
                        key={opt.value}
                        onPress={() => applyPeriod(selectedYear, opt.value)}
                        style={[
                          styles.periodModalRow,
                          { borderTopColor: theme.line },
                          on && { backgroundColor: theme.accentSoft },
                        ]}
                      >
                        <Text
                          style={[
                            styles.periodModalRowText,
                            { color: theme.ink },
                            on && { color: theme.header, fontWeight: '800' },
                          ]}
                        >
                          {opt.label}
                        </Text>
                        {on ? (
                          <Text style={{ color: theme.header, fontWeight: '800' }}>✓</Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>

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
        <View style={styles.detailSide}>
          <Text style={styles.detailSideLabel}>{t('calendar.monthTotals')}</Text>
          <View style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: theme.green }]} />
            <Text style={[styles.legendText, { color: theme.green }]}>
              {t('home.income')} {sym}
              {fullAmt(monthTotals.income, config.currency)}
            </Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: theme.red }]} />
            <Text style={[styles.legendText, { color: theme.red }]}>
              {t('home.expenses')} -{sym}
              {fullAmt(monthTotals.expense, config.currency)}
            </Text>
          </View>
        </View>
        <View style={styles.detailSideEnd}>
          <Text style={[styles.detailNet, { color: dayNet >= 0 ? theme.green : theme.red }]}>
            {dayNet < 0 ? '-' : ''}
            {sym}
            {fullAmt(dayNet, config.currency)}
          </Text>
          <View style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: theme.green }]} />
            <Text style={styles.legendText}>
              {t('home.income')} {sym}
              {fullAmt(dayTotals.income, config.currency)}
            </Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: theme.red }]} />
            <Text style={styles.legendText}>
              {t('home.expenses')} -{sym}
              {fullAmt(dayTotals.expense, config.currency)}
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.listLabel}>
        {dayTxns.length === 0 ? t('calendar.noTxns') : `${dayTxns.length} ${t('home.records')}`}
      </Text>

      {/* Only this area scrolls */}
      <FlatList
        style={styles.list}
        data={dayTxns}
        keyExtractor={(t) => t.id}
        renderItem={renderTxn}
        ListEmptyComponent={
          <Text style={styles.empty}>{t('calendar.empty')}</Text>
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

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
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
      paddingTop: 6,
      paddingBottom: 4,
      gap: 8,
    },
    periodDrop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: theme.accentSoft,
      borderWidth: 1,
      borderColor: theme.line,
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
    detailSide: { flex: 1, paddingRight: 8 },
    detailSideEnd: { alignItems: 'flex-end', flexShrink: 0 },
    detailSideLabel: {
      fontWeight: '800',
      fontSize: 12,
      color: theme.muted,
      marginBottom: 2,
    },
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
}

