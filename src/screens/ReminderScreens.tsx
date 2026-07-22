import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { useAlarms } from '../alarms/AlarmContext';
import { daysUntil } from '../alarms/engine';
import { Card, Screen } from '../components/ui';
import { todayStr } from '../utils';
import { theme as pulse } from '../theme';
import { RootStackParamList } from '../navigation/types';

export function ReminderHubScreen() {
  const { config, theme, expenseReminders, medReminders, groceryReminders, generalReminders } =
    useApp();
  const { alertsEnabled, enableAlerts, currentAlarm } = useAlarms();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const today = todayStr();

  const expenseDue = expenseReminders.filter(
    (r) => !r.paid && daysUntil(r.dueDate) <= Math.max(...(config.expenseOffsets.length ? config.expenseOffsets : [0])),
  ).length;
  const groceryDue = groceryReminders.filter(
    (g) => daysUntil(g.expiryDate) <= Math.max(...(config.groceryOffsets.length ? config.groceryOffsets : [0])),
  ).length;
  const medPending = medReminders.filter((m) =>
    (m.times || []).some((slot) => !(m.done?.[today] || {})[slot]),
  ).length;
  const generalOpen = generalReminders.filter((r) => !r.done).length;

  const items = [
    config.features.expenseReminder && {
      key: 'expense',
      icon: '💸',
      title: 'Expense Reminder',
      subtitle: 'Rent, bills and due dates',
      route: 'ExpenseReminder' as const,
      badge: expenseDue,
    },
    config.features.medicineReminder && {
      key: 'med',
      icon: '💊',
      title: 'Medicine Reminder',
      subtitle: `Daily doses · Morning ${config.medicineTimes.Morning}`,
      route: 'MedicineReminder' as const,
      badge: medPending,
    },
    config.features.groceryExpiryReminder && {
      key: 'grocery',
      icon: '🥬',
      title: 'Grocery Expiry',
      subtitle: 'Track expiry dates for food items',
      route: 'GroceryReminder' as const,
      badge: groceryDue,
    },
    config.features.generalReminder && {
      key: 'general',
      icon: '🔔',
      title: 'General Reminder',
      subtitle: 'Meetings, calls and personal tasks',
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

  const onEnableAlerts = async () => {
    await enableAlerts();
    Alert.alert(
      'Alerts',
      'Phone notifications requested. While the app is open, due reminders also show a banner with Snooze / Mark Done — same idea as the HTML app.',
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={[styles.h1, { color: theme.ink }]}>Reminders</Text>
        <Text style={{ color: theme.muted, marginBottom: 12, lineHeight: 20 }}>
          Alerts fire at the scheduled time (like the HTML app): expense/grocery offsets, medicine
          dose times, and general date+time.
        </Text>

        <Pressable
          style={[styles.alertBtn, alertsEnabled && styles.alertBtnOn]}
          onPress={onEnableAlerts}
        >
          <Text style={styles.alertIcon}>🔔</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.alertTitle}>
              {alertsEnabled ? 'Alerts enabled' : 'Enable alerts'}
            </Text>
            <Text style={styles.alertSub}>
              {alertsEnabled
                ? 'Notifications + in-app alarm banner'
                : 'Tap to allow phone notifications'}
            </Text>
          </View>
          {currentAlarm ? <Text style={styles.live}>LIVE</Text> : null}
        </Pressable>

        <Text style={styles.scheduleHint}>
          Default alert time {config.alertTime} · Expense offsets:{' '}
          {(config.expenseOffsets || []).join(', ')} day(s) before · Medicine Morning{' '}
          {config.medicineTimes.Morning}
        </Text>

        {items.map((item) => (
          <Pressable key={item.key} onPress={() => navigation.navigate(item.route as never)}>
            <Card>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <View style={[styles.icon, { backgroundColor: pulse.accentSoft }]}>
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

const styles = StyleSheet.create({
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
    backgroundColor: pulse.header,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  alertBtnOn: {
    backgroundColor: '#147F7C',
  },
  alertIcon: { fontSize: 22 },
  alertTitle: { color: '#fff', fontWeight: '800', fontSize: 15 },
  alertSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 },
  live: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 11,
    backgroundColor: pulse.red,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  scheduleHint: {
    color: pulse.muted,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 14,
  },
  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: pulse.red,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 12 },
});
