#!/usr/bin/env node
/**
 * Statement SMS become a card bill; a later card-credit reduces remaining.
 *
 *   npx tsc src/lib/importRules/parseDueNotice.ts src/lib/importRules/parseImportText.ts \
 *     src/lib/importRules/builtinRules.ts src/lib/cardBills.ts src/lib/cardFaces.ts \
 *     src/lib/cardActivity.ts src/cashBooks.ts \
 *     --outDir .tmp-cardbills --module commonjs --target es2019 --skipLibCheck --moduleResolution node
 *   node scripts/check-card-bills.js .tmp-cardbills
 */
const path = require('path');

const OUT = path.resolve(process.argv[2] || process.env.CARDBILLS_OUT || '.tmp-cardbills');
const D = require(path.join(OUT, 'lib', 'importRules', 'parseDueNotice.js'));
const P = require(path.join(OUT, 'lib', 'importRules', 'parseImportText.js'));
const R = require(path.join(OUT, 'lib', 'importRules', 'builtinRules.js'));
const B = require(path.join(OUT, 'lib', 'cardBills.js'));
const F = require(path.join(OUT, 'lib', 'cardFaces.js'));
const A = require(path.join(OUT, 'lib', 'cardActivity.js'));
const G = require(path.join(OUT, 'lib', 'gmailCardText.js'));

let failures = 0;

function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'BAD '}${label}`);
  if (!ok) console.log(`       got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
}

const STATEMENT =
  'Dear Customer, your HDFC Bank Credit Card 9981 statement is generated. Total Amount Due Rs.10000.00, Min Due Rs.500.00, Payment Due Date 18-09-2026. Ignore if paid.';

const PARTIAL =
  'HDFC Bank Cardmember, Online Payment of Rs.3000 vide Ref# ABC was credited to your card ending 9981 On 08/AUG/2026.';

const FULL =
  'HDFC Bank Cardmember, Online Payment of Rs.7000 vide Ref# DEF was credited to your card ending 9981 On 12/AUG/2026.';

const NEXT_STMT =
  'Dear Customer, your HDFC Bank Credit Card 9981 statement is generated. Total Amount Due Rs.8200.00, Min Due Rs.410.00, Payment Due Date 18-10-2026.';

const OFFER =
  'You are eligible for a pre-approved personal loan. Credit limit Rs.10000 is ready to be used at your convenience. Apply now.';

console.log('-- due notices are read, not imported as transactions --');

const notice = D.parseDueNotice(STATEMENT, { address: 'VM-HDFCBK', date: '2026-08-05' });
check('statement is a due notice', !!notice, true);
check('issuer', notice && notice.issuer, 'HDFC');
check('last4', notice && notice.last4, '9981');
check('total due', notice && notice.totalDue, 10000);
check('min due', notice && notice.minDue, 500);
check('due date', notice && notice.dueDate, '2026-09-18');
check(
  'statement SMS is still not a transaction',
  P.parseImportMessage({ body: STATEMENT, address: 'VM-HDFCBK', date: '2026-08-05' }, []),
  null,
);
check('loan offer is not a due notice', D.parseDueNotice(OFFER, { address: 'VM-HDFCBK' }), null);
check(
  'loan offer is not a card spend',
  B.parseCardSpend(OFFER, { address: 'VM-HDFCBK', date: '2026-08-05', amount: 10000 }),
  null,
);

console.log('\n-- remaining falls on each card credit, new statement replaces --');

const offsets = [1, 0];
let { next } = B.applyCardBillState([], [notice], [], offsets);
check('opens a bill at full due', next[0] && next[0].amount, 10000);
check('unpaid', next[0] && next[0].paid, false);
check('one reminder', next.length, 1);

const pay1 = B.parseCardBillPayment(PARTIAL, { date: '2026-08-08', amount: 3000 });
({ next } = B.applyCardBillState(next, [notice], [pay1], offsets));
check('partial leaves 7000', next[0] && next[0].amount, 7000);
check('still open after partial', next[0] && next[0].paid, false);
check('still one reminder', next.length, 1);

const pay2 = B.parseCardBillPayment(FULL, { date: '2026-08-12', amount: 7000 });
({ next } = B.applyCardBillState(next, [notice], [pay1, pay2], offsets));
check('full pay leaves remaining 0', next[0] && next[0].amount, 0);
check('full pay marks the bill paid', next[0] && next[0].paid, true);

const nextNotice = D.parseDueNotice(NEXT_STMT, { address: 'VM-HDFCBK', date: '2026-09-05' });
({ next } = B.applyCardBillState(next, [notice, nextNotice], [pay1, pay2], offsets));
check('new statement replaces, does not add', next.length, 1);
check('new total is 8200', next[0] && next[0].amount, 8200);
check('new due date', next[0] && next[0].dueDate, '2026-10-18');
check('reopened', next[0] && next[0].paid, false);

const spend =
  'Txn Rs.683.27 On HDFC Bank Card 9981 At jio@citibank by UPI 657918360150 On 01-08';
check('a card spend is not a due notice', D.parseDueNotice(spend), null);
check('a card spend is not a bill payment', B.parseCardBillPayment(spend, { amount: 683.27 }), null);

const emiConverted =
  'Dear Customer, Txn of Rs.25000 on 12/08/2026 has been converted to EMI. Rs.25000 credited to your card ending 9981.';
check(
  'EMI conversion credited to the card is not a bill payment',
  B.parseCardBillPayment(emiConverted, { amount: 25000 }),
  null,
);
check('EMI conversion is not imported as income', P.parseImportMessages([{ id: 'emi', address: 'VM-HDFCBK', body: emiConverted, date: '2026-08-12' }], R.BUILTIN_IMPORT_RULES).length, 0);
const cardLoan =
  'Personal loan of Rs.50000 has been credited to your HDFC Bank Credit Card XX9981';
check(
  'a card loan credit is not a bill payment',
  B.parseCardBillPayment(cardLoan, { amount: 50000 }),
  null,
);

console.log('\n-- typed payments reduce remaining and stay after Refresh --');

const opened = B.applyCardBillState([], [notice], [], offsets).next;
const typedPartial = B.applyManualCardPayment(opened, [opened[0].id], 3000, '2026-08-20');
check('typed 3000 leaves 7000', typedPartial.next[0] && typedPartial.next[0].amount, 7000);
check('typed partial is not paid', typedPartial.next[0] && typedPartial.next[0].paid, false);
const typedRefresh = B.applyCardBillState(typedPartial.next, [notice], [], offsets);
check('Refresh keeps the typed 3000 off remaining', typedRefresh.next[0] && typedRefresh.next[0].amount, 7000);
const typedRest = B.applyManualCardPayment(typedPartial.next, [opened[0].id], 7000, '2026-08-21');
check('typed rest remaining is 0', typedRest.next[0] && typedRest.next[0].amount, 0);
check('typed rest marks the bill paid', typedRest.next[0] && typedRest.next[0].paid, true);
check(
  'typed full pay is not a live expense reminder',
  B.isCardBillReminderLive(typedRest.next[0], '2026-08-22'),
  false,
);
const typedPaidRefresh = B.applyCardBillState(typedRest.next, [notice], [], offsets);
check('Refresh after typed full pay stays paid', typedPaidRefresh.next[0] && typedPaidRefresh.next[0].paid, true);
check(
  'Refresh after typed full pay is still not live',
  B.isCardBillReminderLive(typedPaidRefresh.next[0], '2026-08-22'),
  false,
);

const spendToDelete =
  'Rs.200 spent on your HDFC Bank Credit Card XX9981 at AMAZON on 20-08-26';
const spendBag = B.collectCardBillEvents(
  [{ body: spendToDelete, address: 'VM-HDFCBK', date: '2026-08-20' }],
  [],
  P.extractAmount,
  P.extractDate,
);
const withSpend = B.applyCardBillState(opened, [notice], [], offsets, spendBag.spends).next;
check('spend is on the card before delete', (withSpend[0].spendEvents || []).length, 1);
const ignoredSpend = B.ignoreCardActivity(withSpend, [withSpend[0].id], {
  fingerprint: spendBag.spends[0] && spendBag.spends[0].fingerprint,
  amount: 200,
  date: '2026-08-20',
  text: spendToDelete,
  last4: '9981',
});
check('deleted spend is gone', (ignoredSpend[0].spendEvents || []).length, 0);
const ignoredRefresh = B.applyCardBillState(ignoredSpend, [notice], [], offsets, spendBag.spends);
check(
  'Refresh does not restore a deleted spend',
  (ignoredRefresh.next[0].spendEvents || []).length,
  0,
);

const OVERDUE =
  'Dear Customer, your HDFC Bank Credit Card 9981 payment is overdue. Total Amount Due Rs.10000. Payment Due Date 18-09-2026. Please pay immediately.';

const ICICI =
  'Your ICICI Bank Credit Card XX4412 statement is generated. Total Amt Due is Rs. 5432.10. Min Amt Due Rs. 250. Due Date 05Sep2026.';

const AMT_FIRST =
  'SBI Card ending 7788. Rs.3200 is the total amount due. Pay by 22-10-2026. Credit card statement.';

console.log('\n-- later overdue SMS does not rewind the current statement --');

const overdue = D.parseDueNotice(OVERDUE, { address: 'VM-HDFCBK', date: '2026-09-20' });
check('overdue SMS is a nudge, not a statement', overdue && overdue.role, 'nudge');
({ next } = B.applyCardBillState(next, [notice, nextNotice, overdue], [pay1, pay2], offsets));
check('current cycle stays after overdue SMS', next[0] && next[0].dueDate, '2026-10-18');
check('current amount stays after overdue SMS', next[0] && next[0].amount, 8200);

const oldPayAfterNewStmt = B.parseCardBillPayment(
  'HDFC Bank Cardmember, Online Payment of Rs.10000 vide Ref# OLD was credited to your card ending 9981 On 08/SEP/2026.',
  { date: '2026-09-08', amount: 10000 },
);
({ next } = B.applyCardBillState(
  next,
  [notice, nextNotice, overdue],
  [pay1, pay2, oldPayAfterNewStmt],
  offsets,
));
check('last month payment does not wipe the new bill', next[0] && next[0].amount, 8200);

console.log('\n-- amount and due date survive more SMS shapes --');

const icici = D.parseDueNotice(ICICI, { address: 'VM-ICICIB', date: '2026-08-20' });
check('ICICI amount after is', icici && icici.totalDue, 5432.1);
check('ICICI due 05Sep2026', icici && icici.dueDate, '2026-09-05');
check('ICICI last4', icici && icici.last4, '4412');

const amtFirst = D.parseDueNotice(AMT_FIRST, { address: 'VK-SBICRD', date: '2026-09-20' });
check('amount before the label', amtFirst && amtFirst.totalDue, 3200);
check('SBI due date', amtFirst && amtFirst.dueDate, '2026-10-22');

console.log('\n-- new statement keeps its own month, paid bills stay paid --');

