import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { useAlarms } from '../alarms/AlarmContext';
import { daysUntil } from '../alarms/engine';
import { requireAuthToSave } from '../authGate';
import { showAppInfo } from '../appDialog';
import { isRepeatingExpense } from '../utils/recurringExpense';
import { Card, Screen } from '../components/ui';
import { GoogleAdBanner } from '../components/GoogleAdBanner';
import { todayStr } from '../utils';
import type { ThemeTokens } from '../types';
import { formatTime12h } from '../components/TimeField';
import { RootStackParamList } from '../navigation/types';
import { useT } from '../i18n/useT';
import { isReminderTypeEnabled } from '../lib/appFeatures';
import { isCardBillReminderLive } from '../lib/cardBills';

export function ReminderHubScreen() {
  const {
    config,
    theme,
    updateConfig,
    expenseReminders,
    medReminders,
    groceryReminders,
    generalReminders,
  } = useApp();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { currentAlarm } = useAlarms();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const today = todayStr();

  const expenseDue = expenseReminders.filter((r) => {
    if (r.source === 'card-bill') return isCardBillReminderLive(r, today);
    return (
      (!r.paid || isRepeatingExpense(r)) &&
      daysUntil(r.dueDate) <= Math.max(...(config.expenseOffsets.length ? config.expenseOffsets : [0]))
    );
  }).length;
  const groceryDue = groceryReminders.filter(
    (g) => daysUntil(g.expiryDate) <= Math.max(...(config.groceryOffsets.length ? config.groceryOffsets : [0])),
  ).length;
  const medPending = medReminders.filter((m) =>
    (m.times || []).some((slot) => !(m.done?.[today] || {})[slot]),
  ).length;
  const generalOpen = generalReminders.filter((r) => !r.done).length;

  const items = [
    isReminderTypeEnabled(config.features, 'expense') && {
      key: 'expense',
      icon: '💸',
      title: t('reminders.expense'),
      subtitle: t('reminders.expenseSub'),
      route: 'ExpenseReminder' as const,
      badge: expenseDue,
    },
    isReminderTypeEnabled(config.features, 'medicine') && {
      key: 'med',
      icon: '💊',
      title: t('reminders.medicine'),
      subtitle: t('reminders.medicineSubFmt').replace(
        '{time}',
        formatTime12h(config.medicineTimes.Morning),
      ),
      route: 'MedicineReminder' as const,
      badge: medPending,
    },
    isReminderTypeEnabled(config.features, 'grocery') && {
      key: 'grocery',
      icon: '🥬',
      title: t('reminders.grocery'),
      subtitle: t('reminders.grocerySub'),
      route: 'GroceryReminder' as const,
      badge: groceryDue,
    },
    isReminderTypeEnabled(config.features, 'general') && {
      key: 'general',
      icon: '🔔',
      title: t('reminders.general'),
      subtitle: t('reminders.generalSub'),
      route: 'GeneralReminder' as const,
      badge: generalOpen,
    },
  ].filter(Boolean) as Array<{
    key: string;
    icon: string;
    title: string;
    subtitle: string;
    route: keyof RootStackParamList;
    badge: number;
  }>;

  /** Off is the only state worth changing from here; on just explains itself. */
  const onEnableAlerts = async () => {
    if (!config.alarmsEnabled) {
      if (!requireAuthToSave('change alarm settings')) return;
      const ok = await updateConfig({ alarmsEnabled: true });
      if (!ok) return;
    }
    showAppInfo(t('reminders.alertsOnTitle'), t('reminders.alertsOnBody'), '🔔');
  };

  return (
    <Screen>
      <GoogleAdBanner placement="reminders" inline />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={[styles.h1, { color: theme.ink }]}>{t('reminders.title')}</Text>
        <Text style={{ color: theme.muted, marginBottom: 12, lineHeight: 20 }}>
          {t('reminders.hint')}
        </Text>

        <Pressable
          style={styles.alertBtn}
          onPress={onEnableAlerts}
        >
          <Text style={styles.alertIcon}>🔔</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.alertTitle}>
              {config.alarmsEnabled ? t('reminders.alertsOn') : t('reminders.enableAlerts')}
            </Text>
            <Text style={styles.alertSub}>
              {config.alarmsEnabled ? t('reminders.alertsSubOn') : t('reminders.alertsSubOff')}
            </Text>
          </View>
          {currentAlarm ? <Text style={styles.live}>{t('reminders.live')}</Text> : null}
        </Pressable>

        <Text style={styles.scheduleHint}>
          {t('reminders.scheduleHint')
            .replace('{time}', formatTime12h(config.alertTime))
            .replace('{offsets}', (config.expenseOffsets || []).join(', '))
            .replace('{morning}', formatTime12h(config.medicineTimes.Morning))}
        </Text>

        {items.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => {
              // Hub is rendered inside Dashboard (not its own screen); push on root stack.
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const root: any = navigation.getParent() ?? navigation;
              root.navigate(item.route);
            }}
          >
            <Card>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <View style={[styles.icon, { backgroundColor: theme.accentSoft }]}>
                  <Text style={{ fontSize: 22 }}>{item.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.ink, fontWeight: '800', fontSize: 16 }}>
                    {item.title}
                  </Text>
                  <Text style={{ color: theme.muted }}>{item.subtitle}</Text>
                </View>
                {item.badge > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.badge}</Text>
                  </View>
                ) : null}
              </View>
            </Card>
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    h1: { fontSize: 24, fontWeight: '800', marginBottom: 4 },
    icon: {
      width: 48,
      height: 48,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    alertBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: theme.header,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
    },
    alertIcon: { fontSize: 22 },
    alertTitle: { color: '#fff', fontWeight: '800', fontSize: 15 },
    alertSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 },
    live: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 11,
      backgroundColor: theme.red,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },
    scheduleHint: {
      color: theme.muted,
      fontSize: 12,
      lineHeight: 17,
      marginBottom: 14,
    },
    badge: {
      minWidth: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: theme.red,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    badgeText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  });
}
