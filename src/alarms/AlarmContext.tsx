import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Vibration } from 'react-native';
import { useApp } from '../context/AppContext';
import { todayStr } from '../utils';
import { applyExpenseReminderPaid } from '../utils/markExpensePaid';
import { isRepeatingExpense } from '../utils/recurringExpense';
import { AlarmInstance, buildDueAlarms } from './engine';
import { buildScheduledAlarms } from './schedule';
import { setAlarmToneUri, startAlarmSound, stopAlarmSound } from './ringSound';
import { loadDismissed, loadSnooze, saveDismissed, saveSnooze } from './storage';
import { syncReminderNotifications } from '../lib/reminderNotifications';

type ResolveAction = 'done' | 'snooze' | 'remove';

type ResolveOptions = {
  /** For expense Mark Paid: create Finance expense (true) or skip (false). */
  addToFinance?: boolean;
};

type AlarmContextValue = {
  currentAlarm: AlarmInstance | null;
  resolveAlarm: (action: ResolveAction, opts?: ResolveOptions) => Promise<void>;
  syncAlarmIfType: (type: AlarmInstance['type'], id: string) => void;
};

const AlarmContext = createContext<AlarmContextValue | null>(null);

/**
 * Reminder alarms, in two halves that answer the same reminders.
 *
 * While the app is open this is the alarm: a banner with Done and Snooze, a
 * looping tone through expo-audio, and a buzz. While it is closed the phone
 * takes over, from the queue booked in lib/reminderNotifications.ts — the only
 * way a reminder can reach someone who is not looking at the app.
 *
 * config.alarmsEnabled is the master switch. config.alarmSound and
 * config.alarmVibration decide whether an alarm is heard and felt, in both
 * halves, so turning the tone off silences the phone's notification too.
 */
export function AlarmProvider({ children }: { children: React.ReactNode }) {
  const {
    ready,
    config,
    finance,
    expenseReminders,
    medReminders,
    groceryReminders,
    generalReminders,
    setExpenseReminders,
    setMedReminders,
    setGroceryReminders,
    setGeneralReminders,
    addTransaction,
  } = useApp();

  const [dismissed, setDismissed] = useState<string[]>([]);
  const [snoozeUntil, setSnoozeUntil] = useState<Record<string, number>>({});
  const [currentAlarm, setCurrentAlarm] = useState<AlarmInstance | null>(null);
  const queueRef = useRef<AlarmInstance[]>([]);
  const ringTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      setDismissed(await loadDismissed());
      setSnoozeUntil(await loadSnooze());
    })();
  }, []);

  // The ring is raised from a timer, so the chosen tone is handed over whenever
  // it changes rather than looked up at the moment of ringing.
  useEffect(() => {
    setAlarmToneUri(config.alarmToneUri);
  }, [config.alarmToneUri]);

  const clearRing = () => {
    if (ringTimer.current) {
      clearTimeout(ringTimer.current);
      ringTimer.current = null;
    }
    Vibration.cancel();
    stopAlarmSound();
  };

  const startRing = useCallback((alarm: AlarmInstance) => {
    clearRing();
    // The banner shows either way; these two are the user's to refuse.
    if (config.alarmVibration) Vibration.vibrate([0, 600, 400, 600], true);
    if (config.alarmSound) void startAlarmSound();
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
        stopAlarmSound();
      }, alarm.ringDurationSec * 1000);
    }
  }, [config.alarmSound, config.alarmVibration]);

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
  ]);

  const checkRef = useRef(checkReminders);
  useEffect(() => {
    checkRef.current = checkReminders;
  }, [checkReminders]);

  /**
   * The poll is set up once and reads the current check through a ref.
   *
   * Depending on checkReminders itself tore the alarm down as it started: the
   * check watches currentAlarm, so setting one changed its identity, and the
   * cleanup — which stops the ring — ran a beat after startRing. That left a
   * buzz about as long as it takes React to re-render, and no sound at all.
   */
  useEffect(() => {
    if (!ready) return;
    const run = () => checkRef.current();
    run();
    const id = setInterval(run, 20000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') run();
    });
    return () => {
      clearInterval(id);
      sub.remove();
      clearRing();
    };
  }, [ready]);

  /**
   * Look again as soon as the reminders change, rather than making a reminder
   * saved for right now wait out the poll. No cleanup here on purpose: this runs
   * often, and anything it tore down would be the ring it had just started.
   */
  useEffect(() => {
    if (!ready || currentAlarm) return;
    checkRef.current();
  }, [
    ready,
    currentAlarm,
    config,
    expenseReminders,
    medReminders,
    groceryReminders,
    generalReminders,
    dismissed,
    snoozeUntil,
  ]);

  /** Stop any active ring immediately when the master switch is turned off. */
  useEffect(() => {
    if (config.alarmsEnabled) return;
    clearRing();
    queueRef.current = [];
    setCurrentAlarm((prev) => (prev ? null : prev));
  }, [config.alarmsEnabled]);

  /**
   * Hand the coming fortnight of reminders to the phone.
   *
   * On a delay because saving a single reminder moves this state several times
   * over, and every rebuild replaces the whole booked queue. The sync itself
   * does nothing when the plan has not actually changed.
   */
  const syncNotifications = useCallback(() => {
    if (!ready) return;
    const planned = config.alarmsEnabled
      ? buildScheduledAlarms({
          config,
          expenseReminders,
          medReminders,
          groceryReminders,
          generalReminders,
          dismissedKeys: dismissed,
          snoozeUntil,
        })
      : [];
    void syncReminderNotifications(planned, {
      sound: config.alarmSound,
      vibration: config.alarmVibration,
    });
  }, [
    ready,
    config,
    expenseReminders,
    medReminders,
    groceryReminders,
    generalReminders,
    dismissed,
    snoozeUntil,
  ]);

  const syncRef = useRef(syncNotifications);
  useEffect(() => {
    syncRef.current = syncNotifications;
  }, [syncNotifications]);

  useEffect(() => {
    const t = setTimeout(() => syncRef.current(), 1500);
    return () => clearTimeout(t);
  }, [syncNotifications]);

  /**
   * Book again on every return to the app. Nothing may have changed in the
   * reminders, but days have gone by, and the far end of the queue needs
   * topping up for the fortnight ahead.
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') syncRef.current();
    });
    return () => sub.remove();
  }, []);

  const resolveAlarm = useCallback(
    async (action: ResolveAction, opts?: ResolveOptions) => {
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
          const reminder = expenseReminders.find((r) => r.id === alarm.id);
          if (reminder && (!reminder.paid || isRepeatingExpense(reminder))) {
            await applyExpenseReminderPaid(reminder, opts?.addToFinance === true, {
              expenseReminders,
              setExpenseReminders,
              finance,
              addTransaction,
            });
          }
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
      addTransaction,
      finance,
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
      resolveAlarm,
      syncAlarmIfType,
    }),
    [currentAlarm, resolveAlarm, syncAlarmIfType],
  );

  return <AlarmContext.Provider value={value}>{children}</AlarmContext.Provider>;
}

export function useAlarms() {
  const ctx = useContext(AlarmContext);
  if (!ctx) throw new Error('useAlarms must be used within AlarmProvider');
  return ctx;
}
