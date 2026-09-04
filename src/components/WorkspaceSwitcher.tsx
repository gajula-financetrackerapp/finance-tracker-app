import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWorkspace, type Workspace } from '../WorkspaceContext';
import { useApp } from '../context/AppContext';
import { useNotifications } from '../context/NotificationsContext';
import { useSplit } from '../context/SplitContext';
import { findCurrency } from '../constants';
import { isWorkspaceEnabled, resolveWorkspace } from '../lib/appFeatures';
import type { ThemeTokens } from '../types';
import { BottomSheet } from './BottomSheet';
import { CurrencyPicker } from './CurrencyPicker';
import { GlobalSearchSheet } from './GlobalSearchSheet';
import { PremiumHeaderFill } from './PremiumChrome';
import { SlidingPillTabs } from './SlidingPillTabs';
import { RootStackParamList } from '../navigation/types';
import { useT } from '../i18n/useT';
import type { TranslationKey } from '../i18n/translations';

const ITEMS: { id: Workspace; labelKey: TranslationKey; icon: string }[] = [
  { id: 'finance', labelKey: 'workspace.finance', icon: '💰' },
  { id: 'reminders', labelKey: 'workspace.reminders', icon: '⏰' },
  { id: 'shopping', labelKey: 'workspace.shopping', icon: '🛒' },
  { id: 'split', labelKey: 'workspace.split', icon: '🤝' },
];

export function WorkspaceSwitcher() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { workspace, setWorkspace } = useWorkspace();
  const { config, setCurrency, activeBook, theme } = useApp();
  const { unreadCount } = useNotifications();
  const split = useSplit();
  const pendingSettleCount = useMemo(
    () => split.settlements.filter((s) => s.status === 'open').length,
    [split.settlements],
  );
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [showCurrency, setShowCurrency] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const current = findCurrency(config.currency) || findCurrency('INR')!;
  const financeOn = isWorkspaceEnabled(config.features, 'finance');
  const visibleItems = useMemo(
    () => ITEMS.filter((item) => isWorkspaceEnabled(config.features, item.id)),
    [config.features],
  );

  useEffect(() => {
    const next = resolveWorkspace(config.features, workspace);
    if (next !== workspace) setWorkspace(next);
  }, [config.features, workspace, setWorkspace]);

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <PremiumHeaderFill />
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <View style={styles.sideSlot}>
            {financeOn ? (
              <View style={styles.leftActions}>
                <Pressable
                  style={styles.calendarBtn}
                  onPress={() => navigation.navigate('Calendar')}
                  hitSlop={8}
                  accessibilityLabel={t('a11y.openCalendar')}
                >
                  <Text style={styles.calendarIcon}>📅</Text>
                </Pressable>
                <Pressable
                  style={styles.bookChip}
                  onPress={() => navigation.navigate('MyCashBooks')}
                  hitSlop={6}
                  accessibilityLabel={t('premium.featBooks')}
                >
                  <Text style={styles.bookChipText}>{activeBook.icon}</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
          <Text style={styles.appName} numberOfLines={1}>
            {config.appName || 'MoneyLit'}
          </Text>
          <View style={[styles.sideSlot, styles.sideSlotEnd]}>
            <View style={styles.rightActions}>
              <Pressable
                style={styles.iconBtn}
                onPress={() => setShowSearch(true)}
                hitSlop={8}
                accessibilityLabel={t('common.search')}
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
              <Pressable
                style={styles.iconBtn}
                onPress={() => navigation.navigate('Notifications')}
                hitSlop={8}
                accessibilityLabel={t('notifications.title')}
                accessibilityHint={
                  unreadCount > 0
                    ? t('notifications.unreadHint').replace('{n}', String(unreadCount))
                    : undefined
                }
              >
                <Text style={styles.iconBtnText}>🔔</Text>
                {unreadCount > 0 ? (
                  <View style={styles.bellBadge}>
                    <Text style={styles.bellBadgeText}>
                      {unreadCount > 9 ? '9+' : String(unreadCount)}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
          </View>
        </View>

        {visibleItems.length > 0 ? (
          <SlidingPillTabs
            items={visibleItems.map((item) => ({
              key: item.id,
              label: t(item.labelKey),
              icon: item.icon,
              badge: item.id === 'split' ? pendingSettleCount : undefined,
              accessibilityLabel:
                item.id === 'split' && pendingSettleCount > 0
                  ? `${t(item.labelKey)}, ${pendingSettleCount}`
                  : t(item.labelKey),
            }))}
            selectedKey={workspace}
            onSelect={(key) => setWorkspace(key as Workspace)}
            trackStyle={styles.row}
            pillStyle={styles.pill}
            labelStyle={styles.label}
            labelActiveStyle={styles.labelOn}
            iconStyle={styles.icon}
            itemStyle={styles.tab}
            itemIdleStyle={styles.tabIdle}
          />
        ) : (
          <Text style={styles.noModules}>
            {t('workspace.noneEnabled')}
          </Text>
        )}
      </View>

      <BottomSheet visible={showCurrency} onClose={() => setShowCurrency(false)}>
        <Text style={styles.modalTitle}>{t('common.currency')}</Text>
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
    // Sits over the corner of the bell; the header is dark, so the count needs
    // its own fill rather than a tint of it.
    bellBadge: {
      position: 'absolute',
      top: -4,
      right: -4,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      paddingHorizontal: 4,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.red,
      borderWidth: 1.5,
      borderColor: theme.header,
    },
    bellBadgeText: {
      color: '#fff',
      fontSize: 9,
      fontWeight: '900',
      lineHeight: 12,
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
      backgroundColor: 'rgba(255,255,255,0.12)',
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.22)',
    },
    pill: {
      backgroundColor: theme.ink,
      borderRadius: 11,
    },
    // Every tab reserves the border so nothing shifts as the pill slides.
    tab: { borderWidth: 1, borderColor: 'transparent' },
    // Only the tabs you can move to are outlined, which reads as tappable
    // without competing with the filled pill on the one you are already on.
    tabIdle: { borderColor: 'rgba(255,255,255,0.32)' },
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
    noModules: {
      color: 'rgba(255,255,255,0.85)',
      fontWeight: '700',
      fontSize: 12,
      textAlign: 'center',
      paddingVertical: 10,
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
