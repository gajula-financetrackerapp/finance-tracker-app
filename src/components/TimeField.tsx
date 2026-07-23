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
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { theme } from '../theme';

/** Parse stored `HH:MM` (24h) into a Date used by the picker. */
export function parseTime(hhmm: string): Date {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm || '').trim());
  const d = new Date();
  if (!m) {
    d.setHours(9, 0, 0, 0);
    return d;
  }
  let h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  d.setHours(h, min, 0, 0);
  return d;
}

/** Store picker value as `HH:MM` (24h) for alarms/engine. */
export function toHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Display `HH:MM` in 12-hour format, e.g. `8:00 AM`. */
export function formatTime12h(hhmm: string): string {
  if (!hhmm) return '';
  const d = parseTime(hhmm);
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

type Props = {
  label?: string;
  value: string;
  onChange: (hhmm: string) => void;
  placeholder?: string;
  style?: ViewStyle;
  compact?: boolean;
};

/** Tap to open a 12-hour system time selector (stores HH:MM internally). */
export function TimeField({
  label,
  value,
  onChange,
  placeholder = 'Select time',
  style,
  compact,
}: Props) {
  const [open, setOpen] = useState(false);
  const picked = useMemo(() => parseTime(value || '09:00'), [value]);

  const onPick = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') {
      setOpen(false);
      if (event.type === 'dismissed') return;
    }
    if (date) onChange(toHHMM(date));
  };

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.field, compact && styles.fieldCompact, style]}
      >
        <Text style={styles.icon}>🕒</Text>
        <Text style={[styles.value, !value && styles.placeholder]} numberOfLines={1}>
          {value ? formatTime12h(value) : placeholder}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>

      {open && Platform.OS === 'android' ? (
        <DateTimePicker
          value={picked}
          mode="time"
          display="spinner"
          is24Hour={false}
          onChange={onPick}
        />
      ) : null}

      {Platform.OS === 'ios' ? (
        <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <View style={styles.iosSheet}>
            <View style={styles.iosHeader}>
              <View style={{ width: 60 }} />
              <Text style={styles.iosTitle}>{label || 'Select time'}</Text>
              <Pressable onPress={() => setOpen(false)}>
                <Text style={styles.doneBtn}>Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={picked}
              mode="time"
              display="spinner"
              is24Hour={false}
              onChange={onPick}
              style={{ alignSelf: 'center' }}
            />
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 10 },
  wrapCompact: { marginBottom: 0, flex: 1 },
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
    paddingVertical: 12,
    backgroundColor: theme.bg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 46,
  },
  fieldCompact: { marginBottom: 0 },
  icon: { fontSize: 16 },
  value: { flex: 1, color: theme.ink, fontWeight: '700', fontSize: 14 },
  placeholder: { color: theme.muted, fontWeight: '500' },
  chevron: { color: theme.muted, fontWeight: '800' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  iosSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 24,
  },
  iosHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.line,
  },
  iosTitle: { fontWeight: '800', color: theme.ink, fontSize: 15 },
  doneBtn: {
    color: theme.accent,
    fontWeight: '800',
    fontSize: 16,
    minWidth: 60,
    textAlign: 'right',
  },
});
