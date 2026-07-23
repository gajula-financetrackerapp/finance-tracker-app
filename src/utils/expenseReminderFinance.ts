import type { ExpenseReminder, Transaction } from '../types';
import { todayStr, uid } from '../utils';
import { formatExpenseReminderLabel } from './recurringExpense';
import { EXPENSE_CATS } from '../theme';

/** Pick the closest expense category for a reminder name (e.g. Rent → Housing). */
export function categoryForExpenseReminder(name: string): string {
  const n = (name || '').trim().toLowerCase();
  if (!n) return 'Others';

  const exact = EXPENSE_CATS.find((c) => c.name.toLowerCase() === n);
  if (exact) return exact.name;

  const contains = EXPENSE_CATS.find(
    (c) => n.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(n),
  );
  if (contains) return contains.name;

  // Common bill keywords
  if (/\b(rent|emi|loan|mortgage|housing|lease)\b/.test(n)) return 'Housing';
  if (/\b(ott|netflix|hotstar|prime|disney|spotify)\b/.test(n)) return 'Entertainment';
  if (/\b(electric|water|gas|internet|wifi|phone|mobile|utility|bill)\b/.test(n)) return 'Phone';
  if (/\b(insurance|hospital|doctor|medical|health)\b/.test(n)) return 'Health';
  if (/\b(school|tuition|fee|education)\b/.test(n)) return 'Education';
  if (/\b(fuel|petrol|diesel|car|vehicle)\b/.test(n)) return 'Car';
  if (/\b(bus|taxi|uber|ola|metro|transport)\b/.test(n)) return 'Transportation';

  return 'Others';
}

export function buildExpenseTxnFromReminder(
  reminder: ExpenseReminder,
  accountId?: string,
): Transaction {
  const txnId = reminder.linkedTxnId || uid();
  const label = formatExpenseReminderLabel(reminder);
  return {
    id: txnId,
    kind: 'expense',
    category: categoryForExpenseReminder(reminder.name),
    amount: Math.abs(reminder.amount),
    date: reminder.dueDate || todayStr(),
    note: label,
    itemName: label,
    accountId,
  };
}