const NEXT_NO_DUE =
  'Dear Customer, your HDFC Bank Credit Card 9981 statement is generated. Total Amount Due Rs.6400.00, Min Due Rs.300.00.';
let lone = B.applyCardBillState([], [notice], [], offsets).next;
const noDue = D.parseDueNotice(NEXT_NO_DUE, { address: 'VM-HDFCBK', date: '2026-09-05' });
check('statement without a due date still parses', !!(noDue && noDue.totalDue), true);
({ next: lone } = B.applyCardBillState(lone, [notice, noDue], [], offsets));
check('missing due date becomes last due plus one month', lone[0] && lone[0].dueDate, '2026-10-18');
check('amount is the new statement, not last month', lone[0] && lone[0].amount, 6400);

const PAST_DUE_STMT =
  'Dear Customer, your HDFC Bank Credit Card 9981 statement is generated. Total Amount Due Rs.4100. Payment Due Date 18-08-2026.';
const pastDue = D.parseDueNotice(PAST_DUE_STMT, { address: 'VM-HDFCBK', date: '2026-08-20' });
check('due printed before the statement SMS moves a month', pastDue && pastDue.dueDate, '2026-09-18');

const paidLast = B.applyCardBillState([], [notice], [pay1, pay2], offsets).next;
check('last month is paid after the credits', paidLast[0] && paidLast[0].paid, true);
const onlyOverdue = D.parseDueNotice(OVERDUE, { address: 'VM-HDFCBK', date: '2026-09-20' });
const stillPaid = B.applyCardBillState(paidLast, [onlyOverdue], [pay1, pay2], offsets).next;
check('an overdue nudge does not reopen a paid bill', stillPaid[0] && stillPaid[0].paid, true);

const spendWithLimit =
  'Thank you for using your BOBCARD ending 4455. Rs.1200 spent at Amazon. Outstanding Rs.8900. Available credit limit Rs.4100.';
check('spend + outstanding is not a due notice', D.parseDueNotice(spendWithLimit), null);
const spendRow = P.parseImportMessage(
  { body: spendWithLimit, address: 'AD-BOBCARD', date: '2026-08-18' },
  R.BUILTIN_IMPORT_RULES,
);
check('spend + outstanding still imports as a card expense', !!(spendRow && spendRow.kind === 'expense'), true);

const hdfcSpend =
  'Txn Rs.683.27 On HDFC Bank Card 9981 At jio@citibank by UPI 657918360150 On 01-08';
const spendEv = B.parseCardSpend(hdfcSpend, { address: 'VM-HDFCBK', date: '2026-08-23', amount: 683.27 });
check('a card spend SMS is a spend event', !!(spendEv && spendEv.last4 === '9981'), true);
check('a card spend SMS is not a payment', B.parseCardBillPayment(hdfcSpend, { amount: 683.27 }), null);

console.log('\n-- missing SMS dates stay empty and are not swapped --');

const firstNoDue = B.applyCardBillState([], [noDue], [], offsets).next;
check('first statement without due date keeps the statement date', firstNoDue[0] && firstNoDue[0].statementDate, '2026-09-05');
check('first statement without due date does not copy that day as due', firstNoDue[0] && !firstNoDue[0].dueDate, true);
check(
  'first statement without due date asks for the due date',
  B.missingCardCycleDates(firstNoDue[0]).needDue,
  true,
);

const dueOnly = B.applyCardBillState([], [overdue], [], offsets).next;
check('due SMS stores the payment due date', dueOnly[0] && dueOnly[0].dueDate, '2026-09-18');
check('due SMS does not invent a statement date', !dueOnly[0]?.statementDate, true);
check('due SMS still asks for the statement date', B.missingCardCycleDates(dueOnly[0]).needStatement, true);
check('due SMS does not ask for the due date again', B.missingCardCycleDates(dueOnly[0]).needDue, false);

const fromSpend = B.applyCardBillState([], [], [], offsets, [spendEv]).next;
check('a spend-only card is kept so dates can be asked', !!(fromSpend[0] && fromSpend[0].cardLast4 === '9981'), true);
check('a spend-only card has no statement date', !fromSpend[0].statementDate, true);
check('a spend-only card has no due date', !fromSpend[0].dueDate, true);

const copied = {
  ...firstNoDue[0],
  dueDate: firstNoDue[0].statementDate,
};
check('a due copied from the statement day is treated as missing', B.effectiveCardDueDate(copied), null);

const filled = B.applyManualCardCycleDates(
  firstNoDue,
  firstNoDue[0],
  { issuer: 'HDFC', last4: '9981' },
  { dueDate: '2026-09-18' },
  offsets,
);
check('manual due date stays on the due field', filled[0] && filled[0].dueDate, '2026-09-18');
check('manual due date does not overwrite the statement date', filled[0] && filled[0].statementDate, '2026-09-05');
check('both dates present after the user fills the missing due', B.missingCardCycleDates(filled[0]), {
  needStatement: false,
  needDue: false,
});

console.log('\n-- a late statement SMS is not the generation day --');

const IDFC_LATE =
  'Dear Customer, your IDFC FIRST Bank Credit Card XX6677 statement is generated. Total Amount Due Rs.9100. Payment Due Date 20-09-2026.';
const idfcLate = D.parseDueNotice(IDFC_LATE, { address: 'VM-IDFCFB', date: '2026-09-15' });
check('IDFC late SMS is a notice', !!idfcLate, true);
check('IDFC late SMS keeps the payment due date', idfcLate && idfcLate.dueDate, '2026-09-20');
check('IDFC late SMS does not treat that day as statement generation', idfcLate && idfcLate.statementDate, null);

const idfcBill = B.applyCardBillState([], [idfcLate], [], offsets).next;
check('IDFC late SMS asks for the statement date', B.missingCardCycleDates(idfcBill[0]).needStatement, true);
check('IDFC late SMS does not ask for the due date again', B.missingCardCycleDates(idfcBill[0]).needDue, false);
check('IDFC due is not copied onto the statement field', !idfcBill[0].statementDate, true);

const stale = {
  ...idfcBill[0],
  statementDate: '2026-08-15',
  dueDate: '2026-08-20',
  dueDateSource: 'sms',
};
check(
  'last month’s late SMS day is not reused as this statement date',
  B.effectiveCardStatementDate(stale),
  null,
);

console.log('\n-- a late-arriving statement SMS keeps the generation day --');

const LATE_PRINTED =
  'Dear Customer, your HDFC Bank Credit Card XX7788 statement is generated on 22-Aug-2026. Total Amount Due Rs.5000. Payment Due Date 10-09-2026.';
const hdfcLatePrinted = D.parseDueNotice(LATE_PRINTED, { address: 'VM-HDFCBK', date: '2026-08-24' });
check('printed generation day wins over the SMS day', hdfcLatePrinted && hdfcLatePrinted.statementDate, '2026-08-22');

const LATE_NO_DATE =
  'Your ICICI Bank Credit Card XX4412 statement is generated. Total Amt Due is Rs. 5432.10. Due Date 05Sep2026.';
const lateNoDate = D.parseDueNotice(LATE_NO_DATE, { address: 'JD-ICICIB', date: '2026-08-24' });
check(
  'a two-day-late SMS without a printed day is refined to last month’s day',
  D.refineStatementDate(lateNoDate, '2026-07-22'),
  '2026-08-22',
);
check(
  'a late copy of this cycle does not move the generation day to the SMS day',
  D.refineStatementDate(lateNoDate, '2026-08-22'),
  '2026-08-22',
);

const lateSpend22 = B.parseCardSpend(
  'Rs.200 spent on your ICICI Bank Credit Card XX4412 at AMAZON on 22-08-26',
  { address: 'JD-ICICIB', date: '2026-08-22', amount: 200 },
);
const lateSpend23 = B.parseCardSpend(
  'Rs.300 spent on your ICICI Bank Credit Card XX4412 at SWIGGY on 23-08-26',
  { address: 'JD-ICICIB', date: '2026-08-23', amount: 300 },
);
const prevCycle = {
  id: 'card-bill:icici|4412',
  name: 'ICICI Card 4412',
  amount: 100,
  dueDate: '2026-08-05',
  paid: true,
  offsets,
  mode: 'default',
  source: 'card-bill',
  cardKey: 'icici|4412',
  cardLast4: '4412',
  cardIssuer: 'ICICI',
  totalDue: 100,
  statementDate: '2026-07-22',
  statementDateSource: 'sms',
  dueDateSource: 'sms',
};
const lateApplied = B.applyCardBillState(
  [prevCycle],
  [lateNoDate],
  [],
  offsets,
  [lateSpend22, lateSpend23].filter(Boolean),
).next;
check('late SMS writes the 22 Aug generation day', lateApplied[0] && lateApplied[0].statementDate, '2026-08-22');
const lateViews = F.listCreditCardViews([], lateApplied, [], '2026-08-24');
check('current expenses start on the generation day, not the SMS day', lateViews[0] && lateViews[0].spendFrom, '2026-08-22');
check('spends on 22 and 23 stay in current expenses', lateViews[0] && lateViews[0].unbilledExpenses, 500);

console.log('\n-- spends stay on their own card --');

const hdfcCard = { last4: '9562', issuer: 'HDFC', cardKey: 'hdfc|9562' };
const iciciCard = { last4: '4412', issuer: 'ICICI', cardKey: 'icici|4412' };
const idfcCard = { last4: '9310', issuer: 'IDFC', cardKey: 'idfc|9310' };
const idfcSms =
  'Happy Shopping! INR 5434.55 spent on your IDFC FIRST Bank Credit Card ending XX9310 at DMART AVENUE SUPERMART on 17 AUG 2026';
const iciciAtHdfcLife =
  'Rs.9,400 spent on your ICICI Bank Credit Card XX4321 at HDFC LIFE INSURANCE';
check('IDFC spend SMS does not belong to HDFC 9562', B.textBelongsToCard(idfcSms, hdfcCard), false);
check('IDFC spend SMS belongs to IDFC 9310', B.textBelongsToCard(idfcSms, idfcCard), true);
check(
  'a generic Card · Bank note does not belong to HDFC',
  B.textBelongsToCard('Card · Bank · dispute call 18001080', hdfcCard),
  false,
);
check(
  'an ICICI note does not belong to HDFC',
  B.textBelongsToCard('ICICI Bank Credit Card XX4412 used at Amazon', hdfcCard),
  false,
);
check(
  'an ICICI spend at HDFC LIFE is still ICICI',
  D.extractCardIssuer(iciciAtHdfcLife),
  'ICICI',
);
check(
  'a stamped ICICI note with an HDFC merchant stays ICICI',
  D.extractCardIssuer('Card · ICICI ending 4412 · HDFC LIFE INSURANCE'),
  'ICICI',
);
check(
  'an ICICI spend at HDFC LIFE does not belong to HDFC',
  B.textBelongsToCard(iciciAtHdfcLife, hdfcCard),
  false,
);
check(
  'last4 mismatch never falls back to issuer',
  B.identitiesMatch({ last4: '9310', issuer: 'IDFC' }, hdfcCard),
  false,
);
check(
  'account name HDFC Credit Card matches issuer HDFC',
  B.identitiesMatch({ last4: null, issuer: 'HDFC Credit Card' }, { last4: null, issuer: 'HDFC' }),
  true,
);
check(
  'a leftover spend with no identity is dropped',
  B.storedEventBelongsToCard({ amount: 180, date: '2026-08-17', fingerprint: 'x' }, hdfcCard),
  false,
);
check(
  'a stored IDFC spend is not kept on HDFC',
  B.storedEventBelongsToCard(
    { amount: 5434.55, date: '2026-08-17', fingerprint: 'idfc', body: idfcSms, last4: '9310', issuer: 'IDFC' },
    hdfcCard,
  ),
  false,
);

