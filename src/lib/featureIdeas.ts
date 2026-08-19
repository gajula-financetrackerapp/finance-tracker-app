import type { TranslationKey } from '../i18n/translations';

/**
 * The shortlist offered in Request a feature. Titles live in the translation
 * files rather than the database so every language reads its own, which means
 * adding an idea is a release rather than a row.
 */
export type FeatureIdea = {
  id: string;
  titleKey: TranslationKey;
};

export const FEATURE_IDEAS: FeatureIdea[] = [
  { id: 'appLock', titleKey: 'featureIdea.appLock' },
  { id: 'multiCurrency', titleKey: 'featureIdea.multiCurrency' },
  { id: 'bankSync', titleKey: 'featureIdea.bankSync' },
  { id: 'billScan', titleKey: 'featureIdea.billScan' },
  { id: 'savingsGoals', titleKey: 'featureIdea.savingsGoals' },
  { id: 'widget', titleKey: 'featureIdea.widget' },
  { id: 'tripPool', titleKey: 'featureIdea.tripPool' },
  { id: 'webVersion', titleKey: 'featureIdea.webVersion' },
];
