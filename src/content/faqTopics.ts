import { tr, type TranslationKey } from '../i18n/translations';

export type FaqTopic = {
  /** Stable across languages, unlike the translated question. */
  id: string;
  question: string;
  /** The taps, in order, already in the user's language. */
  path: string[];
  answer: string;
};

/**
 * Every step is named by the key the button itself uses, so a path can never
 * drift from the label on screen — rename a screen and the FAQ renames with it,
 * in all 62 languages. Steps with no button of their own ("tap the row") live
 * under faq.step*.
 */
type FaqSpec = {
  id: string;
  question: TranslationKey;
  answer: TranslationKey;
  path: TranslationKey[];
};

const FAQ_SPECS: FaqSpec[] = [
  {
    id: 'add-transaction',
    question: 'faq.qAddTxn',
    answer: 'faq.aAddTxn',
    path: [
      'tabs.home',
      'faq.stepPlus',
      'faq.stepExpenseOrIncome',
      'faq.stepPickCategory',
      'home.save',
    ],
  },
  {
    id: 'card-transaction',
    question: 'faq.qCardTxn',
    answer: 'faq.aCardTxn',
    path: ['tabs.home', 'faq.stepPlus', 'add.cardTab', 'faq.stepCardAction', 'home.save'],
  },
  {
    id: 'edit-transaction',
    question: 'faq.qEditTxn',
    answer: 'faq.aEditTxn',
    path: ['tabs.home', 'home.hubTransactions', 'faq.stepTapTxn', 'home.edit', 'add.update'],
  },
  {
    id: 'delete-transaction',
    question: 'faq.qDeleteTxn',
    answer: 'faq.aDeleteTxn',
    path: [
      'tabs.home',
      'home.hubTransactions',
      'faq.stepTapTxn',
      'home.delete',
      'faq.stepConfirm',
    ],
  },
  {
    id: 'delete-many',
    question: 'faq.qDeleteMany',
    answer: 'faq.aDeleteMany',
    path: [
      'tabs.profile',
      'profile.appSettings',
      'allTxns.title',
      'faq.stepTapRows',
      'allTxns.deleteSelected',
      'faq.stepConfirm',
    ],
  },
  {
    id: 'theme',
    question: 'faq.qTheme',
    answer: 'faq.aTheme',
    path: ['tabs.profile', 'profile.appSettings', 'settings.themes', 'faq.stepPickColour'],
  },
  {
    id: 'avatar',
    question: 'faq.qAvatar',
    answer: 'faq.aAvatar',
    path: [
      'tabs.profile',
      'profile.appSettings',
      'settings.myProfile',
      'myProfile.tapToChangeAvatar',
      'faq.stepPickCharacter',
    ],
  },
  {
    id: 'language',
    question: 'faq.qLanguage',
    answer: 'faq.aLanguage',
    path: ['tabs.profile', 'profile.appSettings', 'settings.language', 'faq.stepPickLanguage'],
  },
  {
    id: 'app-lock',
    question: 'faq.qAppLock',
    answer: 'faq.aAppLock',
    path: ['tabs.profile', 'profile.appSettings', 'settings.appLock', 'faq.stepTurnOn'],
  },
  {
    id: 'notifications',
    question: 'faq.qNotifications',
    answer: 'faq.aNotifications',
    path: ['notifications.title'],
  },
  {
    id: 'delete-account',
    question: 'faq.qDeleteAccount',
    answer: 'faq.aDeleteAccount',
    path: [
      'tabs.profile',
      'profile.appSettings',
      'deleteAccount.title',
      'deleteAccount.reasonAsk',
      'deleteAccount.cta',
    ],
  },
  {
    id: 'import-sms',
    question: 'faq.qImportSms',
    answer: 'faq.aImportSms',
    path: [
      'tabs.profile',
      'profile.appSettings',
      'import.title',
      'import.scanSmsAuto',
      'faq.stepTickRows',
      'import.importBtn',
    ],
  },
  {
    id: 'import-auto',
    question: 'faq.qAutoImport',
    answer: 'faq.aAutoImport',
    path: [
      'tabs.profile',
      'profile.appSettings',
      'import.title',
      'import.autoImport',
      'faq.stepTurnOn',
    ],
  },
  {
    id: 'add-account',
    question: 'faq.qAddAccount',
    answer: 'faq.aAddAccount',
    path: [
      'tabs.profile',
      'profile.appSettings',
      'settings.accounts',
      'accounts.add',
      'faq.stepPickType',
      'home.save',
    ],
  },
  {
    id: 'edit-account',
    question: 'faq.qEditAccount',
    answer: 'faq.aEditAccount',
    path: [
      'tabs.profile',
      'profile.appSettings',
      'settings.accounts',
      'faq.stepTapAccount',
      'home.edit',
      'home.save',
    ],
  },
  {
    id: 'category',
    question: 'faq.qCategory',
    answer: 'faq.aCategory',
    path: [
      'tabs.profile',
      'profile.appSettings',
      'settings.categories',
      'faq.stepExpenseOrIncome',
      'categories.addExpense',
    ],
  },
  {
    id: 'budget',
    question: 'faq.qBudget',
    answer: 'faq.aBudget',
    path: ['tabs.budget', 'budget.setBudget', 'faq.stepPickCategory', 'budget.saveBudget'],
  },
  {
    id: 'reminder',
    question: 'faq.qReminder',
    answer: 'faq.aReminder',
    path: [
      'workspace.reminders',
      'faq.stepPickReminder',
      'reminders.tabNew',
      'reminders.saveReminder',
    ],
  },
  {
    id: 'buy-list',
    question: 'faq.qBuyList',
    answer: 'faq.aBuyList',
    path: ['workspace.shopping', 'faq.stepTypeItem', 'add.addItemBtn'],
  },
  {
    id: 'split',
    question: 'faq.qSplit',
    answer: 'faq.aSplit',
    path: ['workspace.split', 'split.tabExpenses', 'split.addExpense', 'split.saveExpense'],
  },
  {
    id: 'charts',
    question: 'faq.qCharts',
    answer: 'faq.aCharts',
    path: ['tabs.charts', 'faq.stepPickPeriod'],
  },
  {
    id: 'backup',
    question: 'faq.qBackup',
    answer: 'faq.aBackup',
    path: ['tabs.profile', 'profile.appSettings', 'settings.backup'],
  },
  {
    id: 'restore',
    question: 'faq.qRestore',
    answer: 'faq.aRestore',
    path: ['tabs.profile', 'profile.appSettings', 'settings.restore', 'faq.stepPickFile'],
  },
  {
    id: 'sign-in',
    question: 'faq.qSignIn',
    answer: 'faq.aSignIn',
    path: ['tabs.profile', 'profile.signIn'],
  },
  {
    id: 'sign-out',
    question: 'faq.qSignOut',
    answer: 'faq.aSignOut',
    path: ['tabs.profile', 'profile.logout', 'faq.stepConfirm'],
  },
  {
    id: 'premium',
    question: 'faq.qPremium',
    answer: 'faq.aPremium',
    path: ['tabs.profile', 'profile.premium'],
  },
  {
    id: 'diamonds',
    question: 'faq.qDiamonds',
    answer: 'faq.aDiamonds',
    path: ['tabs.profile', 'diamonds.title'],
  },
  {
    id: 'home-month',
    question: 'faq.qHomeMonth',
    answer: 'faq.aHomeMonth',
    path: ['tabs.profile', 'profile.appSettings', 'settings.accounts'],
  },
  {
    id: 'contact',
    question: 'faq.qContact',
    answer: 'faq.aContact',
    path: ['tabs.profile', 'profile.appSettings', 'settings.feedback'],
  },
];

/** FAQ entries for in-app display, in the user's language. */
export function faqTopics(): FaqTopic[] {
  return FAQ_SPECS.map((spec) => ({
    id: spec.id,
    question: tr(spec.question),
    path: spec.path.map(tr),
    answer: tr(spec.answer),
  }));
}
