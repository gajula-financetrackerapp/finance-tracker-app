import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { BottomSheet } from './BottomSheet';
import { DateField } from './DateField';
import { DropdownSelect } from './DropdownSelect';
import { Field, PrimaryButton } from './ui';
import { showAppInfo } from '../appDialog';
import { requireAuthToSave } from '../authGate';
import { applyAddCreditCard, isCardIsoDate } from '../lib/cardBills';
import { CARD_ISSUER_LABELS } from '../lib/importRules/parseDueNotice';
import type { ExpenseReminder, ThemeTokens } from '../types';
import { useT } from '../i18n/useT';

type Props = {
  visible: boolean;
  reminders: ExpenseReminder[];
  offsets: number[];
  onClose: () => void;
  onSave: (next: ExpenseReminder[]) => Promise<void>;
};

export function CardAddSheet({ visible, reminders, offsets, onClose, onSave }: Props) {
  const { theme } = useApp();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [issuer, setIssuer] = useState('');
  const [last4, setLast4] = useState('');
  const [statementDate, setStatementDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [totalDue, setTotalDue] = useState('');

  useEffect(() => {
    if (!visible) return;
    setIssuer('');
    setLast4('');
    setStatementDate('');
    setDueDate('');
    setTotalDue('');
  }, [visible]);

  if (!visible) return null;

  const save = async () => {
    if (!requireAuthToSave('add a credit card')) return;
    const digits = last4.replace(/\D/g, '');
    if (!issuer) {
      showAppInfo(t('cards.addTitle'), t('cards.addNeedIssuer'), '💳');
      return;
    }
    if (!/^\d{4}$/.test(digits)) {
      showAppInfo(t('cards.addTitle'), t('cards.addNeedLast4'), '💳');
      return;
    }
    if (statementDate && !isCardIsoDate(statementDate)) {
      showAppInfo(t('cards.addTitle'), t('cards.datesNeedStatement'), '📅');
      return;
    }
    if (dueDate && !isCardIsoDate(dueDate)) {
      showAppInfo(t('cards.addTitle'), t('cards.datesNeedDue'), '📅');
      return;
    }
    if (isCardIsoDate(statementDate) && isCardIsoDate(dueDate) && dueDate < statementDate) {
      showAppInfo(t('cards.addTitle'), t('cards.datesSwapWarn'), '⚠️');
      return;
    }
    const typedDue = Number(String(totalDue).replace(/,/g, ''));
    if (totalDue && (!Number.isFinite(typedDue) || typedDue <= 0)) {
      showAppInfo(t('cards.addTitle'), t('cards.datesNeedAmount'), '💳');
      return;
    }
    const next = applyAddCreditCard(
      reminders,
      {
        issuer,
        last4: digits,
        statementDate: isCardIsoDate(statementDate) ? statementDate : undefined,
        dueDate: isCardIsoDate(dueDate) ? dueDate : undefined,
        totalDue: totalDue && Number.isFinite(typedDue) && typedDue > 0 ? typedDue : undefined,
      },
      offsets,
    );
    await onSave(next);
    showAppInfo(
      t('cards.addTitle'),
      t('cards.addSaved').replace('{card}', `${issuer} ${digits}`),
      '✅',
    );
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>{t('cards.addTitle')}</Text>
      <Text style={styles.lead}>{t('cards.addLead')}</Text>
      <DropdownSelect
        label={t('cards.addIssuer')}
        value={issuer}
        placeholder={t('cards.addIssuer')}
        options={CARD_ISSUER_LABELS.map((label) => ({ value: label, label }))}
        onChange={setIssuer}
        overlay
      />
      <Field
        label={t('cards.addLast4')}
        value={last4}
        onChangeText={(v) => setLast4(v.replace(/\D/g, '').slice(0, 4))}
        keyboardType="number-pad"
        maxLength={4}
        placeholder="1234"
      />
      <View style={styles.block}>
        <DateField
          label={t('cards.datesStatement')}
          value={statementDate}
          onChange={setStatementDate}
          placeholder={t('cards.datesStatement')}
        />
        <Text style={styles.hint}>{t('cards.datesStatementHint')}</Text>
      </View>
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
      <PrimaryButton title={t('cards.add')} onPress={() => void save()} />
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
    block: { marginBottom: 8 },
    hint: { color: theme.muted, fontSize: 12, fontWeight: '600', marginTop: -4, marginBottom: 10 },
    later: { alignItems: 'center', paddingVertical: 12 },
    laterText: { color: theme.muted, fontWeight: '800', fontSize: 14 },
  });
}
