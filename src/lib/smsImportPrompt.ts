import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@pulse/sms_import_prompt_v1';

type PromptState = Record<string, boolean>;

async function load(): Promise<PromptState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PromptState;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** True if we've already asked this signed-in user about SMS import. */
export async function hasAskedSmsImportPrompt(userId: string): Promise<boolean> {
  if (!userId) return true;
  const state = await load();
  return !!state[userId];
}

/** Mark the one-time SMS import prompt as shown (Yes or Not now). */
export async function markSmsImportPromptAsked(userId: string): Promise<void> {
  if (!userId) return;
  try {
    const state = await load();
    state[userId] = true;
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}
