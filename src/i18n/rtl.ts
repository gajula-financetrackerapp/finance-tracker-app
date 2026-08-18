import { Alert, I18nManager, Platform } from 'react-native';
import { isRtlLanguage } from './languages';
import { resolveLanguageCode, setActiveLanguage, tr } from './translations';

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
    // Shown the instant someone picks Arabic or Urdu, so it has to be in the
    // language they just chose rather than the one they are leaving.
    setActiveLanguage(preferred);
    Alert.alert(
      rtl ? tr('language.restartRtl') : tr('language.restartLtr'),
      tr('language.restartBody'),
    );
  }
}
