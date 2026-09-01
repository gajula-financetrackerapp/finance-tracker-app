#!/usr/bin/env node
/**
 * Prove the credit-card figures — what was charged to the cards and what was
 * paid towards them — along with the repair of bills imported before they were
 * booked as transfers, and the clearing of limits saved by older builds.
 *
 * Compile first, since it is TypeScript:
 *   npx tsc src/cashBooks.ts src/lib/importRules/parseImportText.ts \
 *     src/lib/importRules/builtinRules.ts --outDir .tmp-card --module commonjs \
 *     --target es2019 --skipLibCheck --moduleResolution node
 *   node scripts/check-card-summary.js
 */
const path = require('path');

const OUT = path.resolve(process.argv[2] || process.env.CARD_OUT || '.tmp-card');
const CB = require(path.join(OUT, 'cashBooks.js'));
const P = require(path.join(OUT, 'lib', 'importRules', 'parseImportText.js'));
const R = require(path.join(OUT, 'lib', 'importRules', 'builtinRules.js'));
const CLEAN = require(path.join(OUT, 'lib', 'importRules', 'cleanupImports.js'));

let failures = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'BAD '}${name}`);
  if (!ok) console.log(`       got ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
}

const bank = (opening) => ({ id: 'b1', name: 'Bank/Cash/Debit Card', type: 'Bank', currency: 'INR', openingBalance: opening, amount: opening, excluded: false });
const card = (opening, id = 'c1') => ({ id, name: id === 'c1' ? 'Credit Card' : 'Credit Card 2', type: 'Card', currency: 'INR', openingBalance: opening, amount: opening, excluded: false });

const spend = (amount, id = 's1', date = '2026-08-12') => ({ id, kind: 'expense', category: 'Shopping', amount, date, note: 'Card', accountId: 'c1' });
const billTransfer = (amount, id = 'p1', date = '2026-08-18') => ({ id, kind: 'transfer', category: 'Credit Card Bill', amount, date, note: 'Bank · Card bill', fromAccountId: 'b1', toAccountId: 'c1' });

const accts = [bank(20000), card(0)];
const cardsOf = (accounts, txns, inPeriod = () => true) => {
  const c = CB.cardSideTotals(accounts, txns, inPeriod);
  return { expenses: c.expenses, billPaid: c.billPaid };
};
const bankOf = (accounts, txns) => {
  const b = CB.bankSideTotals(accounts, txns, () => true);
  return { expenses: b.expenses, income: b.income };
};
/** Everything out, everything in, and what the two come to. */
const bankRow = (accounts, txns) => {
  const b = CB.bankSideTotals(accounts, txns, () => true);
  return { expenses: b.expenses, income: b.income, balance: b.balance };
};

console.log('-- what the card row reports --');
check('a card spend is charged to the card', cardsOf(accts, [spend(2500)]), { expenses: 2500, billPaid: 0 });
check('a bill payment is money paid towards it', cardsOf(accts, [billTransfer(2500)]), { expenses: 0, billPaid: 2500 });
// The two figures stand alone: paying a bill never rubs out the spend it settled,
// which is what made the old limit figures contradict themselves.
check('both stand together', cardsOf(accts, [spend(2500), billTransfer(2500)]), { expenses: 2500, billPaid: 2500 });
check('paying more than was spent is still just what was paid', cardsOf(accts, [spend(2500), billTransfer(5000)]), { expenses: 2500, billPaid: 5000 });
check('a bill with no spend recorded reports only the payment', cardsOf(accts, [billTransfer(72267)]), { expenses: 0, billPaid: 72267 });
check(
  'a limit left on the card changes nothing',
  cardsOf([bank(0), card(415000)], [spend(2500), billTransfer(2500)]),
  { expenses: 2500, billPaid: 2500 },
);

