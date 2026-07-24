import { Alert } from 'react-native';
import type { ExpenseReminder, FinanceState, Transaction } from '../types';
import { resolveDefaultAccountId } from '../cashBooks';
import {
  advanceDueDateByRepeat,
  getExpenseRepeat,
  isRepeatingExpense,
  ordinalDay,
} from './recurringExpense';
import { buildExpenseTxnFromReminder } from './expenseReminderFinance';
import { translate, type TranslationKey } from '../i18n/translations';
import { repeatShortLabel } from '../i18n/reminderLabels';

export type MarkExpensePaidDeps = {
  expenseReminders: ExpenseReminder[];
  setExpenseReminders: (items: ExpenseReminder[]) => Promise<void>;
  finance: FinanceState;
  addTransaction: (txn: Omit<Transaction, 'id'> & { id?: string }) => Promise<void>;
  syncAlarmIfType?: (type: 'expense', id: string) => void;
  language?: string | null;
};

function tt(lang: string | null | undefined, key: TranslationKey) {
  return translate(lang, key);
}

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
  const lang = deps.language;
  Alert.alert(
    tt(lang, 'reminders.markPaidTitle'),
    tt(lang, 'reminders.markPaidBody').replace('{name}', reminder.name),
    [
      { text: tt(lang, 'common.cancel'), style: 'cancel' },
      {
        text: tt(lang, 'reminders.skip'),
        onPress: () => {
          void applyExpenseReminderPaid(reminder, false, deps).then((r) => onDone?.(r));
        },
      },
      {
        text: tt(lang, 'reminders.addToFinance'),
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
  language?: string | null,
) {
  if (result.nextDue) {
    const nextRepeat = getExpenseRepeat(reminder);
    const day = reminder.dayOfMonth || parseInt(result.nextDue.split('-')[2], 10);
    const financeBit = result.addedToFinance ? tt(language, 'reminders.loggedFinance') : '';
    return tt(language, 'reminders.paidNextMsg')
      .replace('{finance}', financeBit)
      .replace('{date}', result.nextDue)
      .replace('{repeat}', repeatShortLabel(language, nextRepeat).toLowerCase())
      .replace('{day}', ordinalDay(day));
  }
  return result.addedToFinance
    ? tt(language, 'reminders.paidWithFinance')
    : tt(language, 'reminders.paidNoFinance');
}
