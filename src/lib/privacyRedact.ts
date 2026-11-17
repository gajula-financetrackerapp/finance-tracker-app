import type {
  CashBooksState,
  ExpenseReminder,
  FinanceState,
  Transaction,
} from '../types';
import { importFingerprintFromLegacyKey } from './importFingerprint';

/** Drop raw SMS text and ensure its dedupe key is a one-way digest. */
export function stripSmsTextFromTransaction(txn: Transaction): Transaction {
  const importKey = txn.importKey
    ? importFingerprintFromLegacyKey(txn.importKey)
    : txn.importKey;
  if (txn.sourceText == null && importKey === txn.importKey) return txn;
  const next = { ...txn, importKey };
  delete next.sourceText;
  return next;
}

function stripEventBody<T extends { body?: string }>(event: T): T {
  if (event.body == null) return event;
  const next = { ...event };
  delete next.body;
  return next;
}

export function stripSmsTextFromExpenseReminder(r: ExpenseReminder): ExpenseReminder {
  return {
    ...r,
    spendEvents: r.spendEvents?.map(stripEventBody),
    billEvents: r.billEvents?.map(stripEventBody),
  };
}

export function stripSmsTextFromFinance(finance: FinanceState): FinanceState {
  return {
    ...finance,
    transactions: finance.transactions.map(stripSmsTextFromTransaction),
  };
}

/** Cloud sync and file backup must not carry inbox bodies. */
export function stripSmsTextFromCashBooks(books: CashBooksState): CashBooksState {
  return {
    ...books,
    books: books.books.map((book) => ({
      ...book,
      finance: stripSmsTextFromFinance(book.finance),
    })),
  };
}

export function stripSmsTextFromReminders<T extends { expense: ExpenseReminder[] }>(
  reminders: T,
): T {
  return {
    ...reminders,
    expense: reminders.expense.map(stripSmsTextFromExpenseReminder),
  };
}
