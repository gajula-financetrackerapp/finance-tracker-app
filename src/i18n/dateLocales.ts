import { resolveLanguageCode } from './translations';

/** BCP-47 locales for month/date formatting. Unknown codes fall back to en-IN. */
const DATE_LOCALE_BY_LANG: Record<string, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  bn: 'bn-IN',
  te: 'te-IN',
  mr: 'mr-IN',
  ta: 'ta-IN',
  ur: 'ur-IN',
  gu: 'gu-IN',
  kn: 'kn-IN',
  or: 'or-IN',
  ml: 'ml-IN',
  pa: 'pa-IN',
  as: 'as-IN',
  mai: 'mai-IN',
  sa: 'sa-IN',
  ks: 'ks-IN',
  ne: 'ne-IN',
  sd: 'sd-IN',
  kok: 'kok-IN',
  doi: 'doi-IN',
  mni: 'mni-IN',
  sat: 'sat-IN',
  brx: 'brx-IN',
};

export function dateLocaleForLanguage(language: string | null | undefined): string {
  const code = resolveLanguageCode(language);
  return DATE_LOCALE_BY_LANG[code] || 'en-IN';
}
