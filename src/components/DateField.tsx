import React, { useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import type { ThemeTokens } from '../types';
import { todayStr } from '../utils';
import { useT } from '../i18n/useT';

function parseDate(iso: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const fallback = new Date();
  return Number.isNaN(fallback.getTime()) ? new Date() : fallback;
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDisplay(iso: string): string {
  if (!iso) return '';
  const d = parseDate(iso);
  return d.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

type Props = {
  label?: string;
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  /** Allow clearing the date (optional fields like grocery expiry). */
  clearable?: boolean;
  style?: ViewStyle;
  /** Compact field without outer margin (for row layouts). */
  compact?: boolean;
};

/** Tap to open the system calendar instead of typing YYYY-MM-DD. */
export function DateField({
  label,
  value,
  onChange,
  placeholder,
  clearable,
  style,
  compact,
}: Props) {
  const { theme } = useApp();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [open, setOpen] = useState(false);
  const picked = useMemo(() => parseDate(value || todayStr()), [value]);

  const onPick = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') {
      setOpen(false);
      if (event.type === 'dismissed') return;
    }
    if (date) onChange(toIso(date));
  };

  const openPicker = () => {
    // Native Android dialogs sit behind a React Native Modal. Open from the
    // activity instead so the calendar is on top of Close / the rest of the sheet.
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: picked,
        mode: 'date',
        display: 'calendar',
        onChange: onPick,
      });
      return;
    }
    setOpen(true);
  };

  const field = (
    <View style={[styles.field, compact && styles.fieldCompact, style]}>
      <Pressable
        onPress={openPicker}
        style={styles.fieldPress}
      >
        <Text style={styles.calendarIcon}>📅</Text>
        <Text style={[styles.value, !value && styles.placeholder]} numberOfLines={1}>
          {value ? formatDisplay(value) : placeholder || t('common.selectDate')}
        </Text>
      </Pressable>
      {clearable && value ? (
        <Pressable onPress={() => onChange('')} hitSlop={8}>
          <Text style={styles.clear}>✕</Text>
        </Pressable>
      ) : (
        <Pressable onPress={openPicker} hitSlop={8}>
          <Text style={styles.chevron}>▾</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {field}

      {Platform.OS === 'ios' ? (
        <Modal
          visible={open}
          transparent
          animationType="fade"
          presentationStyle="overFullScreen"
          statusBarTranslucent
          onRequestClose={() => setOpen(false)}
        >
          <View style={styles.iosRoot}>
            <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
            <View style={[styles.iosSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              <View style={styles.iosHeader}>
                {clearable ? (
                  <Pressable
                    onPress={() => {
                      onChange('');
                      setOpen(false);
                    }}
                    hitSlop={8}
                  >
                    <Text style={styles.clearBtn}>{t('common.clear')}</Text>
                  </Pressable>
                ) : (
                  <View style={{ width: 60 }} />
                )}
                <Text style={styles.iosTitle}>{label || t('common.selectDate')}</Text>
                <Pressable onPress={() => setOpen(false)} hitSlop={8}>
                  <Text style={styles.doneBtn}>{t('common.done')}</Text>
                </Pressable>
              </View>
              <View style={styles.iosPickerClip} pointerEvents="box-none">
                <DateTimePicker
                  value={picked}
                  mode="date"
                  display="spinner"
                  onChange={onPick}
                  style={styles.iosPicker}
                />
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    wrap: { marginBottom: 10 },
    wrapCompact: { marginBottom: 0 },
    label: {
      color: theme.muted,
      fontWeight: '700',
      fontSize: 12,
      marginBottom: 6,
    },
    field: {
      borderWidth: 1.5,
      borderColor: theme.line,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 4,
      backgroundColor: theme.bg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 46,
    },
    fieldPress: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 8,
    },
    fieldCompact: { marginBottom: 0 },
    calendarIcon: { fontSize: 16 },
    value: { flex: 1, color: theme.ink, fontWeight: '700', fontSize: 14 },
    placeholder: { color: theme.muted, fontWeight: '500' },
    chevron: { color: theme.muted, fontWeight: '800' },
    clear: { color: theme.muted, fontWeight: '800', paddingHorizontal: 4 },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    iosRoot: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    iosSheet: {
      backgroundColor: theme.card,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      overflow: 'hidden',
      zIndex: 2,
      elevation: 24,
    },
    iosHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.line,
      backgroundColor: theme.card,
      zIndex: 3,
      elevation: 4,
    },
    iosPickerClip: {
      height: 216,
      overflow: 'hidden',
      width: '100%',
    },
    iosPicker: {
      height: 216,
      width: '100%',
    },
    iosTitle: { fontWeight: '800', color: theme.ink, fontSize: 15 },
    doneBtn: { color: theme.accent, fontWeight: '800', fontSize: 16, minWidth: 60, textAlign: 'right' },
    clearBtn: { color: theme.red, fontWeight: '700', fontSize: 15, minWidth: 60 },
  });
}
