import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * Local module: the phone's own ringtones, named and rung.
 *
 * Asked for optionally, so a build made before this module existed falls back to
 * a generic label and to expo-audio instead of throwing on import.
 */
type RingtoneInfoModule = {
  titleFor: (uri: string) => Promise<string | null>;
  play: (uri: string, loop: boolean) => Promise<boolean>;
  stop: () => Promise<void>;
};

const native = requireOptionalNativeModule<RingtoneInfoModule>('RingtoneInfo');

/**
 * The label Android's own picker would show for this tone, or null when it
 * cannot say. Android answers "Unknown" for a URI it cannot resolve, which is
 * no better than the caller's own fallback, so it is treated as no answer.
 */
export async function ringtoneTitle(uri: string): Promise<string | null> {
  if (!native) return null;
  try {
    const title = await native.titleFor(uri);
    const trimmed = title?.trim();
    if (!trimmed || trimmed.toLowerCase() === 'unknown') return null;
    return trimmed;
  } catch {
    return null;
  }
}

/**
 * Ring a tone from the phone, on the alarm stream. True only if it started, so
 * a caller can fall back without waiting to see whether anything happens.
 */
export async function playPhoneTone(uri: string, loop = true): Promise<boolean> {
  if (!native || typeof native.play !== 'function') return false;
  try {
    return await native.play(uri, loop);
  } catch {
    return false;
  }
}

/** Silence whatever this module is ringing. Safe to call when it is not. */
export async function stopPhoneTone(): Promise<void> {
  if (!native || typeof native.stop !== 'function') return;
  try {
    await native.stop();
  } catch {
    // Nothing useful to do: the tone either stopped or was never ours.
  }
}
