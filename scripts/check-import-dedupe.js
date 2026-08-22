#!/usr/bin/env node
/**
 * Prove the import duplicate check on the cases that matter.
 *
 * Compile the module first, since it is TypeScript:
 *   npx tsc src/lib/importDedupe.ts --outDir /tmp/dedupe --module commonjs \
 *     --target es2019 --skipLibCheck --moduleResolution node
 *   node scripts/check-import-dedupe.js
 */
const path = require('path');

// Resolved from the working directory, or require reads a bare path as a package.
const OUT = path.resolve(process.argv[2] || process.env.DEDUPE_OUT || '.tmp-dedupe');
const { makeDuplicateCheck } = require(path.join(OUT, 'lib', 'importDedupe.js'));

let failures = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'BAD '}${name}`);
  if (!ok) console.log(`       got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

const sms = (fingerprint, amount, date, note, extra = {}) => ({
  fingerprint,
  kind: 'expense',
  category: 'Food',
  amount,
  date,
  note,
  ruleId: 'r1',
  ruleName: 'Bank',
  sourceLabel: 'HDFCBK',
  rawText: '',
  paymentType: 'bank',
  selected: true,
  ...extra,
});

const txn = (over) => ({
  id: 'x',
  kind: 'expense',
  category: 'Food',
  amount: 100,
  date: '2026-08-01',
  note: 'UPI · Swiggy',
  ...over,
});

const run = (transactions, rows) => {
  const c = makeDuplicateCheck(transactions);
  return rows.map((r) => c.isAlreadyImported(r));
};

// Nothing saved yet, so nothing is a duplicate.
check(
  'first scan imports everything',
  run([], [sms('fp1', 100, '2026-08-01', 'UPI · Swiggy'), sms('fp2', 250, '2026-08-02', 'UPI · Zepto')]),
  [false, false]
);

// The whole point: scan again after importing and every row is recognised.
check(
  'second scan blocks what it already added',
  run(
    [txn({ importKey: 'fp1' }), txn({ importKey: 'fp2', amount: 250, date: '2026-08-02' })],
    [sms('fp1', 100, '2026-08-01', 'UPI · Swiggy'), sms('fp2', 250, '2026-08-02', 'UPI · Zepto')]
  ),
  [true, true]
);

// A row whose SMS was folded into another row must be caught by either key.
check(
  'related fingerprints count as the same money',
  run([txn({ importKey: 'fpB' })], [sms('fpA', 100, '2026-08-01', 'UPI · Swiggy', { relatedFingerprints: ['fpB'] })]),
  [true]
);

// Imported before the fingerprint was stored: matched on what it looks like.
check(
  'older imports without a key are still matched',
  run([txn({})], [sms('fp1', 100, '2026-08-01', 'UPI · Swiggy')]),
  [true]
);

// Two real payments, same shop, same amount, same day, one already saved.
// The first row is the saved one; the second is a genuine second payment.
check(
  'a real repeat payment is not swallowed',
  run(
    [txn({})],
    [sms('fpA', 100, '2026-08-01', 'UPI · Swiggy'), sms('fpB', 100, '2026-08-01', 'UPI · Swiggy')]
  ),
  [true, false]
);

// Both saved, so both rows are duplicates.
check(
  'both repeats blocked once both are saved',
  run(
    [txn({}), txn({ id: 'y' })],
    [sms('fpA', 100, '2026-08-01', 'UPI · Swiggy'), sms('fpB', 100, '2026-08-01', 'UPI · Swiggy')]
  ),
  [true, true]
);

// Deleting the transaction should let it come back on the next scan.
check('a deleted transaction can be imported again', run([], [sms('fp1', 100, '2026-08-01', 'UPI · Swiggy')]), [false]);

// A different amount, date or note is a different transaction.
check(
  'near misses are not duplicates',
  run(
    [txn({ importKey: 'fp1' })],
    [
      sms('fp9', 101, '2026-08-01', 'UPI · Swiggy'),
      sms('fp8', 100, '2026-08-02', 'UPI · Swiggy'),
      sms('fp7', 100, '2026-08-01', 'UPI · Zomato'),
    ]
  ),
  [false, false, false]
);

// Income and expense of the same size on the same day are not each other.
check(
  'kind is part of the identity',
  run([txn({ kind: 'income' })], [sms('fp1', 100, '2026-08-01', 'UPI · Swiggy')]),
  [false]
);

// Amounts are stored positive; a negative one must still match.
check(
  'sign of the stored amount does not matter',
  run([txn({ amount: -100 })], [sms('fp1', 100, '2026-08-01', 'UPI · Swiggy')]),
  [true]
);

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
