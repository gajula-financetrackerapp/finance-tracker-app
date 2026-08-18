import type {
  FeatureFlags,
  PremiumFeatureKey,
  PremiumPlanConfig,
  PlusFeatureOffer,
  PlusFeaturesConfig,
} from '../types';
import { isPremiumFeatureLive, PREMIUM_FEATURE_KEYS } from './premiumFeatures';

export const PLUS_FEATURE_ORDER: PremiumFeatureKey[] = [...PREMIUM_FEATURE_KEYS];

const DEFAULT_PLUS_OFFER: PlusFeatureOffer = {
  enabled: true,
  monthlyInr: 4,
  yearlyInr: 20,
  compareAtMonthlyInr: 0,
  compareAtYearlyInr: 0,
};

/**
 * What Plus includes out of the box. The rest are Premium-only, so they show a
 * cross in the Plus column. Admin can move any of them either way.
 */
const DEFAULT_PLUS_INCLUDED: PremiumFeatureKey[] = ['themes', 'avatars', 'insights'];

export function defaultPlusFeatures(
  monthlyFallback = DEFAULT_PLUS_OFFER.monthlyInr,
  yearlyFallback = DEFAULT_PLUS_OFFER.yearlyInr,
): PlusFeaturesConfig {
  const next = {} as PlusFeaturesConfig;
  for (const key of PREMIUM_FEATURE_KEYS) {
    next[key] = {
      enabled: DEFAULT_PLUS_INCLUDED.includes(key),
      monthlyInr: monthlyFallback,
      yearlyInr: yearlyFallback,
      compareAtMonthlyInr: 0,
      compareAtYearlyInr: 0,
    };
  }
  return next;
}

/** The features Plus actually unlocks, honouring Admin → Features kill-switches. */
export function plusIncludedKeys(
  plan: Pick<PremiumPlanConfig, 'plusFeatures'>,
  flags?: FeatureFlags | null,
): PremiumFeatureKey[] {
  return PREMIUM_FEATURE_KEYS.filter((key) => isPlusFeatureOffered(key, plan, flags));
}

export function mergePlusFeatures(
  saved: Partial<PlusFeaturesConfig> | null | undefined,
  monthlyFallback: number,
  yearlyFallback: number,
): PlusFeaturesConfig {
  const raw = (saved || {}) as Partial<Record<string, Partial<PlusFeatureOffer>>>;
  const next = defaultPlusFeatures(monthlyFallback, yearlyFallback);
  for (const key of PREMIUM_FEATURE_KEYS) {
    const row = raw[key];
    if (!row || typeof row !== 'object') continue;
    const mo = Number(row.monthlyInr);
    const yr = Number(row.yearlyInr);
    const cMo = Number(row.compareAtMonthlyInr);
    const cYr = Number(row.compareAtYearlyInr);
    next[key] = {
      enabled: typeof row.enabled === 'boolean' ? row.enabled : next[key].enabled,
      monthlyInr:
        Number.isFinite(mo) && mo >= 0 ? Math.round(mo * 100) / 100 : next[key].monthlyInr,
      yearlyInr:
        Number.isFinite(yr) && yr >= 0 ? Math.round(yr * 100) / 100 : next[key].yearlyInr,
      compareAtMonthlyInr:
        Number.isFinite(cMo) && cMo >= 0
          ? Math.round(cMo * 100) / 100
          : next[key].compareAtMonthlyInr,
      compareAtYearlyInr:
        Number.isFinite(cYr) && cYr >= 0
          ? Math.round(cYr * 100) / 100
          : next[key].compareAtYearlyInr,
    };
  }
  return next;
}

export function isPlusFeatureOffered(
  key: PremiumFeatureKey,
  plan: Pick<PremiumPlanConfig, 'plusFeatures'>,
  /** When provided, Admin → Features kill-switches also hide the offer. */
  flags?: FeatureFlags | null,
): boolean {
  if (flags && !isPremiumFeatureLive(key, flags)) return false;
  return plan.plusFeatures?.[key]?.enabled !== false;
}

/** Returns list price only when it is strictly greater than the sale price. */
export function strikeCompareAt(saleInr: number, compareAtInr?: number | null): number | null {
  const n = Number(compareAtInr);
  if (!Number.isFinite(n) || n <= 0 || n <= saleInr) return null;
  return Math.round(n * 100) / 100;
}

export function buildPremiumUpiUrl(input: {
  upiId: string;
  payeeName: string;
  amountInr: number;
  note: string;
}): string {
  const pa = encodeURIComponent(input.upiId.trim());
  const pn = encodeURIComponent(input.payeeName.trim() || 'Pulse Wallet');
  const am = encodeURIComponent(String(input.amountInr));
  const tn = encodeURIComponent(input.note);
  return `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=INR&tn=${tn}`;
}

export function plusFeaturesEqual(a: PlusFeaturesConfig, b: PlusFeaturesConfig): boolean {
  for (const key of PREMIUM_FEATURE_KEYS) {
    const x = a[key];
    const y = b[key];
    if (!x || !y) return false;
    if (
      x.enabled !== y.enabled ||
      x.monthlyInr !== y.monthlyInr ||
      x.yearlyInr !== y.yearlyInr ||
      x.compareAtMonthlyInr !== y.compareAtMonthlyInr ||
      x.compareAtYearlyInr !== y.compareAtYearlyInr
    ) {
      return false;
    }
  }
  return true;
}
