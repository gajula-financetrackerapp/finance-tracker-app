import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import type { ThemeTokens } from '../types';
import { useT } from '../i18n/useT';
import type { TranslationKey } from '../i18n/translations';

export const OFFSET_VALUES = [3, 2, 1, 0] as const;

export const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const MED_SLOTS = ['Morning', 'Afternoon', 'Evening'] as const;

/** @deprecated Prefer translated labels via OffsetPicker / offsetsLabel helpers. */
export const OFFSET_OPTIONS: { value: number; label: string; expiryLabel: string }[] = [
  { value: 3, label: '3 days before', expiryLabel: '3 days before' },
  { value: 2, label: '2 days before', expiryLabel: '2 days before' },
  { value: 1, label: '1 day before', expiryLabel: '1 day before' },
  { value: 0, label: 'Due day', expiryLabel: 'Expiry day' },
];

export function offsetsLabel(
  offsets: number[],
  lastLabel = 'Due day',
  dayBefore = '1 day before',
  daysBefore: string | ((n: number) => string) = (n) => `${n} days before`,
) {
  const daysFn = typeof daysBefore === 'function' ? daysBefore : (n: number) => daysBefore.replace('{n}', String(n));
  return [...offsets]
    .sort((a, b) => b - a)
    .map((o) => (o === 0 ? lastLabel : o === 1 ? dayBefore : daysFn(o)))
    .join(', ');
}

function useThemedStyles() {
  const { theme } = useApp();
  return useMemo(() => makeStyles(theme), [theme]);
}

export function ModeToggle({
  mode,
  onChange,
}: {
  mode: 'default' | 'custom';
  onChange: (m: 'default' | 'custom') => void;
}) {
  const styles = useThemedStyles();
  const { t } = useT();
  return (
    <View style={styles.seg}>
      {(['default', 'custom'] as const).map((m) => (
        <Pressable
          key={m}
          style={[styles.segBtn, mode === m && styles.segOn]}
          onPress={() => onChange(m)}
        >
          <Text style={[styles.segText, mode === m && styles.segTextOn]}>
            {m === 'default' ? t('reminders.modeDefault') : t('reminders.modeCustom')}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Top switch for reminder screens: create form vs saved list. */
export function ReminderPaneTabs({
  pane,
  onChange,
  existingCount,
}: {
  pane: 'new' | 'existing';
  onChange: (p: 'new' | 'existing') => void;
  existingCount?: number;
}) {
  const styles = useThemedStyles();
  const { t } = useT();
  return (
    <View style={styles.paneTabs}>
      {(
        [
          { id: 'new' as const, label: t('reminders.tabNew') },
          {
            id: 'existing' as const,
            label:
              typeof existingCount === 'number'
                ? t('reminders.tabExistingN').replace('{n}', String(existingCount))
                : t('reminders.tabExisting'),
          },
        ] as const
      ).map((tab) => {
        const on = pane === tab.id;
        return (
          <Pressable
            key={tab.id}
            style={[styles.paneTab, on && styles.paneTabOn]}
            onPress={() => onChange(tab.id)}
          >
            <Text style={[styles.paneTabText, on && styles.paneTabTextOn]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ChipRow({
  options,
  selected,
  onToggle,
  multi = true,
  labelFor,
}: {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  multi?: boolean;
  labelFor?: (value: string) => string;
}) {
  const styles = useThemedStyles();
  return (
    <View style={styles.chipRow}>
      {options.map((opt) => {
        const on = selected.includes(opt);
        return (
          <Pressable
            key={opt}
            onPress={() => onToggle(opt)}
            style={[styles.chip, on && styles.chipOn]}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>
              {labelFor ? labelFor(opt) : opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function offsetLabelKey(value: number, forExpiry: boolean): TranslationKey {
  if (value === 3) return 'reminders.offset3';
  if (value === 2) return 'reminders.offset2';
  if (value === 1) return 'reminders.offset1';
  return forExpiry ? 'reminders.offsetExpiry' : 'reminders.offsetDue';
}

export function OffsetPicker({
  selected,
  onChange,
  forExpiry = false,
}: {
  selected: number[];
  onChange: (next: number[]) => void;
  forExpiry?: boolean;
}) {
  const styles = useThemedStyles();
  const { t } = useT();
  return (
    <View style={styles.chipRow}>
      {OFFSET_VALUES.map((value) => {
        const on = selected.includes(value);
        return (
          <Pressable
            key={value}
            onPress={() => {
              if (on) onChange(selected.filter((v) => v !== value));
              else onChange([...selected, value].sort((a, b) => b - a));
            }}
            style={[styles.chip, on && styles.chipOn]}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>
              {t(offsetLabelKey(value, forExpiry))}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function HintBox({ children }: { children: string }) {
  const styles = useThemedStyles();
  return (
    <View style={styles.hint}>
      <Text style={styles.hintText}>{children}</Text>
    </View>
  );
}

export function SectionLabel({ children }: { children: string }) {
  const styles = useThemedStyles();
  return <Text style={styles.section}>{children}</Text>;
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    seg: {
      flexDirection: 'row',
      backgroundColor: theme.bg,
      borderRadius: 12,
      padding: 4,
      marginBottom: 12,
      maxWidth: 280,
    },
    segBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 10 },
    segOn: { backgroundColor: theme.header },
    segText: { fontWeight: '700', color: theme.muted, fontSize: 13 },
    segTextOn: { color: '#fff' },
    paneTabs: {
      flexDirection: 'row',
      backgroundColor: theme.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.line,
      padding: 4,
      marginBottom: 14,
    },
    paneTab: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 10 },
    paneTabOn: { backgroundColor: theme.header },
    paneTabText: { fontWeight: '800', color: theme.muted, fontSize: 14 },
    paneTabTextOn: { color: '#fff' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    chip: {
      borderWidth: 1.5,
      borderColor: theme.line,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: theme.bg,
    },
    chipOn: {
      backgroundColor: theme.header,
      borderColor: theme.header,
    },
    chipText: { fontWeight: '700', color: theme.muted, fontSize: 12 },
    chipTextOn: { color: '#fff' },
    hint: {
      backgroundColor: theme.accentSoft,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
    },
    hintText: { color: theme.header, fontSize: 12.5, lineHeight: 18, fontWeight: '600' },
    section: {
      color: theme.muted,
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      marginBottom: 8,
      letterSpacing: 0.3,
    },
  });
}
