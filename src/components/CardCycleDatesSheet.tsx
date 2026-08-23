import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { BottomSheet } from './BottomSheet';
import { DateField } from './DateField';
import { Field, PrimaryButton } from './ui';
import { showAppInfo } from '../appDialog';
import { requireAuthToSave } from '../authGate';
import { applyManualCardCycleDates, isCardIsoDate } from '../lib/cardBills';
import type { CreditCardView } from '../lib/cardFaces';
import type { ExpenseReminder, ThemeTokens } from '../types';
import { useT } from '../i18n/useT';

type Props = {
  card: CreditCardView | null;
  reminders: ExpenseReminder[];
  offsets: number[];
  onClose: () => void;
  onSave: (next: ExpenseReminder[]) => Promise<void>;
};

export function CardCycleDatesSheet({ card, reminders, offsets, onClose, onSave }: Props) {
  const { theme } = useApp();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const reminder = card?.reminderId
    ? reminders.find((r) => r.id === card.reminderId)
    : undefined;
  const needStatement = !!card?.needsStatementDate;
  const needDue = !!card?.needsDueDate;
  const needAmount = !!card?.needsAmount;
  const [statementDate, setStatementDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [totalDue, setTotalDue] = useState('');

  useEffect(() => {
    setStatementDate(isCardIsoDate(card?.statementDate) ? card!.statementDate!.slice(0, 10) : '');
    setDueDate(isCardIsoDate(card?.dueDate) ? card!.dueDate!.slice(0, 10) : '');
    setTotalDue(
      card?.totalDue && card.totalDue > 0 ? String(Math.round(card.totalDue)) : '',
    );
  }, [card]);

  if (!card) return null;

  const cardName = card.last4 ? `${card.issuer} ${card.last4}` : card.issuer;
  const lateStatement = needStatement && !needDue && !!card.dueDate;
  const lead =
    needAmount && !needStatement && !needDue
      ? t('cards.datesLeadAmount').replace('{card}', cardName)
      : needStatement && needDue
        ? t('cards.datesLeadBoth').replace('{card}', cardName)
        : lateStatement
          ? t('cards.datesLeadLateStatement').replace('{card}', cardName)
          : needStatement
            ? t('cards.datesLeadStatement').replace('{card}', cardName)
            : t('cards.datesLeadDue').replace('{card}', cardName);

  const save = async () => {
    if (!requireAuthToSave('save card dates')) return;
    const nextStatement = needStatement ? statementDate : card.statementDate || statementDate;
    const nextDue = needDue ? dueDate : card.dueDate || dueDate;
    if (needStatement && !isCardIsoDate(nextStatement)) {
      showAppInfo(t('cards.datesTitle'), t('cards.datesNeedStatement'), '📅');
      return;
    }
    if (needDue && !isCardIsoDate(nextDue)) {
      showAppInfo(t('cards.datesTitle'), t('cards.datesNeedDue'), '📅');
      return;
    }
    if (
      isCardIsoDate(nextStatement) &&
      isCardIsoDate(nextDue) &&
      nextDue! < nextStatement!
    ) {
      showAppInfo(t('cards.datesTitle'), t('cards.datesSwapWarn'), '⚠️');
      return;
    }
    const typedDue = Number(String(totalDue).replace(/,/g, ''));
    if (needAmount && (!Number.isFinite(typedDue) || typedDue <= 0)) {
      showAppInfo(t('cards.datesTitle'), t('cards.datesNeedAmount'), '💳');
      return;
    }
    const next = applyManualCardCycleDates(
      reminders,
      reminder,
      { issuer: card.issuer, last4: card.last4 },
      {
        statementDate: needStatement ? nextStatement || undefined : undefined,
        dueDate: needDue ? nextDue || undefined : undefined,
        totalDue: needAmount ? typedDue : undefined,
      },
      offsets,
    );
    await onSave(next);
    showAppInfo(
      t('cards.datesTitle'),
      t('cards.datesSaved').replace('{card}', cardName),
      '✅',
    );
  };

  return (
    <BottomSheet visible={!!card} onClose={onClose}>
      <Text style={styles.title}>{t('cards.datesTitle')}</Text>
      <Text style={styles.lead}>{lead}</Text>

      {needStatement ? (
        <View style={styles.block}>
          <DateField
            label={t('cards.datesStatement')}
            value={statementDate}
            onChange={setStatementDate}
            placeholder={t('cards.datesStatement')}
          />
          <Text style={styles.hint}>{t('cards.datesStatementHint')}</Text>
        </View>
      ) : null}

      {needDue ? (
        <View style={styles.block}>
          <DateField
            label={t('cards.datesDue')}
            value={dueDate}
            onChange={setDueDate}
            placeholder={t('cards.datesDue')}
          />
          <Text style={styles.hint}>{t('cards.datesDueHint')}</Text>
        </View>
      ) : null}

      {needAmount ? (
        <View style={styles.block}>
          <Field
            label={t('cards.datesAmount')}
            value={totalDue}
            onChangeText={setTotalDue}
            keyboardType="decimal-pad"
            placeholder={t('cards.datesAmount')}
          />
          <Text style={styles.hint}>{t('cards.datesAmountHint')}</Text>
        </View>
      ) : null}

      <PrimaryButton title={t('common.save')} onPress={() => void save()} />
      <Pressable onPress={onClose} style={styles.later}>
        <Text style={styles.laterText}>{t('cards.datesLater')}</Text>
      </Pressable>
    </BottomSheet>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    title: { color: theme.ink, fontSize: 18, fontWeight: '800', marginBottom: 8 },
    lead: { color: theme.muted, fontSize: 13, fontWeight: '600', lineHeight: 18, marginBottom: 16 },
    block: { marginBottom: 8 },
    hint: { color: theme.muted, fontSize: 12, fontWeight: '600', marginTop: -4, marginBottom: 10 },
    later: { alignItems: 'center', paddingVertical: 12 },
    laterText: { color: theme.muted, fontWeight: '800', fontSize: 14 },
  });
}
