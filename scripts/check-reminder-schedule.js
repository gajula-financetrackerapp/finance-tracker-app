/**
 * A reminder that has to survive the app being closed is booked with Android
 * ahead of time, from the plan these cases pin down. Two ways to get it wrong
 * both end badly: miss an alarm someone was relying on, or wake them for a dose
 * they already took. So each case is about what gets booked and what does not.
 *
 *   node scripts/check-reminder-schedule.js   (see package.json check:schedule)
 */

const Module = require('module');
const path = require('path');

const OUT = process.argv[2] || process.env.SCHEDULE_OUT || '.tmp-schedule';

// The planner reaches i18n for its copy, which reaches the locale JSON. That
// works in node; react-native does not.
const realLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'android' }, I18nManager: { forceRTL: () => {} } };
  }
  return realLoad.call(this, request, parent, isMain);
};

const { buildScheduledAlarms, schedulePrint } = require(
  path.join(process.cwd(), OUT, 'alarms/schedule.js'),
);

/** A Thursday, at half past nine in the morning. */
const NOW = new Date('2026-08-20T09:30:00').getTime();
const TODAY = '2026-08-20';

function dayOffset(days) {
  const d = new Date(`${TODAY}T00:00:00`);
  d.setDate(d.getDate() + days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const CONFIG = {
  alarmsEnabled: true,
  alarmSound: true,
  alarmVibration: true,
  language: 'en',
  currency: 'INR',
  medicineTimes: { Morning: '08:00', Afternoon: '13:00', Evening: '19:00' },
  alertTime: '09:00',
  expenseOffsets: [1, 0],
  groceryOffsets: [2, 1, 0],
  alarmDurationSec: 60,
  features: {},
};

function plan(over = {}, opts = {}) {
  return buildScheduledAlarms(
    {
      config: { ...CONFIG, ...(over.config || {}) },
      expenseReminders: [],
      medReminders: [],
      groceryReminders: [],
      generalReminders: [],
      dismissedKeys: [],
      snoozeUntil: {},
      ...over,
    },
    { now: NOW, ...opts },
  );
}

function bill(over = {}) {
  return {
    id: 'b1',
    name: 'Electricity',
    amount: 1200,
    dueDate: dayOffset(3),
    paid: false,
    offsets: [1, 0],
    mode: 'default',
    ...over,
  };
}

function cardBill(over = {}) {
  return {
    id: 'c1',
    name: 'HDFC Card 9981',
    amount: 8200,
    dueDate: dayOffset(3),
    statementDate: dayOffset(-20),
    statementDateSource: 'sms',
    dueDateSource: 'sms',
    paid: false,
    source: 'card-bill',
    offsets: [1, 0],
    mode: 'default',
    ...over,
  };
}

function medicine(over = {}) {
  return {
    id: 'm1',
    name: 'Metformin',
    frequency: 'daily',
    days: [],
    times: ['Morning', 'Evening'],
    customTimes: {},
    done: {},
    mode: 'default',
    ...over,
  };
}

function grocery(over = {}) {
  return {
    id: 'g1',
    category: 'Dairy',
    item: 'Milk',
    icon: '🥛',
    expiryDate: dayOffset(4),
    offsets: [2, 1, 0],
    mode: 'default',
    ...over,
  };
}

function general(over = {}) {
  return {
    id: 'r1',
    title: 'Call the bank',
    date: dayOffset(1),
    time: '10:00',
    repeat: 'once',
    days: [],
    done: false,
    ...over,
  };
}

let failed = 0;
function check(name, got, want) {
  const ok = got === want;
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok ' : 'FAIL'} ${name}${ok ? '' : `  (got ${got}, want ${want})`}`);
}

const keys = (rows) => rows.map((r) => r.key);
const count = (rows, prefix) => rows.filter((r) => r.key.startsWith(prefix)).length;
const at = (rows, key) => rows.find((r) => r.key === key)?.at;

console.log('-- the master switch --');
check(
  'nothing is booked while alarms are off',
  plan({ config: { alarmsEnabled: false }, medReminders: [medicine()] }).length,
  0,
);

console.log('-- medicine --');
const daily = plan({ medReminders: [medicine()] }, { horizonDays: 2 });
check(
  'both of today’s remaining slots and the next two days are booked',
  count(daily, 'med:'),
  // Morning today has gone at 09:30; evening today, then two full days.
  5,
);
check(
  'the slot that has already passed today is left to the in-app alarm',
  keys(daily).includes(`med:m1:${TODAY}:Morning`),
  false,
);
check(
  'a dose already marked done is not booked',
  keys(
    plan(
      { medReminders: [medicine({ done: { [dayOffset(1)]: { Morning: true } } })] },
      { horizonDays: 1 },
    ),
  ).includes(`med:m1:${dayOffset(1)}:Morning`),
  false,
);
check(
  'a weekly dose is booked only on its days',
  count(
    plan({ medReminders: [medicine({ frequency: 'weekly', days: ['Sat'] })] }, { horizonDays: 7 }),
    'med:',
  ),
  // One Saturday in the next seven days, twice a day.
  2,
);
check(
  'a custom slot time is honoured',
  at(
    plan({ medReminders: [medicine({ mode: 'custom', customTimes: { Evening: '21:15' } })] }),
    `med:m1:${TODAY}:Evening`,
  ),
  new Date(`${TODAY}T21:15:00`).getTime(),
);

console.log('-- bills --');
check(
  'every warning day for a bill is booked, not just the first',
  count(plan({ expenseReminders: [bill()] }), 'exp:'),
  2,
);
check('a paid bill is not booked', count(plan({ expenseReminders: [bill({ paid: true })] }), 'exp:'), 0);
check(
  'a bill due beyond the horizon waits for a later launch',
  count(plan({ expenseReminders: [bill({ dueDate: dayOffset(30) })] }), 'exp:'),
  0,
);
check(
  'the warning lands at the daily alert time',
  at(plan({ expenseReminders: [bill()] }), `exp:b1:${dayOffset(3)}:1`),
  new Date(`${dayOffset(2)}T09:00:00`).getTime(),
);
check(
  'a bill the user has already dealt with is not booked again',
  count(
    plan({ expenseReminders: [bill()], dismissedKeys: [`exp:b1:${dayOffset(3)}:1`] }),
    'exp:',
  ),
  1,
);

console.log('-- groceries --');
check(
  'each expiry warning is booked',
  count(plan({ groceryReminders: [grocery()] }), 'groc:'),
  3,
);
check(
  'a warning whose day has gone is skipped',
  count(plan({ groceryReminders: [grocery({ expiryDate: TODAY })] }), 'groc:'),
  // Two days before, one day before and today at 09:00 have all passed.
  0,
);

console.log('-- general reminders --');
check('a one-off is booked once', count(plan({ generalReminders: [general()] }), 'gen:'), 1);
check(
  'a one-off already done is not booked',
  count(plan({ generalReminders: [general({ done: true })] }), 'gen:'),
  0,
);
check(
  'a daily reminder is booked for every day ahead',
  count(plan({ generalReminders: [general({ repeat: 'daily' })] }, { horizonDays: 3 }), 'gen:'),
  // 10:00 today is still to come, so today and the three days after it.
  4,
);
check(
  'today is skipped once the daily reminder is done',
  count(
    plan(
      { generalReminders: [general({ repeat: 'daily', doneDate: TODAY })] },
      { horizonDays: 3 },
    ),
    'gen:',
  ),
  3,
);
check(
  'a weekly reminder only lands on its days',
  count(
    plan({ generalReminders: [general({ repeat: 'weekly', days: ['Mon'] })] }, { horizonDays: 7 }),
    'gen:',
  ),
  1,
);

console.log('-- card bills --');
check(
  'a live card bill still books its offset days',
  count(plan({ expenseReminders: [cardBill()] }), 'exp:'),
  2,
);
check(
  'a card bill is not booked on the statement day',
  count(
    plan(
      {
        expenseReminders: [
          cardBill({
            statementDate: TODAY,
            dueDate: dayOffset(10),
            offsets: [10, 0],
            mode: 'custom',
          }),
        ],
      },
      { now: new Date('2026-08-20T08:00:00').getTime() },
    ),
    'exp:',
  ),
  1,
);
check(
  'a paid card bill is not booked',
  count(plan({ expenseReminders: [cardBill({ paid: true })] }), 'exp:'),
  0,
);

console.log('-- order and limits --');
const mixed = plan({
  medReminders: [medicine()],
  expenseReminders: [bill()],
  generalReminders: [general({ repeat: 'daily' })],
});
check(
  'the queue is in the order it will arrive',
  mixed.every((row, i) => i === 0 || mixed[i - 1].at <= row.at),
  true,
);
check(
  'the nearest alarms win when the queue is capped',
  plan({ medReminders: [medicine()] }, { limit: 3 }).length,
  3,
);
const snoozeKey = `gen:r1:${dayOffset(1)}:once`;
const snoozedTo = new Date(`${dayOffset(2)}T00:00:00`).getTime();
const snoozed = plan({ generalReminders: [general()], snoozeUntil: { [snoozeKey]: snoozedTo } });
check(
  'a snoozed alarm is booked once, at the moment the snooze runs out',
  count(snoozed, 'gen:'),
  1,
);
check('the snoozed alarm no longer arrives at its own time', at(snoozed, snoozeKey), snoozedTo);
check(
  'a snooze that ran out before the alarm is due changes nothing',
  at(
    plan({ generalReminders: [general()], snoozeUntil: { [snoozeKey]: NOW - 60000 } }),
    snoozeKey,
  ),
  new Date(`${dayOffset(1)}T10:00:00`).getTime(),
);
check(
  'a snooze past the horizon is not booked at all',
  count(
    plan({
      generalReminders: [general()],
      snoozeUntil: { [snoozeKey]: new Date(`${dayOffset(30)}T00:00:00`).getTime() },
    }),
    'gen:',
  ),
  0,
);

console.log('-- rebuild guard --');
const a = plan({ medReminders: [medicine()] });
const b = plan({ medReminders: [medicine()] });
check(
  'the same plan prints the same, so nothing is re-booked',
  schedulePrint(a, 'reminders-sound-buzz') === schedulePrint(b, 'reminders-sound-buzz'),
  true,
);
check(
  'changing a switch prints differently, so the channel moves',
  schedulePrint(a, 'reminders-sound-buzz') === schedulePrint(a, 'reminders-silent-still'),
  false,
);

console.log(failed ? `\n${failed} failing` : '\nall good');
process.exit(failed ? 1 : 0);
