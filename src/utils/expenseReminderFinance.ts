import type { ExpenseReminder, Transaction } from '../types';
import { todayStr, uid } from '../utils';
import { formatExpenseReminderLabel } from './recurringExpense';
import { EXPENSE_CATS } from '../theme';
import { CARD_BILL_CATEGORY } from '../cashBooks';

/** Pick the closest expense category for a reminder name (e.g. Rent → Housing). */
export function categoryForExpenseReminder(name: string): string {
  const n = (name || '').trim().toLowerCase();
  if (!n) return 'Others';

  const exact = EXPENSE_CATS.find((c) => c.name.toLowerCase() === n);
  if (exact) return exact.name;

  const contains = EXPENSE_CATS.find((c) => {
    const cat = c.name.toLowerCase();
    if (cat.length < 4) {
      return new RegExp(`\\b${cat}\\b`).test(n);
    }
    return n.includes(cat) || cat.includes(n);
  });
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

/**
 * Marking a card-bill reminder paid is what puts it on Home → Bill paid.
 * Creating the reminder must not. A bank→card transfer matches an imported bill;
 * card income is the CRED-style fallback when only the card account exists.
 */
export function buildCardBillTxnFromReminder(
  reminder: ExpenseReminder,
  bankId?: string,
  cardId?: string,
): Transaction | null {
  const amount = Math.abs(Number(reminder.amount)) || 0;
  if (amount <= 0) return null;
  const txnId = reminder.linkedTxnId || uid();
  const label = formatExpenseReminderLabel(reminder);
  const date = todayStr();
  if (bankId && cardId && bankId !== cardId) {
    return {
      id: txnId,
      kind: 'transfer',
      category: CARD_BILL_CATEGORY,
      amount,
      date,
      note: label,
      itemName: label,
      fromAccountId: bankId,
      toAccountId: cardId,
    };
  }
  if (cardId) {
    return {
      id: txnId,
      kind: 'income',
      category: CARD_BILL_CATEGORY,
      amount,
      date,
      note: label,
      itemName: label,
      accountId: cardId,
    };
  }
  return null;
}
