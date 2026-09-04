import type { TranslationKey } from './translations';

/**
 * The action phrases the auth gate is raised with, as translation keys.
 *
 * Call sites say what they were about to do in English — `requireAuthToSave
 * ('import transactions')` — which reads well where the gate is raised but
 * arrives at the sign-in modal as English prose in the middle of a translated
 * sentence. This turns the phrase back into a key. Anything not listed falls
 * back to the general wording rather than showing English.
 */
const ACTION_KEYS: Record<string, TranslationKey> = {
  'add transactions': 'authAction.addTransactions',
  'edit transactions': 'authAction.editTransactions',
  'delete transactions': 'authAction.deleteTransactions',
  'import transactions': 'authAction.importTransactions',
  'remove imported transactions': 'authAction.removeImported',
  'save finance data': 'authAction.saveFinance',
  'set a budget': 'authAction.setBudget',
  'remove a budget': 'authAction.removeBudget',
  'manage accounts': 'authAction.manageAccounts',
  'set default account': 'authAction.defaultAccount',
  'add categories': 'authAction.addCategories',
  'edit categories': 'authAction.editCategories',
  'delete categories': 'authAction.deleteCategories',
  'reset categories': 'authAction.resetCategories',
  'change alarm settings': 'authAction.alarmSettings',
  'add reminders': 'authAction.addReminders',
  'edit reminders': 'authAction.editReminders',
  'save reminders': 'authAction.saveReminders',
  'save shopping list': 'authAction.saveShopping',
  'create a cash book': 'authAction.createBook',
  'rename a cash book': 'authAction.renameBook',
  'update a cash book': 'authAction.updateBook',
  'delete a cash book': 'authAction.deleteBook',
  'add a credit card': 'authAction.addCard',
  'remove a credit card': 'authAction.removeCard',
  'save card dates': 'authAction.cardDates',
  'mark a card bill paid': 'authAction.cardBillPaid',
  'delete a card spend': 'authAction.deleteCardSpend',
  'refresh card statements': 'authAction.refreshStatements',
  'send feedback': 'authAction.sendFeedback',
  'request premium': 'authAction.requestPremium',
  'save data': 'authAction.saveData',
};

export function authActionKey(label: string): TranslationKey | null {
  return ACTION_KEYS[label.trim().toLowerCase()] || null;
}