const idfcSpend = B.parseCardSpend(idfcSms, {
  address: 'VM-IDFCFB',
  date: '2026-08-17',
  amount: 5434.55,
});
check(
  'a generic leftover note does not ride onto HDFC just because the amount matches',
  B.txnNoteFitsCard('Card · Bank · DMART AVENUE SUPERMART', hdfcCard, {
    day: '2026-08-17',
    amount: 5434.55,
    spends: idfcSpend ? [idfcSpend] : [],
  }),
  false,
);
check(
  'a generic leftover note does not attach to a card without naming its last 4',
  B.txnNoteFitsCard('Card · Bank · DMART AVENUE SUPERMART', idfcCard, {
    day: '2026-08-17',
    amount: 5434.55,
    spends: idfcSpend ? [idfcSpend] : [],
  }),
  false,
);
check(
  'a ledger note that names the card last 4 still counts',
  B.txnNoteFitsCard('Card · IDFC ending 9310 · DMART AVENUE SUPERMART', idfcCard),
  true,
);
check(
  'an ICICI leftover note never attaches to HDFC',
  B.txnNoteFitsCard('Card · Bank · dispute call 18001080', hdfcCard, {
    day: '2026-08-17',
    amount: 180,
    spends: idfcSpend ? [idfcSpend] : [],
  }),
  false,
);

const taggedHdfc = D.cardIdentityTag(
  'Rs.2150 spent on your HDFC Bank Credit Card XX9562 at BIG BAZAAR',
  'VM-HDFCBK',
);
check('import notes stamp HDFC ending 9562', taggedHdfc, 'HDFC ending 9562');
check(
  'the stamped note reads back onto HDFC 9562',
  B.textBelongsToCard(`Card · ${taggedHdfc} · BIG BAZAAR`, hdfcCard),
  true,
);
check(
  'the stamped note does not read back onto ICICI',
  B.textBelongsToCard(`Card · ${taggedHdfc} · BIG BAZAAR`, iciciCard),
  false,
);

const iciciImport = P.parseImportMessage(
  {
    body: 'Rs.9,400 spent on your ICICI Bank Credit Card XX4412 at Amazon on 17-08-26',
    address: 'JD-ICICIB',
    date: '2026-08-17',
  },
  R.BUILTIN_IMPORT_RULES,
);
check('an ICICI import note names ICICI ending 4412', !!(iciciImport && /ICICI ending 4412/.test(iciciImport.note)), true);
check(
  'that ICICI import note does not belong to HDFC 9562',
  B.textBelongsToCard((iciciImport && iciciImport.note) || '', hdfcCard),
  false,
);

const idfcImport = P.parseImportMessage(
  { body: idfcSms, address: 'VM-IDFCFB', date: '2026-08-17' },
  R.BUILTIN_IMPORT_RULES,
);
check('an IDFC import note names IDFC ending 9310', !!(idfcImport && /IDFC ending 9310/.test(idfcImport.note)), true);

console.log('\n-- a spend on statement day is the next cycle --');

const YES_SPEND =
  'INR 556.20 spent on YES BANK Card X0690 @BOOKMYSHOW COM 17-08-2026 04:55:39 pm. Avl Lmt INR 99,082.76. SMS BLKCC 0690 to 9840909000 if not you';
const YES_STMT =
  'YES BANK Credit Card XX0690 AUG-26 statement: Total due INR 361.04 Min due INR 200.00 Due by 05-SEP-2026.';
const yesSpend = B.parseCardSpend(YES_SPEND, {
  address: 'AD-YESBNK-S',
  date: '2026-08-17',
  amount: 556.2,
});
const yesNotice = D.parseDueNotice(YES_STMT, { address: 'AD-YESBNK-S', date: '2026-08-17' });
check('YES spend SMS is a spend on 0690', !!(yesSpend && yesSpend.last4 === '0690'), true);
check('YES statement total is 361.04', yesNotice && yesNotice.totalDue, 361.04);
check('YES statement date is the SMS day', yesNotice && yesNotice.statementDate, '2026-08-17');

const yesReminder = {
  id: 'card-bill:yes|0690',
  name: 'YES Card 0690',
  amount: 361.04,
  dueDate: '2026-09-05',
  paid: false,
  offsets: [],
  mode: 'default',
  source: 'card-bill',
  cardKey: 'yes|0690',
  cardLast4: '0690',
  cardIssuer: 'YES',
  totalDue: 361.04,
  minDue: 200,
  statementDate: '2026-08-17',
  statementDateSource: 'sms',
  dueDateSource: 'sms',
  spendEvents: yesSpend
    ? [
        {
          amount: yesSpend.amount,
          date: yesSpend.date,
          fingerprint: yesSpend.fingerprint,
          body: yesSpend.body,
          last4: yesSpend.last4,
          issuer: yesSpend.issuer,
        },
      ]
    : [],
  billEvents: [
    {
      kind: 'statement',
      amount: 361.04,
      date: '2026-08-17',
      fingerprint: 'yes-stmt',
      body: YES_STMT,
    },
  ],
};
const yesViews = F.listCreditCardViews([], [yesReminder], [], '2026-08-23');
check('YES current expenses start on the statement day', yesViews[0] && yesViews[0].spendFrom, '2026-08-17');
check('YES same-day spend is in current expenses', yesViews[0] && yesViews[0].unbilledExpenses, 556.2);
check('YES statement remaining stays the SMS total', yesViews[0] && yesViews[0].remaining, 361.04);

const yesExpenseRows = A.listCardAmountActivity({
  kind: 'expenses',
  card: yesViews[0],
  reminder: yesReminder,
  transactions: [],
});
check(
  'YES expenses list includes the same-day spend',
  yesExpenseRows.some((r) => r.source === 'spend' && Math.round(r.amount) === 556),
  true,
);
const yesStmtRows = A.listCardAmountActivity({
  kind: 'statement',
  card: yesViews[0],
  reminder: yesReminder,
  transactions: [],
});
check(
  'YES statement list keeps the 361 bill SMS',
  yesStmtRows.some((r) => r.source === 'statement' && Math.round(r.amount) === 361),
  true,
);
check(
  'YES statement list is only the statement SMS',
  yesStmtRows.every((r) => r.source === 'statement'),
  true,
);
check(
  'YES statement list does not swallow the same-day spend',
  yesStmtRows.some((r) => r.source === 'spend' && Math.round(r.amount) === 556),
  false,
);

console.log('\n-- only cards with a last 4 are listed --');

const namelessCard = {
  id: 'c-generic',
  name: 'Credit Card',
  type: 'Card',
  currency: 'INR',
  openingBalance: 0,
  amount: 0,
  excluded: false,
};
const noLast4 = F.listCreditCardViews([namelessCard], [], [], '2026-08-23');
check('a cash-book card with no last 4 is not listed', noLast4.length, 0);

const issuerOnly = {
  id: 'card-bill:hdfc|unknown',
  name: 'HDFC Card',
  amount: 0,
  dueDate: '',
  paid: false,
  offsets,
  mode: 'default',
  source: 'card-bill',
  cardKey: 'hdfc|unknown',
  cardIssuer: 'HDFC',
};
check(
  'an issuer-only reminder is not listed',
  F.listCreditCardViews([], [issuerOnly], [], '2026-08-23').length,
  0,
);
check('a card with a last 4 is still listed', !!(yesViews[0] && yesViews[0].last4 === '0690'), true);

const typed = B.applyManualCardCycleDates(
  [yesReminder],
  { ...yesReminder, amount: 0, totalDue: undefined },
  { issuer: 'YES', last4: '0690' },
  { totalDue: 361.04 },
  offsets,
);
check('a typed statement amount is stored when SMS never arrived', typed[0] && typed[0].totalDue, 361.04);
check('the remaining bill matches the typed total', typed[0] && typed[0].amount, 361.04);

console.log('\n-- a BOB statement without last 4 still lands on the spend card --');

const BOB_STMT =
  'Dear Customer, your BOBCARD statement is generated. Total Amount Due Rs.5400.00, Min Due Rs.270.00, Payment Due Date 18-09-2026.';
const BOB_SPEND =
  'ALERT: INR 110.00 is spent on your BOBCARD ending 3100 at Upi-ms Sahithi Batraj on 21-08-2026. Available credit limit is Rs 214,380.00, Current outstanding is Rs 400.00.';
const bobNotice = D.parseDueNotice(BOB_STMT, { address: 'AD-BOBCARD', date: '2026-08-18' });
const bobSpend = B.parseCardSpend(BOB_SPEND, { address: 'VM-BOBCRD', date: '2026-08-21', amount: 110 });
check('BOBCARD statement SMS is a notice', !!bobNotice, true);
check('BOBCARD statement SMS does not need a last 4 in the body', bobNotice && bobNotice.last4, null);
check('BOBCARD statement total is 5400', bobNotice && bobNotice.totalDue, 5400);
check('BOBCARD statement date is the SMS day', bobNotice && bobNotice.statementDate, '2026-08-18');
check('BOB spend has last 4 3100', !!(bobSpend && bobSpend.last4 === '3100'), true);

const bobMerged = B.applyCardBillState([], [bobNotice], [], offsets, bobSpend ? [bobSpend] : []).next;
const bobListed = F.listCreditCardViews([], bobMerged, [], '2026-08-23');
check('BOB is listed once, with the spend last 4', bobListed.length, 1);
check('BOB listed last 4 is 3100', bobListed[0] && bobListed[0].last4, '3100');
check('BOB keeps the statement date from the issuer-only SMS', bobListed[0] && bobListed[0].statementDate, '2026-08-18');
check('BOB keeps the due date from the issuer-only SMS', bobListed[0] && bobListed[0].dueDate, '2026-09-18');
check('BOB keeps the statement amount from the issuer-only SMS', bobListed[0] && bobListed[0].remaining, 5400);
check('BOB does not ask for the statement again', bobListed[0] && bobListed[0].needsStatementDate, false);
check('BOB does not ask for the amount again', bobListed[0] && bobListed[0].needsAmount, false);

