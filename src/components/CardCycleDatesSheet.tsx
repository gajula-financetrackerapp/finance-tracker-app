import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { BottomSheet } from './BottomSheet';
import { DateField } from './DateField';
import { Field, PrimaryButton } from './ui';
import { showAppInfo } from '../appDialog';
import { requireAuthToSave } from '../authGate';
import { applyManualCardCycleDates, cardHasBillAmount, isCardIsoDate } from '../lib/cardBills';
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
  const reminder =
    (card?.reminderId ? reminders.find((r) => r.id === card.reminderId) : undefined) ||
    (card?.reminderIds || []).map((id) => reminders.find((r) => r.id === id)).find(Boolean);
  const needStatement = !!card?.needsStatementDate;
  const needDue = !!card?.needsDueDate;
  const needAmount =
    !!card?.needsAmount ||
    (!cardHasBillAmount(reminder) && (card?.totalDue || 0) <= 0.009 && (card?.remaining || 0) <= 0.009);
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
  const editingStatement = !needStatement && !!card.statementDate;
  const lead = needStatement
    ? (lateStatement ? t('cards.datesLeadLateStatement') : t('cards.datesLeadStatement')).replace(
        '{card}',
        cardName,
      )
    : needAmount && !needDue
      ? t('cards.datesLeadAmount').replace('{card}', cardName)
      : needDue
        ? t('cards.datesLeadDue').replace('{card}', cardName)
        : editingStatement
          ? t('cards.datesLeadEdit').replace('{card}', cardName)
          : t('cards.datesLeadDue').replace('{card}', cardName);

  const save = async () => {
    if (!requireAuthToSave('save card dates')) return;
    const nextStatement = statementDate || card.statementDate;
    const nextDue = dueDate || card.dueDate;
    if ((needStatement || editingStatement) && !isCardIsoDate(nextStatement)) {
      showAppInfo(t('cards.datesTitle'), t('cards.datesNeedStatement'), '📅');
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
    const typedAmount = String(totalDue).trim();
    const hasAmount = typedAmount !== '' && Number.isFinite(typedDue) && typedDue > 0;
    if (typedAmount !== '' && !hasAmount) {
      showAppInfo(t('cards.datesTitle'), t('cards.datesNeedAmount'), '💳');
      return;
    }
    const next = applyManualCardCycleDates(
      reminders,
      reminder,
      { issuer: card.issuer, last4: card.last4 },
      {
        statementDate: isCardIsoDate(nextStatement) ? nextStatement.slice(0, 10) : undefined,
        dueDate: isCardIsoDate(nextDue) ? nextDue.slice(0, 10) : undefined,
        totalDue: hasAmount ? typedDue : undefined,
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

      {needStatement || editingStatement ? (
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

      <View style={styles.block}>
        <DateField
          label={t('cards.datesDue')}
          value={dueDate}
          onChange={setDueDate}
          placeholder={t('cards.datesDue')}
        />
        <Text style={styles.hint}>{t('cards.datesDueHint')}</Text>
      </View>

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
