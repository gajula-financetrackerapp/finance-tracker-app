/**
 * Notification service — expo-notifications wrappers.
 *
 * Scheduling strategy
 * ───────────────────
 * Each reminder stores an array of notificationIds in its `notifIds` field.
 * When a reminder is edited or deleted, call cancelAllForReminder(notifIds)
 * to remove stale triggers before re-scheduling.
 *
 * Default vs Custom mode
 * ──────────────────────
 * Reminders have a `mode` field: 'default' | 'custom'.
 * - default  → uses times/days from the admin config (passed as `adminConfig`)
 * - custom   → uses times stored on the reminder itself
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import moment from 'moment';

// ─── Handler (call once in App.js) ───────────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// ─── Permissions ─────────────────────────────────────────────────────────────

/**
 * Request notification permissions.
 * Returns { granted: boolean, error: string | null }.
 */
export async function requestPermissions() {
  if (!Device.isDevice) {
    return {
      granted: false,
      error: 'Push notifications require a physical device.',
    };
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return { granted: false, error: 'Notification permission denied.' };
  }

  // Android channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('finance-tracker', {
      name: 'Finance Tracker',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FFCD3C',
    });
  }

  return { granted: true, error: null };
}

// ─── Low-level schedule / cancel ─────────────────────────────────────────────

/**
 * Schedule a single notification at a specific Date.
 * Returns the notification identifier string, or null on failure.
 *
 * ringDurationSeconds — how long the notification stays visible (Android only via channel).
 * For iOS there is no direct ring-duration API; we honour the system setting.
 */
export async function scheduleNotification({ title, body, triggerDate, data = {} }) {
  try {
    const now = new Date();
    if (triggerDate <= now) return null; // past — skip

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: {
        date: triggerDate,
        channelId: 'finance-tracker',
      },
    });
    return id;
  } catch (err) {
    console.warn('[notifications] scheduleNotification error:', err);
    return null;
  }
}

/**
 * Cancel a single scheduled notification by its id.
 */
export async function cancelNotification(notifId) {
  if (!notifId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notifId);
  } catch (err) {
    console.warn('[notifications] cancelNotification error:', err);
  }
}

/**
 * Cancel all notifications associated with a reminder.
 * Pass the notifIds array stored on the reminder.
 */
export async function cancelAllForReminder(notifIds = []) {
  await Promise.all(notifIds.map(cancelNotification));
}

// ─── Medicine Reminders ───────────────────────────────────────────────────────

/**
 * Schedule medicine reminders for one medicine entry.
 *
 * medicine shape:
 *   { id, name, startDate, endDate?, mode: 'default'|'custom',
 *     // custom-only fields:
 *     customTimes: ['08:00', '13:00', '19:00'],  // HH:mm strings
 *   }
 *
 * adminConfig shape:
 *   { medicineTimes: { morning: '08:00', afternoon: '13:00', evening: '19:00' },
 *     alarmsEnabled: true }
 *
 * Returns array of scheduled notification ids.
 */
export async function scheduleMedicineReminders(medicine, adminConfig) {
  if (!adminConfig?.alarmsEnabled) return [];

  const times =
    medicine.mode === 'custom' && medicine.customTimes?.length
      ? medicine.customTimes
      : [
          adminConfig.medicineTimes?.morning ?? '08:00',
          adminConfig.medicineTimes?.afternoon ?? '13:00',
          adminConfig.medicineTimes?.evening ?? '19:00',
        ];

  const start = moment(medicine.startDate).startOf('day');
  const end = medicine.endDate
    ? moment(medicine.endDate).endOf('day')
    : moment().add(30, 'days').endOf('day'); // default: 30 days

  const ids = [];
  const cursor = start.clone();

  while (cursor.isSameOrBefore(end)) {
    for (const timeStr of times) {
      const [h, m] = timeStr.split(':').map(Number);
      const triggerDate = cursor.clone().hour(h).minute(m).second(0).toDate();

      if (triggerDate > new Date()) {
        const id = await scheduleNotification({
          title: `Medicine Reminder 💊`,
          body: `Time to take ${medicine.name}`,
          triggerDate,
          data: { type: 'medicine', medicineId: medicine.id },
        });
        if (id) ids.push(id);
      }
    }
    cursor.add(1, 'day');
  }

  return ids;
}

