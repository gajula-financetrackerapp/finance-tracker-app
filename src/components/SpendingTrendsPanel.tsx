import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { useApp } from '../context/AppContext';
import { fmt } from '../theme';
import type { ThemeTokens, Transaction } from '../types';
import { useT } from '../i18n/useT';
import { dateLocaleForLanguage } from '../i18n/dateLocales';

export type TrendGraphType = 'pace' | 'daily';
export type GraphType = TrendGraphType | 'compare';

type Props = {
  monthKey: string; // YYYY-MM
  transactions: Transaction[];
  currencyCode: string;
  language?: string | null;
  /** Controlled from Charts header graph dropdown. */
  graphType: TrendGraphType;
  /** Expenses vs income series for the graph. */
  moneyKind: 'expense' | 'income';
};

type MonthSpend = {
  key: string;
  spent: number;
  budget: number;
};

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function shiftMonthKey(key: string, delta: number) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatDayLabel(year: number, month: number, day: number, language?: string | null) {
  return new Date(year, month - 1, day).toLocaleDateString(dateLocaleForLanguage(language), {
    month: 'short',
    day: 'numeric',
  });
}

function formatRangeEdge(year: number, month: number, day: number, language?: string | null) {
  return new Date(year, month - 1, day).toLocaleDateString(dateLocaleForLanguage(language), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Spending pace / daily graphs for Charts. */
export function SpendingTrendsPanel({
  monthKey,
  transactions,
  currencyCode,
  language,
  graphType,
  moneyKind,
}: Props) {
  const { finance, theme } = useApp();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [chartWidth, setChartWidth] = useState(320);

  const [year, month] = monthKey.split('-').map(Number);
  const dim = daysInMonth(year, month);
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const progressDay = isCurrentMonth ? Math.min(today.getDate(), dim) : dim;

  const monthTxns = useMemo(
    () =>
      transactions.filter(
        (txn) =>
          !txn.homeHidden && txn.kind === moneyKind && (txn.date || '').startsWith(monthKey),
      ),
    [transactions, monthKey, moneyKind],
  );

  const dailySpend = useMemo(() => {
    const arr = Array.from({ length: dim + 1 }, () => 0);
    for (const txn of monthTxns) {
      const d = Number((txn.date || '').slice(8, 10));
      if (d >= 1 && d <= dim) arr[d] += txn.amount;
    }
    return arr;
  }, [monthTxns, dim]);

  const cumulative = useMemo(() => {
    const pts: number[] = [0];
    let sum = 0;
    for (let d = 1; d <= dim; d++) {
      sum += dailySpend[d];
      pts[d] = sum;
    }
    return pts;
  }, [dailySpend, dim]);

  const spent = cumulative[progressDay] || 0;

  const budget = useMemo(() => {
    if (moneyKind !== 'expense') return 0;
    return (finance.categoryBudgets || [])
      .filter((b) => b.month === monthKey && b.limit > 0)
      .reduce((s, b) => s + b.limit, 0);
  }, [finance.categoryBudgets, monthKey, moneyKind]);

  const yMax = Math.max(budget, spent, ...cumulative.slice(1), 1);

  const previousPeriods = useMemo((): MonthSpend[] => {
    const rows: MonthSpend[] = [];
    for (let i = 1; i <= 3; i++) {
      const key = shiftMonthKey(monthKey, -i);
      const spentAmt = transactions
        .filter(
          (txn) =>
            !txn.homeHidden && txn.kind === moneyKind && (txn.date || '').startsWith(key),
        )
        .reduce((s, txn) => s + txn.amount, 0);
      const budgetAmt =
        moneyKind === 'expense'
          ? (finance.categoryBudgets || [])
              .filter((b) => b.month === key && b.limit > 0)
              .reduce((s, b) => s + b.limit, 0)
          : 0;
      if (spentAmt > 0 || budgetAmt > 0) {
        rows.push({ key, spent: spentAmt, budget: budgetAmt });
      }
    }
    return rows;
  }, [monthKey, transactions, finance.categoryBudgets, moneyKind]);

  const daysLeft = Math.max(0, dim - progressDay);
  const remaining = budget > 0 ? budget - spent : 0;
  const dailyAllowance = daysLeft > 0 && remaining > 0 ? remaining / daysLeft : 0;
  const spentPct = budget > 0 ? Math.min(999, Math.round((spent / budget) * 100)) : 0;
  const timePct = Math.round((progressDay / dim) * 100);

  const onChartLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setChartWidth(w);
  };

  const tip = (() => {
    if (moneyKind === 'income') {
      return t('charts.tipIncome').replace('{amount}', fmt(spent, currencyCode));
    }
    if (budget <= 0) {
      return t('charts.tipNoBudget');
    }
    if (remaining < 0) {
      return t('charts.tipOver')
        .replace('{amount}', fmt(Math.abs(remaining), currencyCode));
    }
    if (daysLeft <= 0) {
      return remaining >= 0
        ? t('charts.tipEndedUnder').replace('{amount}', fmt(remaining, currencyCode))
        : t('charts.tipEndedOver').replace('{amount}', fmt(Math.abs(remaining), currencyCode));
    }
    return t('charts.tipKeep')
      .replace('{amount}', fmt(Math.round(dailyAllowance * 100) / 100, currencyCode));
  })();

  const tipTone = moneyKind === 'expense' && budget > 0 && remaining < 0 ? 'bad' : 'good';

  return (
    <View>
      <View style={styles.heroCard}>
        <Text
          style={[
            styles.heroSpent,
            {
              color:
                moneyKind === 'income'
                  ? theme.green
                  : budget > 0 && spent > budget
                    ? theme.red
                    : theme.green,
            },
          ]}
        >
          {fmt(spent, currencyCode)}
        </Text>
        <Text style={styles.heroSub}>
          {moneyKind === 'income'
            ? t('charts.earnedThisPeriod')
            : budget > 0
              ? t('charts.spentOutOf').replace('{budget}', fmt(budget, currencyCode))
              : t('charts.spentThisPeriod')}
        </Text>

        <View style={styles.chartBox} onLayout={onChartLayout}>
          {graphType === 'pace' ? (
            <PaceChart
              width={chartWidth}
              height={170}
              dim={dim}
              progressDay={progressDay}
              cumulative={cumulative}
              budget={budget}
              yMax={yMax}
              year={year}
              month={month}
              language={language}
              theme={theme}
              currencyCode={currencyCode}
            />
          ) : (
            <DailyBars
              width={chartWidth}
              height={170}
              dim={dim}
              progressDay={progressDay}
              dailySpend={dailySpend}
              year={year}
              month={month}
              language={language}
              theme={theme}
              currencyCode={currencyCode}
            />
          )}
        </View>

        <View style={[styles.tipBox, tipTone === 'bad' ? styles.tipBad : styles.tipGood]}>
          <Text style={[styles.tipText, tipTone === 'bad' ? styles.tipTextBad : styles.tipTextGood]}>
            {tip}
          </Text>
        </View>

        {budget > 0 ? (
          <View style={styles.progressBlock}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(100, spentPct)}%`,
                    backgroundColor: spent > budget ? theme.red : theme.green,
                  },
                ]}
              />
              {spentPct > 8 && spentPct <= 100 ? (
                <Text
                  style={[
                    styles.progressPctLabel,
                    { left: `${Math.min(92, Math.max(4, spentPct / 2))}%` },
                  ]}
                >
                  {spentPct}%
                </Text>
              ) : null}
              <View style={[styles.todayMark, { left: `${Math.min(98, Math.max(2, timePct))}%` }]}>
                <View style={styles.todayLine} />
                <View style={styles.todayPill}>
                  <Text style={styles.todayPillText}>{t('charts.today')}</Text>
                </View>
              </View>
            </View>
            <View style={styles.rangeRow}>
              <Text style={styles.rangeText}>
                {formatRangeEdge(year, month, 1, language)}
              </Text>
              <Text style={styles.rangeText}>
                {formatRangeEdge(year, month, dim, language)}
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      {previousPeriods.length > 0 ? (
        <View style={styles.prevBlock}>
          <Text style={styles.prevTitle}>{t('charts.previousPeriods')}</Text>
          {previousPeriods.map((row) => {
            const [py, pm] = row.key.split('-').map(Number);
            const pDim = daysInMonth(py, pm);
            const pct = row.budget > 0 ? Math.round((row.spent / row.budget) * 100) : 0;
            const over = row.budget > 0 && row.spent > row.budget;
            return (
              <View key={row.key} style={styles.prevCard}>
                <Text style={styles.prevSpent}>
                  {t('charts.spentPct')
                    .replace('{amount}', fmt(row.spent, currencyCode))
                    .replace(
                      '{pct}',
                      row.budget > 0 ? String(pct) : '—',
                    )}
                </Text>
                <View style={styles.prevTrack}>
                  <View
                    style={[
                      styles.prevFill,
                      {
                        width: `${Math.min(100, row.budget > 0 ? pct : 100)}%`,
                        backgroundColor: over ? theme.red : theme.green,
                      },
                    ]}
                  />
                </View>
                <View style={styles.rangeRow}>
                  <Text style={styles.rangeText}>
                    {formatRangeEdge(py, pm, 1, language)}
                  </Text>
                  <Text style={styles.rangeText}>
                    {formatRangeEdge(py, pm, pDim, language)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function PaceChart({
  width,
  height,
  dim,
  progressDay,
  cumulative,
  budget,
  yMax,
  year,
  month,
  language,
  theme,
  currencyCode,
}: {
  width: number;
  height: number;
  dim: number;
  progressDay: number;
  cumulative: number[];
  budget: number;
  yMax: number;
  year: number;
  month: number;
  language?: string | null;
  theme: ThemeTokens;
  currencyCode: string;
}) {
  const padL = 42;
  const padR = 10;
  const padT = 12;
  const padB = 28;
  const plotW = Math.max(40, width - padL - padR);
  const plotH = Math.max(40, height - padT - padB);

  const xAt = (day: number) => padL + ((day - 1) / Math.max(1, dim - 1)) * plotW;
  const yAt = (v: number) => padT + plotH - (v / yMax) * plotH;

  const linePts =
    progressDay >= 1
      ? [
          `${xAt(1)},${yAt(0)}`,
          ...Array.from({ length: progressDay }, (_, i) => {
            const d = i + 1;
            return `${xAt(d)},${yAt(cumulative[d] || 0)}`;
          }),
        ].join(' ')
      : '';

  const yTicks = [0, yMax / 2, yMax];
  const xTicks = [1, Math.round(dim / 3) || 1, Math.round((2 * dim) / 3) || dim, dim].filter(
    (v, i, a) => a.indexOf(v) === i && v >= 1 && v <= dim,
  );

  const endX = xAt(progressDay);
  const endY = yAt(cumulative[progressDay] || 0);
  const underPace =
    budget <= 0 ||
    (cumulative[progressDay] || 0) <= (budget * progressDay) / Math.max(1, dim);

  return (
    <Svg width={width} height={height}>
      {yTicks.map((v, i) => (
        <React.Fragment key={`y-${i}`}>
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
      {linePts ? (
        <Polyline
          points={linePts}
          fill="none"
          stroke={underPace ? theme.green : theme.primary}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
      {progressDay >= 1 ? (
        <Circle cx={endX} cy={endY} r={5} fill={underPace ? theme.green : theme.primary} />
      ) : null}
      {xTicks.map((d) => (
        <SvgText
          key={`x-${d}`}
          x={xAt(d)}
          y={height - 8}
          fill={theme.muted}
          fontSize="10"
          fontWeight="600"
          textAnchor="middle"
        >
          {formatDayLabel(year, month, d, language)}
        </SvgText>
      ))}
    </Svg>
  );
}

function DailyBars({
  width,
  height,
  dim,
  progressDay,
  dailySpend,
  year,
  month,
  language,
  theme,
  currencyCode,
}: {
  width: number;
  height: number;
  dim: number;
  progressDay: number;
  dailySpend: number[];
  year: number;
  month: number;
  language?: string | null;
  theme: ThemeTokens;
  currencyCode: string;
}) {
  const padL = 42;
  const padR = 10;
  const padT = 12;
  const padB = 28;
  const plotW = Math.max(40, width - padL - padR);
  const plotH = Math.max(40, height - padT - padB);
  const maxDay = Math.max(1, ...dailySpend.slice(1, progressDay + 1));
  const gap = 1.5;
  const barW = Math.max(2, plotW / dim - gap);

  const xAt = (day: number) => padL + ((day - 1) / dim) * plotW + gap / 2;
  const hAt = (v: number) => (v / maxDay) * plotH;

  const xTicks = [1, Math.round(dim / 3) || 1, Math.round((2 * dim) / 3) || dim, dim].filter(
    (v, i, a) => a.indexOf(v) === i && v >= 1 && v <= dim,
  );

  return (
    <Svg width={width} height={height}>
      <Line
        x1={padL}
        y1={padT + plotH}
        x2={padL + plotW}
        y2={padT + plotH}
        stroke={theme.line}
        strokeWidth={1}
      />
      <SvgText
        x={padL - 6}
        y={padT + 4}
        fill={theme.muted}
        fontSize="10"
        fontWeight="600"
        textAnchor="end"
      >
        {fmt(Math.round(maxDay), currencyCode).replace(/\.00$/, '')}
      </SvgText>
      {Array.from({ length: progressDay }, (_, i) => {
        const d = i + 1;
        const h = hAt(dailySpend[d] || 0);
        return (
          <Line
            key={d}
            x1={xAt(d) + barW / 2}
            y1={padT + plotH}
            x2={xAt(d) + barW / 2}
            y2={padT + plotH - h}
            stroke={theme.primary}
            strokeWidth={barW}
            strokeLinecap="butt"
          />
        );
      })}
      {xTicks.map((d) => (
        <SvgText
          key={`x-${d}`}
          x={xAt(d) + barW / 2}
          y={height - 8}
          fill={theme.muted}
          fontSize="10"
          fontWeight="600"
          textAnchor="middle"
        >
          {formatDayLabel(year, month, d, language)}
        </SvgText>
      ))}
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
    heroSpent: {
      fontSize: 32,
      fontWeight: '800',
      textAlign: 'center',
    },
    heroSub: {
      marginTop: 4,
      textAlign: 'center',
      color: theme.muted,
      fontWeight: '600',
      fontSize: 14,
      marginBottom: 12,
    },
    chartBox: { width: '100%', minHeight: 170 },
    tipBox: {
      marginTop: 12,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    tipGood: { backgroundColor: theme.green + '18' },
    tipBad: { backgroundColor: theme.red + '18' },
    tipText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
    tipTextGood: { color: theme.ink },
    tipTextBad: { color: theme.red },
    progressBlock: { marginTop: 16 },
    progressTrack: {
      height: 22,
      borderRadius: 11,
      backgroundColor: theme.track,
      overflow: 'visible',
      justifyContent: 'center',
    },
    progressFill: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      borderRadius: 11,
    },
    progressPctLabel: {
      position: 'absolute',
      color: '#fff',
      fontWeight: '800',
      fontSize: 11,
      transform: [{ translateX: -10 }],
    },
    todayMark: {
      position: 'absolute',
      top: -22,
      alignItems: 'center',
      width: 1,
    },
    todayLine: {
      width: 2,
      height: 44,
      backgroundColor: theme.ink,
      opacity: 0.45,
      borderRadius: 1,
    },
    todayPill: {
      position: 'absolute',
      top: -2,
      backgroundColor: theme.ink,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      transform: [{ translateX: -18 }],
    },
    todayPillText: { color: '#fff', fontSize: 10, fontWeight: '800' },
    rangeRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 10,
    },
    rangeText: { color: theme.muted, fontSize: 12, fontWeight: '600' },
    prevBlock: { marginBottom: 8 },
    prevTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: theme.ink,
      marginBottom: 10,
    },
    prevCard: {
      backgroundColor: theme.card,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.line,
      marginBottom: 10,
    },
    prevSpent: { fontWeight: '700', color: theme.ink, marginBottom: 8, fontSize: 14 },
    prevTrack: {
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.track,
      overflow: 'hidden',
    },
    prevFill: { height: 8, borderRadius: 4 },
  });
}
