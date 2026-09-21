/**
 * Split amounts are added as numbers. The header picker only changes the
 * symbol — it must not hide IOUs or convert them.
 *
 *   npm run check:splitbal
 */
const Module = require('module');
const path = require('path');

const OUT = path.resolve(process.argv[2] || process.env.SPLITBAL_OUT || '.tmp-splitbal');

const stubs = {
  'react-native': {
    Platform: { OS: 'android' },
    I18nManager: { forceRTL: () => {} },
  },
  'expo-secure-store': {
    getItemAsync: async () => null,
    setItemAsync: async () => {},
    deleteItemAsync: async () => {},
  },
  'expo-constants': {
    __esModule: true,
    expoConfig: { extra: {} },
    default: { expoConfig: { extra: {} } },
  },
  'react-native-url-polyfill/auto': {},
  '@supabase/supabase-js': {
    createClient: () => ({
      from: () => ({}),
      rpc: () => ({}),
      auth: {},
    }),
  },
};

const realLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(stubs, request)) return stubs[request];
  return realLoad.call(this, request, parent, isMain);
};

const S = require(path.join(OUT, 'lib', 'splitExpense.js'));

let failures = 0;

function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'BAD '}${label}`);
  if (!ok) console.log(`       got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
}

const ME = 'user-me';
const FRIEND = 'user-friend';

function lunch(currency) {
  return {
    id: 'exp-lunch',
    created_by: ME,
    description: 'Lunch',
    amount: 1000,
    currency,
    paid_by: ME,
    split_mode: 'equal',
    expense_date: '2026-09-21',
    created_at: '2026-09-21T10:00:00.000Z',
    shares: [
      { user_id: ME, share_amount: 500 },
      { user_id: FRIEND, share_amount: 500 },
    ],
    group_id: null,
  };
}

const group = {
  id: 'group-1',
  owner_id: ME,
  name: 'Trip',
  created_at: '2026-09-01',
  member_ids: [ME, FRIEND],
};

const groupLunch = { ...lunch('INR'), id: 'exp-group', group_id: group.id };

console.log('-- picker is a symbol; INR IOUs still show when the picker is USD --');

const usdPicker = S.computeSplitBalances(ME, [lunch('INR')], [], 'USD');
check('USD picker still lists the INR lunch', usdPicker.length, 1);
check('the listed IOU is still 500', usdPicker[0] && usdPicker[0].amount, 500);

check('USD label keeps the same 500', S.splitMoneyLabel(500, 'USD'), '$500.00');
check('INR label keeps the same 500', S.splitMoneyLabel(500, 'INR'), '₹500.00');

check(
  'a group with an INR IOU is not settled just because the picker is USD',
  S.isGroupFullySettled(group, [groupLunch], [], 'USD'),
  false,
);

const owed = S.computeScopedOwedPairs([ME, FRIEND], [groupLunch], [], 'USD', group.id);
check('who-owes still lists the debt when picker is USD', owed.length, 1);
check('who-owes amount is 500', owed[0] && owed[0].amount, 500);

const usdCoffee = {
  ...lunch('USD'),
  id: 'exp-coffee',
  amount: 20,
  shares: [
    { user_id: ME, share_amount: 10 },
    { user_id: FRIEND, share_amount: 10 },
  ],
};
const mixed = S.computeSplitBalances(ME, [lunch('INR'), usdCoffee], []);
check('INR 500 and USD 10 add into one row', mixed.length, 1);
check('mixed total is 510', mixed[0] && mixed[0].amount, 510);

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall split-balance checks passed');