// ─── Expense / Bill Reminders ─────────────────────────────────────────────────

/**
 * Schedule expense/bill reminders for one entry.
 *
 * expense shape:
 *   { id, title, amount, dueDate, mode: 'default'|'custom',
 *     // custom-only:
 *     customDaysBefore: [1, 0],   // 0 = same day
 *     customTime: '09:00',
 *   }
 *
 * adminConfig shape:
 *   { alertTime: '09:00', alarmsEnabled: true }
 *
 * Default behaviour: alert 1 day before AND same day at adminConfig.alertTime.
 * Returns array of scheduled notification ids.
 */
export async function scheduleExpenseReminder(expense, adminConfig) {
  if (!adminConfig?.alarmsEnabled) return [];

  const dueDate = moment(expense.dueDate).startOf('day');
  const alertTime = adminConfig.alertTime ?? '09:00';
  const [defaultH, defaultM] = alertTime.split(':').map(Number);

  let daysBefore;
  let h, m;

  if (expense.mode === 'custom') {
    daysBefore = expense.customDaysBefore ?? [1, 0];
    const t = expense.customTime ?? alertTime;
    [h, m] = t.split(':').map(Number);
  } else {
    daysBefore = [1, 0]; // 1 day before + same day
    h = defaultH;
    m = defaultM;
  }

  const ids = [];

  for (const days of daysBefore) {
    const triggerDate = dueDate.clone().subtract(days, 'days').hour(h).minute(m).second(0).toDate();

    if (triggerDate > new Date()) {
      const label =
        days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`;
      const id = await scheduleNotification({
        title: `Bill Due ${label} 💳`,
        body: `${expense.title} — ${expense.amount ?? ''}`,
        triggerDate,
        data: { type: 'expense', expenseId: expense.id },
      });
      if (id) ids.push(id);
    }
  }

  return ids;
}

// ─── Grocery Reminders ────────────────────────────────────────────────────────

/**
 * Schedule grocery expiry reminders for one grocery item.
 *
 * grocery shape:
 *   { id, name, expiryDate, mode: 'default'|'custom',
 *     // custom-only:
 *     customDaysBefore: [2, 1, 0],
 *     customTime: '08:00',
 *   }
 *
 * adminConfig shape:
 *   { alertTime: '09:00', alarmsEnabled: true }
 *
 * Default: alert 2 days before, 1 day before, and same day at alertTime.
 * Returns array of scheduled notification ids.
 */
export async function scheduleGroceryReminder(grocery, adminConfig) {
  if (!adminConfig?.alarmsEnabled) return [];

  const expiryDate = moment(grocery.expiryDate).startOf('day');
  const alertTime = adminConfig.alertTime ?? '09:00';
  const [defaultH, defaultM] = alertTime.split(':').map(Number);

  let daysBefore;
  let h, m;

  if (grocery.mode === 'custom') {
    daysBefore = grocery.customDaysBefore ?? [2, 1, 0];
    const t = grocery.customTime ?? alertTime;
    [h, m] = t.split(':').map(Number);
  } else {
    daysBefore = [2, 1, 0];
    h = defaultH;
    m = defaultM;
  }

  const ids = [];

  for (const days of daysBefore) {
    const triggerDate = expiryDate
      .clone()
      .subtract(days, 'days')
      .hour(h)
      .minute(m)
      .second(0)
      .toDate();

    if (triggerDate > new Date()) {
      const label =
        days === 0
          ? 'expires today'
          : days === 1
          ? 'expires tomorrow'
          : `expires in ${days} days`;
      const id = await scheduleNotification({
        title: `Grocery Expiry Alert 🛒`,
        body: `${grocery.name} ${label}`,
        triggerDate,
        data: { type: 'grocery', groceryId: grocery.id },
      });
      if (id) ids.push(id);
    }
  }

  return ids;
}

// ─── List all pending ─────────────────────────────────────────────────────────

/**
 * Returns all currently scheduled (pending) notification objects.
 */
export async function getAllPendingNotifications() {
  return Notifications.getAllScheduledNotificationsAsync();
}

/**
 * Cancel every scheduled notification (nuclear option — use with care).
 */
export async function cancelAllNotifications() {
  return Notifications.cancelAllScheduledNotificationsAsync();
}
