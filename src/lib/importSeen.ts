import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@pulse/import_seen_v1';

export async function loadSeenImportFingerprints(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr.slice(-2000) : []);
  } catch {
    return new Set();
  }
}

export async function rememberImportFingerprints(fps: string[]): Promise<void> {
  if (!fps.length) return;
  try {
    const prev = await loadSeenImportFingerprints();
    for (const fp of fps) prev.add(fp);
    const next = Array.from(prev).slice(-2000);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

/** After Undo, the same SMS can be added again. */
export async function forgetImportFingerprints(fps: string[]): Promise<void> {
  if (!fps.length) return;
  try {
    const prev = await loadSeenImportFingerprints();
    for (const fp of fps) prev.delete(fp);
    await AsyncStorage.setItem(KEY, JSON.stringify(Array.from(prev).slice(-2000)));
  } catch {
    // ignore
  }
}
