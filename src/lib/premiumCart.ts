import type {
  PremiumFeatureKey,
  PremiumPlanConfig,
  PlusFeatureOffer,
  PlusFeaturesConfig,
} from '../types';
import { PREMIUM_FEATURE_KEYS } from './premiumFeatures';

export const PLUS_FEATURE_ORDER: PremiumFeatureKey[] = [...PREMIUM_FEATURE_KEYS];

const DEFAULT_PLUS_OFFER: PlusFeatureOffer = {
  enabled: true,
  monthlyInr: 4,
  yearlyInr: 20,
};

export function defaultPlusFeatures(
  monthlyFallback = DEFAULT_PLUS_OFFER.monthlyInr,
  yearlyFallback = DEFAULT_PLUS_OFFER.yearlyInr,
): PlusFeaturesConfig {
  const next = {} as PlusFeaturesConfig;
  for (const key of PREMIUM_FEATURE_KEYS) {
    next[key] = {
      enabled: true,
      monthlyInr: monthlyFallback,
      yearlyInr: yearlyFallback,
    };
  }
  return next;
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
    next[key] = {
      enabled: typeof row.enabled === 'boolean' ? row.enabled : next[key].enabled,
      monthlyInr:
        Number.isFinite(mo) && mo >= 0 ? Math.round(mo * 100) / 100 : next[key].monthlyInr,
      yearlyInr:
        Number.isFinite(yr) && yr >= 0 ? Math.round(yr * 100) / 100 : next[key].yearlyInr,
    };
  }
  return next;
}

export function isPlusFeatureOffered(
  key: PremiumFeatureKey,
  plan: Pick<PremiumPlanConfig, 'plusFeatures'>,
): boolean {
  return plan.plusFeatures?.[key]?.enabled !== false;
}

export function plusFeaturePrice(
  key: PremiumFeatureKey,
  billing: 'month' | 'year',
  plan: Pick<PremiumPlanConfig, 'plusFeatures' | 'plusAddonMonthlyInr' | 'plusAddonYearlyInr'>,
): number {
  const row = plan.plusFeatures?.[key];
  if (row) {
    return billing === 'month' ? row.monthlyInr : row.yearlyInr;
  }
  return billing === 'month' ? plan.plusAddonMonthlyInr : plan.plusAddonYearlyInr;
}

/** @deprecated Prefer plusFeaturePrice — flat unit when all prices match. */
export function plusAddonPrice(
  billing: 'month' | 'year',
  plan: Pick<PremiumPlanConfig, 'plusAddonMonthlyInr' | 'plusAddonYearlyInr' | 'plusFeatures'>,
): number {
  const keys = PREMIUM_FEATURE_KEYS.filter((k) => isPlusFeatureOffered(k, plan));
  if (keys.length === 0) {
    return billing === 'month' ? plan.plusAddonMonthlyInr : plan.plusAddonYearlyInr;
  }
  const prices = keys.map((k) => plusFeaturePrice(k, billing, plan));
  return Math.min(...prices);
}

export function plusCartTotal(
  selected: Iterable<PremiumFeatureKey>,
  billing: 'month' | 'year',
  plan: Pick<PremiumPlanConfig, 'plusFeatures' | 'plusAddonMonthlyInr' | 'plusAddonYearlyInr'>,
): { count: number; totalInr: number } {
  const keys = [...selected].filter((k) => isPlusFeatureOffered(k, plan));
  const total = keys.reduce((sum, k) => sum + plusFeaturePrice(k, billing, plan), 0);
  return { count: keys.length, totalInr: Math.round(total * 100) / 100 };
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
    if (x.enabled !== y.enabled || x.monthlyInr !== y.monthlyInr || x.yearlyInr !== y.yearlyInr) {
      return false;
    }
  }
  return true;
}
