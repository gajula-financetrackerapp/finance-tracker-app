#!/usr/bin/env node
/**
 * Prove the credit-card figures, and the repair of bills imported before they
 * were booked as transfers.
 *
 * Compile first, since it is TypeScript:
 *   npx tsc src/cashBooks.ts src/lib/importRules/parseImportText.ts \
 *     src/lib/importRules/builtinRules.ts --outDir .tmp-card --module commonjs \
 *     --target es2019 --skipLibCheck --moduleResolution node
 *   node scripts/check-card-limits.js
 */
const path = require('path');

const OUT = path.resolve(process.env.CARD_OUT || '/tmp/cardsim');
const CB = require(path.join(OUT, 'cashBooks.js'));
const P = require(path.join(OUT, 'lib', 'importRules', 'parseImportText.js'));
const R = require(path.join(OUT, 'lib', 'importRules', 'builtinRules.js'));

let failures = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'BAD '}${name}`);
  if (!ok) console.log(`       got ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
}

const bank = (opening) => ({ id: 'b1', name: 'Bank/Cash/Debit Card', type: 'Bank', currency: 'INR', openingBalance: opening, amount: opening, excluded: false });
const card = (opening, id = 'c1') => ({ id, name: id === 'c1' ? 'Credit Card' : 'Credit Card 2', type: 'Card', currency: 'INR', openingBalance: opening, amount: opening, excluded: false });

const spend = (amount, id = 's1') => ({ id, kind: 'expense', category: 'Shopping', amount, date: '2026-08-12', note: 'Card', accountId: 'c1' });
const billTransfer = (amount, id = 'p1') => ({ id, kind: 'transfer', category: 'Credit Card Bill', amount, date: '2026-08-18', note: 'Bank · Card bill', fromAccountId: 'b1', toAccountId: 'c1' });

const limits = (accounts, txns) => {
  const l = CB.creditCardLimits(accounts, txns);
  return { total: l.total, used: l.used, available: l.available };
};

console.log('-- a limit was entered (50,000) --');
check('spend 2500', limits([bank(0), card(50000)], [spend(2500)]), { total: 50000, used: 2500, available: 47500 });
check('spend then bill paid', limits([bank(0), card(50000)], [spend(2500), billTransfer(2500)]), { total: 50000, used: 0, available: 50000 });
check('paid more than owed', limits([bank(0), card(50000)], [spend(2500), billTransfer(5000)]), { total: 50000, used: 0, available: 52500 });

console.log('\n-- no limit entered (0) --');
// What the user confirmed: spending with no limit shows a positive amount used
// and a negative amount available.
check('spend 2500', limits([bank(0), card(0)], [spend(2500)]), { total: 0, used: 2500, available: -2500 });
check('spend then bill paid', limits([bank(0), card(0)], [spend(2500), billTransfer(2500)]), { total: 0, used: 0, available: 0 });
// A bill for spends the app never saw: the credit is the only headroom known.
check('bill paid, no spend recorded', limits([bank(0), card(0)], [billTransfer(2500)]), { total: 2500, used: 0, available: 2500 });
check('part paid, still owing', limits([bank(0), card(0)], [spend(5000), billTransfer(2500)]), { total: 0, used: 2500, available: -2500 });

console.log('\n-- two cards, one with a limit --');
check(
  'limits stay per card',
  limits(
    [bank(0), card(50000, 'c1'), card(0, 'c2')],
    [spend(2500), { id: 's2', kind: 'expense', category: 'Food', amount: 1000, date: '2026-08-12', note: '', accountId: 'c2' }],
  ),
  { total: 50000, used: 3500, available: 46500 },
);

console.log('\n-- the bank side --');
const bankOf = (accounts, txns) => {
  const b = CB.bankSideTotals(accounts, txns, () => true);
  return { expenses: b.expenses, income: b.income };
};
check('a bill empties the bank', bankOf([bank(20000), card(50000)], [spend(2500), billTransfer(2500)]), { expenses: 2500, income: 0 });
check('a card spend does not', bankOf([bank(20000), card(50000)], [spend(2500)]), { expenses: 0, income: 0 });

