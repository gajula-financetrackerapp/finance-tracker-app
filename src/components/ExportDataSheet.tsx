import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { showAppInfo } from '../appDialog';
import { BottomSheet } from './BottomSheet';
import { DateField } from './DateField';
import type { ThemeTokens } from '../types';
import { monthKey, todayStr } from '../utils';
import { countExportTransactions, type ExportFormat } from '../utils/exportSpreadsheet';
import { shareSpreadsheetExport } from '../utils/shareExport';

type Props = {
  visible: boolean;
  onClose: () => void;
};

function firstOfMonth(): string {
  return `${monthKey()}-01`;
}

/** Export sheet: pick From → To date range, then CSV or Excel. */
export function ExportDataSheet({ visible, onClose }: Props) {
  const { cashBooks, theme } = useApp();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [fromDate, setFromDate] = useState(firstOfMonth);
  const [toDate, setToDate] = useState(todayStr);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setFromDate(firstOfMonth());
    setToDate(todayStr());
    setBusy(false);
  }, [visible]);

  const range = useMemo(() => ({ from: fromDate, to: toDate }), [fromDate, toDate]);
  const matchCount = useMemo(
    () => countExportTransactions(cashBooks, range),
    [cashBooks, range],
  );
  const rangeInvalid = !!fromDate && !!toDate && fromDate > toDate;

  const runExport = async (format: ExportFormat) => {
    if (!fromDate || !toDate) {
      showAppInfo('Date range', 'Pick both From and To dates.', '📅');
      return;
    }
    if (fromDate > toDate) {
      showAppInfo('Date range', 'From date must be on or before To date.', '📅');
      return;
    }
    setBusy(true);
    try {
      const result = await shareSpreadsheetExport(cashBooks, format, range);
      if (result.empty) {
        showAppInfo(
          'Nothing to export',
          'No transactions in this date range. Try a wider range.',
          '📭',
        );
        return;
      }
      if (!result.ok) {
        showAppInfo('Export Data', result.error || 'Could not export right now.', '⚠️');
        return;
      }
      onClose();
    } catch {
      showAppInfo('Export Data', 'Could not export right now.', '⚠️');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>Export Data</Text>
      <Text style={styles.sub}>
        Choose a date range, then export matching transactions as CSV or Excel.
      </Text>

      <DateField label="From date" value={fromDate} onChange={setFromDate} />
      <DateField label="To date" value={toDate} onChange={setToDate} />

      <Text style={[styles.meta, rangeInvalid && styles.metaError]}>
        {rangeInvalid
          ? 'From date must be on or before To date'
          : `${matchCount} transaction${matchCount === 1 ? '' : 's'} in this range`}
      </Text>

      <Pressable
        style={[styles.primary, (busy || rangeInvalid) && styles.disabled]}
        disabled={busy || rangeInvalid}
        onPress={() => void runExport('csv')}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryText}>Export CSV</Text>
        )}
      </Pressable>

      <Pressable
        style={[styles.secondary, (busy || rangeInvalid) && styles.disabled]}
        disabled={busy || rangeInvalid}
        onPress={() => void runExport('xls')}
      >
        <Text style={styles.secondaryText}>Export Excel (.xls)</Text>
      </Pressable>

      <Pressable style={styles.cancel} onPress={onClose} disabled={busy}>
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    </BottomSheet>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    title: { fontSize: 22, fontWeight: '800', color: theme.ink },
    sub: { color: theme.muted, marginTop: 6, marginBottom: 16, lineHeight: 20, fontSize: 14 },
    meta: {
      color: theme.header,
      fontWeight: '700',
      fontSize: 13,
      marginBottom: 14,
      marginTop: 2,
    },
    metaError: { color: theme.red },
    primary: {
      backgroundColor: theme.header,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      marginBottom: 10,
    },
    primaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
    secondary: {
      backgroundColor: theme.accentSoft,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      marginBottom: 4,
      borderWidth: 1.5,
      borderColor: theme.accent + '55',
    },
    secondaryText: { color: theme.header, fontWeight: '800', fontSize: 16 },
    cancel: { alignItems: 'center', paddingVertical: 12 },
    cancelText: { color: theme.muted, fontWeight: '700', fontSize: 14 },
    disabled: { opacity: 0.5 },
  });
}
