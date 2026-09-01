import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import { useApp } from '../context/AppContext';
import { fmt } from '../theme';
import type { ThemeTokens, Transaction } from '../types';
import { useT } from '../i18n/useT';
import { dateLocaleForLanguage } from '../i18n/dateLocales';

const MONTHS_SHOWN = 6;

type Props = {
  /** End month of the comparison window (YYYY-MM). */
  endMonthKey: string;
  transactions: Transaction[];
  currencyCode: string;
  language?: string | null;
  moneyKind: 'expense' | 'income';
};

type MonthRow = {
  key: string;
  total: number;
  delta: number | null;
  deltaPct: number | null;
};

function shiftMonthKey(key: string, delta: number) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string, language?: string | null) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(dateLocaleForLanguage(language), {
    month: 'short',
    year: '2-digit',
  });
}

/** Bar chart comparing the last N months ending at endMonthKey. */
export function MonthComparePanel({
  endMonthKey,
  transactions,
  currencyCode,
  language,
  moneyKind,
}: Props) {
  const { theme } = useApp();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [chartWidth, setChartWidth] = useState(320);

  const rows = useMemo((): MonthRow[] => {
    const keys: string[] = [];
    for (let i = MONTHS_SHOWN - 1; i >= 0; i--) {
      keys.push(shiftMonthKey(endMonthKey, -i));
    }
    const totals = keys.map((key) =>
      transactions
        .filter(
          (txn) =>
            !txn.homeHidden && txn.kind === moneyKind && (txn.date || '').startsWith(key),
        )
        .reduce((s, txn) => s + txn.amount, 0),
    );
    return keys.map((key, i) => {
      const total = totals[i];
      const prev = i > 0 ? totals[i - 1] : null;
      const delta = prev == null ? null : total - prev;
      const deltaPct =
        prev == null || prev === 0 ? null : Math.round(((total - prev) / prev) * 100);
      return { key, total, delta, deltaPct };
    });
  }, [endMonthKey, transactions, moneyKind]);

  const maxTotal = Math.max(1, ...rows.map((r) => r.total));
  const latest = rows[rows.length - 1];
  const prior = rows.length > 1 ? rows[rows.length - 2] : null;

  const summaryDelta = latest && prior ? latest.total - prior.total : null;
  const summaryPct =
    latest && prior && prior.total > 0
      ? Math.round(((latest.total - prior.total) / prior.total) * 100)
      : null;

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setChartWidth(w);
  };

  const barColor = moneyKind === 'expense' ? theme.red : theme.green;

  return (
    <View>
      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>
          {moneyKind === 'expense' ? t('charts.compareExpenses') : t('charts.compareIncome')}
        </Text>
        <Text style={[styles.heroAmount, { color: barColor }]}>
          {fmt(latest?.total || 0, currencyCode)}
        </Text>
        <Text style={styles.heroSub}>
          {t('charts.compareLatest')
            .replace('{month}', monthLabel(endMonthKey, language))}
        </Text>
        {summaryDelta != null ? (
          <Text
            style={[
              styles.vsPrev,
              {
                color:
                  summaryDelta === 0
                    ? theme.muted
                    : moneyKind === 'expense'
                      ? summaryDelta > 0
                        ? theme.red
                        : theme.green
                      : summaryDelta > 0
                        ? theme.green
                        : theme.red,
              },
            ]}
          >
            {summaryDelta === 0
              ? t('charts.compareSame')
              : t('charts.compareVsPrev')
                  .replace(
                    '{sign}',
                    summaryDelta > 0 ? '+' : '−',
                  )
                  .replace('{amount}', fmt(Math.abs(summaryDelta), currencyCode))
                  .replace(
                    '{pct}',
                    summaryPct == null ? '—' : `${summaryPct > 0 ? '+' : ''}${summaryPct}`,
                  )}
          </Text>
        ) : null}

        <View style={styles.chartBox} onLayout={onLayout}>
          <CompareBars
            width={chartWidth}
            height={180}
            rows={rows}
            maxTotal={maxTotal}
            language={language}
            theme={theme}
            barColor={barColor}
            currencyCode={currencyCode}
            highlightKey={endMonthKey}
          />
        </View>
        <Text style={styles.hint}>{t('charts.compareHint')}</Text>
      </View>

      {rows
        .slice()
        .reverse()
        .map((row) => {
          const downIsGood = moneyKind === 'expense';
          const deltaColor =
            row.delta == null || row.delta === 0
              ? theme.muted
              : row.delta > 0
                ? downIsGood
                  ? theme.red
                  : theme.green
                : downIsGood
                  ? theme.green
                  : theme.red;
          return (
            <View key={row.key} style={styles.row}>
              <View style={styles.rowMeta}>
                <Text style={styles.rowMonth}>{monthLabel(row.key, language)}</Text>
                {row.delta != null ? (
                  <Text style={[styles.rowDelta, { color: deltaColor }]}>
                    {row.delta === 0
                      ? t('charts.compareSame')
                      : `${row.delta > 0 ? '+' : '−'}${fmt(Math.abs(row.delta), currencyCode)}${
                          row.deltaPct == null ? '' : ` (${row.deltaPct > 0 ? '+' : ''}${row.deltaPct}%)`
                        }`}
                  </Text>
                ) : (
                  <Text style={[styles.rowDelta, { color: theme.muted }]}>
                    {t('charts.compareBaseline')}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.rowAmt,
                  { color: moneyKind === 'expense' ? theme.red : theme.green },
                ]}
              >
                {moneyKind === 'expense' ? '−' : '+'}
                {fmt(row.total, currencyCode)}
              </Text>
            </View>
          );
        })}
    </View>
  );
}

