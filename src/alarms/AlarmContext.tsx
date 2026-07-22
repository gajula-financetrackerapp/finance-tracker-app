import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Vibration } from 'react-native';
import { useApp } from '../context/AppContext';
import { todayStr } from '../utils';
import { AlarmInstance, buildDueAlarms } from './engine';
import { loadDismissed, loadSnooze, saveDismissed, saveSnooze } from './storage';

type ResolveAction = 'done' | 'snooze' | 'remove';

type AlarmContextValue = {
  currentAlarm: AlarmInstance | null;
  alertsEnabled: boolean;
  enableAlerts: () => Promise<void>;
  resolveAlarm: (action: ResolveAction) => Promise<void>;
  syncAlarmIfType: (type: AlarmInstance['type'], id: string) => void;
};

const AlarmContext = createContext<AlarmContextValue | null>(null);

/**
 * In-app reminder alarms (HTML-style banner + vibration).
 * Intentionally does NOT use expo-notifications — remote/push APIs were
 * removed from Expo Go (SDK 53+) and crash the runtime on import.
 */
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
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const queueRef = useRef<AlarmInstance[]>([]);
  const ringTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (!alertsEnabled) return;
    Vibration.vibrate([0, 600, 400, 600], true);
    if (alarm.ringDurationSec > 0) {
      ringTimer.current = setTimeout(() => {
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
  }, [alertsEnabled]);

  const checkReminders = useCallback(() => {
    if (!ready || !config.alarmsEnabled || !alertsEnabled) return;
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
    setAlertsEnabled(true);
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
