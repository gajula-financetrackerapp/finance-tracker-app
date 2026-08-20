import React, { useEffect, useState } from 'react';
import {
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
import { playTestAlarmSound } from '../alarms/ringSound';
import { requireAuthToSave } from '../authGate';
import { showAppInfo } from '../appDialog';
import { Card, PrimaryButton, Screen } from '../components/ui';
import { TimeField, formatTime12h } from '../components/TimeField';
import { OffsetPicker, offsetsLabel } from '../components/ReminderFormBits';
import { useT } from '../i18n/useT';

/**
 * Mirrors HTML admin "Alarms & Notifications" defaults:
 * enable alarms, medicine slot times, daily alert time, expense/grocery offsets, ring duration.
 * Guests may only run Test alarm — all other changes require sign-in.
 */
export function AlarmSettingsScreen() {
  const { theme, config, updateConfig } = useApp();
  const { t } = useT();

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

  /** All alarm setting changes require sign-in (Test alarm is the exception). */
  const requireAlarmAuth = () => requireAuthToSave('change alarm settings');

  const gatedSet = <T,>(setter: (v: T) => void) => (v: T) => {
    if (!requireAlarmAuth()) return;
    setter(v);
  };

  const toggleAlarms = async (on: boolean) => {
    if (!requireAlarmAuth()) return;
    await updateConfig({ alarmsEnabled: on });
  };

  /** Guests may test sound/vibration without signing in. */
  const onTest = () => {
    Vibration.vibrate([0, 500, 300, 500, 300, 500]);
    void (async () => {
      const heard = await playTestAlarmSound(2500);
      if (heard) {
        showAppInfo('Test alarm', 'You should hear a short alarm tone and feel vibration.', '▶');
        return;
      }
      // The tone can only fail for reasons the phone knows about, so say what
      // they are rather than leaving a silent test looking like a working one.
      showAppInfo(
        'No alarm tone',
        'The vibration ran, but this phone could not play the alarm sound.\n\nCheck that media volume is up and the phone is not in silent or Do Not Disturb mode. If that is not it, the app needs rebuilding — the sound player is missing from this build.',
        '🔇',
      );
    })();
  };

  const save = async () => {
    if (!requireAlarmAuth()) return;
    const duration = parseInt(alarmDurationSec, 10);
    const ok = await updateConfig({
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
    if (!ok) return;
    showAppInfo('Saved', 'Alarm & notification defaults updated.', '✅');
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={[styles.h2, { color: theme.ink }]}>{t('settings.alarms')}</Text>
          <Text style={[styles.hint, { color: theme.muted }]}>{t('alarms.hint')}</Text>
          <Text style={[styles.hint, { color: theme.muted, marginTop: -4 }]}>
            Sign in to change these settings. Test alarm works without signing in.
          </Text>

          <View style={[styles.toggleRow, { borderBottomWidth: 0 }]}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.toggleTitle, { color: theme.ink }]}>{t('alarms.enable')}</Text>
                <Pressable
                  onPress={() =>
                    showAppInfo(
                      t('alarms.enable'),
                      'The switch for the reminder alarm system. When off, no reminder banner, sound or vibration will fire.\n\nAlarms are in-app only: they reach you while Kashio is open, and not when it is closed. They are not phone notifications.\n\nUse the settings below for medicine times, expense and grocery warnings, and how long an alarm rings.',
                      'ⓘ',
                    )
                  }
                  hitSlop={10}
                  accessibilityLabel="Enable Alarms info"
                >
                  <Text style={{ color: theme.muted, fontSize: 16, fontWeight: '700' }}>ⓘ</Text>
                </Pressable>
              </View>
              <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                Banner, sound and vibration while the app is open
              </Text>
            </View>
            <Switch
              value={config.alarmsEnabled}
              onValueChange={toggleAlarms}
              trackColor={{ false: theme.switchOff, true: theme.switchOn }}
              thumbColor="#fff"
            />
          </View>
        </Card>

        <Card>
          <PrimaryButton title={`▶ ${t('alarms.test')}`} onPress={onTest} danger />
        </Card>

        <Card>
          <Text style={[styles.h3, { color: theme.ink }]}>{t('alarms.medicineTimes')}</Text>
          <TimeField label={t('alarms.morning')} value={morning} onChange={gatedSet(setMorning)} />
          <TimeField label={t('alarms.afternoon')} value={afternoon} onChange={gatedSet(setAfternoon)} />
          <TimeField label={t('alarms.evening')} value={evening} onChange={gatedSet(setEvening)} />
        </Card>

        <Card>
          <Text style={[styles.h3, { color: theme.ink }]}>{t('alarms.expenseGrocery')}</Text>
          <TimeField label={t('alarms.dailyAlert')} value={alertTime} onChange={gatedSet(setAlertTime)} />
          <Text style={[styles.fieldLabel, { color: theme.muted }]}>{t('alarms.remindExpenses')}</Text>
          <Text style={[styles.subHint, { color: theme.muted }]}>
            Currently: {offsetsLabel(expenseOffsets)}
          </Text>
          <OffsetPicker selected={expenseOffsets} onChange={gatedSet(setExpenseOffsets)} />
          <Text style={[styles.fieldLabel, { color: theme.muted, marginTop: 8 }]}>
            {t('alarms.remindGroceries')}
          </Text>
          <Text style={[styles.subHint, { color: theme.muted }]}>
            Currently: {offsetsLabel(groceryOffsets, 'Expiry day')}
          </Text>
          <OffsetPicker selected={groceryOffsets} onChange={gatedSet(setGroceryOffsets)} forExpiry />
        </Card>

        <Card>
          <Text style={[styles.h3, { color: theme.ink }]}>{t('alarms.duration')}</Text>
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
            onChangeText={gatedSet(setAlarmDurationSec)}
            keyboardType="number-pad"
            placeholder="60"
            placeholderTextColor={theme.muted}
          />
          <PrimaryButton title={t('alarms.save')} onPress={save} />
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
