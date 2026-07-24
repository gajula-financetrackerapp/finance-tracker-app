import React, { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAlarms } from '../alarms/AlarmContext';
import { useApp } from '../context/AppContext';
import type { ThemeTokens } from '../types';
import { useT } from '../i18n/useT';

export function AlarmBanner() {
  const { theme } = useApp();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { currentAlarm, resolveAlarm } = useAlarms();
  const insets = useSafeAreaInsets();
  if (!currentAlarm) return null;

  const isMed = currentAlarm.type === 'medicine';
  const isExp = currentAlarm.type === 'expense';
  const isGen = currentAlarm.type === 'general';
  const isGroc = currentAlarm.type === 'grocery';

  const onMarkExpensePaid = () => {
    Alert.alert(
      t('reminders.markPaidTitle'),
      t('reminders.markPaidBannerBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('reminders.skip'),
          onPress: () => void resolveAlarm('done', { addToFinance: false }),
        },
        {
          text: t('reminders.addToFinance'),
          onPress: () => void resolveAlarm('done', { addToFinance: true }),
        },
      ],
    );
  };

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 8) }]} pointerEvents="box-none">
      <View style={styles.banner}>
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
          <Pressable style={styles.snooze} onPress={() => void resolveAlarm('snooze')}>
            <Text style={styles.snoozeText}>{t('reminders.snooze')}</Text>
          </Pressable>
        </View>
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
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
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
  });
}
