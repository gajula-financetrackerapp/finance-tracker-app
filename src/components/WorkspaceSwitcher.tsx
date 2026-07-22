import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useWorkspace, Workspace } from '../WorkspaceContext';
import { useApp } from '../context/AppContext';
import { CURRENCIES } from '../constants';
import { theme } from '../theme';
import { BottomSheet } from './BottomSheet';
import { RootStackParamList } from '../navigation/types';

const ITEMS: { id: Workspace; label: string; icon: string }[] = [
  { id: 'finance', label: 'Finance', icon: '💰' },
  { id: 'reminders', label: 'Reminders', icon: '⏰' },
  { id: 'shopping', label: 'Buy list', icon: '🛒' },
];

export function WorkspaceSwitcher() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { workspace, setWorkspace } = useWorkspace();
  const { config, setCurrency } = useApp();
  const [showCurrency, setShowCurrency] = useState(false);

  const current = CURRENCIES.find((c) => c.code === config.currency) || CURRENCIES[0];

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <Pressable
          style={styles.calendarBtn}
          onPress={() => navigation.navigate('Calendar')}
          hitSlop={8}
          accessibilityLabel="Open calendar"
        >
          <Text style={styles.calendarIcon}>📅</Text>
        </Pressable>
        <Text style={styles.appName}>{config.appName || 'Pulse Wallet'}</Text>
        <Pressable
          style={styles.currencyBtn}
          onPress={() => setShowCurrency(true)}
          hitSlop={8}
        >
          <Text style={styles.currencyText}>
            {current.sym} {current.code}
          </Text>
        </Pressable>
      </View>

      <View style={styles.row}>
        {ITEMS.map((item) => {
          const on = workspace === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => setWorkspace(item.id)}
              style={[styles.btn, on && styles.btnOn]}
            >
              <Text style={styles.icon}>{item.icon}</Text>
              <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <BottomSheet visible={showCurrency} onClose={() => setShowCurrency(false)}>
        <Text style={styles.modalTitle}>Currency</Text>
        {CURRENCIES.map((c) => (
          <Pressable
            key={c.code}
            style={[styles.currencyRow, config.currency === c.code && styles.currencyRowOn]}
            onPress={async () => {
              await setCurrency(c.code);
              setShowCurrency(false);
            }}
          >
            <Text style={styles.currencyRowText}>
              {c.sym}  {c.code}
            </Text>
            <Text style={styles.currencyRowName}>{c.name}</Text>
          </Pressable>
        ))}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: theme.header,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  calendarBtn: {
    minWidth: 72,
    alignItems: 'flex-start',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  calendarIcon: {
    fontSize: 16,
  },
  appName: {
    flex: 1,
    color: '#fff',
    fontWeight: '800',
    fontSize: 18,
    textAlign: 'center',
  },
  currencyBtn: {
    minWidth: 72,
    alignItems: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  currencyText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  btn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 11,
    gap: 2,
  },
  btnOn: {
    backgroundColor: theme.ink,
  },
  icon: { fontSize: 14 },
  label: {
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '700',
    fontSize: 12,
  },
  labelOn: {
    color: theme.accentSoft,
  },
  modalTitle: {
    fontWeight: '800',
    fontSize: 18,
    color: theme.ink,
    marginBottom: 12,
    textAlign: 'center',
  },
  currencyRow: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: theme.line,
  },
  currencyRowOn: {
    backgroundColor: theme.accentSoft,
    borderColor: theme.accent,
  },
  currencyRowText: { fontWeight: '800', color: theme.ink, fontSize: 15 },
  currencyRowName: { color: theme.muted, fontSize: 12, marginTop: 2 },
});
