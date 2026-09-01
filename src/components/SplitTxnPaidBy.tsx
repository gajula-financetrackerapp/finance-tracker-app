import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { useApp } from '../context/AppContext';
import { useT } from '../i18n/useT';
import { displayPaidInFull, splitExpenseNoteParts } from '../lib/splitFinanceNote';
import { fmt } from '../theme';

/** Footer on a Finance row: who paid the full split bill, and how much. */
export function SplitTxnPaidBy({
  note,
  style,
}: {
  note?: string | null;
  style?: StyleProp<TextStyle>;
}) {
  const { t } = useT();
  const { config } = useApp();
  const label = displayPaidInFull(splitExpenseNoteParts(note).paidInFull, t, (n) =>
    fmt(n, config.currency),
  );
  if (!label) return null;
  return (
    <Text style={style} numberOfLines={2}>
      {label}
    </Text>
  );
}
