import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useApp } from '../context/AppContext';
import { todayStr } from '../utils';
import { AlarmInstance, buildDueAlarms } from './engine';
import { loadDismissed, loadSnooze, saveDismissed, saveSnooze } from './storage';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

type ResolveAction = 'done' | 'snooze' | 'remove';

type AlarmContextValue = {
  currentAlarm: AlarmInstance | null;
  alertsEnabled: boolean;
  enableAlerts: () => Promise<void>;
  resolveAlarm: (action: ResolveAction) => Promise<void>;
  syncAlarmIfType: (type: AlarmInstance['type'], id: string) => void;
};

const AlarmContext = createContext<AlarmContextValue | null>(null);

export function AlarmProvider({ children }: { children: React.ReactNode }) {
  const {
    ready,
    config,
    expenseReminders,
    medReminders,
    groceryReminders,
    generalReminders,
    setExpenseReminders,
    setMedReminders,
    setGroceryReminders,
    setGeneralReminders,
  } = useApp();

  const [dismissed, setDismissed] = useState<string[]>([]);
  const [snoozeUntil, setSnoozeUntil] = useState<Record<string, number>>({});
  const [currentAlarm, setCurrentAlarm] = useState<AlarmInstance | null>(null);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const queueRef = useRef<AlarmInstance[]>([]);
  const ringTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownNotifyKeys = useRef<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      setDismissed(await loadDismissed());
      setSnoozeUntil(await loadSnooze());
    })();
  }, []);

  const clearRing = () => {
    if (ringTimer.current) {
      clearTimeout(ringTimer.current);
      ringTimer.current = null;
    }
    Vibration.cancel();
  };

  const startRing = useCallback((alarm: AlarmInstance) => {
    clearRing();
    Vibration.vibrate([0, 600, 400, 600], true);
    if (alarm.ringDurationSec > 0) {
      ringTimer.current = setTimeout(() => {
        // Auto-snooze like HTML after ring duration
        setSnoozeUntil((prev) => {
          const next = { ...prev, [alarm.key]: Date.now() + 15 * 60 * 1000 };
          void saveSnooze(next);
          return next;
        });
        queueRef.current = queueRef.current.filter((q) => q.key !== alarm.key);
        setCurrentAlarm(null);
        Vibration.cancel();
      }, alarm.ringDurationSec * 1000);
    }
  }, []);

  const fireNotification = async (alarm: AlarmInstance) => {
    if (!alertsEnabled) return;
    if (shownNotifyKeys.current.has(alarm.key)) return;
    shownNotifyKeys.current.add(alarm.key);
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: alarm.title,
          body: alarm.sub,
          sound: true,
        },
        trigger: null,
      });
    } catch {
      // ignore — Expo Go / permission edge cases
    }
  };

  const checkReminders = useCallback(() => {
    if (!ready || !config.alarmsEnabled) return;
    if (currentAlarm) return;

    const due = buildDueAlarms({
      config,
      expenseReminders,
      medReminders,
      groceryReminders,
      generalReminders,
      dismissedKeys: dismissed,
      snoozeUntil,
    });

    const next = due.find((d) => !queueRef.current.some((q) => q.key === d.key)) || due[0];
    if (!next) {
      queueRef.current = [];
      return;
    }
    queueRef.current = due;
    setCurrentAlarm(next);
    startRing(next);
    void fireNotification(next);
  }, [
    ready,
    config,
    expenseReminders,
    medReminders,
    groceryReminders,
    generalReminders,
    dismissed,
    snoozeUntil,
    currentAlarm,
    startRing,
    alertsEnabled,
  ]);

  useEffect(() => {
    if (!ready) return;
    checkReminders();
    const id = setInterval(checkReminders, 20000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') checkReminders();
    });
    return () => {
      clearInterval(id);
      sub.remove();
      clearRing();
    };
  }, [ready, checkReminders]);

  const enableAlerts = useCallback(async () => {
    try {
      const current = (await Notifications.getPermissionsAsync()) as {
        status?: string;
        granted?: boolean;
      };
      let ok = current.granted === true || current.status === 'granted';
      if (!ok) {
        const req = (await Notifications.requestPermissionsAsync()) as {
          status?: string;
          granted?: boolean;
        };
        ok = req.granted === true || req.status === 'granted';
      }
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('reminders', {
          name: 'Reminders',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 400, 200, 400],
          sound: 'default',
        });
      }
      setAlertsEnabled(ok);
    } catch {
      setAlertsEnabled(false);
    }
  }, []);

  const resolveAlarm = useCallback(
    async (action: ResolveAction) => {
      if (!currentAlarm) return;
      const alarm = currentAlarm;
      clearRing();

      if (action === 'snooze') {
        const next = { ...snoozeUntil, [alarm.key]: Date.now() + 10 * 60 * 1000 };
        setSnoozeUntil(next);
        await saveSnooze(next);
      } else if (action === 'done') {
        const nextDismissed = [...dismissed, alarm.key];
        setDismissed(nextDismissed);
        await saveDismissed(nextDismissed);

        if (alarm.type === 'medicine' && alarm.slot) {
          const day = todayStr();
          await setMedReminders(
            medReminders.map((m) => {
              if (m.id !== alarm.id) return m;
              const done = { ...(m.done || {}) };
              done[day] = { ...(done[day] || {}), [alarm.slot!]: true };
              return { ...m, done };
            }),
          );
        } else if (alarm.type === 'expense') {
          await setExpenseReminders(
            expenseReminders.map((r) => (r.id === alarm.id ? { ...r, paid: true } : r)),
          );
        } else if (alarm.type === 'general') {
          const day = todayStr();
          await setGeneralReminders(
            generalReminders.map((r) => {
              if (r.id !== alarm.id) return r;
              if (r.repeat === 'once') return { ...r, done: true };
              return { ...r, doneDate: day, done: true };
            }),
          );
        }
      } else if (action === 'remove' && alarm.type === 'grocery') {
        const nextDismissed = [...dismissed, alarm.key];
        setDismissed(nextDismissed);
        await saveDismissed(nextDismissed);
        await setGroceryReminders(groceryReminders.filter((g) => g.id !== alarm.id));
      }

      queueRef.current = queueRef.current.filter((q) => q.key !== alarm.key);
      setCurrentAlarm(null);
      setTimeout(() => {
        // allow state to settle then show next
      }, 400);
    },
    [
      currentAlarm,
      snoozeUntil,
      dismissed,
      medReminders,
      expenseReminders,
      generalReminders,
      groceryReminders,
      setMedReminders,
      setExpenseReminders,
      setGeneralReminders,
      setGroceryReminders,
    ],
  );

  // After dismissing current, re-check for next
  useEffect(() => {
    if (!currentAlarm) {
      const t = setTimeout(checkReminders, 500);
      return () => clearTimeout(t);
    }
  }, [currentAlarm, checkReminders]);

  const syncAlarmIfType = useCallback(
    (type: AlarmInstance['type'], id: string) => {
      if (currentAlarm && currentAlarm.type === type && currentAlarm.id === id) {
        clearRing();
        queueRef.current = queueRef.current.filter((q) => !(q.type === type && q.id === id));
        setCurrentAlarm(null);
      }
    },
    [currentAlarm],
  );

  const value = useMemo(
    () => ({
      currentAlarm,
      alertsEnabled,
      enableAlerts,
      resolveAlarm,
      syncAlarmIfType,
    }),
    [currentAlarm, alertsEnabled, enableAlerts, resolveAlarm, syncAlarmIfType],
  );

  return <AlarmContext.Provider value={value}>{children}</AlarmContext.Provider>;
}

export function useAlarms() {
  const ctx = useContext(AlarmContext);
  if (!ctx) throw new Error('useAlarms must be used within AlarmProvider');
  return ctx;
}
