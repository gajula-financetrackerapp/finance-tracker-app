import React, { useCallback, useEffect, useState } from 'react';
import {
  Linking,
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
import { playTestAlarmSound, setAlarmToneUri } from '../alarms/ringSound';
import { pickSystemAlarmTone, systemTonesSupported } from '../alarms/toneChoice';
import { ringtoneTitle } from '../../modules/ringtone-info';
import {
  ensureReminderPermission,
  reminderNotificationsSupported,
  reminderPermissionStatus,
  type ReminderPermission,
} from '../lib/reminderNotifications';
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

  /**
   * Whether the phone will let Kashio post a notification. Worth showing,
   * because everything on this screen is quietly pointless without it.
   */
  const [permission, setPermission] = useState<ReminderPermission>('granted');
  const refreshPermission = useCallback(() => {
    void reminderPermissionStatus().then(setPermission);
  }, []);
  useEffect(refreshPermission, [refreshPermission, config.alarmsEnabled]);

  /**
   * Name a tone that was chosen before this build could read names. Saved
   * rather than only shown, so the row does not have to ask the phone again on
   * every visit.
   */
  useEffect(() => {
    const uri = config.alarmToneUri;
    if (!uri || config.alarmToneName) return;
    let dropped = false;
    void ringtoneTitle(uri).then((name) => {
      if (dropped || !name) return;
      void updateConfig({ alarmToneName: name });
    });
    return () => {
      dropped = true;
    };
  }, [config.alarmToneUri, config.alarmToneName, updateConfig]);

  const toggleAlarms = async (on: boolean) => {
    if (!requireAlarmAuth()) return;
    const saved = await updateConfig({ alarmsEnabled: on });
    if (!saved || !on) return;
    // Ask now, while the user is plainly thinking about reminders, rather than
    // springing the system prompt on them at some later launch.
    setPermission(await ensureReminderPermission(true));
  };

  const toggleSound = async (on: boolean) => {
    if (!requireAlarmAuth()) return;
    await updateConfig({ alarmSound: on });
  };

  const toggleVibration = async (on: boolean) => {
    if (!requireAlarmAuth()) return;
    await updateConfig({ alarmVibration: on });
  };

  /** Borrow one of the phone's own alarm tones for the in-app ring. */
  const onPickTone = () => {
    if (!requireAlarmAuth()) return;
    void (async () => {
      const picked = await pickSystemAlarmTone({
        title: t('alarms.tonePickerTitle'),
        labels: {
          defaultAlarm: t('alarms.toneDefaultAlarm'),
          defaultNotification: t('alarms.toneDefaultNotification'),
        },
        currentUri: config.alarmToneUri,
      });
      if (picked.state === 'cancelled') return;
      if (picked.state === 'unavailable') {
        showAppInfo(t('alarms.tone'), t('alarms.toneUnavailable'), '🔇');
        return;
      }
      const uri = picked.state === 'picked' ? picked.uri : null;
      const name = picked.state === 'picked' ? picked.name : null;
      if (!(await updateConfig({ alarmToneUri: uri, alarmToneName: name }))) return;
      setAlarmToneUri(uri);
      // Played back at once: the picker hands over a URI and no name, so hearing
      // it is the only way to know which tone was actually chosen.
      const ring = await playTestAlarmSound();
      if (!ring.heard) {
        showAppInfo(t('alarms.testNoSound'), t('alarms.testNoSoundBody'), '🔇');
        return;
      }
      if (uri && !ring.usedChosenTone) {
        // The tone is left saved: it may well be readable on another day, and
        // the built-in one covers the alarm meanwhile.
        showAppInfo(t('alarms.tone'), t('alarms.toneUnplayable'), '🔇');
        return;
      }
      showAppInfo(t('alarms.tone'), uri ? t('alarms.toneSaved') : t('alarms.toneBackToBuiltIn'), '🔔');
    })();
  };

  /** Back to the tone that ships with the app, and play it so it is heard. */
  const onUseBuiltInTone = () => {
    if (!requireAlarmAuth()) return;
    void (async () => {
      if (!(await updateConfig({ alarmToneUri: null, alarmToneName: null }))) return;
      setAlarmToneUri(null);
      const ring = await playTestAlarmSound();
      if (!ring.heard) {
        showAppInfo(t('alarms.testNoSound'), t('alarms.testNoSoundBody'), '🔇');
        return;
      }
      showAppInfo(t('alarms.tone'), t('alarms.toneBackToBuiltIn'), '🔔');
    })();
  };

  /**
   * Guests may test without signing in. The test follows the two switches, so
   * it shows what a real reminder will actually do on this phone.
   */
  const onTest = () => {
    if (config.alarmVibration) Vibration.vibrate([0, 500, 300, 500, 300, 500]);
    if (!config.alarmSound) {
      showAppInfo(
        t('alarms.testTitle'),
        config.alarmVibration ? t('alarms.testBody') : t('alarms.testQuiet'),
        '▶',
      );
      return;
    }
    void (async () => {
      const ring = await playTestAlarmSound();
      if (ring.heard) {
        // A tone that runs may still be inaudible on a phone with its media
        // volume down, and nothing in the audio module can tell the difference,
        // so the volume gets a mention either way.
        const fellBack = !!config.alarmToneUri && !ring.usedChosenTone;
        const volumeHint =
          ring.stream === 'alarm' ? t('alarms.testAlarmHint') : t('alarms.testMediaHint');
        showAppInfo(
          t('alarms.testTitle'),
          fellBack ? t('alarms.toneUnplayable') : `${t('alarms.testBody')}\n\n${volumeHint}`,
          '▶',
        );
        return;
      }
      // The tone can only fail for reasons the phone knows about, so say what
      // they are rather than leaving a silent test looking like a working one.
      showAppInfo(t('alarms.testNoSound'), t('alarms.testNoSoundBody'), '🔇');
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
    showAppInfo(t('common.saved'), t('alarms.savedDefaults'), '✅');
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={[styles.h2, { color: theme.ink }]}>{t('settings.alarms')}</Text>
          <Text style={[styles.hint, { color: theme.muted }]}>{t('alarms.hint')}</Text>
          <Text style={[styles.hint, { color: theme.muted, marginTop: -4 }]}>
            {t('alarms.signInToChange')}
          </Text>

          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.toggleTitle, { color: theme.ink }]}>{t('alarms.enable')}</Text>
                <Pressable
                  onPress={() => showAppInfo(t('alarms.enable'), t('alarms.enableInfo'), 'ⓘ')}
                  hitSlop={10}
                  accessibilityLabel={t('alarms.enable')}
                >
                  <Text style={{ color: theme.muted, fontSize: 16, fontWeight: '700' }}>ⓘ</Text>
                </Pressable>
              </View>
              <Text style={[styles.toggleHint, { color: theme.muted }]}>
                {t('alarms.enableHint')}
              </Text>
            </View>
            <Switch
              value={config.alarmsEnabled}
              onValueChange={toggleAlarms}
              trackColor={{ false: theme.switchOff, true: theme.switchOn }}
              thumbColor="#fff"
            />
          </View>

          {/* A switch that is off but faded still reads as on, and the rows
              below are exactly that while reminders are off. Their choices are
              kept rather than written off, so say so instead. */}
          {!config.alarmsEnabled ? (
            <Text style={[styles.notice, { color: theme.muted, borderColor: theme.line }]}>
              {t('alarms.offKeepsChoices')}
            </Text>
          ) : null}

          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={[styles.toggleTitle, { color: theme.ink }]}>{t('alarms.sound')}</Text>
              <Text style={[styles.toggleHint, { color: theme.muted }]}>
                {t('alarms.soundHint')}
              </Text>
            </View>
            <Switch
              value={config.alarmSound}
              onValueChange={toggleSound}
              disabled={!config.alarmsEnabled}
              trackColor={{ false: theme.switchOff, true: theme.switchOn }}
              thumbColor="#fff"
            />
          </View>

          {/* Only offered where there is a picker to open, and only while the
              ring is meant to make a noise at all. */}
          {config.alarmSound && systemTonesSupported() ? (
            <View style={styles.toggleRow}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={[styles.toggleTitle, { color: theme.ink }]}>{t('alarms.tone')}</Text>
                {/* Both tones stay on show, since a way back that only appears
                    once a phone tone is chosen is invisible at the moment it is
                    wanted. The tick marks the one that will ring, and the name
                    of the phone's tone sits under its own button. */}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  {(
                    [
                      { key: 'builtIn', label: t('alarms.toneKashio'), press: onUseBuiltInTone },
                      { key: 'phone', label: t('alarms.toneChoose'), press: onPickTone },
                    ] as const
                  ).map((choice) => {
                    const chosen = choice.key === 'phone' ? !!config.alarmToneUri : !config.alarmToneUri;
                    const onPhone = choice.key === 'phone';
                    return (
                      <View key={choice.key} style={{ alignItems: 'flex-start', flexShrink: 1 }}>
                        <Pressable
                          onPress={choice.press}
                          disabled={!config.alarmsEnabled}
                          style={[
                            styles.toneBtn,
                            chosen
                              ? { backgroundColor: theme.primary }
                              : { borderWidth: 1.5, borderColor: theme.line },
                            { opacity: config.alarmsEnabled ? 1 : 0.5 },
                          ]}
                        >
                          <Text
                            style={[
                              styles.toneBtnText,
                              { color: chosen ? theme.onPrimary : theme.ink },
                            ]}
                          >
                            {/* The phone's tick goes beside its name below. */}
                            {chosen && !onPhone ? `✓ ${choice.label}` : choice.label}
                          </Text>
                        </Pressable>
                        {onPhone && chosen ? (
                          <Text
                            style={[styles.toneName, { color: theme.ink }]}
                            numberOfLines={1}
                          >
                            {`✓ ${config.alarmToneName || t('alarms.toneUnnamed')}`}
                          </Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
                <Text style={[styles.toggleHint, { color: theme.muted, marginTop: 8 }]}>
                  {t('alarms.toneClosedAppNote')}
                </Text>
              </View>
            </View>
          ) : null}

          <View style={[styles.toggleRow, { borderBottomWidth: 0 }]}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={[styles.toggleTitle, { color: theme.ink }]}>
                {t('alarms.vibration')}
              </Text>
              <Text style={[styles.toggleHint, { color: theme.muted }]}>
                {t('alarms.vibrationHint')}
              </Text>
            </View>
            <Switch
              value={config.alarmVibration}
              onValueChange={toggleVibration}
              disabled={!config.alarmsEnabled}
              trackColor={{ false: theme.switchOff, true: theme.switchOn }}
              thumbColor="#fff"
            />
          </View>

          {/* Only worth saying while reminders are meant to be arriving. */}
          {config.alarmsEnabled && !config.alarmSound && !config.alarmVibration ? (
            <Text style={[styles.notice, { color: theme.muted, borderColor: theme.line }]}>
              {t('alarms.quiet')}
            </Text>
          ) : null}

          {config.alarmsEnabled && !reminderNotificationsSupported() ? (
            <Text style={[styles.notice, { color: theme.muted, borderColor: theme.line }]}>
              {t('alarms.unsupported')}
            </Text>
          ) : null}

          {config.alarmsEnabled && permission === 'denied' ? (
            <View>
              <Text style={[styles.notice, { color: theme.red, borderColor: theme.red }]}>
                {t('alarms.blocked')}
              </Text>
              <Pressable
                onPress={() => {
                  void Linking.openSettings();
                }}
                hitSlop={8}
              >
                <Text style={[styles.link, { color: theme.primaryDark }]}>
                  {t('alarms.openSettings')}
                </Text>
              </Pressable>
            </View>
          ) : null}
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
  toggleHint: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  toneBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10 },
  toneBtnText: { fontWeight: '800', fontSize: 13 },
  toneName: { fontWeight: '700', fontSize: 12, marginTop: 5, paddingHorizontal: 2 },
  notice: {
    fontSize: 12,
    lineHeight: 17,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 10,
  },
  link: { fontSize: 12.5, fontWeight: '800', marginTop: 8, textDecorationLine: 'underline' },
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
