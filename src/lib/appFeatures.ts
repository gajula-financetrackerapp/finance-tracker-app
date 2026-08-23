import type { FeatureFlags } from '../types';
import type { Workspace } from '../WorkspaceContext';

/** Module / workspace gates from Admin → Features. */
export function isWorkspaceEnabled(features: FeatureFlags, workspace: Workspace): boolean {
  if (workspace === 'finance') return features.finance !== false;
  if (workspace === 'reminders') return features.reminders !== false;
  if (workspace === 'shopping') return features.shoppingList !== false;
  if (workspace === 'split') return features.splitExpense !== false;
  return true;
}

export function enabledWorkspaces(features: FeatureFlags): Workspace[] {
  return (['finance', 'reminders', 'shopping', 'split'] as const).filter((w) =>
    isWorkspaceEnabled(features, w),
  );
}

/** If current workspace was turned off, pick the first still-enabled one. */
export function resolveWorkspace(features: FeatureFlags, current: Workspace): Workspace {
  if (isWorkspaceEnabled(features, current)) return current;
  return enabledWorkspaces(features)[0] || 'finance';
}

export function isReminderTypeEnabled(
  features: FeatureFlags,
  type: 'expense' | 'medicine' | 'grocery' | 'general',
): boolean {
  if (features.reminders === false) return false;
  if (type === 'expense') return features.expenseReminder !== false;
  if (type === 'medicine') return features.medicineReminder !== false;
  if (type === 'grocery') return features.groceryExpiryReminder !== false;
  return features.generalReminder !== false;
}

/** Statement SMS → card bill reminders. Needs SMS import and expense reminders. */
export function isCardBillRemindersEnabled(features: FeatureFlags): boolean {
  return (
    features.cardBillReminders !== false &&
    features.smsImport !== false &&
    isReminderTypeEnabled(features, 'expense')
  );
}
