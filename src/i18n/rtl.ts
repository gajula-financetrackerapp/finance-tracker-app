import { Alert, I18nManager, Platform } from 'react-native';
import { isRtlLanguage } from './languages';
import { resolveLanguageCode } from './translations';

/**
 * Align React Native layout direction with the selected language.
 *
 * Do NOT call DevSettings.reload() here — in Expo Go, I18nManager.isRTL often
 * does not update after a soft reload, which causes an infinite
 * "Loading from…" loop (load → forceRTL → reload → load…).
 */
export function applyRtlForLanguage(
  preferred: string | null | undefined,
  opts?: { notifyRestart?: boolean },
) {
  const code = resolveLanguageCode(preferred);
  const rtl = isRtlLanguage(code);
  const current = I18nManager.isRTL;

  I18nManager.allowRTL(true);
  if (current === rtl) return;

  I18nManager.forceRTL(rtl);

  if (opts?.notifyRestart && Platform.OS !== 'web') {
    Alert.alert(
      rtl ? 'Restart for right-to-left layout' : 'Restart for left-to-right layout',
      'Close the app fully and open it again so the layout direction updates. (A soft reload is skipped to avoid a loading loop in Expo Go.)',
    );
  }
}
