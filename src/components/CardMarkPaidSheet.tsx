import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { BottomSheet } from './BottomSheet';
import { Field, PrimaryButton } from './ui';
import { showAppInfo } from '../appDialog';
import { requireAuthToSave } from '../authGate';
import { applyManualCardPayment } from '../lib/cardBills';
import { remindersForCardView, type CreditCardView } from '../lib/cardFaces';
import { fmt } from '../theme';
import type { ExpenseReminder, ThemeTokens } from '../types';
import { useT } from '../i18n/useT';
import { todayStr } from '../utils';

type Props = {
  card: CreditCardView | null;
  reminders: ExpenseReminder[];
  currency: string;
  onClose: () => void;
  onSave: (next: ExpenseReminder[], paidAmount: number) => Promise<void>;
};

export function CardMarkPaidSheet({ card, reminders, currency, onClose, onSave }: Props) {
  const { theme } = useApp();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const remaining = Math.max(0, card?.remaining || 0);
  const [mode, setMode] = useState<'full' | 'custom'>('full');
  const [custom, setCustom] = useState('');

  useEffect(() => {
    setMode('full');
    setCustom(remaining > 0 ? String(Math.round(remaining)) : '');
  }, [card, remaining]);

  if (!card) return null;

  const save = async () => {
    if (!requireAuthToSave('mark a card bill paid')) return;
    const typed =
      mode === 'full' ? remaining : Number(String(custom).replace(/,/g, ''));
    if (!Number.isFinite(typed) || typed <= 0) {
      showAppInfo(t('cards.payTitle'), t('cards.payNeedAmount'), '💳');
      return;
    }
    if (typed > remaining + 0.009) {
      showAppInfo(
        t('cards.payTitle'),
        t('cards.payTooMuch').replace('{amount}', fmt(Math.round(remaining), currency)),
        '⚠️',
      );
      return;
    }
    const ids = remindersForCardView(card, reminders).map((r) => r.id);
    const result = applyManualCardPayment(reminders, ids, typed, todayStr());
    if (result.paidAmount <= 0) return;
    await onSave(result.next, result.paidAmount);
    showAppInfo(
      t('cards.payTitle'),
      result.fullyPaid
        ? t('cards.paySavedFull')
        : t('cards.paySaved')
            .replace('{amount}', fmt(Math.round(result.paidAmount), currency))
            .replace('{remaining}', fmt(Math.round(result.remaining), currency)),
      '✅',
    );
  };

  return (
    <BottomSheet visible={!!card} onClose={onClose}>
      <Text style={styles.title}>{t('cards.payTitle')}</Text>
      <Text style={styles.lead}>{t('cards.payLead')}</Text>
      <View style={styles.pills}>
        <Pressable
          onPress={() => setMode('full')}
          style={[
            styles.pill,
            { borderColor: theme.line, backgroundColor: theme.card },
            mode === 'full' && { borderColor: theme.primary, backgroundColor: theme.ink },
          ]}
        >
          <Text style={[styles.pillText, { color: mode === 'full' ? theme.onInk : theme.ink }]}>
            {t('cards.payFull')}
          </Text>
          <Text style={[styles.pillSub, { color: mode === 'full' ? theme.onInk : theme.muted }]}>
            {fmt(Math.round(remaining), currency)}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setMode('custom')}
          style={[
            styles.pill,
            { borderColor: theme.line, backgroundColor: theme.card },
            mode === 'custom' && { borderColor: theme.primary, backgroundColor: theme.ink },
          ]}
        >
          <Text style={[styles.pillText, { color: mode === 'custom' ? theme.onInk : theme.ink }]}>
            {t('cards.payCustom')}
          </Text>
          <Text style={[styles.pillSub, { color: mode === 'custom' ? theme.onInk : theme.muted }]}>
            {t('cards.payCustomHint')}
          </Text>
        </Pressable>
      </View>
      {mode === 'custom' ? (
        <Field
          label={t('cards.payAmount')}
          value={custom}
          onChangeText={setCustom}
          keyboardType="decimal-pad"
          placeholder={String(Math.round(remaining))}
        />
      ) : null}
      <PrimaryButton title={t('cards.payCta')} onPress={() => void save()} />
      <Pressable onPress={onClose} style={styles.later}>
        <Text style={styles.laterText}>{t('common.cancel')}</Text>
      </Pressable>
    </BottomSheet>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    title: { color: theme.ink, fontSize: 18, fontWeight: '800', marginBottom: 8 },
    lead: { color: theme.muted, fontSize: 13, fontWeight: '600', lineHeight: 18, marginBottom: 16 },
    pills: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    pill: {
      flex: 1,
      borderWidth: 1.5,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 10,
    },
    pillText: { fontSize: 13, fontWeight: '800' },
    pillSub: { marginTop: 4, fontSize: 12, fontWeight: '700' },
    later: { alignItems: 'center', paddingVertical: 12 },
    laterText: { color: theme.muted, fontWeight: '800', fontSize: 14 },
  });
}
