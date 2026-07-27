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
  | 'brx'
  | 'ar'
  | 'zh'
  | 'ru'
  | 'es'
  | 'de'
  | 'fr'
  | 'it'
  | 'pt'
  | 'nl'
  | 'pl'
  | 'sv'
  | 'ro'
  | 'el'
  | 'cs'
  | 'hu'
  | 'fi'
  | 'da'
  | 'nb'
  | 'uk'
  | 'bg'
  | 'hr'
  | 'sk'
  | 'sl'
  | 'lt'
  | 'lv'
  | 'et'
  | 'ga'
  | 'mt'
  | 'ja'
  | 'ko'
  | 'sw'
  | 'am'
  | 'ha'
  | 'yo'
  | 'zu'
  | 'af'
  | 'ig'
  | 'sn'
  | 'so'
  | 'xh';

export type AppLanguage = {
  code: AppLanguageCode;
  /** Native name shown in the picker */
  nativeLabel: string;
  /** English label for clarity */
  englishLabel: string;
};

/**
 * English + India’s 22 Eighth Schedule languages + major international /
 * European official languages, Arabic & Mandarin.
 * Untranslated catalog keys fall back to English at runtime.
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
  { code: 'ar', nativeLabel: 'العربية', englishLabel: 'Arabic' },
  { code: 'zh', nativeLabel: '中文', englishLabel: 'Chinese (Mandarin)' },
  { code: 'ru', nativeLabel: 'Русский', englishLabel: 'Russian' },
  { code: 'es', nativeLabel: 'Español', englishLabel: 'Spanish' },
  { code: 'de', nativeLabel: 'Deutsch', englishLabel: 'German' },
  { code: 'fr', nativeLabel: 'Français', englishLabel: 'French' },
  { code: 'it', nativeLabel: 'Italiano', englishLabel: 'Italian' },
  { code: 'pt', nativeLabel: 'Português', englishLabel: 'Portuguese' },
  { code: 'nl', nativeLabel: 'Nederlands', englishLabel: 'Dutch' },
  { code: 'pl', nativeLabel: 'Polski', englishLabel: 'Polish' },
  { code: 'sv', nativeLabel: 'Svenska', englishLabel: 'Swedish' },
  { code: 'ro', nativeLabel: 'Română', englishLabel: 'Romanian' },
  { code: 'el', nativeLabel: 'Ελληνικά', englishLabel: 'Greek' },
  { code: 'cs', nativeLabel: 'Čeština', englishLabel: 'Czech' },
  { code: 'hu', nativeLabel: 'Magyar', englishLabel: 'Hungarian' },
  { code: 'fi', nativeLabel: 'Suomi', englishLabel: 'Finnish' },
  { code: 'da', nativeLabel: 'Dansk', englishLabel: 'Danish' },
  { code: 'nb', nativeLabel: 'Norsk', englishLabel: 'Norwegian' },
  { code: 'uk', nativeLabel: 'Українська', englishLabel: 'Ukrainian' },
  { code: 'bg', nativeLabel: 'Български', englishLabel: 'Bulgarian' },
  { code: 'hr', nativeLabel: 'Hrvatski', englishLabel: 'Croatian' },
  { code: 'sk', nativeLabel: 'Slovenčina', englishLabel: 'Slovak' },
  { code: 'sl', nativeLabel: 'Slovenščina', englishLabel: 'Slovenian' },
  { code: 'lt', nativeLabel: 'Lietuvių', englishLabel: 'Lithuanian' },
  { code: 'lv', nativeLabel: 'Latviešu', englishLabel: 'Latvian' },
  { code: 'et', nativeLabel: 'Eesti', englishLabel: 'Estonian' },
  { code: 'ga', nativeLabel: 'Gaeilge', englishLabel: 'Irish' },
  { code: 'mt', nativeLabel: 'Malti', englishLabel: 'Maltese' },
  { code: 'ja', nativeLabel: '日本語', englishLabel: 'Japanese' },
  { code: 'ko', nativeLabel: '한국어', englishLabel: 'Korean' },
  { code: 'sw', nativeLabel: 'Kiswahili', englishLabel: 'Swahili' },
  { code: 'am', nativeLabel: 'አማርኛ', englishLabel: 'Amharic' },
  { code: 'ha', nativeLabel: 'Hausa', englishLabel: 'Hausa' },
  { code: 'yo', nativeLabel: 'Yorùbá', englishLabel: 'Yoruba' },
  { code: 'zu', nativeLabel: 'isiZulu', englishLabel: 'Zulu' },
  { code: 'af', nativeLabel: 'Afrikaans', englishLabel: 'Afrikaans' },
  { code: 'ig', nativeLabel: 'Igbo', englishLabel: 'Igbo' },
  { code: 'sn', nativeLabel: 'chiShona', englishLabel: 'Shona' },
  { code: 'so', nativeLabel: 'Soomaali', englishLabel: 'Somali' },
  { code: 'xh', nativeLabel: 'isiXhosa', englishLabel: 'Xhosa' },
];

export const DEFAULT_LANGUAGE: AppLanguageCode = 'en';

/** Languages that read right-to-left. */
export const RTL_LANGUAGE_CODES = new Set<string>(['ar', 'ur', 'sd', 'ks']);

export function isRtlLanguage(code: string | null | undefined): boolean {
  if (!code || code === 'system') return false;
  return RTL_LANGUAGE_CODES.has(code);
}

export function findAppLanguage(code: string | null | undefined): AppLanguage {
  return APP_LANGUAGES.find((l) => l.code === code) || APP_LANGUAGES.find((l) => l.code === 'en')!;
}

export function languageSubtitle(code: string | null | undefined): string {
  const lang = findAppLanguage(code);
  if (lang.code === 'system') return lang.englishLabel;
  if (lang.code === 'en') return lang.nativeLabel;
  return `${lang.nativeLabel} · ${lang.englishLabel}`;
}
