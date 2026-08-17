import {
  accountBalance,
  accountExistingAmount,
  accountMonthExpense,
  accountMonthIncome,
  accountMonthlyBalances,
  accountOpening,
  previousMonth,
} from '../src/utils/accountBalance';
import { creditCardAccountIds, isCardBillTransfer } from '../src/cashBooks';
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

// ---------- a credit card bill payment ----------

// The limit is the card's opening balance, so the card's balance is the limit
// still available. Paying the bill must restore it without booking an expense.
const card = {
  id: 'c1',
  name: 'Credit Card',
  type: 'Card',
  currency: 'INR',
  amount: 0,
  openingBalance: 200000,
  icon: '💳',
  excluded: false,
} as Account;
const bank = acc(80000);

const spends: Transaction[] = [
  txn({ kind: 'expense', accountId: 'c1', amount: 35000, date: '2026-08-04' }),
];
check('a card spend eats into the available limit', accountBalance(card, spends) === 165000);

const billPaid: Transaction[] = [
  ...spends,
  txn({
    kind: 'transfer',
    category: 'Credit Card Bill',
    fromAccountId: 'a1',
    toAccountId: 'c1',
    amount: 35000,
    date: '2026-08-15',
  }),
];
check('paying the bill restores the available limit', accountBalance(card, billPaid) === 200000);
check('paying the bill takes the money out of the bank', accountBalance(bank, billPaid) === 45000);
check(
  'the bill is not a second expense on the card',
  accountMonthExpense('c1', billPaid, THIS_MONTH) === 35000,
);
check(
  'the bill is not an expense on the bank either',
  accountMonthExpense('a1', billPaid, THIS_MONTH) === 0,
);
check(
  'the bill is not income on the card',
  accountMonthIncome('c1', billPaid, THIS_MONTH) === 0,
);

// Booking the bill as a bank expense instead would have counted the same
// ₹35,000 twice across the two accounts.
const billAsExpense: Transaction[] = [
  ...spends,
  txn({ kind: 'expense', accountId: 'a1', amount: 35000, date: '2026-08-15' }),
];
const totalExpense = (list: Transaction[]) =>
  accountMonthExpense('a1', list, THIS_MONTH) + accountMonthExpense('c1', list, THIS_MONTH);
check('the transfer keeps the month total at the amount spent', totalExpense(billPaid) === 35000);
check('an expense would have doubled the month total', totalExpense(billAsExpense) === 70000);

// ---------- the three figures shown for a credit card ----------

const cardFigures = (list: Transaction[]) => {
  const total = accountOpening(card, list);
  const available = accountBalance(card, list);
  return { total, available, utilised: total - available };
};

const afterSpend = cardFigures(spends);
check('total credit limit is the opening balance', afterSpend.total === 200000);
check('available limit is what is left of it', afterSpend.available === 165000);
check('limit utilised is the difference', afterSpend.utilised === 35000);
check(
  'utilised plus available is the total limit',
  afterSpend.utilised + afterSpend.available === afterSpend.total,
);

const afterBill = cardFigures(billPaid);
check('paying the bill frees the whole limit again', afterBill.available === 200000);
check('paying the bill drops utilisation to zero', afterBill.utilised === 0);
check('paying the bill leaves the total limit alone', afterBill.total === 200000);

// A card whose limit was never set reads as fully over-utilised rather than
// silently showing a healthy balance.
const noLimitCard = { ...card, openingBalance: 0 } as Account;
check('a card with no limit set reports none', accountOpening(noLimitCard, spends) === 0);
check(
  'its spend shows as a negative available limit',
  accountBalance(noLimitCard, spends) === -35000,
);

// ---------- which transfers count as money spent ----------

const cardIds = creditCardAccountIds([bank, card]);
const asTransfer = (from: string | undefined, to: string | undefined) =>
  txn({ kind: 'transfer', fromAccountId: from, toAccountId: to, amount: 100, date: TODAY });

check('bank to card is a bill payment', isCardBillTransfer(asTransfer('a1', 'c1'), cardIds));
check('card to bank is not', !isCardBillTransfer(asTransfer('c1', 'a1'), cardIds));
check('bank to another own account is not', !isCardBillTransfer(asTransfer('a1', 'w1'), cardIds));
check('card to card is not', !isCardBillTransfer(asTransfer('c1', 'c1'), cardIds));
check(
  'a transfer with no destination is not',
  !isCardBillTransfer(asTransfer('a1', undefined), cardIds),
);
check(
  'a plain expense is not',
  !isCardBillTransfer(
    txn({ kind: 'expense', accountId: 'a1', amount: 100, date: TODAY }),
    cardIds,
  ),
);

// What the Home tile and the expense list now add up for the bank: its own
// spends plus the bill, and the card's spends stay out of it.
const bankSpentThisMonth = (list: Transaction[]) =>
  list
    .filter((t) => t.date.startsWith(THIS_MONTH))
    .reduce((sum, t) => {
      if (t.kind === 'expense' && t.accountId === 'a1') return sum + t.amount;
      if (isCardBillTransfer(t, cardIds) && t.fromAccountId === 'a1') return sum + t.amount;
      return sum;
    }, 0);

check('without a bill the bank shows only its own spends', bankSpentThisMonth(txns) === 5000);
check('the bill adds to what left the bank', bankSpentThisMonth([...txns, ...billPaid]) === 40000);
check(
  'the card spend never lands on the bank',
  bankSpentThisMonth([...txns, ...spends]) === 5000,
);

console.log(fail === 0 ? '\nall passed' : `\n${fail} failed`);