const bobOrphan = {
  id: 'card-bill:bob|unknown',
  name: 'BOB Card',
  amount: 5400,
  dueDate: '2026-09-18',
  paid: false,
  offsets,
  mode: 'default',
  source: 'card-bill',
  cardKey: 'bob|unknown',
  cardIssuer: 'BOB',
  totalDue: 5400,
  statementDate: '2026-08-18',
  statementDateSource: 'sms',
  dueDateSource: 'sms',
};
const bobFromSaved = B.applyCardBillState([bobOrphan], [], [], offsets, bobSpend ? [bobSpend] : []).next;
const bobFromSavedView = F.listCreditCardViews([], bobFromSaved, [], '2026-08-23');
check('a saved BOB statement without last 4 is folded onto 3100', bobFromSavedView[0] && bobFromSavedView[0].last4, '3100');
check('the folded BOB card still has the saved statement date', bobFromSavedView[0] && bobFromSavedView[0].statementDate, '2026-08-18');
check('the folded BOB card still has the saved amount', bobFromSavedView[0] && bobFromSavedView[0].remaining, 5400);

const bobEmptyLast4 = {
  id: 'card-bill:bob|3100',
  name: 'BOB Card 3100',
  amount: 0,
  dueDate: '',
  paid: false,
  offsets,
  mode: 'default',
  source: 'card-bill',
  cardKey: 'bob|3100',
  cardLast4: '3100',
  cardIssuer: 'BOB',
};
const bobShown = F.listCreditCardViews([], [bobOrphan, bobEmptyLast4], [], '2026-08-23');
check('listing folds a saved BOB statement onto the last-4 card', bobShown.length, 1);
check('listing keeps the BOB statement date without a refresh', bobShown[0] && bobShown[0].statementDate, '2026-08-18');
check('listing keeps the BOB amount without a refresh', bobShown[0] && bobShown[0].remaining, 5400);

console.log('\n-- a removed card stays off the list --');

const hidden = B.hideCardReminder(bobMerged, bobListed[0]);
check('hiding a card leaves the reminder saved', hidden.some((r) => r.hidden && r.cardLast4 === '3100'), true);
check(
  'a hidden card is not listed',
  F.listCreditCardViews([], hidden, [], '2026-08-23').length,
  0,
);
const stillHidden = B.applyCardBillState(hidden, [bobNotice], [], offsets, bobSpend ? [bobSpend] : []).next;
check(
  'Refresh does not put a removed card back',
  F.listCreditCardViews([], stillHidden, [], '2026-08-23').length,
  0,
);

const spendOnly = B.applyCardBillState([], [], [], offsets, [spendEv]).next;
const spendHidden = B.hideCardReminder(spendOnly, { last4: '9981', issuer: 'HDFC', reminderId: spendOnly[0] && spendOnly[0].id });
const spendBack = B.applyCardBillState(spendHidden, [], [], offsets, [spendEv]).next;
check(
  'Refresh spend SMS does not recreate a removed card',
  F.listCreditCardViews([], spendBack, [], '2026-08-23').length,
  0,
);
const stmtBack = B.applyCardBillState(spendHidden, [notice], [], offsets, [spendEv]).next;
check(
  'Refresh statement SMS does not recreate a removed card',
  F.listCreditCardViews([], stmtBack, [], '2026-08-23').length,
  0,
);
const broughtBack = B.applyAddCreditCard(spendHidden, { issuer: 'HDFC', last4: '9981' }, offsets);
check(
  'Add card is what brings a removed card back',
  !!(broughtBack.find((r) => r.cardLast4 === '9981') && broughtBack.find((r) => r.cardLast4 === '9981').hidden === false),
  true,
);
check('YES is still listed after BOB is removed', !!(yesViews[0] && yesViews[0].last4 === '0690'), true);

console.log('\n-- add-on cards that share one statement stay one bill --');

const iciciAddon = (last4, spend) => ({
  id: `card-bill:icici|${last4}`,
  name: `ICICI Card ${last4}`,
  amount: 8000,
  dueDate: '2026-09-05',
  paid: false,
  offsets,
  mode: 'default',
  source: 'card-bill',
  cardKey: `icici|${last4}`,
  cardLast4: last4,
  cardIssuer: 'ICICI',
  totalDue: 8000,
  statementDate: '2026-08-10',
  statementDateSource: 'sms',
  dueDateSource: 'sms',
  spendEvents: spend
    ? [
        {
          amount: spend,
          date: '2026-08-20',
          fingerprint: `icici-${last4}`,
          last4,
          issuer: 'ICICI',
        },
      ]
    : [],
});
const iciciFour = [
  iciciAddon('1111', 500),
  iciciAddon('2222', 700),
  iciciAddon('3333', 0),
  iciciAddon('4444', 200),
];
const iciciViews = F.listCreditCardViews([], iciciFour, [], '2026-08-23');
check('four ICICI add-on cards list as one face', iciciViews.length, 1);
check('the shared face keeps one statement amount', iciciViews[0] && iciciViews[0].remaining, 8000);
check('the shared face names every last 4', iciciViews[0] && iciciViews[0].last4s, ['1111', '2222', '3333', '4444']);
check('current expenses add spends from every add-on card', iciciViews[0] && iciciViews[0].unbilledExpenses, 1400);
check('the due-count is one bill, not four', F.openCardBillCount(iciciViews), 1);

const otherIcici = {
  ...iciciAddon('5555', 100),
  amount: 1200,
  totalDue: 1200,
  statementDate: '2026-08-12',
  dueDate: '2026-09-18',
};
check(
  'a second ICICI account with its own bill stays separate',
  F.listCreditCardViews([], [...iciciFour, otherIcici], [], '2026-08-23').length,
  2,
);

console.log('\n-- adding cards with dates but no amount is not a paid bill --');

const iciciDatesOnly = B.applyAddCreditCard(
  [],
  { issuer: 'ICICI', last4: '1111', statementDate: '2026-08-10', dueDate: '2026-09-05' },
  offsets,
);
const iciciDatesTwo = B.applyAddCreditCard(
  iciciDatesOnly,
  { issuer: 'ICICI', last4: '2222', statementDate: '2026-08-10', dueDate: '2026-09-05' },
  offsets,
);
const iciciDatesShared = B.applySharedCreditLimitAnswer(iciciDatesTwo, 'ICICI', true);
check('typed ICICI cards without an amount are not paid', iciciDatesShared.every((r) => !r.paid), true);
const iciciDatesView = F.listCreditCardViews([], iciciDatesShared, [], '2026-08-24');
check('typed ICICI cards list as one shared-limit face', iciciDatesView.length, 1);
check('typed ICICI cards are not shown as paid', iciciDatesView[0] && iciciDatesView[0].paid, false);
check(
  'typed ICICI cards still ask for the bill amount',
  iciciDatesView[0] && iciciDatesView[0].needsAmount,
  true,
);
check(
  'typed ICICI cards have no remaining bill until an amount is entered',
  iciciDatesView[0] && iciciDatesView[0].remaining,
  null,
);

const stuckPaid = B.settleCardPaidFlag({
  ...iciciDatesOnly[0],
  paid: true,
  amount: 0,
});
check('a stuck paid flag with no bill amount is cleared', stuckPaid.paid, false);

const iciciNoBill = [
  {
    ...iciciAddon('1111', 0),
    amount: 0,
    totalDue: undefined,
    dueDate: '',
    statementDate: undefined,
    paid: false,
  },
  {
    ...iciciAddon('2222', 0),
    amount: 0,
    totalDue: undefined,
    dueDate: '',
    statementDate: undefined,
    paid: false,
  },
];
const iciciSharedNoBill = B.applySharedCreditLimitAnswer(iciciNoBill, 'ICICI', true);
const iciciSharedNoBillView = F.listCreditCardViews([], iciciSharedNoBill, [], '2026-08-24');
check(
  'shared-limit cards with no SMS bill still ask for both dates',
  !!(iciciSharedNoBillView[0] && iciciSharedNoBillView[0].needsStatementDate && iciciSharedNoBillView[0].needsDueDate),
  true,
);
check(
  'shared-limit cards with no SMS bill also ask for the amount in that same prompt',
  iciciSharedNoBillView[0] && iciciSharedNoBillView[0].needsAmount,
  true,
);
const datesOnly = B.applyManualCardCycleDates(
  iciciSharedNoBill,
  iciciSharedNoBill.find((r) => r.cardLast4 === '1111'),
  { issuer: 'ICICI', last4: '1111' },
  { statementDate: '2026-08-10', dueDate: '2026-09-05' },
  offsets,
);
const datesOnlyView = F.listCreditCardViews([], datesOnly, [], '2026-08-24');
check('saving only the two dates does not mark the bill paid', datesOnlyView[0] && datesOnlyView[0].paid, false);
check(
  'saving only the two dates still shows a missing amount on the face',
  datesOnlyView[0] && datesOnlyView[0].needsAmount,
  true,
);
check(
  'saving only the two dates does not keep the dates sheet open',
  F.cardsMissingCycleDates(datesOnlyView).length,
  0,
);

const statementOnly = B.applyManualCardCycleDates(
  iciciSharedNoBill,
  iciciSharedNoBill.find((r) => r.cardLast4 === '1111'),
  { issuer: 'ICICI', last4: '1111' },
  { statementDate: '2026-08-10' },
  offsets,
);
const statementOnlyView = F.listCreditCardViews([], statementOnly, [], '2026-08-24');
check(
  'saving only the statement date is enough to close the dates prompt',
  F.cardsMissingCycleDates(statementOnlyView).length,
  0,
);
check(
  'saving only the statement date can still show a missing amount on the face',
  !!(statementOnlyView[0] && statementOnlyView[0].needsAmount),
  true,
);

console.log('\n-- a crossed due date hides the old bill --');

const afterDue = F.listCreditCardViews([], [yesReminder], [], '2026-09-06');
check('after the due date the old due day is gone', afterDue[0] && afterDue[0].dueDate, null);
check('after the due date the old due amount is gone', afterDue[0] && afterDue[0].remaining, null);
check('after the due date the face is waiting', afterDue[0] && afterDue[0].phase, 'waiting');
check('after the due date the header due-count is 0', F.openCardBillCount(afterDue), 0);
check(
  'on the due date the amount is still shown',
  F.listCreditCardViews([], [yesReminder], [], '2026-09-05')[0]?.remaining,
  361.04,
);

console.log('\n-- more SMS shapes still fill statement date, due date, and amount --');

const SBI_TAD =
  'SBICARD: Statement for Card XX7788 generated. TAD Rs.8500.00 MAD Rs.425.00 PDD 22-09-2026.';
const sbiTad = D.parseDueNotice(SBI_TAD, { address: 'VK-SBICRD', date: '2026-08-22' });
check('SBI TAD SMS is a statement', !!(sbiTad && sbiTad.role === 'statement'), true);
check('SBI TAD total is 8500', sbiTad && sbiTad.totalDue, 8500);
check('SBI MAD min is 425', sbiTad && sbiTad.minDue, 425);
check('SBI PDD due date is 22 Sep', sbiTad && sbiTad.dueDate, '2026-09-22');
check('SBI TAD statement date is the SMS day', sbiTad && sbiTad.statementDate, '2026-08-22');

