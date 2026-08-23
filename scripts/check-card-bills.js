#!/usr/bin/env node
/**
 * Statement SMS become a card bill; a later card-credit reduces remaining.
 *
 *   npx tsc src/lib/importRules/parseDueNotice.ts src/lib/importRules/parseImportText.ts \
 *     src/lib/importRules/builtinRules.ts src/lib/cardBills.ts src/cashBooks.ts \
 *     --outDir .tmp-cardbills --module commonjs --target es2019 --skipLibCheck --moduleResolution node
 *   node scripts/check-card-bills.js .tmp-cardbills
 */
const path = require('path');

const OUT = path.resolve(process.argv[2] || process.env.CARDBILLS_OUT || '.tmp-cardbills');
const D = require(path.join(OUT, 'lib', 'importRules', 'parseDueNotice.js'));
const P = require(path.join(OUT, 'lib', 'importRules', 'parseImportText.js'));
const R = require(path.join(OUT, 'lib', 'importRules', 'builtinRules.js'));
const B = require(path.join(OUT, 'lib', 'cardBills.js'));

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
check('not bill-paid until the user marks it', next[0] && next[0].paid, false);

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

const spendWithLimit =
  'Thank you for using your BOBCARD ending 4455. Rs.1200 spent at Amazon. Outstanding Rs.8900. Available credit limit Rs.4100.';
check('spend + outstanding is not a due notice', D.parseDueNotice(spendWithLimit), null);
const spendRow = P.parseImportMessage(
  { body: spendWithLimit, address: 'AD-BOBCARD', date: '2026-08-18' },
  R.BUILTIN_IMPORT_RULES,
);
check('spend + outstanding still imports as a card expense', !!(spendRow && spendRow.kind === 'expense'), true);

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall card-bill checks passed');
