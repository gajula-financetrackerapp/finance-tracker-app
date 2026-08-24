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
  'a generic leftover note can attach to the card whose SMS spend matches',
  B.txnNoteFitsCard('Card · Bank · DMART AVENUE SUPERMART', idfcCard, {
    day: '2026-08-17',
    amount: 5434.55,
    spends: idfcSpend ? [idfcSpend] : [],
  }),
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
  yesStmtRows.some((r) => (r.source === 'statement' || r.source === 'due') && Math.round(r.amount) === 361),
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

console.log('\n-- Gmail statement mail writes the same way as SMS --');

check('login Gmail must be the exact address', G.emailsMatch('ram@gmail.com', 'ram@gmail.com'), true);
check('a different Gmail is rejected', G.emailsMatch('ram@gmail.com', 'other@gmail.com'), false);
check('empty Gmail is rejected', G.emailsMatch('ram@gmail.com', ''), false);

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

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall card-bill checks passed');
