/**
 * When a split is deleted, everyone in it has a Home transaction for their own
 * share that has to go with it. Deciding that from the outside is the risky
 * part: read it too eagerly and the app deletes real spending nobody asked it
 * to touch. So these cases are as much about what survives as what goes.
 *
 *   node scripts/check-split-orphans.js   (see package.json check:orphans)
 */

const path = require('path');

const OUT = process.argv[2] || process.env.ORPHANS_OUT || '.tmp-orphans';

const { findOrphanShareTxns } = require(path.join(process.cwd(), OUT, 'splitOrphans.js'));

let failed = 0;

function check(label, got, want) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  const ok = a === b;
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok ' : 'BAD'} ${label}`);
  if (!ok) console.log(`      got  ${a}\n      want ${b}`);
}

const LUNCH = { id: 't1', kind: 'expense', splitExpenseId: 'lunch' };
const CAB = { id: 't2', kind: 'expense', splitExpenseId: 'cab' };
const GROCERIES = { id: 't3', kind: 'expense' };
const SALARY = { id: 't4', kind: 'income' };

console.log('\n-- a split that is still there --');

check(
  'a share of a live split is left alone',
  findOrphanShareTxns([LUNCH], ['lunch']).txnIds,
  [],
);

check(
  'one split going does not take the other with it',
  findOrphanShareTxns([LUNCH, CAB], ['lunch']).txnIds,
  ['t2'],
);

console.log('\n-- a split that has gone --');

check(
  'the share of a deleted split is given up',
  findOrphanShareTxns([LUNCH], ['cab']).txnIds,
  ['t1'],
);

check(
  'the split is named once, however many rows point at it',
  findOrphanShareTxns(
    [LUNCH, { id: 't9', kind: 'expense', splitExpenseId: 'lunch' }],
    [],
  ).expenseIds,
  ['lunch'],
);

check(
  'a phone with no splits left gives up all of them',
  findOrphanShareTxns([LUNCH, CAB], []).txnIds,
  ['t1', 't2'],
);

console.log('\n-- what is never touched --');

check(
  'ordinary spending has no split to lose',
  findOrphanShareTxns([GROCERIES, SALARY], []).txnIds,
  [],
);

check(
  'money that changed hands stays, though its split is gone',
  findOrphanShareTxns(
    [{ id: 't5', kind: 'income', splitExpenseId: 'lunch', splitSettlementId: 's1' }],
    [],
  ).txnIds,
  [],
);

console.log('\n-- not knowing is not the same as knowing --');

check(
  'a list that could not be read deletes nothing',
  findOrphanShareTxns([LUNCH, CAB], null).txnIds,
  [],
);

check(
  'and neither does a list that never arrived',
  findOrphanShareTxns([LUNCH, CAB], undefined).txnIds,
  [],
);

console.log(failed ? `\n${failed} case(s) failed` : '\nall cases pass');
process.exit(failed ? 1 : 0);
