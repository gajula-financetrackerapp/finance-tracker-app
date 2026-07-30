import en from './locales/en.json';
import { LOCALE_LOADERS } from './localeAssets';
import type { AppLanguageCode } from './languages';

export type TranslationKey = keyof typeof en;

type Dict = Record<string, string>;

/** English only until another locale is loaded. */
const cache: Record<string, Dict> = {
  en: en as Dict,
};

const KNOWN = new Set<string>(['en', ...Object.keys(LOCALE_LOADERS)]);

function loadLocaleSync(code: string): Dict | null {
  if (cache[code]) return cache[code];
  const loader = LOCALE_LOADERS[code];
  if (!loader) return null;
  try {
    const dict = loader();
    if (!dict || typeof dict !== 'object') return null;
    cache[code] = dict;
    return dict;
  } catch (e) {
    console.warn('[i18n] failed to load locale', code, e);
    return null;
  }
}

export async function ensureLocale(code: string | null | undefined): Promise<string> {
  const resolved = resolveLanguageCode(code);
  if (resolved === 'en') return 'en';
  return loadLocaleSync(resolved) ? resolved : 'en';
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

/**
 * Resolve UI copy for the active language.
 * Loads locale packs on demand (sync require) so language changes apply immediately.
 */
export function translate(
  preferredLanguage: string | null | undefined,
  key: TranslationKey,
): string {
  const code = resolveLanguageCode(preferredLanguage);
  if (code !== 'en') loadLocaleSync(code);
  return cache[code]?.[key] || cache.en[key] || key;
}

export function isLocaleCached(code: string | null | undefined): boolean {
  const resolved = resolveLanguageCode(code);
  if (resolved === 'en') return true;
  return !!loadLocaleSync(resolved);
}

export type { AppLanguageCode };
