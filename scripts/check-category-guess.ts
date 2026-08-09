import {
  applyCategorySeeds,
  CATEGORY_SEEDS,
  DEFAULT_EXPENSE_CATS,
  DEFAULT_INCOME_CATS,
} from '../src/categories/defaults';
import { GUESSABLE_CATEGORIES } from '../src/lib/importRules/categoryGuess';
import { activeImportRules, mergeImportRules } from '../src/lib/importRules/merge';
import { parseImportMessage } from '../src/lib/importRules/parseImportText';

const rules = activeImportRules(mergeImportRules(null));

const cases: Array<[string, string]> = [
  ['Rs.349 debited from a/c XX1234 on 05-08-26 to SWIGGY via UPI. Ref 5512. -HDFC Bank', 'Food'],
  ['INR 1,240.00 spent on your HDFC Bank Credit Card XX1234 at BLINKIT on 04-08-26', 'Groceries'],
  ['Rs 799 debited a/c XX9999 UPI to SWIGGY INSTAMART Ref 8811 -SBI', 'Groceries'],
  ['Rs.2,499 spent on ICICI Bank Card XX4321 at AMAZON PAY INDIA on 03-08-26', 'Shopping'],
  ['Rs.180 paid to UBER INDIA SYSTEMS from a/c XX1234 via UPI -Axis Bank', 'Transportation'],
  ['Rs.2,000.00 debited from A/c XX1234 at INDIAN OIL PETROL PUMP on 02-08-26 -SBI', 'Car'],
  ['INR 649 debited towards NETFLIX SUBSCRIPTION from a/c XX1234 -HDFC Bank', 'Entertainment'],
  ['Rs.1,150 paid to APOLLO PHARMACY via UPI from a/c XX1234 -ICICI', 'Health'],
  ['Rs.599 debited for AIRTEL PREPAID RECHARGE from a/c XX1234 -Axis', 'Recharge'],
  ['Rs.12,450 debited a/c XX1234 to MAKEMYTRIP INDIA on 01-08-26 -HDFC', 'Travel'],
  ['Rs.3,200 spent on HDFC Card XX1234 at MYNTRA DESIGNS on 06-08-26', 'Clothing'],
  ['Rs.4,500 debited from a/c XX1234 towards ELECTRICITY BILL BESCOM -Canara Bank', 'Electricity Bill'],
  ['Rs.22,000 paid to LANDLORD towards HOUSE RENT via UPI from a/c XX1234 -SBI', 'Housing'],
  ['Rs.1,899 paid to DECATHLON SPORTS INDIA via UPI -Axis Bank', 'Sports'],
  ['Rs.2,150 debited a/c XX1234 to CROMA RETAIL on 07-08-26 -HDFC', 'Electronics'],
  ['Rs.760 paid to NYKAA E RETAIL from a/c XX1234 via UPI -SBI', 'Beauty'],
  ['Rs.1,299 debited a/c XX1234 to FIRSTCRY COM on 03-08-26 -ICICI', 'Kids'],
  ['Rs.899 paid to URBAN COMPANY via UPI from a/c XX1234 -HDFC', 'Home'],
  ['Rs.14,999 debited a/c XX1234 towards UNACADEMY course fee -Axis', 'Education'],
  ['Rs.18,450 debited from a/c XX1234 towards HOME LOAN EMI for AUG -HDFC', 'EMI'],
  ['Rs.25,000 debited a/c XX1234 towards PERSONAL LOAN repayment -Axis Bank', 'Loans'],
  ['Rs.3,120 debited a/c XX1234 for BESCOM ELECTRICITY BILL via BBPS -Canara', 'Electricity Bill'],
  ['Rs.1,099 debited a/c XX1234 towards ACT FIBERNET broadband bill -ICICI', 'Internet Bill'],
  ['Rs.1,150 paid to MAHANAGAR GAS BILL from a/c XX1234 -HDFC', 'Gas Bill'],
  ['Rs.640 debited a/c XX1234 towards BWSSB WATER BILL -SBI', 'Water Bill'],
  ['Rs.2,499 paid to CULT FIT gym membership via UPI from a/c XX1234 -Axis', 'Gym Bill'],
  ['Rs.399 debited a/c XX1234 for AIRTEL PREPAID RECHARGE -HDFC', 'Recharge'],
  ['Rs.870 debited a/c XX1234 via BILLDESK BILL PAYMENT ref 7781 -SBI', 'Bill Pay'],
  ['Rs.85,000 credited to a/c XX1234 towards SALARY for JUL 2026 -HDFC Bank', 'Salary'],
  ['Rs.1,240 credited to a/c XX1234 as DIVIDEND from ITC LTD -SBI', 'Investments'],
  ['Rs.150 credited to a/c XX1234 as CASHBACK on your UPI payment -HDFC', 'Cashback'],
  // Broadband must beat the Airtel recharge tokens.
  ['Rs.1,499 debited a/c XX1234 for AIRTEL XSTREAM FIBER bill -Axis', 'Internet Bill'],
  // Must stay Others: no merchant signal at all.
  ['Rs.500 debited from a/c XX1234 on 05-08-26. Ref 99120. -HDFC Bank', 'Others'],
  ['Rs.2,000 credited to a/c XX1234 by UPI from RAMESH KUMAR -SBI', 'Others'],
];

