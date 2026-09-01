import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { useT } from '../i18n/useT';
import { displayPaidInFull, splitExpenseNoteParts } from '../lib/splitFinanceNote';

/** Footer on a Finance row: who paid the full split bill. */
export function SplitTxnPaidBy({
  note,
  style,
}: {
  note?: string | null;
  style?: StyleProp<TextStyle>;
}) {
  const { t } = useT();
  const label = displayPaidInFull(splitExpenseNoteParts(note).paidInFull, t);
  if (!label) return null;
  return (
    <Text style={style} numberOfLines={2}>
      {label}
    </Text>
  );
}