const PRINTED_STMT =
  'Kotak Credit Card 3344: Your statement dated 12-08-2026 is generated. Total amount due Rs.6700. Payment due date 01-09-2026.';
const printed = D.parseDueNotice(PRINTED_STMT, { address: 'VM-KOTAKB', date: '2026-08-20' });
check('a printed statement date is used, not the SMS day', printed && printed.statementDate, '2026-08-12');
check('printed-date SMS keeps the due date', printed && printed.dueDate, '2026-09-01');
check('printed-date SMS keeps the total', printed && printed.totalDue, 6700);

const LATE_WITH_PRINTED =
  'Dear Customer, your IDFC FIRST Bank Credit Card XX6677 statement dated 20-08-2026. Total Amount Due Rs.9100. Payment Due Date 20-09-2026.';
const latePrinted = D.parseDueNotice(LATE_WITH_PRINTED, { address: 'VM-IDFCFB', date: '2026-09-15' });
check(
  'a late SMS that names the real statement date still stores it',
  latePrinted && latePrinted.statementDate,
  '2026-08-20',
);

const ONECARD =
  'Your OneCard statement is generated. Total due Rs.1400. Due date 15 Sep 2026. Card ending 8899.';
const oneCard = D.parseDueNotice(ONECARD, { address: 'AD-ONECRD', date: '2026-08-20' });
check('OneCard SMS is a notice', !!oneCard, true);
check('OneCard last 4', oneCard && oneCard.last4, '8899');
check('OneCard issuer', oneCard && oneCard.issuer, 'OneCard');
check('OneCard total', oneCard && oneCard.totalDue, 1400);
check('OneCard due date', oneCard && oneCard.dueDate, '2026-09-15');

const added = B.applyAddCreditCard([], { issuer: 'HDFC', last4: '1234' }, offsets);
check('Add card keeps a last 4', added[0] && added[0].cardLast4, '1234');
check('Add card keeps the bank', added[0] && added[0].cardIssuer, 'HDFC');
const hiddenAdded = added.map((r) => ({ ...r, hidden: true }));
const shownAgain = B.applyAddCreditCard(hiddenAdded, { issuer: 'HDFC', last4: '1234' }, offsets);
check('Add card unhides a removed card', shownAgain[0] && shownAgain[0].hidden, false);
check('Add card does not create a second reminder', shownAgain.length, 1);

console.log('\n-- spend SMS shapes that were dropped still land on the card --');

const bobSpentAt = B.collectCardBillEvents(
  [{ body: spendWithLimit, address: 'AD-BOBCARD', date: '2026-08-18' }],
  [],
  P.extractAmount,
  P.extractDate,
);
check(
  'BOB spent-at SMS is a card spend',
  !!(bobSpentAt.spends[0] && bobSpentAt.spends[0].last4 === '4455' && bobSpentAt.spends[0].amount === 1200),
  true,
);

const sbiThanks =
  'Thank you for using your SBI Card XX7788 for Rs.640 at SWIGGY on 24 Aug 26. Avl Lmt Rs 12000.';
const sbiThanksSpend = B.collectCardBillEvents(
  [{ body: sbiThanks, address: 'VK-SBICRD', date: '2026-08-24' }],
  [],
  P.extractAmount,
  P.extractDate,
);
check(
  'SBI thank-you SMS is a card spend on 7788',
  !!(sbiThanksSpend.spends[0] && sbiThanksSpend.spends[0].last4 === '7788' && sbiThanksSpend.spends[0].amount === 640),
  true,
);

const iciciUsedFor =
  'ICICI Bank Credit Card XX4412 is used for INR 219.50 at AMAZON on 24-Aug-26. Available limit Rs.8000.';
const iciciUsedSpend = B.collectCardBillEvents(
  [{ body: iciciUsedFor, address: 'VM-ICICIB', date: '2026-08-24' }],
  [],
  P.extractAmount,
  P.extractDate,
);
check(
  'ICICI used-for SMS is a card spend',
  !!(iciciUsedSpend.spends[0] && iciciUsedSpend.spends[0].last4 === '4412' && iciciUsedSpend.spends[0].amount === 219.5),
  true,
);

const iciciUpiDebit =
  'ICICI Bank Credit Card XX7002 was debited for INR 3,000.00 on 23-Aug-26 for UPI-484462581381-Sri Mayu. To dispute call 18001080/SMS BLOCK 7002 to 9215676766';
check(
  'ICICI UPI debit SMS keeps the spend day printed in the text',
  P.extractDate(iciciUpiDebit, '2026-08-24'),
  '2026-08-23',
);
check(
  'ICICI UPI debit SMS amount is 3000, not a figure from the footer',
  P.extractAmount(iciciUpiDebit),
  3000,
);
const iciciUpiSpend = B.collectCardBillEvents(
  [{ body: iciciUpiDebit, address: 'VM-ICICIB', date: '2026-08-24' }],
  [],
  P.extractAmount,
  P.extractDate,
);
check(
  'ICICI UPI debit SMS is a card spend on 7002',
  !!(
    iciciUpiSpend.spends[0] &&
    iciciUpiSpend.spends[0].last4 === '7002' &&
    iciciUpiSpend.spends[0].amount === 3000 &&
    iciciUpiSpend.spends[0].date === '2026-08-23'
  ),
  true,
);
const iciciUpiCard = {
  id: 'card-bill:icici|7002',
  name: 'ICICI Card 7002',
  amount: 20833,
  dueDate: '2026-09-05',
  paid: false,
  offsets,
  mode: 'default',
  source: 'card-bill',
  cardKey: 'icici|7002',
  cardLast4: '7002',
  cardIssuer: 'ICICI',
  totalDue: 20833,
  statementDate: '2026-08-19',
  statementDateSource: 'sms',
  dueDateSource: 'sms',
};
const iciciUpiApplied = B.applyCardBillState(
  [iciciUpiCard],
  [],
  [],
  offsets,
  iciciUpiSpend.spends,
).next;
const iciciUpiView = F.listCreditCardViews([], iciciUpiApplied, [], '2026-08-24');
check(
  'a 23 Aug UPI debit after the 19 Aug statement is in current expenses',
  iciciUpiView[0] && iciciUpiView[0].unbilledExpenses,
  3000,
);
const bankUpiTxn = {
  id: 'bank-3000',
  kind: 'expense',
  category: 'Others',
  amount: 3000,
  date: '2026-08-24',
  note: 'UPI · Bank TADIKONDA VAMSI KRISHNA',
};
const mixedView = F.listCreditCardViews([], iciciUpiApplied, [bankUpiTxn], '2026-08-24');
check(
  'a bank UPI of the same amount is not added to card expenses',
  mixedView[0] && mixedView[0].unbilledExpenses,
  3000,
);
const mixedRows = A.listCardAmountActivity({
  kind: 'expenses',
  card: mixedView[0],
  reminder: iciciUpiApplied[0],
  transactions: [bankUpiTxn],
  spends: iciciUpiSpend.spends,
});
check(
  'card expenses list does not include the bank UPI row',
  mixedRows.every((r) => !/TADIKONDA|UPI · Bank/i.test(r.text)),
  true,
);
check(
  'card expenses list still includes the 23 Aug card SMS',
  !!(mixedRows.find((r) => r.date === '2026-08-23' && r.amount === 3000)),
  true,
);
check(
  'paying a card bill from a bank account is not a card spend',
  B.parseCardSpend(
    'Rs.3000.00 debited from A/c XX1234 towards ICICI Bank Credit Card XX7002 on 23-Aug-26',
    { address: 'VM-ICICIB', date: '2026-08-23', amount: 3000 },
  ),
  null,
);

const debitSms =
  'Rs.500 spent on your HDFC Bank Debit Card XX9562 at AMAZON on 24-08-26.';
check(
  'a debit-card SMS is not a credit-card spend',
  B.parseCardSpend(debitSms, { address: 'VM-HDFCBK', date: '2026-08-24', amount: 500 }),
  null,
);

console.log('\n-- current expenses use the spend day in the SMS, from the statement date --');

check(
  '19 Aug in the SMS is kept even if the inbox row is 24 Aug',
  P.extractDate(
    'Rs.410 spent on your HDFC Bank Credit Card XX9981 at AMAZON on 19-08-26',
    '2026-08-24',
  ),
  '2026-08-19',
);
check(
  '17 AUG 2026 in the SMS is kept',
  P.extractDate(idfcSms, '2026-08-24'),
  '2026-08-17',
);
check(
  'On 01-08 uses that day, not the SMS day',
  P.extractDate(hdfcSpend, '2026-08-23'),
  '2026-08-01',
);

const midCycle = B.collectCardBillEvents(
  [
    {
      body: 'Rs.200 spent on your HDFC Bank Credit Card XX9981 at AMAZON on 19-08-26',
      address: 'VM-HDFCBK',
      date: '2026-08-24',
    },
    {
      body: 'Rs.350 spent on your HDFC Bank Credit Card XX9981 at SWIGGY on 21-08-26',
      address: 'VM-HDFCBK',
      date: '2026-08-24',
    },
    {
      body: 'Rs.90 spent on your HDFC Bank Credit Card XX9981 at UPI on 24-08-26',
      address: 'VM-HDFCBK',
      date: '2026-08-24',
    },
  ],
  [],
  P.extractAmount,
  P.extractDate,
);
check(
  'a 19 Aug spend is stored on 19 Aug',
  midCycle.spends.find((s) => s.amount === 200) && midCycle.spends.find((s) => s.amount === 200).date,
  '2026-08-19',
);
check(
  'a 21 Aug spend is stored on 21 Aug',
  midCycle.spends.find((s) => s.amount === 350) && midCycle.spends.find((s) => s.amount === 350).date,
  '2026-08-21',
);

const datedCard = {
  id: 'card-bill:hdfc|9981',
  name: 'HDFC Card 9981',
  amount: 1000,
  dueDate: '2026-09-05',
  paid: false,
  offsets,
  mode: 'default',
  source: 'card-bill',
  cardKey: 'hdfc|9981',
  cardLast4: '9981',
  cardIssuer: 'HDFC',
  totalDue: 1000,
  statementDate: '2026-08-19',
  statementDateSource: 'manual',
  dueDateSource: 'manual',
};
const datedApplied = B.applyCardBillState([datedCard], [], [], offsets, midCycle.spends).next;
const datedView = F.listCreditCardViews([], datedApplied, [], '2026-08-24');
check('current expenses start on the typed statement date', datedView[0] && datedView[0].spendFrom, '2026-08-19');
check('spends from 19 Aug through 24 Aug are all in current expenses', datedView[0] && datedView[0].unbilledExpenses, 640);

