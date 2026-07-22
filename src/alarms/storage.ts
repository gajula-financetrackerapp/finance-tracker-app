import AsyncStorage from '@react-native-async-storage/async-storage';

const DISMISSED_KEY = 'aio_dismissed_alarms_v1';
const SNOOZE_KEY = 'aio_snooze_alarms_v1';

export async function loadDismissed(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(DISMISSED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export async function saveDismissed(keys: string[]) {
  await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(keys));
}

export async function loadSnooze(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(SNOOZE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export async function saveSnooze(map: Record<string, number>) {
  await AsyncStorage.setItem(SNOOZE_KEY, JSON.stringify(map));
}
