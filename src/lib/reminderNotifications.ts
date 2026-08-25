import { Platform } from 'react-native';
import type { PlannedAlarm } from '../alarms/schedule';
import { schedulePrint } from '../alarms/schedule';

/**
 * Reminders handed to Android, so they still arrive when MoneyLit is closed.
 *
 * The in-app alarm can only ring while the app is running, which is no use for
 * a tablet due at nine in the morning. So the plan from alarms/schedule.ts is
 * booked with the system ahead of time and the phone does the waking.
 *
 * Two details shape everything here:
 *
 *  - Sound and vibration belong to the *channel* on Android 8 and above, and a
 *    channel cannot be changed once the user's phone has it. So there is one
 *    channel per combination of the two switches, and we post to whichever
 *    matches the current settings. Changing a switch moves future reminders to
 *    a different channel rather than trying to edit one.
 *  - The module is asked for quietly, the way appLock.ts asks for the lock
 *    screen. expo-notifications reaches for its native module as it is
 *    imported, which throws on any build made before this dependency existed.
 */

type PermissionStatus = 'granted' | 'denied' | 'undetermined';

type NotificationsModule = {
  setNotificationHandler: (handler: unknown) => void;
  getPermissionsAsync: () => Promise<{ status: PermissionStatus; granted: boolean }>;
  requestPermissionsAsync: () => Promise<{ status: PermissionStatus; granted: boolean }>;
  setNotificationChannelAsync: (id: string, channel: Record<string, unknown>) => Promise<unknown>;
  cancelAllScheduledNotificationsAsync: () => Promise<void>;
  scheduleNotificationAsync: (request: Record<string, unknown>) => Promise<string>;
  AndroidImportance: { MAX: number; HIGH: number };
  SchedulableTriggerInputTypes: { DATE: string };
};

let cached: NotificationsModule | null | undefined;

function resolveModule(): NotificationsModule | null {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const core = require('expo-modules-core') as {
      requireOptionalNativeModule?: <T>(name: string) => T | null;
    };
    if (!core.requireOptionalNativeModule?.('ExpoNotificationScheduler')) return null;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-notifications') as NotificationsModule;
    if (typeof mod?.scheduleNotificationAsync !== 'function') return null;

    /**
     * While the app is open the in-app alarm banner is the better one — it can
     * take Done or Snooze — so the system one stays out of the way and silent.
     * It still goes to the tray, so nothing is lost if the app is put away
     * before the alarm is dealt with. This handler only ever runs for a
     * notification arriving in the foreground.
     */
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: false,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    return mod;
  } catch {
    return null;
  }
}

function getModule(): NotificationsModule | null {
  if (cached === undefined) cached = resolveModule();
  return cached;
}

export type ReminderChannelPrefs = {
  sound: boolean;
  vibration: boolean;
};

/** Buzz long enough to notice, in the shape the in-app alarm uses. */
const VIBRATION_PATTERN = [0, 600, 400, 600];

function reminderChannelId({ sound, vibration }: ReminderChannelPrefs) {
  return `reminders-${sound ? 'sound' : 'silent'}-${vibration ? 'buzz' : 'still'}`;
}

async function ensureChannel(mod: NotificationsModule, prefs: ReminderChannelPrefs) {
  const id = reminderChannelId(prefs);
  if (Platform.OS !== 'android') return id;
  await mod.setNotificationChannelAsync(id, {
    name: 'Reminders',
    description: 'Bills, medicines, groceries and your own reminders',
    importance: mod.AndroidImportance.MAX,
    sound: prefs.sound ? 'default' : null,
    enableVibrate: prefs.vibration,
    vibrationPattern: prefs.vibration ? VIBRATION_PATTERN : null,
  });
  return id;
}

export type ReminderPermission = 'granted' | 'denied' | 'unavailable';

/**
 * Ask the phone's permission, but only the once: after a refusal Android will
 * not show the prompt again, and pestering on every launch would achieve
 * nothing anyway.
 */
export async function ensureReminderPermission(ask = true): Promise<ReminderPermission> {
  const mod = getModule();
  if (!mod) return 'unavailable';
  try {
    const current = await mod.getPermissionsAsync();
    if (current.granted) return 'granted';
    if (!ask || current.status === 'denied') return 'denied';
    const asked = await mod.requestPermissionsAsync();
    return asked.granted ? 'granted' : 'denied';
  } catch {
    return 'unavailable';
  }
}

export async function reminderPermissionStatus(): Promise<ReminderPermission> {
  return ensureReminderPermission(false);
}

export type SyncOutcome =
  /** Booked, with the number that went to the system. */
  | { state: 'scheduled'; count: number }
  /** Nothing had changed since last time. */
  | { state: 'unchanged' }
  /** The user has turned notifications off for MoneyLit. */
  | { state: 'denied' }
  /** An older build with no notification module compiled in. */
  | { state: 'unavailable' };

let lastPrint = '';
/** One rebuild at a time: cancel-then-schedule must not interleave with itself. */
let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  queue = run.catch(() => undefined);
  return run;
}

/**
 * Replace everything the system is holding with the given plan.
 *
 * Wholesale replacement rather than a diff: the plan is small, and a reminder
 * marked done has to stop arriving, which is the case a diff gets wrong.
 */
export async function syncReminderNotifications(
  planned: PlannedAlarm[],
  prefs: ReminderChannelPrefs,
): Promise<SyncOutcome> {
  const mod = getModule();
  if (!mod) return { state: 'unavailable' };

  const channelId = reminderChannelId(prefs);
  const print = schedulePrint(planned, channelId);
  if (print === lastPrint) return { state: 'unchanged' };

  return serialize(async () => {
    if (print === lastPrint) return { state: 'unchanged' } as SyncOutcome;

    // Clearing is worth doing even without permission: the reminders may have
    // been booked while it was still granted.
    await mod.cancelAllScheduledNotificationsAsync().catch(() => undefined);

    if (!planned.length) {
      lastPrint = print;
      return { state: 'scheduled', count: 0 } as SyncOutcome;
    }

    const permission = await ensureReminderPermission(true);
    if (permission !== 'granted') {
      lastPrint = '';
      return { state: permission === 'denied' ? 'denied' : 'unavailable' } as SyncOutcome;
    }

    await ensureChannel(mod, prefs);

    let count = 0;
    for (const alarm of planned) {
      try {
        await mod.scheduleNotificationAsync({
          identifier: alarm.key,
          content: {
            title: alarm.title,
            body: alarm.body,
            sound: prefs.sound,
            vibrate: prefs.vibration ? VIBRATION_PATTERN : undefined,
            data: { kind: 'reminder', type: alarm.type, id: alarm.id, key: alarm.key },
          },
          trigger: {
            type: mod.SchedulableTriggerInputTypes.DATE,
            date: alarm.at,
            channelId,
          },
        });
        count += 1;
      } catch {
        // One reminder the system would not take is no reason to drop the rest.
      }
    }
    lastPrint = print;
    return { state: 'scheduled', count } as SyncOutcome;
  });
}

/** True when this build can post notifications at all. */
export function reminderNotificationsSupported() {
  return !!getModule();
}
