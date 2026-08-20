import { Platform } from 'react-native';

/**
 * The screen lock the phone already has, borrowed to cover the app.
 *
 * We deliberately never hold a secret of our own: `authenticateAsync` shows the
 * fingerprint / face sheet and, because `disableDeviceFallback` stays off, falls
 * back to the phone's own PIN, pattern or password by itself. So there is
 * nothing here to store, reset, or lock a user out of their own records with.
 */

type LocalAuthModule = {
  /** SecurityLevel: 0 none, 1 PIN/pattern, 2 weak biometric, 3 strong biometric. */
  getEnrolledLevelAsync: () => Promise<number>;
  authenticateAsync: (options?: {
    promptMessage?: string;
    cancelLabel?: string;
    fallbackLabel?: string;
    disableDeviceFallback?: boolean;
  }) => Promise<{ success: boolean; error?: string }>;
};

/** `null` once we know it is absent — asking twice only repeats the work. */
let cached: LocalAuthModule | null | undefined;

function resolveModule(): LocalAuthModule | null {
  if (Platform.OS === 'web') return null;
  try {
    // Ask the registry before importing the wrapper: the wrapper calls
    // requireNativeModule at import time, which throws and logs on every build
    // made before this dependency existed. This asks quietly instead.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const core = require('expo-modules-core') as {
      requireOptionalNativeModule?: <T>(name: string) => T | null;
    };
    if (!core.requireOptionalNativeModule?.('ExpoLocalAuthentication')) return null;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-local-authentication');
    const resolved = (mod?.default || mod) as LocalAuthModule | null;
    if (resolved && typeof resolved.authenticateAsync === 'function') return resolved;
  } catch {
    // not linked in this binary
  }
  return null;
}

function getModule(): LocalAuthModule | null {
  if (cached === undefined) cached = resolveModule();
  return cached;
}

export type LockAvailability =
  /** Something is enrolled, so the sheet will open. */
  | 'ready'
  /** The phone has no screen lock at all — there is nothing to ask for. */
  | 'noScreenLock'
  /** No native module: an older build, or web. */
  | 'unavailable';

export async function lockAvailability(): Promise<LockAvailability> {
  const mod = getModule();
  if (!mod) return 'unavailable';
  try {
    // Enrolment, not hardware: a phone with only a PIN and no fingerprint
    // reader can still lock the app, it just shows the PIN pad instead.
    const level = await mod.getEnrolledLevelAsync();
    return level > 0 ? 'ready' : 'noScreenLock';
  } catch {
    return 'unavailable';
  }
}

export type UnlockOutcome =
  | 'ok'
  /** Cancelled or not recognised — stay locked and let them try again. */
  | 'failed'
  /**
   * The lock went away underneath us (module missing, or the screen lock was
   * removed in phone settings). Opening the app has to win over the setting.
   */
  | 'unavailable';

/** Errors that mean the phone can no longer ask, rather than a refused attempt. */
const GONE = new Set(['not_available', 'not_enrolled', 'passcode_not_set']);

export async function askToUnlock(opts: {
  prompt: string;
  cancel: string;
  usePin: string;
}): Promise<UnlockOutcome> {
  const mod = getModule();
  if (!mod) return 'unavailable';
  try {
    const res = await mod.authenticateAsync({
      promptMessage: opts.prompt,
      cancelLabel: opts.cancel,
      fallbackLabel: opts.usePin,
    });
    if (res.success) return 'ok';
    return res.error && GONE.has(res.error) ? 'unavailable' : 'failed';
  } catch {
    return 'unavailable';
  }
}