console.log('\n-- repairing bills imported before the fix --');
const booksOf = (txns, accounts) => ({
  activeBookId: 'k1',
  books: [{ id: 'k1', name: 'Personal', icon: '📒', finance: { accounts, transactions: txns, defaultAccountId: 'b1' } }],
});
const accts = [bank(20000), card(50000)];

// The broken case: bank debited, card untouched.
const oneSided = [
  spend(2500),
  { id: 'x1', kind: 'expense', category: 'Others', amount: 2500, date: '2026-08-18', note: 'Bank · Card bill', accountId: 'b1', importKey: 'fp-bank' },
];
const r1 = CB.repairImportedCardBills(booksOf(oneSided, accts));
check('one-sided bill is rebooked', r1.fixed, 1);
check('and now clears the card', limits(accts, r1.state.books[0].finance.transactions), { total: 50000, used: 0, available: 50000 });
check('while still emptying the bank', bankOf(accts, r1.state.books[0].finance.transactions), { expenses: 2500, income: 0 });

// Both legs imported: net effect was already right, so it must stay right.
const bothLegs = [
  spend(2500),
  { id: 'x1', kind: 'expense', category: 'Others', amount: 2500, date: '2026-08-18', note: 'Bank · Card bill', accountId: 'b1', importKey: 'fp-bank' },
  { id: 'x2', kind: 'income', category: 'Others', amount: 2500, date: '2026-08-19', note: 'Card · Card bill', accountId: 'c1', importKey: 'fp-card' },
];
const r2 = CB.repairImportedCardBills(booksOf(bothLegs, accts));
check('the pair becomes one transfer', r2.state.books[0].finance.transactions.length, 2);
check('card is not cleared twice', limits(accts, r2.state.books[0].finance.transactions), { total: 50000, used: 0, available: 50000 });
check('bank is not emptied twice', bankOf(accts, r2.state.books[0].finance.transactions), { expenses: 2500, income: 0 });

// Ordinary rows must be left alone.
const innocent = [
  spend(2500),
  { id: 'y1', kind: 'expense', category: 'Food', amount: 300, date: '2026-08-14', note: 'Bank · Swiggy', accountId: 'b1', importKey: 'fp-food' },
  { id: 'y2', kind: 'transfer', category: 'Credit Card Bill', amount: 1000, date: '2026-08-15', note: 'manual', fromAccountId: 'b1', toAccountId: 'c1' },
];
const r3 = CB.repairImportedCardBills(booksOf(innocent, accts));
check('nothing else is touched', { fixed: r3.fixed, changed: r3.changed }, { fixed: 0, changed: false });

// Running it twice must not double-book.
const r4 = CB.repairImportedCardBills(r1.state);
check('re-running is a no-op', { fixed: r4.fixed, changed: r4.changed }, { fixed: 0, changed: false });

console.log('\n-- imported SMS still book as one transfer --');
const msg = (body, date) => ({ id: body.slice(0, 10) + date, address: 'HDFCBK', body, date });
const parsed = P.parseImportMessages(
  [
    msg('Rs.2500.00 debited from A/c XX1234 on 18-08-26 towards HDFC Bank Credit Card XX9999 bill payment. -HDFC Bank', '2026-08-18'),
    msg('Payment of Rs.2500.00 received towards your HDFC Bank Credit Card XX9999. Thank you.', '2026-08-18'),
  ],
  R.BUILTIN_IMPORT_RULES,
);
check('two SMS, one row', parsed.length, 1);
check('booked as a transfer onto the card', { kind: parsed[0].kind, to: parsed[0].toPaymentType, cat: parsed[0].category }, { kind: 'transfer', to: 'card', cat: 'Credit Card Bill' });
check('both SMS remembered, so a rescan skips them', (parsed[0].relatedFingerprints || []).length, 1);

console.log(failures ? `\n${failures} failing case(s)` : '\nall cases pass');
process.exit(failures ? 1 : 0);
