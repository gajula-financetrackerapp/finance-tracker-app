import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import en from './locales/en.json';
import { LOCALE_ASSETS } from './localeAssets';
import type { AppLanguageCode } from './languages';

export type TranslationKey = keyof typeof en;

type Dict = Record<string, string>;

/** English only in the JS bundle; other languages load from asset packs. */
const cache: Record<string, Dict> = {
  en: en as Dict,
};

const KNOWN = new Set<string>(['en', ...Object.keys(LOCALE_ASSETS)]);

async function readAssetLocale(moduleId: number): Promise<Dict> {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  const uri = asset.localUri || asset.uri;
  if (!uri) throw new Error('Locale asset has no URI');
  const text = await FileSystem.readAsStringAsync(uri);
  return JSON.parse(text) as Dict;
}

export async function ensureLocale(code: string | null | undefined): Promise<string> {
  const resolved = resolveLanguageCode(code);
  if (cache[resolved]) return resolved;
  const moduleId = LOCALE_ASSETS[resolved];
  if (moduleId == null) return 'en';
  try {
    cache[resolved] = await readAssetLocale(moduleId);
  } catch (e) {
    console.warn('[i18n] failed to load locale', resolved, e);
    return 'en';
  }
  return resolved;
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
