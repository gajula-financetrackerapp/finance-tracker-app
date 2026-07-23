import { Alert } from 'react-native';
import type { ExpenseReminder, FinanceState, Transaction } from '../types';
import { resolveDefaultAccountId } from '../cashBooks';
import {
  advanceDueDateByRepeat,
  expenseRepeatShortLabel,
  getExpenseRepeat,
  isRepeatingExpense,
  ordinalDay,
} from './recurringExpense';
import { buildExpenseTxnFromReminder } from './expenseReminderFinance';

export type MarkExpensePaidDeps = {
  expenseReminders: ExpenseReminder[];
  setExpenseReminders: (items: ExpenseReminder[]) => Promise<void>;
  finance: FinanceState;
  addTransaction: (txn: Omit<Transaction, 'id'> & { id?: string }) => Promise<void>;
  syncAlarmIfType?: (type: 'expense', id: string) => void;
};

/** Apply mark-paid; optionally create a Finance expense (avoids duplicate when user skips). */
export async function applyExpenseReminderPaid(
  reminder: ExpenseReminder,
  addToFinance: boolean,
  deps: MarkExpensePaidDeps,
): Promise<{ nextDue?: string; addedToFinance: boolean }> {
  const { expenseReminders, setExpenseReminders, finance, addTransaction, syncAlarmIfType } = deps;

  let linkedTxnId: string | null = null;
  let addedToFinance = false;

  if (addToFinance) {
    const txn = buildExpenseTxnFromReminder(reminder, resolveDefaultAccountId(finance));
    const already =
      reminder.linkedTxnId && finance.transactions.some((t) => t.id === reminder.linkedTxnId);
    if (!already) {
      await addTransaction(txn);
      addedToFinance = true;
    }
    linkedTxnId = txn.id;
  }

  if (isRepeatingExpense(reminder)) {
    const nextRepeat = getExpenseRepeat(reminder);
    const nextDue = advanceDueDateByRepeat(reminder.dueDate, nextRepeat, reminder.dayOfMonth);
    await setExpenseReminders(
      expenseReminders.map((x) =>
        x.id === reminder.id
          ? {
              ...x,
              paid: false,
              dueDate: nextDue,
              linkedTxnId: null,
              repeat: nextRepeat,
              recurring: true,
              dayOfMonth: x.dayOfMonth || parseInt(x.dueDate.split('-')[2], 10) || 1,
            }
          : x,
      ),
    );
    syncAlarmIfType?.('expense', reminder.id);
    return { nextDue, addedToFinance };
  }

  await setExpenseReminders(
    expenseReminders.map((x) =>
      x.id === reminder.id
        ? { ...x, paid: true, linkedTxnId: addToFinance ? linkedTxnId : null }
        : x,
    ),
  );
  syncAlarmIfType?.('expense', reminder.id);
  return { addedToFinance };
}

/** Prompt: add expense to Finance, or skip (mark paid only). */
export function confirmMarkExpensePaid(
  reminder: ExpenseReminder,
  deps: MarkExpensePaidDeps,
  onDone?: (result: { nextDue?: string; addedToFinance: boolean }) => void,
) {
  Alert.alert(
    'Mark as paid',
    `Mark “${reminder.name}” as paid?\n\nAdd this to Finance as an expense only if you haven’t already logged it — choose Skip to avoid a duplicate.`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Skip',
        onPress: () => {
          void applyExpenseReminderPaid(reminder, false, deps).then((r) => onDone?.(r));
        },
      },
      {
        text: 'Add to Finance expense',
        onPress: () => {
          void applyExpenseReminderPaid(reminder, true, deps).then((r) => onDone?.(r));
        },
      },
    ],
  );
}

export function expensePaidSuccessMessage(
  reminder: ExpenseReminder,
  result: { nextDue?: string; addedToFinance: boolean },
) {
  if (result.nextDue) {
    const nextRepeat = getExpenseRepeat(reminder);
    const day = reminder.dayOfMonth || parseInt(result.nextDue.split('-')[2], 10);
    const financeBit = result.addedToFinance ? 'Logged in Finance. ' : '';
    return `${financeBit}Next due: ${result.nextDue} (${expenseRepeatShortLabel(nextRepeat).toLowerCase()} on the ${ordinalDay(day)}).`;
  }
  return result.addedToFinance
    ? 'Marked paid and added to Finance expenses.'
    : 'Marked paid without adding a Finance transaction.';
}
