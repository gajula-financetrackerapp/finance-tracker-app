import React, { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  Vibration,
  View,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { useAlarms } from '../alarms/AlarmContext';
import { playTestAlarmSound } from '../alarms/ringSound';
import { Card, PrimaryButton, Screen } from '../components/ui';
import { TimeField, formatTime12h } from '../components/TimeField';
import { OffsetPicker, offsetsLabel } from '../components/ReminderFormBits';

/**
 * Mirrors HTML admin "Alarms & Notifications" defaults:
 * enable alarms, medicine slot times, daily alert time, expense/grocery offsets, ring duration.
 */
export function AlarmSettingsScreen() {
  const { theme, config, updateConfig } = useApp();
  const { alertsEnabled, enableAlerts, setAlertsEnabled } = useAlarms();

  const [morning, setMorning] = useState(config.medicineTimes.Morning);
  const [afternoon, setAfternoon] = useState(config.medicineTimes.Afternoon);
  const [evening, setEvening] = useState(config.medicineTimes.Evening);
  const [alertTime, setAlertTime] = useState(config.alertTime);
  const [expenseOffsets, setExpenseOffsets] = useState(config.expenseOffsets);
  const [groceryOffsets, setGroceryOffsets] = useState(config.groceryOffsets);
  const [alarmDurationSec, setAlarmDurationSec] = useState(String(config.alarmDurationSec));

  useEffect(() => {
    setMorning(config.medicineTimes.Morning);
    setAfternoon(config.medicineTimes.Afternoon);
    setEvening(config.medicineTimes.Evening);
    setAlertTime(config.alertTime);
    setExpenseOffsets(config.expenseOffsets);
    setGroceryOffsets(config.groceryOffsets);
    setAlarmDurationSec(String(config.alarmDurationSec));
  }, [config]);

  const toggleAlarms = async (on: boolean) => {
    await updateConfig({ alarmsEnabled: on });
    if (!on) setAlertsEnabled(false);
    else setAlertsEnabled(true);
  };

  const onEnableSound = async () => {
    await enableAlerts();
    if (!config.alarmsEnabled) await updateConfig({ alarmsEnabled: true });
    Alert.alert(
      'Alerts on',
      'In-app reminder banners, vibration, and alarm sound play while the app is open.\n\nPhone push notifications need a development build — Expo Go no longer supports them.',
    );
  };

  const onTest = () => {
    Vibration.vibrate([0, 500, 300, 500, 300, 500]);
    void playTestAlarmSound(2500);
    Alert.alert('Test alarm', 'You should hear a short alarm tone and feel vibration.');
  };

  const save = async () => {
    const duration = parseInt(alarmDurationSec, 10);
    await updateConfig({
      medicineTimes: {
        Morning: morning || '08:00',
        Afternoon: afternoon || '13:00',
        Evening: evening || '19:00',
      },
      alertTime: alertTime || '09:00',
      expenseOffsets: expenseOffsets.length ? expenseOffsets : [1, 0],
      groceryOffsets: groceryOffsets.length ? groceryOffsets : [2, 1, 0],
      alarmDurationSec: Number.isFinite(duration) ? Math.max(0, duration) : 60,
    });
    Alert.alert('Saved', 'Alarm & notification defaults updated.');
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={[styles.h2, { color: theme.ink }]}>Alarms & Notifications</Text>
          <Text style={[styles.hint, { color: theme.muted }]}>
            Same defaults as the HTML admin panel. Reminders on “Default” use these times and
            schedules. Each reminder can still be customized separately.
          </Text>

          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.toggleTitle, { color: theme.ink }]}>Enable Alarms</Text>
                <Pressable
                  onPress={() =>
                    Alert.alert(
                      'Enable Alarms',
                      'Master switch for the reminder alarm system.\n\nWhen off, no reminder banners, sounds, or vibration will fire — even if In-app alerts is on.\n\nUse the settings below for medicine times, expense/grocery offsets, and ring duration.',
                    )
                  }
                  hitSlop={10}
                  accessibilityLabel="Enable Alarms info"
                >
                  <Text style={{ color: theme.muted, fontSize: 16, fontWeight: '700' }}>ⓘ</Text>
                </Pressable>
              </View>
              <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                Turns reminder banners, sound & vibration on or off
              </Text>
            </View>
            <Switch
              value={config.alarmsEnabled}
              onValueChange={toggleAlarms}
              trackColor={{ false: '#d0d5d4', true: theme.accent }}
              thumbColor="#fff"
            />
          </View>

          <View style={[styles.toggleRow, { borderBottomWidth: 0 }]}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.toggleTitle, { color: theme.ink }]}>In-app alerts armed</Text>
                <Pressable
                  onPress={() =>
                    Alert.alert(
                      'In-app alerts',
                      'Shows a banner, vibration, and alarm sound when a reminder is due — only while Pulse Wallet is open.\n\nThese are not phone notifications. Alerts will not appear if the app is closed.',
                    )
                  }
                  hitSlop={10}
                  accessibilityLabel="In-app alerts info"
                >
                  <Text style={{ color: theme.muted, fontSize: 16, fontWeight: '700' }}>ⓘ</Text>
                </Pressable>
              </View>
              <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                {alertsEnabled ? 'Sound/vibration path is unlocked' : 'Tap Enable below to unlock'}
              </Text>
            </View>
            <Switch
              value={alertsEnabled}
              onValueChange={(v) => {
                if (v) {
                  void enableAlerts();
                  if (!config.alarmsEnabled) void updateConfig({ alarmsEnabled: true });
                } else {
                  setAlertsEnabled(false);
                }
              }}
              trackColor={{ false: '#d0d5d4', true: theme.accent }}
              thumbColor="#fff"
            />
          </View>
        </Card>

        <Card>
          <PrimaryButton title="🔔 Enable Sound & Notifications" onPress={onEnableSound} />
          <View style={{ height: 10 }} />
          <PrimaryButton title="▶ Test Alarm" onPress={onTest} danger />
        </Card>

        <Card>
          <Text style={[styles.h3, { color: theme.ink }]}>Medicine Reminder Times</Text>
          <TimeField label="Morning" value={morning} onChange={setMorning} />
          <TimeField label="Afternoon" value={afternoon} onChange={setAfternoon} />
          <TimeField label="Evening" value={evening} onChange={setEvening} />
        </Card>

        <Card>
          <Text style={[styles.h3, { color: theme.ink }]}>Expense & Grocery Alerts</Text>
          <TimeField label="Daily Alert Time" value={alertTime} onChange={setAlertTime} />
          <Text style={[styles.fieldLabel, { color: theme.muted }]}>Remind me for expenses</Text>
          <Text style={[styles.subHint, { color: theme.muted }]}>
            Currently: {offsetsLabel(expenseOffsets)}
          </Text>
          <OffsetPicker selected={expenseOffsets} onChange={setExpenseOffsets} />
          <Text style={[styles.fieldLabel, { color: theme.muted, marginTop: 8 }]}>
            Remind me for groceries
          </Text>
          <Text style={[styles.subHint, { color: theme.muted }]}>
            Currently: {offsetsLabel(groceryOffsets, 'Expiry day')}
          </Text>
          <OffsetPicker selected={groceryOffsets} onChange={setGroceryOffsets} forExpiry />
        </Card>

        <Card>
          <Text style={[styles.h3, { color: theme.ink }]}>Default Alarm Duration</Text>
          <Text style={[styles.hint, { color: theme.muted }]}>
            Seconds to ring (0 = until dismissed). Shown as {formatTime12h(alertTime)} daily for
            expense/grocery defaults.
          </Text>
          <TextInput
            style={[
              styles.input,
              { borderColor: theme.line, color: theme.ink, backgroundColor: theme.card },
            ]}
            value={alarmDurationSec}
            onChangeText={setAlarmDurationSec}
            keyboardType="number-pad"
            placeholder="60"
            placeholderTextColor={theme.muted}
          />
          <PrimaryButton title="Save Alarm Settings" onPress={save} />
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h2: { fontWeight: '800', fontSize: 18, marginBottom: 6 },
  h3: { fontWeight: '800', fontSize: 15, marginBottom: 10 },
  hint: { fontSize: 12.5, lineHeight: 18, marginBottom: 12 },
  subHint: { fontSize: 12, marginBottom: 6 },
  fieldLabel: { fontWeight: '700', fontSize: 12, marginBottom: 4, textTransform: 'uppercase' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E3EBE9',
  },
  toggleTitle: { fontWeight: '800', fontSize: 14 },
  input: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 12,
  },
});
