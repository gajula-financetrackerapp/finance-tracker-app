/**
 * Two callers can ask to write the same bank SMS at once: the app-open pass and
 * the Import screen, which a user may open while that pass is still writing.
 * Each brings its own snapshot of the ledger, so neither duplicate check can
 * see the other's work. These cases pin the behaviour that keeps one SMS one
 * transaction, without stopping a deliberate re-import after a delete.
 *
 *   node scripts/check-import-race.js   (see package.json check:race)
 */

const Module = require('module');
const path = require('path');

const OUT = process.argv[2] || process.env.IMPORT_RACE_OUT || '.tmp-race';

// The module under test reaches react-native and AsyncStorage on the way in.
// Neither exists off-device, and neither has anything to do with what is being
// checked here, so both are answered with the smallest thing that will do.
const store = new Map();
const stubs = {
  'react-native': {
    Platform: { OS: 'android' },
    NativeModules: {},
    PermissionsAndroid: { PERMISSIONS: {}, RESULTS: {}, request: async () => 'denied' },
  },
  '@react-native-async-storage/async-storage': {
    __esModule: true,
    default: {
      getItem: async (k) => (store.has(k) ? store.get(k) : null),
      setItem: async (k, v) => void store.set(k, v),
      removeItem: async (k) => void store.delete(k),
    },
  },
};

const realLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(stubs, request)) return stubs[request];
  return realLoad.call(this, request, parent, isMain);
};

const { writeImportRows } = require(path.join(process.cwd(), OUT, 'lib/autoSmsImport.js'));

const ACCOUNTS = [{ id: 'bank-1', name: 'Bank', kind: 'bank', openingBalance: 0 }];

function row(fingerprint, over = {}) {
  return {
    fingerprint,
    kind: 'expense',
    category: 'Others',
    amount: 250,
    date: '2026-08-19',
    note: 'SWIGGY',
    paymentType: 'bank',
    alreadyImported: false,
    selected: true,
    ...over,
  };
}

/** A ledger that grows as it is written to, the way the app's does. */
function ledger() {
  const transactions = [];
  return {
    transactions,
    addTransaction: async (txn) => {
      transactions.push({ id: `t${transactions.length + 1}`, ...txn });
    },
  };
}

let failed = 0;
function check(name, got, want) {
  const ok = got === want;
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok ' : 'FAIL'} ${name}${ok ? '' : `  (got ${got}, want ${want})`}`);
}

async function main() {
  // Both callers hold the same empty snapshot, which is exactly the race: the
  // second was decided before the first had written anything.
  {
    const book = ledger();
    const opts = {
      accounts: ACCOUNTS,
      fallbackAccountId: 'bank-1',
      transactions: book.transactions,
      addTransaction: book.addTransaction,
    };
    const [first, second] = await Promise.all([
      writeImportRows([row('fp-a')], opts),
      writeImportRows([row('fp-a')], opts),
    ]);
    const skipped = first.skippedFingerprints.length + second.skippedFingerprints.length;
    check('two overlapping runs write one SMS once', first.added + second.added, 1);
    check('the loser reports it as skipped', skipped, 1);
    check('the ledger holds one transaction', book.transactions.length, 1);
  }

  // The screen's list and the launch pass often overlap only partly.
  {
    const book = ledger();
    const opts = {
      accounts: ACCOUNTS,
      fallbackAccountId: 'bank-1',
      transactions: book.transactions,
      addTransaction: book.addTransaction,
    };
    const [first, second] = await Promise.all([
      writeImportRows([row('fp-b'), row('fp-c', { amount: 90 })], opts),
      writeImportRows([row('fp-c', { amount: 90 }), row('fp-d', { amount: 40 })], opts),
    ]);
    check('overlapping batches add three, not four', first.added + second.added, 3);
    check('and the ledger agrees', book.transactions.length, 3);
  }

  // A row settled by a related fingerprint — a card bill seen from both sides —
  // must not come back through the other caller's list.
  {
    const book = ledger();
    const opts = {
      accounts: ACCOUNTS,
      fallbackAccountId: 'bank-1',
      transactions: book.transactions,
      addTransaction: book.addTransaction,
    };
    const [first, second] = await Promise.all([
      writeImportRows([row('fp-e', { relatedFingerprints: ['fp-f'] })], opts),
      writeImportRows([row('fp-f')], opts),
    ]);
    check('a related fingerprint blocks its twin', first.added + second.added, 1);
  }

  // Deleting a transaction and scanning again is a later decision, so the row
  // is news once more. Without this the guard would be a one-way door.
  {
    const book = ledger();
    const opts = {
      accounts: ACCOUNTS,
      fallbackAccountId: 'bank-1',
      transactions: book.transactions,
      addTransaction: book.addTransaction,
    };
    const before = await writeImportRows([row('fp-g')], opts);
    check('first pass writes it', before.added, 1);
    book.transactions.length = 0; // the user deleted it
    const after = await writeImportRows([row('fp-g')], {
      ...opts,
      transactions: book.transactions,
    });
    check('a deleted row can be imported again', after.added, 1);
  }

  // The plain case still has to work: nothing racing, nothing saved.
  {
    const book = ledger();
    const res = await writeImportRows([row('fp-h'), row('fp-i', { amount: 12 })], {
      accounts: ACCOUNTS,
      fallbackAccountId: 'bank-1',
      transactions: book.transactions,
      addTransaction: book.addTransaction,
    });
    check('a lone run writes every row', res.added, 2);
  }

  console.log(failed ? `\n${failed} case(s) failed` : '\nall cases pass');
  process.exit(failed ? 1 : 0);
}

void main();
