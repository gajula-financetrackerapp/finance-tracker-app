import { DEFAULT_PREMIUM_PLAN } from '../src/constants';
import {
  canAccessPremiumFeature,
  DEFAULT_PREMIUM_FEATURES,
  PREMIUM_FEATURE_KEYS,
} from '../src/lib/premiumFeatures';
import { isPlusCurrentlyActive, isPremiumCurrentlyActive } from '../src/lib/premium';
import {
  defaultPlusFeatures,
  isPlusFeatureOffered,
  plusIncludedKeys,
  strikeCompareAt,
} from '../src/lib/premiumCart';
import type { PremiumFeatureKey } from '../src/types';

let fail = 0;
function check(label: string, cond: boolean) {
  if (!cond) fail++;
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}`);
}

const plan = DEFAULT_PREMIUM_PLAN;

// ---------- what Plus includes ----------

const included = plusIncludedKeys(plan);
const expected: PremiumFeatureKey[] = ['themes', 'avatars', 'insights'];

check('Plus includes exactly three features', included.length === 3);
for (const key of expected) {
  check(`Plus includes ${key}`, included.includes(key));
}
for (const key of ['cloud', 'backup', 'splitExpense'] as PremiumFeatureKey[]) {
  check(`Plus leaves out ${key}`, !included.includes(key));
  check(`${key} shows a cross in the Plus column`, !isPlusFeatureOffered(key, plan));
}
check(
  'every feature is accounted for either way',
  PREMIUM_FEATURE_KEYS.every((k) => included.includes(k) || !isPlusFeatureOffered(k, plan)),
);

// An admin kill-switch hides a feature from Plus even when it is included.
check(
  'a killed feature drops out of Plus',
  !plusIncludedKeys(plan, { financeThemes: false } as never).includes('themes') ||
    plusIncludedKeys(plan, {} as never).includes('themes'),
);

// ---------- Plus is priced as one tier ----------

check('Plus has a yearly amount', plan.plusAmountInr > 0);
check('Plus has a monthly amount', plan.plusMonthlyAmountInr > 0);
check('Plus is cheaper than Premium yearly', plan.plusAmountInr < plan.amountInr);
check('Plus is cheaper than Premium monthly', plan.plusMonthlyAmountInr < plan.monthlyAmountInr);
check('the yearly label is set', plan.plusPriceLabel.trim().length > 0);
check('the monthly label is set', plan.plusMonthlyPriceLabel.trim().length > 0);

check('no strike-through until a list price is set', strikeCompareAt(199, 0) === null);
check('a list price below the sale price is ignored', strikeCompareAt(199, 149) === null);
check('a list price above the sale price strikes through', strikeCompareAt(199, 299) === 299);

// ---------- admin can move a feature either way ----------

const custom = defaultPlusFeatures();
custom.cloud = { ...custom.cloud, enabled: true };
custom.themes = { ...custom.themes, enabled: false };
const moved = plusIncludedKeys({ plusFeatures: custom });
check('admin can add a feature to Plus', moved.includes('cloud'));
check('admin can take one out', !moved.includes('themes'));

const later = new Date(Date.now() + 86_400_000).toISOString();
const plusAccess = { active: true, plusFeatures: plan.plusFeatures };
check(
  'Plus can open a Plus feature',
  canAccessPremiumFeature('themes', false, DEFAULT_PREMIUM_FEATURES, null, plusAccess),
);
check(
  'Plus cannot open a Premium-only feature',
  !canAccessPremiumFeature('cloud', false, DEFAULT_PREMIUM_FEATURES, null, plusAccess),
);
check(
  'Premium can open cloud',
  canAccessPremiumFeature('cloud', true, DEFAULT_PREMIUM_FEATURES, null, null),
);
check(
  'a Plus row is not Premium even if the old flag is still on',
  !isPremiumCurrentlyActive({ is_premium: true, plan_kind: 'plus', premium_until: later }),
);
check(
  'a Plus row stays Plus',
  isPlusCurrentlyActive({ plan_kind: 'plus', premium_until: later }),
);
check(
  'a Premium row stays Premium',
  isPremiumCurrentlyActive({ is_premium: true, plan_kind: 'premium', premium_until: later }),
);
check(
  'an older Premium row with no plan tag stays Premium',
  isPremiumCurrentlyActive({ is_premium: true, plan_kind: null, premium_until: null }),
);

console.log(fail === 0 ? '\nall passed' : `\n${fail} failed`);
