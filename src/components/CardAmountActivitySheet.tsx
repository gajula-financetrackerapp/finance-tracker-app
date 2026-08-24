import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { BottomSheet } from './BottomSheet';
import { fmt } from '../theme';
import {
  listCardAmountActivity,
  listCardAmountActivityFromMessages,
  type CardActivityKind,
  type CardActivityRow,
} from '../lib/cardActivity';
import { loadRecentCardBillMessages } from '../lib/cardBillScan';
import { extractAmount, extractDate } from '../lib/importRules/parseImportText';
import type { CreditCardView } from '../lib/cardFaces';
import type { ExpenseReminder, ThemeTokens, Transaction } from '../types';
import { useT } from '../i18n/useT';
import type { TranslationKey } from '../i18n/translations';

type Props = {
  card: CreditCardView | null;
  kind: CardActivityKind | null;
  reminder?: ExpenseReminder;
  transactions: Transaction[];
  currency: string;
  onClose: () => void;
};

function sourceLabel(row: CardActivityRow, t: (key: TranslationKey) => string) {
  const channel = row.channel === 'sms' ? t('cards.activitySms') : t('cards.activityTxn');
  const source =
    row.source === 'statement'
      ? t('cards.activityStatement')
      : row.source === 'due'
        ? t('cards.activityDue')
        : row.source === 'payment'
          ? t('cards.activityPayment')
          : row.source === 'spend'
            ? t('cards.activitySpend')
            : t('cards.activityExpense');
  return `${channel} · ${source}`;
}

export function CardAmountActivitySheet({
  card,
  kind,
  reminder,
  transactions,
  currency,
  onClose,
}: Props) {
  const { theme } = useApp();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [rows, setRows] = useState<CardActivityRow[]>([]);
  const [loading, setLoading] = useState(false);

  const stored = useMemo(() => {
    if (!card || !kind) return [];
    return listCardAmountActivity({ kind, card, reminder, transactions });
  }, [card, kind, reminder, transactions]);

  useEffect(() => {
    setRows(stored);
    if (!card || !kind) return;
    let cancelled = false;
    setLoading(true);
    void loadRecentCardBillMessages()
      .then(({ messages }) => {
        if (cancelled || !messages.length) return;
        setRows(
          listCardAmountActivityFromMessages(
            kind,
            card,
            reminder,
            transactions,
            messages,
            extractAmount,
            extractDate,
          ),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [card, kind, reminder, stored, transactions]);

  if (!card || !kind) return null;

  const title =
    kind === 'statement' ? t('cards.activityStatementTitle') : t('cards.activityExpensesTitle');
  const total =
    kind === 'statement'
      ? card.remaining ?? card.totalDue ?? 0
      : card.unbilledExpenses;

  return (
    <BottomSheet visible={!!card && !!kind} onClose={onClose}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.sub}>
        {card.last4s?.length
          ? `${card.issuer} ${card.last4s.join(' · ')}`
          : card.last4
            ? `${card.issuer} ${card.last4}`
            : card.issuer}
        {' · '}
        {fmt(Math.round(total), currency)}
      </Text>
      {loading ? <ActivityIndicator style={{ marginBottom: 10 }} color={theme.ink} /> : null}
      <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 12 }}>
        {rows.length === 0 ? (
          <Text style={styles.empty}>{t('cards.activityEmpty')}</Text>
        ) : (
          rows.map((row) => (
            <View key={row.id} style={styles.row}>
              <View style={styles.rowTop}>
                <Text style={styles.meta}>{sourceLabel(row, t)}</Text>
                <Text style={styles.amt}>{fmt(Math.round(row.amount), currency)}</Text>
              </View>
              <Text style={styles.date}>{row.date}</Text>
              {row.text ? <Text style={styles.body}>{row.text}</Text> : null}
            </View>
          ))
        )}
      </ScrollView>
    </BottomSheet>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    title: { color: theme.ink, fontSize: 18, fontWeight: '800', marginBottom: 4 },
    sub: { color: theme.muted, fontSize: 13, fontWeight: '700', marginBottom: 12 },
    list: { maxHeight: 420 },
    empty: { color: theme.muted, fontWeight: '600', paddingVertical: 20 },
    row: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.line,
      paddingVertical: 10,
    },
    rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
    meta: { color: theme.muted, fontSize: 11, fontWeight: '800', flex: 1 },
    amt: { color: theme.ink, fontSize: 14, fontWeight: '800' },
    date: { color: theme.muted, fontSize: 11, fontWeight: '600', marginTop: 2 },
    body: { color: theme.ink, fontSize: 13, fontWeight: '600', marginTop: 6, lineHeight: 18 },
  });
}
