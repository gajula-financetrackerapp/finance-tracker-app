import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Which feed rows have been looked at.
 *
 * The feed itself is worked out from live state, so the only thing worth keeping
 * is this. Ids are pruned against what the feed currently holds, or the list
 * would grow for the life of the install remembering bills that no longer exist.
 */

const KEY = '@pulse/notifications_seen_v1';
const CAP = 400;

export async function loadSeenNotifications(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Remember these ids, keeping only those still worth remembering. */
export async function rememberSeenNotifications(
  ids: string[],
  stillLive: Set<string>,
): Promise<Set<string>> {
  const seen = await loadSeenNotifications();
  for (const id of ids) seen.add(id);
  const kept = [...seen].filter((id) => stillLive.has(id)).slice(-CAP);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    /* a lost marker only means a row shows as unread again */
  }
  return new Set(kept);
}
