import { DEFAULT_THEME_CATALOG, THEMES } from '../constants';
import type { ThemeAccess, ThemeCatalogConfig, ThemeKey } from '../types';

const THEME_KEYS = Object.keys(THEMES) as ThemeKey[];

const ACCESS_VALUES: ThemeAccess[] = ['free', 'premium', 'premiumPro', 'hidden'];

export function mergeThemeCatalog(
  saved?: Partial<ThemeCatalogConfig> | null,
): ThemeCatalogConfig {
  const savedAccess = saved?.access || {};
  // Older installs lacked dual-tone Premium packs — reset tiers once.
  const isLegacyCatalog =
    !('aurora' in savedAccess) &&
    !('sunset' in savedAccess) &&
    !('obsidian' in savedAccess) &&
    !('velvet' in savedAccess);

  const access: Partial<Record<ThemeKey, ThemeAccess>> = {
    ...DEFAULT_THEME_CATALOG.access,
  };
  if (!isLegacyCatalog) {
    for (const key of THEME_KEYS) {
      const v = savedAccess[key];
      if (v && ACCESS_VALUES.includes(v)) access[key] = v;
    }
  }
  return {
    unlockAllPremium:
      typeof saved?.unlockAllPremium === 'boolean'
        ? saved.unlockAllPremium
        : DEFAULT_THEME_CATALOG.unlockAllPremium,
    access,
  };
}

export function themeAccessFor(
  key: ThemeKey,
  catalog: ThemeCatalogConfig,
): ThemeAccess {
  return catalog.access[key] || DEFAULT_THEME_CATALOG.access[key] || 'free';
}

export function canUseTheme(
  key: ThemeKey,
  catalog: ThemeCatalogConfig,
  isPremium: boolean,
  isPremiumPro = false,
): boolean {
  const access = themeAccessFor(key, catalog);
  if (access === 'hidden') return false;
  if (access === 'free') return true;
  if (access === 'premium') return isPremium || catalog.unlockAllPremium;
  // Premium Pro — locked until you define Pro colors / membership
  return isPremiumPro;
}

export function themesForAccess(
  catalog: ThemeCatalogConfig,
  access: ThemeAccess,
): ThemeKey[] {
  return THEME_KEYS.filter((k) => themeAccessFor(k, catalog) === access);
}

export function visibleThemes(
  catalog: ThemeCatalogConfig,
): ThemeKey[] {
  return THEME_KEYS.filter((k) => themeAccessFor(k, catalog) !== 'hidden');
}

export function firstAllowedTheme(
  catalog: ThemeCatalogConfig,
  isPremium: boolean,
  preferred?: ThemeKey,
  isPremiumPro = false,
): ThemeKey {
  if (preferred && canUseTheme(preferred, catalog, isPremium, isPremiumPro)) {
    return preferred;
  }
  for (const key of THEME_KEYS) {
    if (canUseTheme(key, catalog, isPremium, isPremiumPro)) return key;
  }
  return 'teal';
}
