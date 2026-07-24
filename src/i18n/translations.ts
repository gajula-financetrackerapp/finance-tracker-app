import en from './locales/en.json';
import hi from './locales/hi.json';
import ta from './locales/ta.json';
import te from './locales/te.json';
import kn from './locales/kn.json';
import ml from './locales/ml.json';
import mr from './locales/mr.json';
import bn from './locales/bn.json';
import gu from './locales/gu.json';
import type { AppLanguageCode } from './languages';

export type TranslationKey = keyof typeof en;

type Dict = Record<string, string>;

const CATALOG: Record<string, Dict> = {
  en: en as Dict,
  hi: hi as Dict,
  ta: ta as Dict,
  te: te as Dict,
  kn: kn as Dict,
  ml: ml as Dict,
  mr: mr as Dict,
  bn: bn as Dict,
  gu: gu as Dict,
};

export function resolveLanguageCode(preferred: string | null | undefined): string {
  if (preferred && preferred !== 'system') {
    return CATALOG[preferred] ? preferred : 'en';
  }
  try {
    const loc = Intl.DateTimeFormat().resolvedOptions().locale || 'en';
    const base = loc.split(/[-_]/)[0]?.toLowerCase() || 'en';
    return CATALOG[base] ? base : 'en';
  } catch {
    return 'en';
  }
}

export function translate(
  preferredLanguage: string | null | undefined,
  key: TranslationKey,
): string {
  const code = resolveLanguageCode(preferredLanguage);
  return CATALOG[code]?.[key] || (en as Dict)[key] || key;
}

export type { AppLanguageCode };