console.log('\n-- same-amount spends on different days are both kept --');

const twinSpends = B.collectCardBillEvents(
  [
    {
      body: 'Rs.200 spent on your HDFC Bank Credit Card XX9981 at AMAZON on 19-08-26',
      address: 'VM-HDFCBK',
      date: '2026-08-24',
    },
    {
      body: 'Rs.200 spent on your HDFC Bank Credit Card XX9981 at SWIGGY on 21-08-26',
      address: 'VM-HDFCBK',
      date: '2026-08-24',
    },
  ],
  [],
  P.extractAmount,
  P.extractDate,
);
check('two ₹200 spends are both stored', twinSpends.spends.length, 2);
check(
  '19 Aug Amazon is kept',
  !!(twinSpends.spends.find((s) => s.date === '2026-08-19' && s.amount === 200)),
  true,
);
check(
  '21 Aug Swiggy is kept',
  !!(twinSpends.spends.find((s) => s.date === '2026-08-21' && s.amount === 200)),
  true,
);

const twinApplied = B.applyCardBillState([datedCard], [], [], offsets, twinSpends.spends).next;
const twinView = F.listCreditCardViews([], twinApplied, [], '2026-08-24');
check('both ₹200 spends count in current expenses', twinView[0] && twinView[0].unbilledExpenses, 400);
const twinRows = A.listCardAmountActivity({
  kind: 'expenses',
  card: twinView[0],
  reminder: twinApplied[0],
  transactions: [],
  spends: twinSpends.spends,
});
check('both ₹200 spends are listed from their expense dates', twinRows.length, 2);
check(
  'the 19 Aug spend is listed on 19 Aug',
  !!(twinRows.find((r) => r.date === '2026-08-19' && r.amount === 200)),
  true,
);

console.log('\n-- a payment is not applied twice, and remaining is not marked paid --');

const paidOnce = B.applyCardBillState([], [notice], [pay1], offsets).next;
check('first credit leaves 7000', paidOnce[0] && paidOnce[0].amount, 7000);
const oldPayKey = `pay|9981|2026-08-24|3000|${PARTIAL.slice(0, 40).toLowerCase()}`;
const pay1Reread = B.parseCardBillPayment(PARTIAL, {
  date: P.extractDate(PARTIAL, '2026-08-24'),
  amount: 3000,
});
const leftover = {
  ...paidOnce[0],
  amount: 7000,
  paid: true,
  appliedPaymentKeys: [oldPayKey],
};
const notTwice = B.applyCardBillState([leftover], [], pay1Reread ? [pay1Reread] : [], offsets).next;
check('re-reading the payment date does not subtract it again', notTwice[0] && notTwice[0].amount, 7000);
check('a bill with remaining is not marked paid', notTwice[0] && notTwice[0].paid, false);

const wronglyPaid = {
  ...paidOnce[0],
  paid: true,
  amount: 7000,
};
const unstuck = B.applyCardBillState([wronglyPaid], [notice], [pay1], offsets).next;
check('remaining 7000 is shown unpaid even if paid was stuck', unstuck[0] && unstuck[0].paid, false);
check('remaining stays 7000 after Refresh', unstuck[0] && unstuck[0].amount, 7000);

const smsDayStmt = D.parseDueNotice(
  'Dear Customer, your HDFC Bank Credit Card 9981 statement is generated. Total Amount Due Rs.1000.00, Min Due Rs.50.00, Payment Due Date 05-09-2026.',
  { address: 'VM-HDFCBK', date: '2026-08-24' },
);
const keptManual = B.applyCardBillState(
  datedApplied,
  smsDayStmt ? [smsDayStmt] : [],
  [],
  offsets,
  midCycle.spends,
).next;
check(
  'Refresh does not replace a typed 19 Aug statement with the SMS day',
  keptManual.find((r) => r.cardLast4 === '9981') &&
    keptManual.find((r) => r.cardLast4 === '9981').statementDate,
  '2026-08-19',
);

const hdfc1111 = {
  id: 'card-bill:hdfc|1111',
  name: 'HDFC Card 1111',
  amount: 0,
  dueDate: '',
  paid: false,
  offsets,
  mode: 'default',
  source: 'card-bill',
  cardKey: 'hdfc|1111',
  cardLast4: '1111',
  cardIssuer: 'HDFC',
};
const hdfc2222 = {
  ...hdfc1111,
  id: 'card-bill:hdfc|2222',
  name: 'HDFC Card 2222',
  cardKey: 'hdfc|2222',
  cardLast4: '2222',
};
const hdfcStmt1111 = D.parseDueNotice(
  'Dear Customer, your HDFC Bank Credit Card 1111 statement is generated. Total Amount Due Rs.4500.00, Min Due Rs.225.00, Payment Due Date 18-09-2026.',
  { address: 'VM-HDFCBK', date: '2026-08-05' },
);
const twoHdfc = B.applyCardBillState([hdfc1111, hdfc2222], hdfcStmt1111 ? [hdfcStmt1111] : [], [], offsets).next;
check(
  'a statement on 1111 does not copy onto 2222 before the user answers',
  twoHdfc.find((r) => r.cardLast4 === '2222') && twoHdfc.find((r) => r.cardLast4 === '2222').totalDue,
  undefined,
);
check(
  'the 1111 statement still lands on 1111',
  twoHdfc.find((r) => r.cardLast4 === '1111') && twoHdfc.find((r) => r.cardLast4 === '1111').totalDue,
  4500,
);
check(
  'two same-bank cards ask about a shared limit',
  B.issuersNeedingSharedLimitAsk(twoHdfc).map((g) => g.issuer),
  ['HDFC'],
);
const sharedYes = B.applySharedCreditLimitAnswer(twoHdfc, 'HDFC', true);
check(
  'shared-limit yes copies the due date onto 2222',
  sharedYes.find((r) => r.cardLast4 === '2222') && sharedYes.find((r) => r.cardLast4 === '2222').dueDate,
  '2026-09-18',
);
check(
  'shared-limit yes copies the statement amount onto 2222',
  sharedYes.find((r) => r.cardLast4 === '2222') && sharedYes.find((r) => r.cardLast4 === '2222').totalDue,
  4500,
);
check(
  'shared-limit yes copies the statement date onto 2222',
  sharedYes.find((r) => r.cardLast4 === '2222') && sharedYes.find((r) => r.cardLast4 === '2222').statementDate,
  '2026-08-05',
);
check(
  'shared-limit cards list as one face',
  F.listCreditCardViews([], sharedYes, [], '2026-08-23').length,
  1,
);

const typedOnce = B.applyManualCardCycleDates(
  [
    { ...hdfc1111, sharedCreditLimit: true },
    { ...hdfc2222, sharedCreditLimit: true },
  ],
  { ...hdfc1111, sharedCreditLimit: true },
  { issuer: 'HDFC', last4: '1111' },
  { statementDate: '2026-08-19', dueDate: '2026-09-05', totalDue: 1200 },
  offsets,
);
check(
  'typing dates once copies the statement date onto 2222',
  typedOnce.find((r) => r.cardLast4 === '2222') && typedOnce.find((r) => r.cardLast4 === '2222').statementDate,
  '2026-08-19',
);
check(
  'typing dates once copies the due date onto 2222',
  typedOnce.find((r) => r.cardLast4 === '2222') && typedOnce.find((r) => r.cardLast4 === '2222').dueDate,
  '2026-09-05',
);
check(
  'typing dates once copies the amount onto 2222',
  typedOnce.find((r) => r.cardLast4 === '2222') && typedOnce.find((r) => r.cardLast4 === '2222').totalDue,
  1200,
);
check(
  'a shared-limit pair asks for dates on one face',
  F.cardsMissingCycleDates(F.listCreditCardViews([], typedOnce, [], '2026-08-23')).length,
  0,
);

const addedThird = B.applyAddCreditCard(sharedYes, { issuer: 'HDFC', last4: '3333' }, offsets);
check(
  'a third card on the same limit is not asked again',
  B.issuersNeedingSharedLimitAsk(addedThird).length,
  0,
);
check(
  'the third card gets the same statement date',
  addedThird.find((r) => r.cardLast4 === '3333') && addedThird.find((r) => r.cardLast4 === '3333').statementDate,
  '2026-08-05',
);
check(
  'the third card gets the same due date',
  addedThird.find((r) => r.cardLast4 === '3333') && addedThird.find((r) => r.cardLast4 === '3333').dueDate,
  '2026-09-18',
);
check(
  'the third card gets the same bill amount',
  addedThird.find((r) => r.cardLast4 === '3333') && addedThird.find((r) => r.cardLast4 === '3333').totalDue,
  4500,
);
check(
  'three shared-limit last 4s still list as one face',
  F.listCreditCardViews([], addedThird, [], '2026-08-23').length,
  1,
);
check(
  'Add card does not ask for dates again when the limit is already filled',
  !!(B.existingSharedLimitBill(addedThird, 'HDFC') && B.existingSharedLimitBill(addedThird, 'HDFC').totalDue === 4500),
  true,
);

const sharedNo = B.applySharedCreditLimitAnswer(twoHdfc, 'HDFC', false);
check(
  'shared-limit no leaves 2222 without that bill',
  !sharedNo.find((r) => r.cardLast4 === '2222')?.totalDue,
  true,
);
const sameBillSeparate = [
  { ...twoHdfc.find((r) => r.cardLast4 === '1111'), sharedCreditLimit: false },
  {
    ...twoHdfc.find((r) => r.cardLast4 === '2222'),
    sharedCreditLimit: false,
    amount: 4500,
    totalDue: 4500,
    dueDate: '2026-09-18',
    statementDate: '2026-08-05',
  },
];
check(
  'same-bank cards that do not share a limit stay as two faces',
  F.listCreditCardViews([], sameBillSeparate, [], '2026-08-23').length,
  2,
);

console.log('\n-- Gmail statement mail writes the same way as SMS --');

check('login Gmail must be the exact address', G.emailsMatch('ram@gmail.com', 'ram@gmail.com'), true);
check('a different Gmail is rejected', G.emailsMatch('ram@gmail.com', 'other@gmail.com'), false);
check('empty Gmail is rejected', G.emailsMatch('ram@gmail.com', ''), false);
check('a second Gmail is kept on the list', G.upsertGmailEmails(['ram@gmail.com'], 'cards@gmail.com'), [
  'ram@gmail.com',
  'cards@gmail.com',
]);
check('the same Gmail is not added twice', G.upsertGmailEmails(['ram@gmail.com'], 'Ram@gmail.com'), [
  'ram@gmail.com',
]);

const mailBody =
  'Your ICICI Bank Credit Card XX4412 statement is generated. Total Amt Due is Rs. 5432.10. Min Amt Due Rs. 250. Due Date 05Sep2026.';
const mailB64 = Buffer.from(mailBody, 'utf8')
  .toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');
