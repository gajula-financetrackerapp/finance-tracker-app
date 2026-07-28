import type {
  FeatureFlags,
  PremiumFeatureAccess,
  PremiumFeatureKey,
  PremiumFeaturesConfig,
} from '../types';

export const PREMIUM_FEATURE_KEYS: PremiumFeatureKey[] = [
  'themes',
  'avatars',
  'cloud',
  'backup',
  'insights',
  'feedback',
  'splitExpense',
];

export const DEFAULT_PREMIUM_FEATURES: PremiumFeaturesConfig = {
  themes: 'premium',
  avatars: 'premium',
  cloud: 'premium',
  backup: 'premium',
  insights: 'premium',
  feedback: 'premium',
  splitExpense: 'premium',
};

export const PREMIUM_FEATURE_LABELS: Record<PremiumFeatureKey, string> = {
  themes: 'Exclusive themes',
  avatars: 'Character avatars',
  cloud: 'Multi-device cloud sync',
  backup: 'File backup & restore',
  insights: 'Smart Insights',
  feedback: 'Button sound & ripples',
  splitExpense: 'Split expense with friends',
};

/**
 * Admin Features kill-switch that gates a Premium / Plus compare row.
 * `feedback` uses the older `buttonFeedback` flag name.
 */
export function featureFlagForPremiumKey(
  key: PremiumFeatureKey,
): keyof FeatureFlags {
  if (key === 'feedback') return 'buttonFeedback';
  return key;
}

/** False when Admin → Features turned this module off. */
export function isPremiumFeatureLive(
  key: PremiumFeatureKey,
  flags: FeatureFlags | null | undefined,
): boolean {
  const flag = featureFlagForPremiumKey(key);
  return flags?.[flag] !== false;
}

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

/**
 * True when the feature is live (admin enabled), and either free for everyone
 * or the user has Premium.
 */
export function canAccessPremiumFeature(
  key: PremiumFeatureKey,
  isPremium: boolean,
  features: PremiumFeaturesConfig,
  flags?: FeatureFlags | null,
): boolean {
  if (flags && !isPremiumFeatureLive(key, flags)) return false;
  if (features[key] === 'free') return true;
  return isPremium;
}

export function featureAccessLabel(access: PremiumFeatureAccess): string {
  return access === 'free' ? 'Free' : 'Premium';
}
