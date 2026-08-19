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

console.log('\n-- a bill the app credited to the card twice --');
const key = (body, date = '2026-08-18') => `hdfc|${date}|2500|HDFCBK|${body}`;
const BANK_SMS = 'Rs.2500.00 debited from A/c XX1234 towards HDFC Bank Credit Card XX9999 bill payment';
const CARD_SMS = 'Payment of Rs.2500.00 received towards your HDFC Bank Credit Card XX9999';
const importedTransfer = (id, date, body) => ({ id, kind: 'transfer', category: 'Credit Card Bill', amount: 2500, date, note: 'Bank · Card bill', fromAccountId: 'b1', toAccountId: 'c1', importKey: key(body, date) });

// The card's own SMS came six days late, so each leg booked its own transfer.
const twiceAsTransfers = [
  spend(2500),
  importedTransfer('t1', '2026-08-12', BANK_SMS),
  importedTransfer('t2', '2026-08-18', CARD_SMS),
];
const r5 = CB.repairImportedCardBills(booksOf(twiceAsTransfers, accts));
check("the card's copy goes", { dropped: r5.dropped, left: r5.state.books[0].finance.transactions.length }, { dropped: 1, left: 2 });
check('so the card is cleared once', limits(accts, r5.state.books[0].finance.transactions), { total: 50000, used: 0, available: 50000 });
check('and the bank is emptied once', bankOf(accts, r5.state.books[0].finance.transactions), { expenses: 2500, income: 0 });
check('re-running finds nothing left', CB.repairImportedCardBills(r5.state).changed, false);

// The older shape: a transfer plus the card credit the first repair left behind.
const transferPlusCredit = [
  spend(2500),
  importedTransfer('t1', '2026-08-12', BANK_SMS),
  { id: 'x2', kind: 'income', category: 'Credit Card Bill', amount: 2500, date: '2026-08-18', note: 'Card · Card bill', accountId: 'c1', importKey: key(CARD_SMS) },
];
const r6 = CB.repairImportedCardBills(booksOf(transferPlusCredit, accts));
check('the leftover credit goes', { dropped: r6.dropped, left: r6.state.books[0].finance.transactions.length }, { dropped: 1, left: 2 });
check('so headroom stops exceeding the limit', limits(accts, r6.state.books[0].finance.transactions), { total: 50000, used: 0, available: 50000 });

// Two real payments of the same amount, both from the bank's own SMS: not a pair.
const twoRealBills = [
  importedTransfer('t1', '2026-08-12', BANK_SMS),
  importedTransfer('t2', '2026-08-15', BANK_SMS),
];
const r7 = CB.repairImportedCardBills(booksOf(twoRealBills, accts));
check('two genuine payments both stand', { changed: r7.changed, left: r7.state.books[0].finance.transactions.length }, { changed: false, left: 2 });

console.log('\n-- a limit typed in over credit the card already carried --');
// Bills paid for spends the app never saw leave the card in credit, and with no
// limit that credit is all the headroom there is to report.
const carrying = [billTransfer(72267, 'p0')];
check('with no limit the credit is the limit', limits([bank(0), card(0)], carrying), { total: 72267, used: 0, available: 72267 });

// Then the real limit is entered. It replaces that guess instead of adding to it.
const held = CB.creditToHoldAside(card(0), carrying);
check('the credit to hold aside is the credit on the card', held, 72267);
const withLimit = { ...card(415000), creditBeforeLimit: held };
check('so nothing spent means the whole limit is available', limits([bank(0), withLimit], carrying), { total: 415000, used: 0, available: 415000 });
check('a later spend still uses the limit up', limits([bank(0), withLimit], [...carrying, spend(50000)]), { total: 415000, used: 50000, available: 365000 });
check('and paying that bill frees it again', limits([bank(0), withLimit], [...carrying, spend(50000), billTransfer(50000, 'p2')]), { total: 415000, used: 0, available: 415000 });
check('a genuine overpayment after the limit still shows', limits([bank(0), withLimit], [...carrying, spend(10000), billTransfer(15000, 'p3')]), { total: 415000, used: 0, available: 420000 });
// A card that owes money has nothing to hold aside: that is real spending.
check('a card in debt holds nothing aside', CB.creditToHoldAside(card(0), [spend(2500)]), 0);