console.log('\n-- which rows count --');
check(
  'spends on every card add up',
  cardsOf(
    [bank(0), card(0, 'c1'), card(0, 'c2')],
    [spend(2500), { id: 's2', kind: 'expense', category: 'Food', amount: 1000, date: '2026-08-12', note: '', accountId: 'c2' }],
  ),
  { expenses: 3500, billPaid: 0 },
);
check('a card is counted once it exists', CB.cardSideTotals([bank(0), card(0)], [], () => true).count, 1);
check('no card reports nothing', CB.cardSideTotals([bank(0)], [], () => true).count, 0);
check('an excluded card drops out', CB.cardSideTotals([bank(0), { ...card(0), excluded: true }], [], () => true).count, 0);
check('a bank spend is not the card’s', cardsOf(accts, [{ id: 'e1', kind: 'expense', category: 'Food', amount: 300, date: '2026-08-14', note: '', accountId: 'b1' }]), { expenses: 0, billPaid: 0 });
check(
  'a refund credited to the card is not a bill paid',
  cardsOf(accts, [{ id: 'i1', kind: 'income', category: 'Cashback', amount: 200, date: '2026-08-14', note: '', accountId: 'c1' }]),
  { expenses: 0, billPaid: 0 },
);
check(
  'the period filter is respected',
  cardsOf(accts, [spend(2500, 's1', '2026-07-30'), spend(400, 's2', '2026-08-03')], (txn) =>
    txn.date.startsWith('2026-08'),
  ),
  { expenses: 400, billPaid: 0 },
);

console.log('\n-- what the bank row reports --');
// Everything the bank paid out is an expense, the bill included: it left the
// account like any other payment, and the balance has to be the two figures
// beside it subtracted, or nobody can check the row by eye.
check(
  'a bill the bank paid is bank spending',
  bankRow(accts, [spend(2500), billTransfer(2500)]),
  { expenses: 2500, income: 0, balance: -2500 },
);
check('a card spend is not', bankRow(accts, [spend(2500)]), { expenses: 0, income: 0, balance: 0 });
check(
  'what the bank itself buys is',
  bankRow(accts, [{ id: 'e1', kind: 'expense', category: 'Food', amount: 300, date: '2026-08-14', note: '', accountId: 'b1' }]),
  { expenses: 300, income: 0, balance: -300 },
);
const monthRows = [
  { id: 'sal', kind: 'income', category: 'Salary', amount: 50000, date: '2026-08-01', note: '', accountId: 'b1' },
  { id: 'e2', kind: 'expense', category: 'Food', amount: 2000, date: '2026-08-05', note: '', accountId: 'b1' },
  spend(3000),
  billTransfer(2500),
];
check(
  'a month of pay, a spend, a card spend and a bill',
  bankRow(accts, monthRows),
  { expenses: 4500, income: 50000, balance: 45500 },
);
check('the card keeps its own spending', cardsOf(accts, monthRows), { expenses: 3000, billPaid: 2500 });
const m = bankRow(accts, monthRows);
check('and the row adds up as printed', m.income - m.expenses, m.balance);

console.log('\n-- clearing limits saved by older builds --');
const booksOf = (txns, accounts) => ({
  activeBookId: 'k1',
  books: [{ id: 'k1', name: 'Personal', icon: '📒', finance: { accounts, transactions: txns, defaultAccountId: 'b1' } }],
});
const withLimit = CB.clearStoredCardLimits(booksOf([spend(2500)], [bank(20000), card(415000)]));
check('the limit is cleared off the card', { changed: withLimit.changed, cards: withLimit.cards }, { changed: true, cards: 1 });
check(
  'so it stops reading as money in the account',
  withLimit.state.books[0].finance.accounts.map((a) => a.openingBalance),
  [20000, 0],
);
check('the card is left owing what it owes', withLimit.state.books[0].finance.accounts[1].amount, -2500);
check('re-running changes nothing', CB.clearStoredCardLimits(withLimit.state).changed, false);
check('a card with no limit is left alone', CB.clearStoredCardLimits(booksOf([], [bank(0), card(0)])).changed, false);
check(
  'the bank keeps its own opening balance',
  CB.clearStoredCardLimits(booksOf([], [bank(20000)])).changed,
  false,
);