let fail = 0;
for (const [body, want] of cases) {
  const parsed = parseImportMessage({ body, address: 'HDFCBK', date: Date.now() }, rules);
  const got = parsed?.category ?? '(not parsed)';
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${want.padEnd(15)} got=${got.padEnd(15)} ${body.slice(0, 60)}`);
}

// A bucket naming a category the app doesn't have can only ever yield Others.
for (const kind of ['expense', 'income'] as const) {
  const defaults = kind === 'income' ? DEFAULT_INCOME_CATS : DEFAULT_EXPENSE_CATS;
  const names = new Set(defaults.map((c) => c.name));
  for (const name of GUESSABLE_CATEGORIES[kind]) {
    if (!names.has(name)) {
      console.log(`FAIL  ${kind} bucket "${name}" is not a default category`);
      fail++;
    }
  }
}

// --- one-time seeding of new categories onto an existing install ---
const seeded = new Set(CATEGORY_SEEDS.flatMap((s) => [...(s.expense || []), ...(s.income || [])]));
const oldInstall = {
  expense: DEFAULT_EXPENSE_CATS.filter((c) => !seeded.has(c.name)).map((c) => ({ ...c })),
  income: DEFAULT_INCOME_CATS.filter((c) => !seeded.has(c.name)).map((c) => ({ ...c })),
};

function check(label: string, cond: boolean) {
  if (!cond) fail++;
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}`);
}

const first = applyCategorySeeds(oldInstall, []);
check('seed adds every new category', seeded.size > 0 &&
  [...seeded].every((n) => [...first.expense, ...first.income].some((c) => c.name === n)));
check('seed keeps Others last', first.expense[first.expense.length - 1].name === 'Others' &&
  first.income[first.income.length - 1].name === 'Others');
check('seed reports a change', first.changed && first.newlyApplied.length > 0);

const again = applyCategorySeeds(first, first.newlyApplied);
check('seed is idempotent', !again.changed && again.newlyApplied.length === 0 &&
  again.expense.length === first.expense.length);

const afterDelete = {
  expense: first.expense.filter((c) => c.name !== 'Gym Bill'),
  income: first.income,
};
const resurrect = applyCategorySeeds(afterDelete, first.newlyApplied);
check('a deleted seeded category stays deleted',
  !resurrect.expense.some((c) => c.name === 'Gym Bill'));

const fresh = applyCategorySeeds(
  { expense: [...DEFAULT_EXPENSE_CATS], income: [...DEFAULT_INCOME_CATS] },
  [],
);
check('fresh install gains no duplicates', !fresh.changed &&
  fresh.expense.length === DEFAULT_EXPENSE_CATS.length);

console.log(fail === 0 ? '\nall passed' : `\n${fail} failed`);