function CompareBars({
  width,
  height,
  rows,
  maxTotal,
  language,
  theme,
  barColor,
  currencyCode,
  highlightKey,
}: {
  width: number;
  height: number;
  rows: MonthRow[];
  maxTotal: number;
  language?: string | null;
  theme: ThemeTokens;
  barColor: string;
  currencyCode: string;
  highlightKey: string;
}) {
  const padL = 44;
  const padR = 8;
  const padT = 16;
  const padB = 28;
  const plotW = Math.max(40, width - padL - padR);
  const plotH = Math.max(40, height - padT - padB);
  const n = rows.length;
  const gap = 8;
  const barW = Math.max(10, (plotW - gap * (n + 1)) / n);

  const yAt = (v: number) => padT + plotH - (v / maxTotal) * plotH;

  return (
    <Svg width={width} height={height}>
      {[0, maxTotal / 2, maxTotal].map((v, i) => (
        <React.Fragment key={i}>
          <Line
            x1={padL}
            y1={yAt(v)}
            x2={padL + plotW}
            y2={yAt(v)}
            stroke={theme.line}
            strokeWidth={1}
          />
          <SvgText
            x={padL - 6}
            y={yAt(v) + 4}
            fill={theme.muted}
            fontSize="10"
            fontWeight="600"
            textAnchor="end"
          >
            {fmt(Math.round(v), currencyCode).replace(/\.00$/, '')}
          </SvgText>
        </React.Fragment>
      ))}
      {rows.map((row, i) => {
        const x = padL + gap + i * (barW + gap);
        const top = yAt(row.total);
        const h = Math.max(2, padT + plotH - top);
        const on = row.key === highlightKey;
        return (
          <React.Fragment key={row.key}>
            <Rect
              x={x}
              y={top}
              width={barW}
              height={h}
              rx={6}
              fill={barColor}
              opacity={on ? 1 : 0.45}
            />
            <SvgText
              x={x + barW / 2}
              y={height - 8}
              fill={on ? theme.ink : theme.muted}
              fontSize="10"
              fontWeight={on ? '800' : '600'}
              textAnchor="middle"
            >
              {monthLabel(row.key, language)}
            </SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    heroCard: {
      backgroundColor: theme.card,
      borderRadius: 20,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.line,
      marginBottom: 12,
    },
    heroTitle: {
      textAlign: 'center',
      color: theme.muted,
      fontWeight: '700',
      fontSize: 13,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    heroAmount: {
      marginTop: 6,
      textAlign: 'center',
      fontSize: 30,
      fontWeight: '800',
    },
    heroSub: {
      marginTop: 4,
      textAlign: 'center',
      color: theme.muted,
      fontWeight: '600',
      fontSize: 13,
    },
    vsPrev: {
      marginTop: 8,
      textAlign: 'center',
      fontWeight: '700',
      fontSize: 13,
    },
    chartBox: { width: '100%', minHeight: 180, marginTop: 10 },
    hint: {
      marginTop: 8,
      textAlign: 'center',
      color: theme.muted,
      fontSize: 12,
      fontWeight: '600',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.card,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: theme.line,
      gap: 12,
    },
    rowMeta: { flex: 1, minWidth: 0 },
    rowMonth: { fontWeight: '800', color: theme.ink, fontSize: 15 },
    rowDelta: { marginTop: 2, fontWeight: '600', fontSize: 12 },
    rowAmt: { fontWeight: '800', fontSize: 14 },
  });
}