console.log('\n-- repairing bills imported before they were transfers --');
// The broken case: bank debited, card untouched.
const oneSided = [
  spend(2500),
  { id: 'x1', kind: 'expense', category: 'Others', amount: 2500, date: '2026-08-18', note: 'Bank · Card bill', accountId: 'b1', importKey: 'fp-bank' },
];
const r1 = CB.repairImportedCardBills(booksOf(oneSided, accts));
check('one-sided bill is rebooked', r1.fixed, 1);
check('and now reads as paid towards the card', cardsOf(accts, r1.state.books[0].finance.transactions), { expenses: 2500, billPaid: 2500 });
check('while still emptying the bank', bankRow(accts, r1.state.books[0].finance.transactions).expenses, 2500);

// Both legs imported: net effect was already right, so it must stay right.
const bothLegs = [
  spend(2500),
  { id: 'x1', kind: 'expense', category: 'Others', amount: 2500, date: '2026-08-18', note: 'Bank · Card bill', accountId: 'b1', importKey: 'fp-bank' },
  { id: 'x2', kind: 'income', category: 'Others', amount: 2500, date: '2026-08-19', note: 'Card · Card bill', accountId: 'c1', importKey: 'fp-card' },
];
const r2 = CB.repairImportedCardBills(booksOf(bothLegs, accts));
check('the pair becomes one transfer', r2.state.books[0].finance.transactions.length, 2);
check('the bill is counted once', cardsOf(accts, r2.state.books[0].finance.transactions), { expenses: 2500, billPaid: 2500 });
check('bank is not emptied twice', bankRow(accts, r2.state.books[0].finance.transactions).expenses, 2500);

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
check('so one bill is reported, not two', cardsOf(accts, r5.state.books[0].finance.transactions), { expenses: 2500, billPaid: 2500 });
check('and the bank is emptied once', bankRow(accts, r5.state.books[0].finance.transactions).expenses, 2500);
check('re-running finds nothing left', CB.repairImportedCardBills(r5.state).changed, false);

// The older shape: a transfer plus the card credit the first repair left behind.
const transferPlusCredit = [
  spend(2500),
  importedTransfer('t1', '2026-08-12', BANK_SMS),
  { id: 'x2', kind: 'income', category: 'Credit Card Bill', amount: 2500, date: '2026-08-18', note: 'Card · Card bill', accountId: 'c1', importKey: key(CARD_SMS) },
];
const r6 = CB.repairImportedCardBills(booksOf(transferPlusCredit, accts));
check('the leftover credit goes', { dropped: r6.dropped, left: r6.state.books[0].finance.transactions.length }, { dropped: 1, left: 2 });
check('so the bill is not counted twice', cardsOf(accts, r6.state.books[0].finance.transactions), { expenses: 2500, billPaid: 2500 });

// Two real payments of the same amount, both from the bank's own SMS: not a pair.
const twoRealBills = [
  importedTransfer('t1', '2026-08-12', BANK_SMS),
  importedTransfer('t2', '2026-08-15', BANK_SMS),
];
const r7 = CB.repairImportedCardBills(booksOf(twoRealBills, accts));
check('two genuine payments both stand', { changed: r7.changed, left: r7.state.books[0].finance.transactions.length }, { changed: false, left: 2 });

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

console.log('\n-- a bill paid through an app empties the bank only once --');
// Through CRED the bank gives up one sum to the app and the card is credited
// another, cashback and all. Both SMS arrive, and charging the bank for the
// card's side as well emptied it twice: 900 out, then 904 out again.
const credRows = rows([
  msg('Rs.900.00 debited from A/c XX1234 to CRED Club by UPI 4455 on 04-08-26', '2026-08-04'),
  msg(
    'HDFC Bank Cardmember, Online Payment of Rs.904 vide Ref# 216BSEP42GD5U9G was credited to your card ending 2731 On 05/AUG/2026 value Date 04/AUG/2026',
    '2026-08-05',
  ),
]);
check('two rows, since the amounts differ', credRows.length, 2);
const credCard = credRows.find((r) => r.amount === 904);
check(
  "the card's own credit lands on the card",
  { kind: credCard.kind, pay: credCard.paymentType, to: credCard.toPaymentType || null },
  { kind: 'income', pay: 'card', to: null },
);

