import type { PremiumFeatureAccess, PremiumFeatureKey, PremiumFeaturesConfig } from '../types';

export const PREMIUM_FEATURE_KEYS: PremiumFeatureKey[] = [
  'themes',
  'avatars',
  'cloud',
  'backup',
  'insights',
];

export const DEFAULT_PREMIUM_FEATURES: PremiumFeaturesConfig = {
  themes: 'premium',
  avatars: 'premium',
  cloud: 'premium',
  backup: 'premium',
  insights: 'premium',
};

export const PREMIUM_FEATURE_LABELS: Record<PremiumFeatureKey, string> = {
  themes: 'Exclusive themes',
  avatars: 'Character avatars',
  cloud: 'Multi-device cloud sync',
  backup: 'File backup & restore',
  insights: 'Smart Insights',
};

export function mergePremiumFeatures(
  saved?: Partial<PremiumFeaturesConfig> | null,
): PremiumFeaturesConfig {
  const raw = (saved || {}) as Partial<Record<string, string>>;
  const next = { ...DEFAULT_PREMIUM_FEATURES };
  for (const key of PREMIUM_FEATURE_KEYS) {
    const v = raw[key];
    if (v === 'free' || v === 'premium') next[key] = v;
  }
  return next;
}

/** True when the feature is free for everyone, or the user has Premium. */
export function canAccessPremiumFeature(
  key: PremiumFeatureKey,
  isPremium: boolean,
  features: PremiumFeaturesConfig,
): boolean {
  if (features[key] === 'free') return true;
  return isPremium;
}

export function featureAccessLabel(access: PremiumFeatureAccess): string {
  return access === 'free' ? 'Free' : 'Premium';
}