const fromGmail = G.gmailMessagesToRaw([
  {
    id: 'gm1',
    internalDate: String(new Date('2026-08-20T08:00:00Z').getTime()),
    payload: {
      headers: [{ name: 'From', value: 'ICICI Bank <alerts@icicibank.com>' }],
      mimeType: 'text/plain',
      body: { data: mailB64 },
    },
  },
]);
check('Gmail payload becomes a message body', !!(fromGmail[0] && fromGmail[0].body.includes('5432.10')), true);
check('Gmail from-address is kept for the issuer', !!(fromGmail[0] && /icici/i.test(fromGmail[0].address || '')), true);

const fromMail = B.applyCardBillState([], [], [], offsets).next;
const mailNotice = D.parseDueNotice(fromGmail[0].body, {
  address: fromGmail[0].address,
  date: fromGmail[0].date,
});
const written = B.applyCardBillState(fromMail, mailNotice ? [mailNotice] : [], [], offsets).next;
check('Refresh writes the Gmail statement automatically', written[0] && written[0].cardLast4, '4412');
check('Gmail total due is stored', written[0] && written[0].totalDue, 5432.1);
check('Gmail due date is stored', written[0] && written[0].dueDate, '2026-09-05');

const otherCard = {
  id: 'card-bill:hdfc|9981',
  name: 'HDFC Card 9981',
  amount: 0,
  dueDate: '',
  paid: false,
  offsets,
  mode: 'default',
  source: 'card-bill',
  cardKey: 'hdfc|9981',
  cardLast4: '9981',
  cardIssuer: 'HDFC',
};
const mixed = B.applyCardBillState([otherCard], mailNotice ? [mailNotice] : [], [], offsets).next;
check(
  'Gmail ICICI mail does not overwrite an HDFC card',
  mixed.find((r) => r.cardLast4 === '9981') && mixed.find((r) => r.cardLast4 === '9981').amount,
  0,
);
check('Gmail ICICI mail lands on 4412', !!(mixed.find((r) => r.cardLast4 === '4412') && mixed.find((r) => r.cardLast4 === '4412').totalDue === 5432.1), true);

console.log('\n-- card bill expense reminders stay between statement+1 and due --');

const liveBill = {
  source: 'card-bill',
  paid: false,
  hidden: false,
  amount: 10000,
  statementDate: '2026-08-15',
  statementDateSource: 'sms',
  dueDate: '2026-09-18',
  dueDateSource: 'sms',
};
check('not live on the statement day', B.isCardBillReminderLive(liveBill, '2026-08-15'), false);
check('live the day after the statement', B.isCardBillReminderLive(liveBill, '2026-08-16'), true);
check('live on the due day', B.isCardBillReminderLive(liveBill, '2026-09-18'), true);
check('not live after the due day', B.isCardBillReminderLive(liveBill, '2026-09-19'), false);
check('not live once marked paid', B.isCardBillReminderLive({ ...liveBill, paid: true }, '2026-08-20'), false);
check('not live once remaining is 0', B.isCardBillReminderLive({ ...liveBill, amount: 0 }, '2026-08-20'), false);
check('not live once hidden', B.isCardBillReminderLive({ ...liveBill, hidden: true }, '2026-08-20'), false);
check(
  'not live without a statement date',
  B.isCardBillReminderLive({ ...liveBill, statementDate: undefined }, '2026-08-20'),
  false,
);

console.log('\n-- bill-pay SMS that still quote total due are payments, not statements --');

const PAY_AND_DUE =
  'Payment of Rs.3000 received towards your HDFC Bank Credit Card XX9981. Total Amount Due Rs.7000. Payment Due Date 18-09-2026.';
check('payment + remaining due is not a due notice', D.parseDueNotice(PAY_AND_DUE, { address: 'VM-HDFCBK', date: '2026-08-08' }), null);
const payAndDue = B.parseCardBillPayment(PAY_AND_DUE, { date: '2026-08-08', amount: 3000 });
check('payment + remaining due is a bill payment', !!(payAndDue && payAndDue.amount === 3000 && payAndDue.last4 === '9981'), true);
const payAndDueRow = P.parseImportMessage(
  { body: PAY_AND_DUE, address: 'VM-HDFCBK', date: '2026-08-08' },
  [],
);
check(
  'payment + remaining due still imports onto the card',
  !!(payAndDueRow && payAndDueRow.kind === 'income' && payAndDueRow.paymentType === 'card' && payAndDueRow.amount === 3000),
  true,
);
const payAndDueState = B.applyCardBillState([], [notice], [payAndDue], offsets).next;
check('Refresh subtracts a payment that still quotes due', payAndDueState[0] && payAndDueState[0].amount, 7000);

const ICICI_CREDIT =
  'INR 5000.00 has been credited to your ICICI Bank Credit Card XX4412 on 08-08-26.';
check(
  'credited to your <bank> Credit Card is a payment',
  !!(B.parseCardBillPayment(ICICI_CREDIT, { amount: 5000 }) && B.parseCardBillPayment(ICICI_CREDIT, { amount: 5000 }).last4 === '4412'),
  true,
);

const SBI_RECEIVED =
  'Payment of Rs.3200 received for your SBI Card ending 7788. Total amount due is now Rs.0.';
check('received for your SBI Card is a payment', !!B.parseCardBillPayment(SBI_RECEIVED, { amount: 3200 }), true);
check('received for your SBI Card is not a due notice', D.parseDueNotice(SBI_RECEIVED, { address: 'VK-SBICRD' }), null);

const BANK_TOWARDS =
  'Rs.2500.00 debited from A/c XX1234 towards HDFC Bank Credit Card XX9981 bill payment';
const bankTowards = B.parseCardBillPayment(BANK_TOWARDS, { date: '2026-08-08', amount: 2500 });
check('bank debit towards the card is a payment on Refresh', !!(bankTowards && bankTowards.last4 === '9981'), true);
const bankOnlyState = B.applyCardBillState([], [notice], [bankTowards], offsets).next;
check('Refresh subtracts a bank-only bill debit', bankOnlyState[0] && bankOnlyState[0].amount, 7500);

const TRANSFERRED =
  'Rs.4000 transferred from A/c XX1234 to HDFC BANK CREDIT CARD XX9981';
check(
  'transferred to the card is a bank-leg payment',
  !!B.parseCardBillPayment(TRANSFERRED, { amount: 4000 }),
  true,
);
const transferredRow = P.parseImportMessage(
  { body: TRANSFERRED, address: 'VM-HDFCBK', date: '2026-08-08' },
  R.BUILTIN_IMPORT_RULES,
);
check(
  'transferred to the card imports as a transfer',
  !!(transferredRow && transferredRow.kind === 'transfer' && transferredRow.toPaymentType === 'card'),
  true,
);

const CARD_CREDIT_2500 =
  'Payment of Rs.2500 received towards your HDFC Bank Credit Card XX9981. Thank you.';
const bothLegs = B.collectCardBillEvents(
  [
    { body: BANK_TOWARDS, address: 'VM-HDFCBK', date: '2026-08-08' },
    { body: CARD_CREDIT_2500, address: 'VM-HDFCBK', date: '2026-08-08' },
  ],
  [],
  P.extractAmount,
  P.extractDate,
);
check('bank debit + card credit of the same bill is one payment', bothLegs.payments.length, 1);
check('the kept leg is the card credit', bothLegs.payments[0] && bothLegs.payments[0].amount, 2500);

const POSTED =
  'Rs.1500 has been posted to your HDFC Bank Credit Card ending 9981.';
check('posted to your card is a payment', !!B.parseCardBillPayment(POSTED, { amount: 1500 }), true);

console.log('\n-- a bank a/c last 4 is not a credit card --');

const BANK_AC_1739 =
  'Sent Rs.20000.00\nFrom HDFC Bank A/C *1739\nTo GAJULA RAM KUMAR\nOn 04/08/26\nRef 511204758027\nNot You?\nCall 18002586161';
check('a bank A/C mask is not a card last 4', D.extractCardLast4(BANK_AC_1739), null);
check(
  'a bank A/C send is not a card spend',
  B.parseCardSpend(BANK_AC_1739, { address: 'VM-HDFCBK', date: '2026-08-04', amount: 20000 }),
  null,
);
check(
  'a bank A/C send is not a card-bill payment',
  B.parseCardBillPayment(BANK_AC_1739, { amount: 20000 }),
  null,
);
check(
  'Kotak Bank AC X6178 is not a card last 4',
  D.extractCardLast4('Sent Rs.20000.00 from Kotak Bank AC X6178 to billpay.axb@upi on 04-08-26'),
  null,
);
check(
  'a bank debit towards a named card keeps the card last 4',
  D.extractCardLast4(
    'Rs.2500.00 debited from A/c XX1739 towards HDFC Bank Credit Card XX9981 bill payment',
  ),
  '9981',
);
check(
  'a bank debit towards a card with no PAN is not last 4 1739',
  D.extractCardLast4('Rs.2500.00 debited from A/c XX1739 towards HDFC Bank Credit Card bill payment'),
  null,
);
check(
  'YES BANK Card X0690 is still a card last 4',
  D.extractCardLast4(YES_SPEND),
  '0690',
);

const bankAcEvents = B.collectCardBillEvents(
  [{ body: BANK_AC_1739, address: 'VM-HDFCBK', date: '2026-08-04' }],
  [],
  P.extractAmount,
  P.extractDate,
);
check('Refresh does not mint a card from a bank A/C send', bankAcEvents.spends.length, 0);
check('Refresh does not treat a bank A/C send as a payment', bankAcEvents.payments.length, 0);
const bankAcState = B.applyCardBillState(
  [],
  [],
  [],
  offsets,
  bankAcEvents.spends.length
    ? bankAcEvents.spends
    : [
        {
          last4: '1739',
          issuer: 'HDFC',
          amount: 20000,
          date: '2026-08-04',
          fingerprint: 'stale-1739',
          body: BANK_AC_1739,
        },
      ],
).next;
check('a stale bank A/C spend does not create a card face', bankAcState.length, 0);

const leftoverBankFace = {
  id: 'card-bill:hdfc|1739',
  name: 'HDFC Card 1739',
  amount: 0,
  dueDate: '',
  paid: false,
  offsets,
  mode: 'default',
  source: 'card-bill',
  cardKey: 'hdfc|1739',
  cardLast4: '1739',
  cardIssuer: 'HDFC',
  spendEvents: [
    {
      amount: 20000,
      date: '2026-08-04',
      fingerprint: 'stale-1739',
      body: BANK_AC_1739,
      last4: '1739',
      issuer: 'HDFC',
    },
  ],
};
check(
  'Credit cards does not list a bank a/c as a card',
  F.listCreditCardViews([], [leftoverBankFace], [], '2026-08-24').length,
  0,
);
const droppedBankFace = B.applyCardBillState([leftoverBankFace], [], [], offsets).next;
check('Refresh drops the bank a/c that was saved as a card', droppedBankFace.length, 0);

console.log('\n-- a shared-limit statement fills every add-on card --');