const asBooked = (row) => {
  const asTransfer = row.kind === 'transfer' && row.toPaymentType === 'card';
  return {
    id: row.fingerprint,
    kind: asTransfer ? 'transfer' : row.kind,
    category: row.category,
    amount: row.amount,
    date: row.date,
    note: row.note,
    importKey: row.fingerprint,
    ...(asTransfer
      ? { fromAccountId: 'b1', toAccountId: 'c1' }
      : { accountId: row.paymentType === 'card' ? 'c1' : 'b1' }),
  };
};
const credBooks = credRows.map(asBooked);
check('the bank gives up only what left it', bankRow(accts, credBooks), { expenses: 900, income: 0, balance: -900 });
check('and the card counts the bill as paid', cardsOf(accts, credBooks), { expenses: 0, billPaid: 904 });
// The repair pass must leave this alone: the two are not two halves of one leg.
check(
  'the repair leaves both standing',
  CB.repairImportedCardBills(booksOf(credBooks, accts)).changed,
  false,
);

// Paid straight from the bank, the bank really did pay, and still says so.
const directBooks = rows([bankSms('2026-08-18'), cardSms('2026-08-18')]).map(asBooked);
check('a bill paid from the bank still empties it', bankRow(accts, directBooks), { expenses: 2500, income: 0, balance: -2500 });
check('and counts once on the card', cardsOf(accts, directBooks), { expenses: 0, billPaid: 2500 });

console.log('\n-- rebooking bills already saved as though the bank paid --');
const CRED_CARD_SMS =
  'HDFC Bank Cardmember, Online Payment of Rs.904 vide Ref# 216BSEP42GD5U9G was credited to your card ending 2731 On 05/AUG/2026 value Date 04/AUG/2026';
const savedAsTransfer = [
  { id: 'cred-bank', kind: 'expense', category: 'Others', amount: 900, date: '2026-08-04', note: 'UPI · Bank · CRED Club', accountId: 'b1', importKey: `upi-debit|2026-08-04|900|HDFCBK|Rs.900.00 debited from A/c XX1234 to CRED Club` },
  { id: 'cred-card', kind: 'transfer', category: 'Credit Card Bill', amount: 904, date: '2026-08-05', note: 'Bank · Card bill', fromAccountId: 'b1', toAccountId: 'c1', importKey: `card|2026-08-05|904|HDFCBK|${CRED_CARD_SMS}` },
];
check(
  'the bank was emptied twice before',
  bankRow(accts, savedAsTransfer),
  { expenses: 1804, income: 0, balance: -1804 },
);

const reb = CB.rebookCardOnlyBills(booksOf(savedAsTransfer, accts));
const after = reb.state.books[0].finance.transactions;
check('one row is rebooked', { rebooked: reb.rebooked, changed: reb.changed }, { rebooked: 1, changed: true });
const rebookedRow = after.find((t) => t.id === 'cred-card');
check(
  'now a credit sitting on the card',
  {
    kind: rebookedRow.kind,
    on: rebookedRow.accountId,
    from: rebookedRow.fromAccountId ?? null,
    to: rebookedRow.toAccountId ?? null,
  },
  { kind: 'income', on: 'c1', from: null, to: null },
);
check('the bank gives up only the 900', bankRow(accts, after), { expenses: 900, income: 0, balance: -900 });
check('and the bill still reads as paid', cardsOf(accts, after), { expenses: 0, billPaid: 904 });
check('re-running changes nothing', CB.rebookCardOnlyBills(reb.state).changed, false);

// A bill the bank itself reported paying keeps both ends.
const bankPaid = [
  { id: 'paid', kind: 'transfer', category: 'Credit Card Bill', amount: 2500, date: '2026-08-18', note: 'Bank · Card bill', fromAccountId: 'b1', toAccountId: 'c1', importKey: `hdfc|2026-08-18|2500|HDFCBK|Rs.2500.00 debited from A/c XX1234 towards HDFC Bank Credit Card XX9999 bill payment` },
];
check('a bank-paid bill is left as a transfer', CB.rebookCardOnlyBills(booksOf(bankPaid, accts)).changed, false);
check('so the bank still shows it going out', bankRow(accts, bankPaid), { expenses: 2500, income: 0, balance: -2500 });

