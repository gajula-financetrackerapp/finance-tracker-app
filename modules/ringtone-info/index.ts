import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * Local module: the name of a system ringtone, given its URI.
 *
 * Asked for optionally, so a build made before this module existed carries on
 * with a generic label instead of throwing.
 */
type RingtoneInfoModule = {
  titleFor: (uri: string) => Promise<string | null>;
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
