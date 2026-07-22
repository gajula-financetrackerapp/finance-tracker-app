import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAlarms } from '../alarms/AlarmContext';
import { theme } from '../theme';

export function AlarmBanner() {
  const { currentAlarm, resolveAlarm } = useAlarms();
  const insets = useSafeAreaInsets();
  if (!currentAlarm) return null;

  const isMed = currentAlarm.type === 'medicine';
  const isExp = currentAlarm.type === 'expense';
  const isGen = currentAlarm.type === 'general';
  const isGroc = currentAlarm.type === 'grocery';

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
            <Pressable style={styles.done} onPress={() => resolveAlarm('done')}>
              <Text style={styles.doneText}>✓ Mark Done</Text>
            </Pressable>
          ) : null}
          {isExp ? (
            <Pressable style={styles.done} onPress={() => resolveAlarm('done')}>
              <Text style={styles.doneText}>✓ Mark Paid</Text>
            </Pressable>
          ) : null}
          {isGroc ? (
            <>
              <Pressable style={styles.done} onPress={() => resolveAlarm('done')}>
                <Text style={styles.doneText}>✓ Got it</Text>
              </Pressable>
              <Pressable style={styles.used} onPress={() => resolveAlarm('remove')}>
                <Text style={styles.usedText}>Mark Used</Text>
              </Pressable>
            </>
          ) : null}
          <Pressable style={styles.snooze} onPress={() => resolveAlarm('snooze')}>
            <Text style={styles.snoozeText}>Snooze 10m</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    paddingHorizontal: 10,
  },
  banner: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  ic: { fontSize: 26 },
  body: { flex: 1, minWidth: 120 },
  title: { color: '#fff', fontWeight: '800', fontSize: 14.5 },
  sub: { color: 'rgba(255,255,255,0.75)', fontSize: 12.5, marginTop: 2 },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
    justifyContent: 'flex-end',
  },
  done: {
    backgroundColor: theme.accent,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  doneText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  used: {
    backgroundColor: theme.header,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  usedText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  snooze: {
    backgroundColor: '#3a3a3d',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  snoozeText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
