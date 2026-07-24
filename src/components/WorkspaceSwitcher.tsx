import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWorkspace, Workspace } from '../WorkspaceContext';
import { useApp } from '../context/AppContext';
import { findCurrency } from '../constants';
import type { ThemeTokens } from '../types';
import { BottomSheet } from './BottomSheet';
import { CurrencyPicker } from './CurrencyPicker';
import { GlobalSearchSheet } from './GlobalSearchSheet';
import { PremiumHeaderFill } from './PremiumChrome';
import { RootStackParamList } from '../navigation/types';
import { useT } from '../i18n/useT';
import type { TranslationKey } from '../i18n/translations';

const ITEMS: { id: Workspace; labelKey: TranslationKey; icon: string }[] = [
  { id: 'finance', labelKey: 'workspace.finance', icon: '💰' },
  { id: 'reminders', labelKey: 'workspace.reminders', icon: '⏰' },
  { id: 'shopping', labelKey: 'workspace.shopping', icon: '🛒' },
];

export function WorkspaceSwitcher() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { workspace, setWorkspace } = useWorkspace();
  const { config, setCurrency, activeBook, theme } = useApp();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [showCurrency, setShowCurrency] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const current = findCurrency(config.currency) || findCurrency('INR')!;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <PremiumHeaderFill />
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <View style={styles.sideSlot}>
            <View style={styles.leftActions}>
              <Pressable
                style={styles.calendarBtn}
                onPress={() => navigation.navigate('Calendar')}
                hitSlop={8}
                accessibilityLabel="Open calendar"
              >
                <Text style={styles.calendarIcon}>📅</Text>
              </Pressable>
              <Pressable
                style={styles.bookChip}
                onPress={() => navigation.navigate('MyCashBooks')}
                hitSlop={6}
                accessibilityLabel="Cash books"
              >
                <Text style={styles.bookChipText}>{activeBook.icon}</Text>
              </Pressable>
            </View>
          </View>
          <Text style={styles.appName} numberOfLines={1}>
            {config.appName || 'Pulse Wallet'}
          </Text>
          <View style={[styles.sideSlot, styles.sideSlotEnd]}>
            <View style={styles.rightActions}>
              <Pressable
                style={styles.iconBtn}
                onPress={() => setShowSearch(true)}
                hitSlop={8}
                accessibilityLabel="Search"
              >
                <Text style={styles.iconBtnText}>🔍</Text>
              </Pressable>
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
          </View>
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
                  {t(item.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <BottomSheet visible={showCurrency} onClose={() => setShowCurrency(false)}>
        <Text style={styles.modalTitle}>Currency</Text>
        <CurrencyPicker
          selectedCode={config.currency}
          onSelect={async (code) => {
            await setCurrency(code);
            setShowCurrency(false);
          }}
        />
      </BottomSheet>

      <GlobalSearchSheet visible={showSearch} onClose={() => setShowSearch(false)} />
    </View>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    wrap: {
      backgroundColor: theme.header,
      overflow: 'hidden',
    },
    content: {
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 12,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    sideSlot: {
      flex: 1,
      alignItems: 'flex-start',
      justifyContent: 'center',
    },
    sideSlotEnd: {
      alignItems: 'flex-end',
    },
    rightActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    leftActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    iconBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.14)',
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 10,
    },
    iconBtnText: {
      fontSize: 14,
    },
    bookChip: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.14)',
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 10,
    },
    bookChipText: {
      fontSize: 14,
    },
    calendarBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.14)',
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 10,
    },
    calendarIcon: {
      fontSize: 16,
    },
    appName: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 18,
      textAlign: 'center',
      paddingHorizontal: 8,
      maxWidth: '46%',
    },
    currencyBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.14)',
      paddingHorizontal: 8,
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
      color: '#fff',
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
}