console.log('\n-- what the bank expense figure is made of --');
// Home writes the figure out as a sum, so its parts have to be reported apart:
// a bill is money out of the bank, but it is not a fresh spend.
const mixed = [
  { id: 'shop', kind: 'expense', category: 'Food', amount: 400, date: '2026-08-10', note: '', accountId: 'b1' },
  billTransfer(2500),
  spend(1200),
];
const split = CB.bankSideTotals(accts, mixed, () => true);
check(
  'the bill is named inside the total',
  { expenses: split.expenses, cardBills: split.cardBills },
  { expenses: 2900, cardBills: 2500 },
);
check('leaving what the bank itself spent', split.expenses - split.cardBills, 400);
// The second sum on the note: everything the bank gave up, the bill included,
// plus what the cards are still holding.
check(
  'the month as a whole, bank and cards together',
  split.expenses + cardsOf(accts, mixed).expenses,
  4100,
);
// A month without a bill has nothing to split off.
check('no bill, nothing to name', CB.bankSideTotals(accts, [mixed[0]], () => true).cardBills, 0);

console.log('\n-- one mandate debit, written up by two senders --');
const at = (address, body, date) => ({ id: `${address}${body.slice(0, 12)}${date}`, address, body, date });
const HDFC_MANDATE = at(
  'AD-HDFCBK',
  'HDFC Bank: Rs 14946.00 debited from A/c **9213 towards LEAP INDIA LIMITED on 13-08-26. Application No. ICI58e02431972cb9dce0635728e60ab988, UMN: 578ce517ecd04b8881cbbdc28a84b38b@ybl. If not you, kindly report on 18002586161.',
  '2026-08-13',
);
const APP_SIDE = at(
  'VM-BOBTXN',
  'Rs.14946.00 debited from HDFC Bank XX9213 on 13-AUG-26. Info: UPI Mandate LEAP INDIA. Ref 445566778899.',
  '2026-08-13',
);
check('the pair collapses to one row', rows([HDFC_MANDATE, APP_SIDE]).length, 1);
check('and the survivor remembers the other', (rows([HDFC_MANDATE, APP_SIDE])[0].relatedFingerprints || []).length, 1);
check('the row is still one expense of the right size', rows([HDFC_MANDATE, APP_SIDE])[0].amount, 14946);

// The same UMN quoted on both sides is proof, whatever else the wording is.
check(
  'a shared mandate number is enough',
  rows([
    HDFC_MANDATE,
    at('VM-PHONEP', 'Rs.14946.00 paid for your subscription. UMN: 578ce517ecd04b8881cbbdc28a84b38b. -PhonePe', '2026-08-13'),
  ]).length,
  1,
);

// Two payments that merely share an amount and a day are two payments.
check(
  'the same bank saying it twice is two debits',
  rows([
    at('AD-HDFCBK', 'HDFC Bank: Rs 500.00 debited from A/c **9213 towards SWIGGY on 13-08-26. Ref 111111111111', '2026-08-13'),
    at('AD-HDFCBK', 'HDFC Bank: Rs 500.00 debited from A/c **9213 towards BLINKIT on 13-08-26. Ref 222222222222', '2026-08-13'),
  ]).length,
  2,
);
check(
  'and neither is a mandate to pair with',
  rows([
    at('AD-HDFCBK', 'HDFC Bank: Rs 500.00 debited from A/c **9213 towards SWIGGY on 13-08-26. Ref 111111111111', '2026-08-13'),
    at('VM-ICICIB', 'Rs.500.00 debited from ICICI Bank XX4321 on 13-AUG-26. Info: BLINKIT. Ref 222222222222', '2026-08-13'),
  ]).length,
  2,
);
check(
  'a mandate a week later is next month\u2019s bill',
  rows([
    HDFC_MANDATE,
    at('VM-BOBTXN', 'Rs.14946.00 debited from HDFC Bank XX9213 on 20-AUG-26. Info: UPI Mandate LEAP INDIA. Ref 998877665544.', '2026-08-20'),
  ]).length,
  2,
);

