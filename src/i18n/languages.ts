/** App UI languages. Codes follow BCP-47 where possible. */
export type AppLanguageCode =
  | 'system'
  | 'en'
  | 'hi'
  | 'ta'
  | 'te'
  | 'kn'
  | 'ml'
  | 'mr'
  | 'bn'
  | 'gu';

export type AppLanguage = {
  code: AppLanguageCode;
  /** Native name shown in the picker */
  nativeLabel: string;
  /** English label for clarity */
  englishLabel: string;
  flag: string;
};

export const APP_LANGUAGES: AppLanguage[] = [
  {
    code: 'system',
    nativeLabel: 'Device language',
    englishLabel: 'Follow phone settings',
    flag: '📱',
  },
  { code: 'en', nativeLabel: 'English', englishLabel: 'English', flag: '🇬🇧' },
  { code: 'hi', nativeLabel: 'हिन्दी', englishLabel: 'Hindi', flag: '🇮🇳' },
  { code: 'ta', nativeLabel: 'தமிழ்', englishLabel: 'Tamil', flag: '🇮🇳' },
  { code: 'te', nativeLabel: 'తెలుగు', englishLabel: 'Telugu', flag: '🇮🇳' },
  { code: 'kn', nativeLabel: 'ಕನ್ನಡ', englishLabel: 'Kannada', flag: '🇮🇳' },
  { code: 'ml', nativeLabel: 'മലയാളം', englishLabel: 'Malayalam', flag: '🇮🇳' },
  { code: 'mr', nativeLabel: 'मराठी', englishLabel: 'Marathi', flag: '🇮🇳' },
  { code: 'bn', nativeLabel: 'বাংলা', englishLabel: 'Bengali', flag: '🇮🇳' },
  { code: 'gu', nativeLabel: 'ગુજરાતી', englishLabel: 'Gujarati', flag: '🇮🇳' },
];

export const DEFAULT_LANGUAGE: AppLanguageCode = 'en';

export function findAppLanguage(code: string | null | undefined): AppLanguage {
  return APP_LANGUAGES.find((l) => l.code === code) || APP_LANGUAGES.find((l) => l.code === 'en')!;
}

export function languageSubtitle(code: string | null | undefined): string {
  const lang = findAppLanguage(code);
  if (lang.code === 'system') return lang.englishLabel;
  if (lang.code === 'en') return lang.nativeLabel;
  return `${lang.nativeLabel} · ${lang.englishLabel}`;
}
