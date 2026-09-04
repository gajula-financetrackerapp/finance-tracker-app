import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAlarms } from '../alarms/AlarmContext';
import { SNOOZE_CHOICES } from '../alarms/snoozeChoices';
import { useApp } from '../context/AppContext';
import { showAppDialog } from '../appDialog';
import type { ThemeTokens } from '../types';
import { useT } from '../i18n/useT';

export function AlarmBanner() {
  const { theme } = useApp();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { currentAlarm, resolveAlarm } = useAlarms();
  const insets = useSafeAreaInsets();
  const [pickingSnooze, setPickingSnooze] = useState(false);

  // The next alarm arrives in the same banner, so the open picker belongs to
  // the one that raised it and nothing else.
  const alarmKey = currentAlarm?.key ?? null;
  useEffect(() => {
    setPickingSnooze(false);
  }, [alarmKey]);

  if (!currentAlarm) return null;

  const isMed = currentAlarm.type === 'medicine';
  const isExp = currentAlarm.type === 'expense';
  const isGen = currentAlarm.type === 'general';
  const isGroc = currentAlarm.type === 'grocery';

  const onMarkExpensePaid = () => {
    showAppDialog({
      title: t('reminders.markPaidTitle'),
      message: t('reminders.markPaidBannerBody'),
      icon: '✅',
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('reminders.skip'),
          onPress: () => void resolveAlarm('done', { addToFinance: false }),
        },
        {
          text: t('reminders.addToFinance'),
          style: 'primary',
          onPress: () => void resolveAlarm('done', { addToFinance: true }),
        },
      ],
    });
  };

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 8) }]} pointerEvents="box-none">
      <View style={styles.banner}>
        <View style={styles.row}>
          <Text style={styles.ic}>🔔</Text>
          <View style={styles.body}>
            <Text style={styles.title} numberOfLines={2}>
              {currentAlarm.title}
            </Text>
            <Text style={styles.sub} numberOfLines={2}>
              {currentAlarm.sub}
            </Text>
          </View>
          <View style={styles.actions}>
            {isMed || isGen ? (
              <Pressable style={styles.done} onPress={() => void resolveAlarm('done')}>
                <Text style={styles.doneText}>{t('reminders.markDoneShort')}</Text>
              </Pressable>
            ) : null}
            {isExp ? (
              <Pressable style={styles.done} onPress={onMarkExpensePaid}>
                <Text style={styles.doneText}>{t('reminders.markPaidShort')}</Text>
              </Pressable>
            ) : null}
            {isGroc ? (
              <>
                <Pressable style={styles.done} onPress={() => void resolveAlarm('done')}>
                  <Text style={styles.doneText}>{t('reminders.gotIt')}</Text>
                </Pressable>
                <Pressable style={styles.used} onPress={() => void resolveAlarm('remove')}>
                  <Text style={styles.usedText}>{t('reminders.markUsed')}</Text>
                </Pressable>
              </>
            ) : null}
            <Pressable
              style={[styles.snooze, pickingSnooze && styles.snoozeOpen]}
              onPress={() => setPickingSnooze((open) => !open)}
            >
              <Text style={styles.snoozeText}>
                {pickingSnooze ? t('common.cancel') : t('reminders.snooze')}
              </Text>
            </Pressable>
          </View>
        </View>

        {pickingSnooze ? (
          <View style={styles.snoozePicker}>
            <Text style={styles.snoozeLead}>{t('reminders.snoozeFor')}</Text>
            <View style={styles.chips}>
              {SNOOZE_CHOICES.map((choice) => (
                <Pressable
                  key={choice.minutes}
                  style={styles.chip}
                  onPress={() => void resolveAlarm('snooze', { snoozeMinutes: choice.minutes })}
                >
                  <Text style={styles.chipText}>{t(choice.labelKey)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    wrap: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      paddingHorizontal: 12,
    },
    banner: {
      backgroundColor: theme.header,
      borderRadius: 16,
      padding: 12,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    ic: { fontSize: 22, marginTop: 2 },
    body: { flex: 1 },
    title: { color: '#fff', fontWeight: '800', fontSize: 14 },
    sub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 3, lineHeight: 16 },
    actions: { gap: 6, alignItems: 'stretch', minWidth: 110 },
    done: {
      backgroundColor: theme.accent,
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 10,
      alignItems: 'center',
    },
    doneText: { color: '#fff', fontWeight: '800', fontSize: 12 },
    used: {
      backgroundColor: 'rgba(255,255,255,0.18)',
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 10,
      alignItems: 'center',
    },
    usedText: { color: '#fff', fontWeight: '700', fontSize: 12 },
    snooze: {
      backgroundColor: 'rgba(255,255,255,0.12)',
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 10,
      alignItems: 'center',
    },
    snoozeText: { color: 'rgba(255,255,255,0.9)', fontWeight: '700', fontSize: 12 },
    snoozeOpen: { backgroundColor: 'rgba(255,255,255,0.28)' },
    snoozePicker: {
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: 'rgba(255,255,255,0.25)',
    },
    snoozeLead: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    chip: {
      backgroundColor: 'rgba(255,255,255,0.18)',
      borderRadius: 999,
      paddingVertical: 8,
      paddingHorizontal: 14,
    },
    chipText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  });
}
