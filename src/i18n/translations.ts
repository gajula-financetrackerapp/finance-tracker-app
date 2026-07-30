import en from './locales/en.json';
import { LOCALE_LOADERS } from './localeAssets';
import type { AppLanguageCode } from './languages';

export type TranslationKey = keyof typeof en;

type Dict = Record<string, string>;

/** English only until another locale is loaded via ensureLocale(). */
const cache: Record<string, Dict> = {
  en: en as Dict,
};

const KNOWN = new Set<string>(['en', ...Object.keys(LOCALE_LOADERS)]);

export async function ensureLocale(code: string | null | undefined): Promise<string> {
  const resolved = resolveLanguageCode(code);
  if (cache[resolved]) return resolved;
  const loader = LOCALE_LOADERS[resolved];
  if (!loader) return 'en';
  try {
    const dict = loader();
    if (!dict || typeof dict !== 'object') {
      console.warn('[i18n] locale pack empty', resolved);
      return 'en';
    }
    cache[resolved] = dict;
    return resolved;
  } catch (e) {
    console.warn('[i18n] failed to load locale', resolved, e);
    return 'en';
  }
}

export function resolveLanguageCode(preferred: string | null | undefined): string {
  if (preferred && preferred !== 'system') {
    return KNOWN.has(preferred) ? preferred : 'en';
  }
  try {
    const loc = Intl.DateTimeFormat().resolvedOptions().locale || 'en';
    const base = loc.split(/[-_]/)[0]?.toLowerCase() || 'en';
    if (base === 'zh') return KNOWN.has('zh') ? 'zh' : 'en';
    if (base === 'no') return KNOWN.has('nb') ? 'nb' : 'en';
    return KNOWN.has(base) ? base : 'en';
  } catch {
    return 'en';
  }
}

export function translate(
  preferredLanguage: string | null | undefined,
  key: TranslationKey,
): string {
  const code = resolveLanguageCode(preferredLanguage);
  return cache[code]?.[key] || cache.en[key] || key;
}

export function isLocaleCached(code: string | null | undefined): boolean {
  return !!cache[resolveLanguageCode(code)];
}

export type { AppLanguageCode };