const iciciSharedEmpty = ['1111', '2222', '3333', '4444'].map((last4) => ({
  id: `card-bill:icici|${last4}`,
  name: `ICICI Card ${last4}`,
  amount: 0,
  dueDate: '',
  paid: false,
  offsets,
  mode: 'default',
  source: 'card-bill',
  cardKey: `icici|${last4}`,
  cardLast4: last4,
  cardIssuer: 'ICICI',
  sharedCreditLimit: true,
}));
check('ICICI statement last 4 is the primary PAN', icici && icici.last4, '4412');
const iciciUnshared = iciciSharedEmpty.map((r) => {
  const next = { ...r };
  delete next.sharedCreditLimit;
  return next;
}).slice(0, 2);
const iciciUnmatched = B.applyCardBillState(
  iciciUnshared,
  icici ? [icici] : [],
  [],
  offsets,
).next;
check(
  'an unmatched primary PAN does not copy onto add-ons before they answer',
  iciciUnmatched.filter((r) => (r.cardLast4 === '1111' || r.cardLast4 === '2222') && r.totalDue).length,
  0,
);
check(
  'Refresh still stores the unmatched primary PAN as its own card',
  iciciUnmatched.find((r) => r.cardLast4 === '4412' && !r.hidden) &&
    iciciUnmatched.find((r) => r.cardLast4 === '4412').totalDue,
  5432.1,
);
const iciciFilled = B.applyCardBillState(
  iciciSharedEmpty,
  icici ? [icici] : [],
  [],
  offsets,
).next;
const iciciFilledNamed = iciciFilled.filter((r) => r.source === 'card-bill' && !r.hidden && r.cardLast4);
check('Refresh does not mint a fifth ICICI card for the primary PAN', iciciFilledNamed.length, 4);
check(
  'every add-on card gets the statement amount',
  iciciFilledNamed.every((r) => Math.abs((r.totalDue || 0) - 5432.1) < 0.009),
  true,
);
check(
  'every add-on card gets the due date',
  iciciFilledNamed.every((r) => r.dueDate === '2026-09-05'),
  true,
);
check(
  'every add-on card gets the statement date',
  iciciFilledNamed.every((r) => r.statementDate === '2026-08-20'),
  true,
);
const iciciFilledView = F.listCreditCardViews([], iciciFilled, [], '2026-08-24');
check('the shared ICICI face shows the new remaining', iciciFilledView[0] && iciciFilledView[0].remaining, 5432.1);
check('the shared ICICI face shows the new due date', iciciFilledView[0] && iciciFilledView[0].dueDate, '2026-09-05');

const ICICI_ISSUER_STMT =
  'Your ICICI Bank Credit Card statement is generated. Total Amt Due is Rs. 3200.00. Min Amt Due Rs. 160. Due Date 05Sep2026.';
const iciciIssuerStmt = D.parseDueNotice(ICICI_ISSUER_STMT, {
  address: 'VM-ICICIB',
  date: '2026-08-20',
});
check('an ICICI statement with no last 4 still parses', !!(iciciIssuerStmt && iciciIssuerStmt.totalDue === 3200), true);
const iciciIssuerFilled = B.applyCardBillState(
  iciciSharedEmpty,
  iciciIssuerStmt ? [iciciIssuerStmt] : [],
  [],
  offsets,
).next;
check(
  'an issuer-only statement still fills the shared-limit add-ons',
  iciciIssuerFilled.filter((r) => r.cardLast4 && r.totalDue === 3200).length,
  4,
);

console.log('\n-- removing extra same-bank cards does not mark the real bill paid --');

const hdfcKeepBill = {
  id: 'card-bill:hdfc|9981',
  name: 'HDFC Card 9981',
  amount: 10000,
  dueDate: '2026-09-18',
  paid: false,
  offsets,
  mode: 'default',
  source: 'card-bill',
  cardKey: 'hdfc|9981',
  cardLast4: '9981',
  cardIssuer: 'HDFC',
  totalDue: 10000,
  statementDate: '2026-08-05',
  statementDateSource: 'sms',
  dueDateSource: 'sms',
  sharedCreditLimit: true,
};
const hdfcRemovedOther = {
  ...hdfcKeepBill,
  id: 'card-bill:hdfc|1111',
  name: 'HDFC Card 1111',
  cardKey: 'hdfc|1111',
  cardLast4: '1111',
  hidden: true,
  amount: 0,
  totalDue: undefined,
  paid: false,
};
const HDFC_ISSUER_PAY =
  'Payment of Rs.10000 received towards your HDFC Bank Credit Card. Thank you.';
const hdfcIssuerPay = B.parseCardBillPayment(HDFC_ISSUER_PAY, { date: '2026-08-08', amount: 10000 });
const hdfcAfterRemove = B.applyCardBillState(
  [hdfcKeepBill, hdfcRemovedOther],
  notice ? [notice] : [],
  hdfcIssuerPay ? [hdfcIssuerPay] : [],
  offsets,
).next;
const hdfcKept = hdfcAfterRemove.find((r) => r.cardLast4 === '9981' && !r.hidden);
check('the remaining HDFC card is not marked paid', hdfcKept && hdfcKept.paid, false);
check('the remaining HDFC card still shows the statement amount', hdfcKept && hdfcKept.amount, 10000);

const hdfcStuckPaid = {
  ...hdfcKeepBill,
  amount: 0,
  paid: true,
  appliedPaymentKeys: hdfcIssuerPay ? [hdfcIssuerPay.fingerprint] : [],
};
const hdfcUnstuck = B.applyCardBillState(
  [hdfcStuckPaid, hdfcRemovedOther],
  notice ? [notice] : [],
  hdfcIssuerPay ? [hdfcIssuerPay] : [],
  offsets,
).next;
const hdfcUnstuckKept = hdfcUnstuck.find((r) => r.cardLast4 === '9981' && !r.hidden);
check(
  'Refresh unsticks a bill that an issuer-only payment wrongly cleared',
  hdfcUnstuckKept && hdfcUnstuckKept.paid,
  false,
);
check(
  'Refresh restores remaining after a wrongly applied issuer-only payment',
  hdfcUnstuckKept && hdfcUnstuckKept.amount,
  10000,
);

const HDFC_NAMED_PAY =
  'HDFC Bank Cardmember, Online Payment of Rs.10000 vide Ref# FULL was credited to your card ending 9981 On 12/AUG/2026.';
const hdfcNamedPay = B.parseCardBillPayment(HDFC_NAMED_PAY, { date: '2026-08-12', amount: 10000 });
const hdfcNamedPaid = B.applyCardBillState(
  [hdfcKeepBill, hdfcRemovedOther],
  notice ? [notice] : [],
  hdfcNamedPay ? [hdfcNamedPay] : [],
  offsets,
).next;
const hdfcNamedKept = hdfcNamedPaid.find((r) => r.cardLast4 === '9981' && !r.hidden);
check('a payment that names this last 4 still clears the bill', hdfcNamedKept && hdfcNamedKept.paid, true);

console.log('\n-- typed statement-less bills survive Refresh --');

const typedNoSms = {
  id: 'card-bill:axis|5566',
  name: 'Axis Card 5566',
  amount: 4200,
  dueDate: '2026-08-28',
  paid: false,
  offsets,
  mode: 'default',
  source: 'card-bill',
  cardKey: 'axis|5566',
  cardLast4: '5566',
  cardIssuer: 'Axis',
  totalDue: 4200,
  statementDate: '2026-08-20',
  statementDateSource: 'manual',
  dueDateSource: 'manual',
};
const AXIS_ISSUER_PAY =
  'Payment of Rs.4200 received towards your Axis Bank Credit Card. Thank you.';
const axisIssuerPay = B.parseCardBillPayment(AXIS_ISSUER_PAY, { date: '2026-08-22', amount: 4200 });
const typedKept = B.applyCardBillState(
  [typedNoSms],
  [],
  axisIssuerPay ? [axisIssuerPay] : [],
  offsets,
).next;
check('a typed bill is not marked paid by an issuer-only payment', typedKept[0] && typedKept[0].paid, false);
check('a typed bill keeps its remaining', typedKept[0] && typedKept[0].amount, 4200);
check('a typed bill keeps the statement date', typedKept[0] && typedKept[0].statementDate, '2026-08-20');
check('a typed bill keeps the due date', typedKept[0] && typedKept[0].dueDate, '2026-08-28');

const tightUntagged = {
  ...typedNoSms,
  id: 'card-bill:axis|7788',
  name: 'Axis Card 7788',
  cardKey: 'axis|7788',
  cardLast4: '7788',
  dueDate: '2026-08-25',
  statementDate: '2026-08-20',
  statementDateSource: undefined,
  dueDateSource: undefined,
};
const tightKept = B.applyCardBillState([tightUntagged], [], [], offsets).next;
check(
  'Refresh does not wipe typed dates that sit close together',
  !!(tightKept[0] && tightKept[0].statementDate === '2026-08-20' && tightKept[0].dueDate === '2026-08-25'),
  true,
);
check('Refresh does not ask for the wiped dates again', tightKept[0] && tightKept[0].totalDue, 4200);

const typedAddon = {
  id: 'card-bill:icici|2222',
  name: 'ICICI Card 2222',
  amount: 2100,
  dueDate: '2026-09-05',
  paid: false,
  offsets,
  mode: 'default',
  source: 'card-bill',
  cardKey: 'icici|2222',
  cardLast4: '2222',
  cardIssuer: 'ICICI',
  totalDue: 2100,
  statementDate: '2026-08-10',
  statementDateSource: 'manual',
  dueDateSource: 'manual',
  sharedCreditLimit: true,
};
const emptyAddon = {
  ...typedAddon,
  id: 'card-bill:icici|1111',
  name: 'ICICI Card 1111',
  cardKey: 'icici|1111',
  cardLast4: '1111',
  amount: 0,
  totalDue: undefined,
  dueDate: '',
  statementDate: undefined,
  statementDateSource: undefined,
  dueDateSource: undefined,
  paid: false,
};
const mixedShared = B.applyCardBillState(
  [emptyAddon, typedAddon],
  icici ? [icici] : [],
  [],
  offsets,
).next;
const typedAddonAfter = mixedShared.find((r) => r.cardLast4 === '2222');
const emptyAddonAfter = mixedShared.find((r) => r.cardLast4 === '1111');
check('a typed add-on bill is not marked paid when the primary PAN statement arrives', typedAddonAfter && typedAddonAfter.paid, false);
check('a typed add-on bill keeps its remaining', typedAddonAfter && typedAddonAfter.amount, 2100);
check('the empty add-on still gets the primary PAN statement', emptyAddonAfter && emptyAddonAfter.totalDue, 5432.1);
check(
  'Refresh still does not mint the primary PAN as a fifth card',
  mixedShared.filter((r) => r.source === 'card-bill' && !r.hidden && r.cardLast4).length,
  2,
);

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall card-bill checks passed');
