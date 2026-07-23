import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import type { ThemeTokens } from '../types';

export type DropdownOption = {
  value: string;
  label: string;
};

type Props = {
  label?: string;
  value: string;
  placeholder: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
};

/** HTML-style `<select>`: tap the field to expand a dropdown list. */
export function DropdownSelect({
  label,
  value,
  placeholder,
  options,
  onChange,
  disabled,
}: Props) {
  const { theme } = useApp();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [open, setOpen] = useState(false);

  const selectedLabel = useMemo(() => {
    if (!value) return '';
    return options.find((o) => o.value === value)?.label || value;
  }, [options, value]);

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        disabled={disabled}
        onPress={() => !disabled && setOpen((v) => !v)}
        style={[styles.field, open && styles.fieldOpen, disabled && styles.fieldDisabled]}
      >
        <Text
          style={[styles.fieldText, !selectedLabel && styles.placeholder]}
          numberOfLines={1}
        >
          {selectedLabel || placeholder}
        </Text>
        <Text style={styles.chevron}>{open ? '▴' : '▾'}</Text>
      </Pressable>

      {open && !disabled ? (
        <View style={styles.menu}>
          <ScrollView
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            style={styles.menuScroll}
            showsVerticalScrollIndicator
          >
            {options.length === 0 ? (
              <Text style={styles.empty}>{placeholder}</Text>
            ) : (
              options.map((item) => {
                const on = item.value === value;
                return (
                  <Pressable
                    key={item.value}
                    style={[styles.option, on && styles.optionOn]}
                    onPress={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}
                  >
                    <Text style={[styles.optionText, on && styles.optionTextOn]}>{item.label}</Text>
                    {on ? <Text style={styles.check}>✓</Text> : null}
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    wrap: { marginBottom: 10, zIndex: 1 },
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
    },
    fieldOpen: {
      borderColor: theme.accent,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
    },
    fieldDisabled: { opacity: 0.5 },
    fieldText: { flex: 1, color: theme.ink, fontWeight: '600', fontSize: 14 },
    placeholder: { color: theme.muted, fontWeight: '500' },
    chevron: { color: theme.muted, fontSize: 14, fontWeight: '800' },
    menu: {
      borderWidth: 1.5,
      borderTopWidth: 0,
      borderColor: theme.accent,
      borderBottomLeftRadius: 12,
      borderBottomRightRadius: 12,
      backgroundColor: theme.card,
      overflow: 'hidden',
    },
    menuScroll: { maxHeight: 200 },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.line,
    },
    optionOn: { backgroundColor: theme.accentSoft },
    optionText: { flex: 1, color: theme.ink, fontWeight: '600', fontSize: 14 },
    optionTextOn: { color: theme.header, fontWeight: '800' },
    check: { color: theme.header, fontWeight: '800', fontSize: 14 },
    empty: {
      color: theme.muted,
      paddingVertical: 14,
      paddingHorizontal: 12,
      fontSize: 13,
    },
  });
}
