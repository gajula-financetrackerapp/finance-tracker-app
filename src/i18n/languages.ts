/** App UI languages. Codes follow BCP-47 where possible. */
export type AppLanguageCode =
  | 'system'
  | 'en'
  | 'hi'
  | 'bn'
  | 'te'
  | 'mr'
  | 'ta'
  | 'ur'
  | 'gu'
  | 'kn'
  | 'or'
  | 'ml'
  | 'pa'
  | 'as'
  | 'mai'
  | 'sa'
  | 'ks'
  | 'ne'
  | 'sd'
  | 'kok'
  | 'doi'
  | 'mni'
  | 'sat'
  | 'brx';

export type AppLanguage = {
  code: AppLanguageCode;
  /** Native name shown in the picker */
  nativeLabel: string;
  /** English label for clarity */
  englishLabel: string;
};

/**
 * English + all 22 Eighth Schedule languages of India.
 * Untranslated catalogs fall back to English at runtime.
 */
export const APP_LANGUAGES: AppLanguage[] = [
  {
    code: 'system',
    nativeLabel: 'Device language',
    englishLabel: 'Follow phone settings',
  },
  { code: 'en', nativeLabel: 'English', englishLabel: 'English' },
  { code: 'hi', nativeLabel: 'हिन्दी', englishLabel: 'Hindi' },
  { code: 'bn', nativeLabel: 'বাংলা', englishLabel: 'Bengali' },
  { code: 'te', nativeLabel: 'తెలుగు', englishLabel: 'Telugu' },
  { code: 'mr', nativeLabel: 'मराठी', englishLabel: 'Marathi' },
  { code: 'ta', nativeLabel: 'தமிழ்', englishLabel: 'Tamil' },
  { code: 'ur', nativeLabel: 'اردو', englishLabel: 'Urdu' },
  { code: 'gu', nativeLabel: 'ગુજરાતી', englishLabel: 'Gujarati' },
  { code: 'kn', nativeLabel: 'ಕನ್ನಡ', englishLabel: 'Kannada' },
  { code: 'or', nativeLabel: 'ଓଡ଼ିଆ', englishLabel: 'Odia' },
  { code: 'ml', nativeLabel: 'മലയാളം', englishLabel: 'Malayalam' },
  { code: 'pa', nativeLabel: 'ਪੰਜਾਬੀ', englishLabel: 'Punjabi' },
  { code: 'as', nativeLabel: 'অসমীয়া', englishLabel: 'Assamese' },
  { code: 'mai', nativeLabel: 'मैथिली', englishLabel: 'Maithili' },
  { code: 'sa', nativeLabel: 'संस्कृतम्', englishLabel: 'Sanskrit' },
  { code: 'ks', nativeLabel: 'کٲشُر', englishLabel: 'Kashmiri' },
  { code: 'ne', nativeLabel: 'नेपाली', englishLabel: 'Nepali' },
  { code: 'sd', nativeLabel: 'سنڌي', englishLabel: 'Sindhi' },
  { code: 'kok', nativeLabel: 'कोंकणी', englishLabel: 'Konkani' },
  { code: 'doi', nativeLabel: 'डोगरी', englishLabel: 'Dogri' },
  { code: 'mni', nativeLabel: 'ꯃꯤꯇꯩꯂꯣꯟ', englishLabel: 'Manipuri' },
  { code: 'sat', nativeLabel: 'ᱥᱟᱱᱛᱟᱲᱤ', englishLabel: 'Santali' },
  { code: 'brx', nativeLabel: 'बरʼ', englishLabel: 'Bodo' },
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
