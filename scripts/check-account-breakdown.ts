import {
  accountBalance,
  accountExistingAmount,
  accountMonthExpense,
  accountMonthIncome,
  accountMonthlyBalances,
  previousMonth,
} from '../src/utils/accountBalance';
import type { Account, Transaction } from '../src/types';

let fail = 0;
function check(label: string, cond: boolean) {
  if (!cond) fail++;
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}`);
}

const acc = (openingBalance = 0): Account =>
  ({
    id: 'a1',
    name: 'Bank/Cash/Debit Card',
    type: 'Bank',
    currency: 'INR',
    amount: 0,
    openingBalance,
    icon: '🏦',
    excluded: false,
  }) as Account;

const txn = (t: Partial<Transaction>): Transaction =>
  ({ id: Math.random().toString(36), amount: 0, ...t }) as Transaction;

const THIS_MONTH = '2026-08';
const TODAY = '2026-08-17';

// ---------- previousMonth ----------

check('previous month steps back', previousMonth('2026-08') === '2026-07');
check('previous month crosses the year', previousMonth('2026-01') === '2025-12');
check('a malformed month is left alone', previousMonth('nope') === 'nope');

// ---------- the three figures reconcile ----------

const txns: Transaction[] = [
  // Closed months.
  txn({ kind: 'income', accountId: 'a1', amount: 10000, date: '2026-06-10' }),
  txn({ kind: 'expense', accountId: 'a1', amount: 2000, date: '2026-07-05' }),
  // Current month.
  txn({ kind: 'income', accountId: 'a1', amount: 50000, date: '2026-08-01' }),
  txn({ kind: 'expense', accountId: 'a1', amount: 5000, date: '2026-08-09' }),
];

const a = acc(1000);
const existing = accountExistingAmount(a, txns, THIS_MONTH);
const income = accountMonthIncome('a1', txns, THIS_MONTH);
const expense = accountMonthExpense('a1', txns, THIS_MONTH);
const live = accountBalance(a, txns);

// 1000 opening + 10000 June income − 2000 July expense = 9000 at end of July.
check('existing is last month’s closing balance', existing === 9000);
check('current month income is isolated', income === 50000);
check('current month expense is isolated', expense === 5000);
check('existing + income − expense equals the live balance', existing + income - expense === live);
check('the live balance is unchanged by the rework', live === 54000);

// A month with no activity still reports last month's close.
const quiet = accountExistingAmount(acc(700), [], THIS_MONTH);
check('an empty account reports its opening balance', quiet === 700);

// ---------- monthly balance list ----------

const months = accountMonthlyBalances(a, txns, THIS_MONTH, TODAY);
check(
  'the current month is left out of the list',
  !months.some((m) => m.month === THIS_MONTH),
);
check('closed months with activity are listed', months.length === 2);
check('the list is newest first', months[0].month === '2026-07' && months[1].month === '2026-06');
check('July closes at the existing amount', months[0].balance === 9000);
check('June closes before the July expense', months[1].balance === 11000);

// Only current-month activity means nothing closed yet.
const freshOnly = accountMonthlyBalances(
  acc(0),
  [txn({ kind: 'expense', accountId: 'a1', amount: 100, date: '2026-08-02' })],
  THIS_MONTH,
  TODAY,
);
check('a brand new account lists no closed months', freshOnly.length === 0);

// ---------- transfers ----------

// Transfers are neither income nor expense, so a current-month transfer is the
// one case where the three figures cannot add up to the live balance.
const withTransfer: Transaction[] = [
  ...txns,
  txn({
    kind: 'transfer',
    fromAccountId: 'a1',
    toAccountId: 'other',
    amount: 3000,
    date: '2026-08-12',
  }),
];
const liveT = accountBalance(a, withTransfer);
const existingT = accountExistingAmount(a, withTransfer, THIS_MONTH);
const gap =
  liveT -
  (existingT +
    accountMonthIncome('a1', withTransfer, THIS_MONTH) -
    accountMonthExpense('a1', withTransfer, THIS_MONTH));
check('a current-month transfer is the only gap, and it is the transfer amount', gap === -3000);
check('a transfer in a closed month lands in existing', existingT === 9000);

console.log(fail === 0 ? '\nall passed' : `\n${fail} failed`);
