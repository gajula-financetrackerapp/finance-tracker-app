import { Platform } from 'react-native';
import { ringtoneTitle } from '../../modules/ringtone-info';

/**
 * Borrowing the phone's own alarm tones.
 *
 * Android keeps its ringtones behind a system picker rather than a list an app
 * may read, so this hands the choosing to that picker and keeps only what comes
 * back: a content:// URI, which expo-audio can play like any other source. No
 * native code of our own, and nothing to bundle.
 *
 * Two things it cannot do, both Android's rules rather than ours:
 *
 *  - A notification arriving while the app is closed takes its sound from its
 *    channel, and a channel will only accept a sound compiled into the build.
 *    Those keep the phone's default notification tone.
 *  - A tone the user added themselves may sit in external storage, which needs
 *    a media permission this app does not ask for. Playback simply fails and the
 *    caller falls back, which is why nothing here is trusted to work.
 *
 * iOS has no equivalent at all: system sounds are not offered to apps.
 */

const PICKER_ACTION = 'android.intent.action.RINGTONE_PICKER';

const EXTRA_TYPE = 'android.intent.extra.ringtone.TYPE';
const EXTRA_TITLE = 'android.intent.extra.ringtone.TITLE';
const EXTRA_EXISTING = 'android.intent.extra.ringtone.EXISTING_URI';
const EXTRA_SHOW_DEFAULT = 'android.intent.extra.ringtone.SHOW_DEFAULT';
const EXTRA_SHOW_SILENT = 'android.intent.extra.ringtone.SHOW_SILENT';
const EXTRA_PICKED = 'android.intent.extra.ringtone.PICKED_URI';

/** RingtoneManager.TYPE_ALARM. */
const TYPE_ALARM = 4;

export type TonePickOutcome =
  /**
   * A tone came back and is ready to be saved. `name` is what to call it on
   * screen, and is null for the many tones Android names only inside its own
   * picker.
   */
  | { state: 'picked'; uri: string; name: string | null }
  /** The user chose the app's own tone, or backed out of the picker. */
  | { state: 'default' }
  | { state: 'cancelled' }
  /** No picker on this phone, or a build without the module compiled in. */
  | { state: 'unavailable' };

type IntentLauncher = {
  startActivityAsync: (
    action: string,
    params?: Record<string, unknown>,
  ) => Promise<{ resultCode: number; data?: string; extra?: Record<string, unknown> }>;
};

/**
 * Asked for quietly, the way appLock.ts asks for the lock screen: the module is
 * native, so any build made before it was added would throw on import.
 */
function resolveLauncher(): IntentLauncher | null {
  if (Platform.OS !== 'android') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const core = require('expo-modules-core') as {
      requireOptionalNativeModule?: <T>(name: string) => T | null;
    };
    if (!core.requireOptionalNativeModule?.('ExpoIntentLauncher')) return null;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-intent-launcher') as IntentLauncher;
    return typeof mod?.startActivityAsync === 'function' ? mod : null;
  } catch {
    return null;
  }
}

let cached: IntentLauncher | null | undefined;

function getLauncher(): IntentLauncher | null {
  if (cached === undefined) cached = resolveLauncher();
  return cached;
}

/** Whether this phone and this build can offer the phone's own tones. */
export function systemTonesSupported(): boolean {
  return !!getLauncher();
}

/**
 * The URI arrives inside the picker's result as an Android Uri rather than a
 * string, and what survives the crossing to JavaScript is not guaranteed to be
 * either. So take a string if there is one, and otherwise anything that reads
 * like one.
 */
function readPickedUri(extra: Record<string, unknown> | undefined): string | null {
  const raw = extra?.[EXTRA_PICKED];
  if (typeof raw === 'string') return raw.trim() || null;
  if (raw && typeof raw === 'object') {
    const candidate = raw as Record<string, unknown>;
    for (const key of ['uri', 'url', 'path', '_uri']) {
      const value = candidate[key];
      if (typeof value === 'string' && value.includes('://')) return value;
    }
    const asText = String(raw);
    if (asText.includes('://')) return asText;
  }
  return null;
}

/**
 * What to call a tone when its name cannot be read.
 *
 * The local ringtone-info module answers for nearly everything, but a build
 * made before it existed answers for nothing, and these two URIs are the
 * settings provider's own aliases and so can be named from here alone.
 */
function knownToneName(uri: string, labels: ToneLabels): string | null {
  if (uri.startsWith('content://settings/system/alarm_alert')) return labels.defaultAlarm;
  if (uri.startsWith('content://settings/system/notification_sound')) return labels.defaultNotification;
  return null;
}

export type ToneLabels = {
  /** Translated name for the phone's default alarm sound. */
  defaultAlarm: string;
  /** Translated name for the phone's default notification sound. */
  defaultNotification: string;
};

/**
 * Open the phone's alarm-tone picker.
 *
 * `title` is the heading the picker shows and `labels` name the tones that can
 * be named, so both arrive translated from the caller rather than being written
 * in English here.
 */
export async function pickSystemAlarmTone(input: {
  title: string;
  labels: ToneLabels;
  currentUri?: string | null;
}): Promise<TonePickOutcome> {
  const launcher = getLauncher();
  if (!launcher) return { state: 'unavailable' };

  try {
    const result = await launcher.startActivityAsync(PICKER_ACTION, {
      extra: {
        [EXTRA_TYPE]: TYPE_ALARM,
        [EXTRA_TITLE]: input.title,
        [EXTRA_SHOW_DEFAULT]: true,
        // Silence is what the sound switch is for; a tone that plays nothing
        // would look like the alarm having failed.
        [EXTRA_SHOW_SILENT]: false,
        ...(input.currentUri ? { [EXTRA_EXISTING]: input.currentUri } : {}),
      },
    });

    // ResultCode.Success is 1; anything else is a back press or a refusal.
    if (result.resultCode !== 1) return { state: 'cancelled' };

    const uri = readPickedUri(result.extra) || (result.data ? result.data : null);
    if (!uri) return { state: 'default' };
    const name = (await ringtoneTitle(uri)) ?? knownToneName(uri, input.labels);
    return { state: 'picked', uri, name };
  } catch {
    return { state: 'unavailable' };
  }
}