console.log('\n-- repairing a limit that was already typed in over credit --');
const preLimit = CB.absorbCreditBeforeLimit(booksOf(carrying, [bank(0), card(415000)]));
check('the card is put right once', { changed: preLimit.changed, cards: preLimit.cards }, { changed: true, cards: 1 });
check(
  'and reads its limit again',
  limits(preLimit.state.books[0].finance.accounts, carrying),
  { total: 415000, used: 0, available: 415000 },
);
check('re-running changes nothing', CB.absorbCreditBeforeLimit(preLimit.state).changed, false);
check(
  'a card with spends against its limit is left alone',
  CB.absorbCreditBeforeLimit(booksOf([spend(2500)], [bank(0), card(50000)])).changed,
  false,
);
check(
  'a card with no limit is left alone',
  CB.absorbCreditBeforeLimit(booksOf(carrying, [bank(0), card(0)])).changed,
  false,
);

console.log('\n-- the workings behind the figures --');
const audit = (accounts, txns, id = 'c1') =>
  CB.cardLimitAudit(accounts.find((a) => a.id === id), txns);
const summary = (a) => ({ limit: a.limit, credits: a.credits, charges: a.charges, unexplained: a.unexplained });

check(
  'a spend and a bill balance out',
  summary(audit([bank(0), card(50000)], [spend(2500), billTransfer(2500)])),
  { limit: 50000, credits: 2500, charges: 2500, unexplained: 0 },
);
// The shape the user is looking at: more credit than the card was ever charged.
check(
  'credit beyond the charges is named',
  summary(audit([bank(0), card(50000)], [spend(2500), billTransfer(2500, 'p1'), billTransfer(2500, 'p2')])),
  { limit: 50000, credits: 5000, charges: 2500, unexplained: 2500 },
);
const doubled = audit([bank(0), card(50000)], [billTransfer(2500, 'p1'), billTransfer(2500, 'p2')]);
check('and both suspect credits are flagged', doubled.creditRows.map((r) => r.maybeDuplicate), [true, true]);
check(
  'a lone credit is not',
  audit([bank(0), card(50000)], [billTransfer(2500)]).creditRows.map((r) => r.maybeDuplicate),
  [false],
);
check(
  'with no limit entered there is nothing to exceed',
  summary(audit([bank(0), card(0)], [billTransfer(2500)])),
  { limit: 0, credits: 2500, charges: 0, unexplained: 0 },
);
// With credit held aside the lines still account for the whole balance:
// credits − charges − held aside = available − limit.
const heldAudit = audit([bank(0), withLimit], carrying);
check(
  'the credit a limit replaced is shown as such',
  { credits: heldAudit.credits, charges: heldAudit.charges, heldAside: heldAudit.heldAside, unexplained: heldAudit.unexplained },
  { credits: 72267, charges: 0, heldAside: 72267, unexplained: 0 },
);

check(
  "another card's rows stay out of it",
  summary(audit([bank(0), card(50000, 'c1'), card(20000, 'c2')], [{ id: 'p9', kind: 'transfer', category: 'Credit Card Bill', amount: 900, date: '2026-08-18', note: '', fromAccountId: 'b1', toAccountId: 'c2' }])),
  { limit: 50000, credits: 0, charges: 0, unexplained: 0 },
);

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

const bankSms = (date) => msg(`Rs.2500.00 debited from A/c XX1234 on ${date} towards HDFC Bank Credit Card XX9999 bill payment. -HDFC Bank`, date);
const cardSms = (date) => msg(`Payment of Rs.2500.00 received towards your HDFC Bank Credit Card XX9999. Thank you.`, date);
const rows = (messages) => P.parseImportMessages(messages, R.BUILTIN_IMPORT_RULES);

// The issuer took six days to acknowledge the payment.
check('a slow card credit still pairs', rows([bankSms('2026-08-12'), cardSms('2026-08-18')]).length, 1);

// A fixed monthly bill: every month must find its own second SMS, not just the
// first month scanned.
check(
  'a monthly bill of the same amount stays one row per month',
  rows([bankSms('2026-08-18'), cardSms('2026-08-19'), bankSms('2026-07-18'), cardSms('2026-07-19')]).length,
  2,
);

// Two real payments of the same amount days apart: two bank SMS, so two rows.
check('two bank debits days apart stay separate', rows([bankSms('2026-08-12'), bankSms('2026-08-18')]).length, 2);

console.log(failures ? `\n${failures} failing case(s)` : '\nall cases pass');
process.exit(failures ? 1 : 0);
