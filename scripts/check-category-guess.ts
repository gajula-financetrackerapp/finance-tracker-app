import { DEFAULT_EXPENSE_CATS, DEFAULT_INCOME_CATS } from '../src/categories/defaults';
import { guessImportCategory } from '../src/lib/importRules/categoryGuess';
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
  ['Rs.599 debited for AIRTEL PREPAID RECHARGE from a/c XX1234 -Axis', 'Phone'],
  ['Rs.12,450 debited a/c XX1234 to MAKEMYTRIP INDIA on 01-08-26 -HDFC', 'Travel'],
  ['Rs.3,200 spent on HDFC Card XX1234 at MYNTRA DESIGNS on 06-08-26', 'Clothing'],
  ['Rs.4,500 debited from a/c XX1234 towards ELECTRICITY BILL BESCOM -Canara Bank', 'Housing'],
  ['Rs.1,899 paid to DECATHLON SPORTS INDIA via UPI -Axis Bank', 'Sports'],
  ['Rs.2,150 debited a/c XX1234 to CROMA RETAIL on 07-08-26 -HDFC', 'Electronics'],
  ['Rs.760 paid to NYKAA E RETAIL from a/c XX1234 via UPI -SBI', 'Beauty'],
  ['Rs.1,299 debited a/c XX1234 to FIRSTCRY COM on 03-08-26 -ICICI', 'Kids'],
  ['Rs.899 paid to URBAN COMPANY via UPI from a/c XX1234 -HDFC', 'Home'],
  ['Rs.14,999 debited a/c XX1234 towards UNACADEMY course fee -Axis', 'Education'],
  ['Rs.85,000 credited to a/c XX1234 towards SALARY for JUL 2026 -HDFC Bank', 'Salary'],
  ['Rs.1,240 credited to a/c XX1234 as DIVIDEND from ITC LTD -SBI', 'Investments'],
  // Must stay Others: no merchant signal at all.
  ['Rs.500 debited from a/c XX1234 on 05-08-26. Ref 99120. -HDFC Bank', 'Others'],
  ['Rs.2,000 credited to a/c XX1234 by UPI from RAMESH KUMAR -SBI', 'Others'],
];

const valid = new Set([
  ...DEFAULT_EXPENSE_CATS.map((c) => c.name),
  ...DEFAULT_INCOME_CATS.map((c) => c.name),
]);

let fail = 0;
for (const [body, want] of cases) {
  const parsed = parseImportMessage({ body, address: 'HDFCBK', date: Date.now() }, rules);
  const got = parsed?.category ?? '(not parsed)';
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${want.padEnd(15)} got=${got.padEnd(15)} ${body.slice(0, 60)}`);
}

// A guess the app can't render is worse than Others.
for (const b of ['expense', 'income'] as const) {
  for (const [body] of cases) {
    const g = guessImportCategory(b, '', body);
    if (g && !valid.has(g)) {
      console.log(`FAIL  unknown category "${g}"`);
      fail++;
    }
  }
}

console.log(fail === 0 ? '\nall passed' : `\n${fail} failed`);