console.log('\n-- moving money between your own accounts keeps both ends --');
// One UPI reference, two banks: HDFC says it left, Kotak says it arrived. The
// shared reference makes them one movement, not one message told twice.
const OWN_TRANSFER = [
  at('AD-KOTAKB', 'Received Rs.20000.00 in your Kotak Bank AC X6178 from 7036623867hdfc@ybl on 04-08-26.UPI Ref:511204758027.', '2026-08-04'),
  at('VM-HDFCBK', 'Sent Rs.20000.00\nFrom HDFC Bank A/C *1739\nTo GAJULA RAM KUMAR\nOn 04/08/26\nRef 511204758027\nNot You?\nCall 18002586161', '2026-08-04'),
  at('AD-KOTAKB', 'Sent Rs.20000.00 from Kotak Bank AC X6178 to billpay.axb@upi on 04-08-26.UPI Ref 221253071971. Not you, https://kotak.com/KBANKT/Fraud', '2026-08-04'),
];
const ownRows = rows(OWN_TRANSFER);
check('all three stand', ownRows.length, 3);
check(
  'one in, two out',
  { in: ownRows.filter((r) => r.kind === 'income').length, out: ownRows.filter((r) => r.kind === 'expense').length },
  { in: 1, out: 2 },
);
check('and none was folded into another', ownRows.every((r) => !(r.relatedFingerprints || []).length), true);

console.log("\n-- clearing rows an older build made out of a biller's thank-you --");
const keyFor = (ruleId, date, amount, addr, body) =>
  `${ruleId}|${date}|${amount}|${addr}|${body.replace(/\s+/g, ' ').trim().slice(0, 120)}`;
const JIO_ACK =
  'Dear Customer, \nPayment of Rs. 683.27 for your JioHome connection with JioFixedVoice Number +918672314451 through UPI Payments has been received on 20-Aug-26. Thank You!';
const withStrays = [
  { id: 'jio', kind: 'income', category: 'Others', amount: 683.27, date: '2026-08-20', note: 'UPI · Bank', accountId: 'b1', importKey: keyFor('upi-credit', '2026-08-20', 683.27, 'AD-JIOHOM', JIO_ACK) },
  { id: 'salary', kind: 'income', category: 'Salary', amount: 45000, date: '2026-08-01', note: 'Bank', accountId: 'b1', importKey: keyFor('bank-credit', '2026-08-01', 45000, 'AD-SBIINB', 'INR 45,000.00 credited to your A/c XX3456 by NEFT from ACME PAYROLL') },
  { id: 'typed', kind: 'income', category: 'Gift', amount: 500, date: '2026-08-10', note: 'Cash gift', accountId: 'b1' },
];
const swept = CLEAN.dropNoiseImports(booksOf(withStrays, accts));
check('one row swept', { dropped: swept.dropped, changed: swept.changed }, { dropped: 1, changed: true });
check(
  'the salary and the typed row stay',
  swept.state.books[0].finance.transactions.map((t) => t.id),
  ['salary', 'typed'],
);
check('re-running sweeps nothing', CLEAN.dropNoiseImports(swept.state).changed, false);
check('and a book of honest rows is left alone', CLEAN.dropNoiseImports(booksOf(savedAsTransfer, accts)).changed, false);

const PAY_WITH_DUE =
  'Payment of Rs.3000 received towards your HDFC Bank Credit Card XX9999. Total Amount Due Rs.7000. Payment Due Date 18-09-2026.';
const payWithDueBooks = [
  { id: 'pay-due', kind: 'income', category: 'Credit Card Bill', amount: 3000, date: '2026-08-08', note: 'Card · Card bill', accountId: 'c1', importKey: keyFor('card-bill-card', '2026-08-08', 3000, 'VM-HDFCBK', PAY_WITH_DUE) },
];
check(
  'a payment that still quotes total due is not swept as a statement',
  CLEAN.dropNoiseImports(booksOf(payWithDueBooks, accts)).changed,
  false,
);

console.log(failures ? `\n${failures} failing case(s)` : '\nall cases pass');
process.exit(failures ? 1 : 0);
