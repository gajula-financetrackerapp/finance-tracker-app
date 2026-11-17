const { accountBalance } = require('../.tmp-cloud/utils/accountBalance.js');
const {
  filterCashBooksSince,
  mergeCloudIntoLocalBooks,
} = require('../.tmp-cloud/cashBooks.js');

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'ok ' : 'FAIL'} ${name}`);
  if (!ok) {
    console.error('  expected:', expected);
    console.error('  actual:  ', actual);
    process.exitCode = 1;
  }
}

const account = {
  id: 'bank',
  name: 'Bank/Cash/Debit Card',
  type: 'Bank',
  currency: 'INR',
  amount: 1400,
  openingBalance: 1000,
  icon: '🏦',
};
const card = {
  id: 'card',
  name: 'Credit Card',
  type: 'Card',
  currency: 'INR',
  amount: 0,
  openingBalance: 0,
  icon: '💳',
};
const oldIncome = {
  id: 'old-income',
  kind: 'income',
  category: 'Salary',
  amount: 500,
  date: '2023-01-01',
  note: '',
  accountId: 'bank',
};
const recentExpense = {
  id: 'recent-expense',
  kind: 'expense',
  category: 'Food',
  amount: 100,
  date: '2025-01-01',
  note: '',
  accountId: 'bank',
};

function state(transactions, extra = {}) {
  return {
    activeBookId: 'book',
    books: [
      {
        id: 'book',
        name: 'Business',
        icon: '💼',
        finance: {
          accounts: [account, card],
          transactions,
          budget: 0,
          categoryBudgets: [],
          defaultAccountId: 'bank',
          ...extra,
        },
      },
    ],
  };
}

const full = state([oldIncome, recentExpense]);
const retained = filterCashBooksSince(full, '2024-01-01');
const retainedFinance = retained.books[0].finance;
check('retention removes only old rows', retainedFinance.transactions.map((t) => t.id), [
  'recent-expense',
]);
check(
  'retention folding preserves the live balance',
  accountBalance(retainedFinance.accounts[0], retainedFinance.transactions),
  accountBalance(account, full.books[0].finance.transactions),
);

const deletedLocal = state([], { deletedTransactionIds: ['recent-expense'] });
const staleCloud = state([recentExpense]);
const tombstoneMerge = mergeCloudIntoLocalBooks(deletedLocal, staleCloud);
check(
  'a cloud copy cannot resurrect a deleted transaction',
  tombstoneMerge.books[0].finance.transactions.map((t) => t.id),
  [],
);

const mergedFull = mergeCloudIntoLocalBooks(full, retained);
const mergedFinance = mergedFull.books[0].finance;
check(
  'folded cloud opening is not double-counted into full local history',
  accountBalance(mergedFinance.accounts[0], mergedFinance.transactions),
  1400,
);

const cloudOnlyAccount = {
  id: 'savings',
  name: 'Savings',
  type: 'Bank',
  currency: 'INR',
  amount: 200,
  openingBalance: 200,
  icon: '🏦',
};
const retainedWithNewAccount = JSON.parse(JSON.stringify(retained));
retainedWithNewAccount.books[0].finance.accounts.push(cloudOnlyAccount);
const mergedWithNewAccount = mergeCloudIntoLocalBooks(full, retainedWithNewAccount);
check(
  'retention merge preserves accounts created on another device',
  mergedWithNewAccount.books[0].finance.accounts.some((item) => item.id === 'savings'),
  true,
);

if (process.exitCode) process.exit(process.exitCode);
console.log('\nall cloud-integrity checks passed');
