import en from './locales/en.json';
import hi from './locales/hi.json';
import ta from './locales/ta.json';
import te from './locales/te.json';
import kn from './locales/kn.json';
import ml from './locales/ml.json';
import mr from './locales/mr.json';
import bn from './locales/bn.json';
import gu from './locales/gu.json';
import ur from './locales/ur.json';
import or from './locales/or.json';
import pa from './locales/pa.json';
import as from './locales/as.json';
import mai from './locales/mai.json';
import sa from './locales/sa.json';
import ks from './locales/ks.json';
import ne from './locales/ne.json';
import sd from './locales/sd.json';
import kok from './locales/kok.json';
import doi from './locales/doi.json';
import mni from './locales/mni.json';
import sat from './locales/sat.json';
import brx from './locales/brx.json';
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
  ur: ur as Dict,
  or: or as Dict,
  pa: pa as Dict,
  as: as as Dict,
  mai: mai as Dict,
  sa: sa as Dict,
  ks: ks as Dict,
  ne: ne as Dict,
  sd: sd as Dict,
  kok: kok as Dict,
  doi: doi as Dict,
  mni: mni as Dict,
  sat: sat as Dict,
  brx: brx as Dict,
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
