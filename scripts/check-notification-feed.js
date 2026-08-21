/**
 * The bell has to be honest: a row appears because something is genuinely
 * waiting, and it leaves the moment that stops being true. These cases pin the
 * rules that decide what counts — and, just as importantly, what does not, since
 * a badge that cries wolf is one people learn to ignore.
 *
 *   node scripts/check-notification-feed.js   (see package.json check:feed)
 */

const Module = require('module');
const path = require('path');

const OUT = process.env.FEED_OUT || '.tmp-feed';

// The builder reaches i18n for its copy, which reaches the locale JSON. That
// works in node; react-native does not, and the navigation types are types only.
const realLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'android' }, I18nManager: { forceRTL: () => {} } };
  }
  return realLoad.call(this, request, parent, isMain);
};

const { buildNotificationFeed } = require(path.join(process.cwd(), OUT, 'lib/notificationFeed.js'));

const TODAY = '2026-08-20';

function dayOffset(days) {
  const d = new Date(`${TODAY}T00:00:00`);
  d.setDate(d.getDate() + days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const CONFIG = {
  language: 'en',
  currency: 'INR',
  expenseOffsets: [1, 0],
  groceryOffsets: [2, 1, 0],
};

function feed(over = {}) {
  return buildNotificationFeed({
    config: { ...CONFIG, ...(over.config || {}) },
    today: TODAY,
    expenseReminders: [],
    medReminders: [],
    groceryReminders: [],
    generalReminders: [],
    transactions: [],
    categoryBudgets: [],
    splitInvites: 0,
    splitToConfirm: 0,
    ...over,
  });
}

function bill(over = {}) {
  return {
    id: 'b1',
    name: 'Electricity',
    amount: 1200,
    dueDate: TODAY,
    paid: false,
    offsets: [1, 0],
    mode: 'default',
    ...over,
  };
}

let failed = 0;
function check(name, got, want) {
  const ok = got === want;
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok ' : 'FAIL'} ${name}${ok ? '' : `  (got ${got}, want ${want})`}`);
}

const idsOf = (rows) => rows.map((r) => r.id);
const has = (rows, prefix) => rows.some((r) => r.id.startsWith(prefix));

console.log('-- bills --');
check('a bill due today is listed', has(feed({ expenseReminders: [bill()] }), 'expense:'), true);
check(
  'a bill already paid is not',
  has(feed({ expenseReminders: [bill({ paid: true })] }), 'expense:'),
  false,
);
check(
  'a bill beyond the widest offset waits its turn',
  has(feed({ expenseReminders: [bill({ dueDate: dayOffset(9) })] }), 'expense:'),
  false,
);
check(
  'a bill with its own longer offset is listed early',
  has(
    feed({ expenseReminders: [bill({ dueDate: dayOffset(6), offsets: [7] })] }),
    'expense:',
  ),
  true,
);
check(
  'an overdue bill reads as late',
  feed({ expenseReminders: [bill({ dueDate: dayOffset(-3) })] })[0].tone,
  'late',
);
check(
  'overdue outranks upcoming',
  idsOf(
    feed({
      expenseReminders: [
        bill({ id: 'soon', dueDate: TODAY }),
        bill({ id: 'late', dueDate: dayOffset(-2) }),
      ],
    }),
  )[0],
  'expense:late:' + dayOffset(-2),
);
check(
  'the id holds the due date, so a rolled bill counts as new',
  idsOf(feed({ expenseReminders: [bill({ dueDate: dayOffset(-1) })] }))[0],
  `expense:b1:${dayOffset(-1)}`,
);

console.log('\n-- groceries and medicines --');
const grocery = (over = {}) => ({
  id: 'g1',
  category: 'Fridge',
  item: 'Milk',
  icon: '🥛',
  expiryDate: TODAY,
  offsets: [2, 1, 0],
  mode: 'default',
  ...over,
});
check('an item going off is listed', has(feed({ groceryReminders: [grocery()] }), 'grocery:'), true);
check(
  'one still fresh is not',
  has(feed({ groceryReminders: [grocery({ expiryDate: dayOffset(8) })] }), 'grocery:'),
  false,
);

const med = (over = {}) => ({
  id: 'm1',
  name: 'Metformin',
  frequency: 'daily',
  days: [],
  times: ['08:00', '20:00'],
  customTimes: {},
  done: {},
  mode: 'default',
  ...over,
});
check('an untaken medicine is listed', has(feed({ medReminders: [med()] }), 'medicine:'), true);
check(
  'four slots make one row, not four',
  feed({ medReminders: [med({ times: ['06:00', '10:00', '14:00', '22:00'] })] }).length,
  1,
);
check(
  'a medicine finished for today is not listed',
  has(
    feed({ medReminders: [med({ done: { [TODAY]: { '08:00': true, '20:00': true } } })] }),
    'medicine:',
  ),
  false,
);
check(
  'yesterday being done says nothing about today',
  has(
    feed({ medReminders: [med({ done: { [dayOffset(-1)]: { '08:00': true, '20:00': true } } })] }),
    'medicine:',
  ),
  true,
);

console.log('\n-- budgets --');
const txn = (over = {}) => ({
  id: 't1',
  kind: 'expense',
  category: 'Food',
  amount: 600,
  date: TODAY,
  note: '',
  ...over,
});
const foodBudget = { month: TODAY.slice(0, 7), category: 'Food', limit: 500 };
check(
  'going past a limit is listed',
  has(feed({ transactions: [txn()], categoryBudgets: [foodBudget] }), 'budget:'),
  true,
);
check(
  'staying inside it is not',
  has(
    feed({ transactions: [txn({ amount: 400 })], categoryBudgets: [foodBudget] }),
    'budget:',
  ),
  false,
);
check(
  'last month is history, not a task',
  has(
    feed({
      transactions: [txn({ date: '2026-07-14', amount: 900 })],
      categoryBudgets: [{ ...foodBudget, month: '2026-07' }],
    }),
    'budget:',
  ),
  false,
);
check(
  'income does not eat the budget',
  has(
    feed({
      transactions: [txn({ kind: 'income', amount: 5000 })],
      categoryBudgets: [foodBudget],
    }),
    'budget:',
  ),
  false,
);

console.log('\n-- split --');
check('friend requests are listed', has(feed({ splitInvites: 2 }), 'split:invites'), true);
check('settlements to confirm are listed', has(feed({ splitToConfirm: 1 }), 'split:confirm'), true);

console.log('\n-- nothing waiting --');
check('an empty app has an empty bell', feed().length, 0);

console.log(failed ? `\n${failed} case(s) failed` : '\nall cases pass');
process.exit(failed ? 1 : 0);
