#!/usr/bin/env node
/**
 * Prove the SMS category guesser on real message shapes.
 *
 * The cases that matter are UPI handles with the words glued together, since
 * that is what most Indian bank SMS carry and what used to fall to Others.
 *
 * Compile the modules first, since they are TypeScript:
 *   npx tsc src/lib/importRules/categoryGuess.ts src/categories/defaults.ts \
 *     --outDir /tmp/catguess --module commonjs --target es2019 --skipLibCheck \
 *     --moduleResolution node
 *   node scripts/check-import-category.js
 */
const path = require('path');

const OUT = path.resolve(process.env.CATGUESS_OUT || '/tmp/catguess');
const { guessImportCategory, GUESSABLE_CATEGORIES } = require(
  path.join(OUT, 'lib', 'importRules', 'categoryGuess.js'),
);
const { DEFAULT_EXPENSE_CATS, DEFAULT_INCOME_CATS } = require(
  path.join(OUT, 'categories', 'defaults.js'),
);

let failures = 0;
function check(kind, merchant, body, want) {
  const got = guessImportCategory(kind, merchant, body);
  const ok = got === want;
  if (!ok) failures++;
  const label = merchant || body.slice(0, 44);
  console.log(`${ok ? 'ok  ' : 'BAD '}${label.padEnd(34)} -> ${got}`);
  if (!ok) console.log(`       wanted ${want}`);
}

// Every name the guesser can emit has to exist, or the row silently shows Others.
for (const [kind, names] of Object.entries(GUESSABLE_CATEGORIES)) {
  const real = (kind === 'income' ? DEFAULT_INCOME_CATS : DEFAULT_EXPENSE_CATS).map(
    (c) => c.name,
  );
  const orphans = names.filter((n) => !real.includes(n));
  check.orphans = orphans;
  if (orphans.length) {
    failures++;
    console.log(`BAD  ${kind} guesses a category that does not exist: ${orphans.join(', ')}`);
  } else {
    console.log(`ok   every ${kind} guess maps to a real category`);
  }
}

console.log('\n-- glued UPI handles (the old failure) --');
check('expense', 'sriramrestaurant', 'Rs.450 debited to VPA sriramrestaurant@okhdfcbank UPI Ref 123456', 'Food');
check('expense', 'hotelsaravanabhavan', 'Rs.520 paid to hotelsaravanabhavan@ybl', 'Food');
check('expense', 'bloomsflorist', 'Rs.900 debited to bloomsflorist@paytm', 'Flowers');
check('expense', 'srivenkateswarasweets', 'Rs.260 to srivenkateswarasweets@axl', 'Food');
check('expense', 'newbakeryhouse', 'Rs.140 paid to newbakeryhouse@oksbi', 'Food');
check('expense', 'apollopharmacyltd', 'Rs.780 to apollopharmacyltd@icici', 'Health');
check('expense', 'sharmatiffincentre', 'Rs.90 to sharmatiffincentre@ibl', 'Food');
check('expense', 'kumarjuicecentre', 'Rs.70 to kumarjuicecentre@ybl', 'Food');

console.log('\n-- the examples asked for --');
check('expense', 'PHOENIX MARKETCITY', 'Rs.2400 spent at PHOENIX MARKETCITY BLR', 'Shopping');
check('expense', 'PHOENIXMALL', 'Rs.2400 spent at PHOENIXMALL', 'Shopping');
check('expense', 'LULU MALL', 'Rs.1800 debited at LULU MALL KOCHI', 'Shopping');
check('expense', '', 'Rs.5000 withdrawn from ATM at MG Road on 18-08-26. Avl Bal Rs.12000', 'Withdraw');
check('expense', '', 'Rs.2000 debited ATM WDL HDFC BANK KORAMANGALA', 'Withdraw');
check('expense', 'COCACOLA', 'Rs.60 paid to COCACOLA', 'Groceries');
check('expense', 'SRI COOL DRINKS', 'Rs.80 paid to SRI COOL DRINKS', 'Groceries');
check('expense', 'FLOWER STALL', 'Rs.50 to FLOWER STALL', 'Flowers');

console.log('\n-- unbranded local shops --');
check('expense', 'ANNAPURNA MESS', 'Rs.120 paid to ANNAPURNA MESS', 'Food');
check('expense', 'SRI LAXMI DHABA', 'Rs.310 to SRI LAXMI DHABA', 'Food');
check('expense', 'BALAJI MEDICALS', 'Rs.220 to BALAJI MEDICALS', 'Health');
check('expense', 'RAJ UNISEX SALON', 'Rs.400 to RAJ UNISEX SALON', 'Beauty');
check('expense', 'SHREE PETROL PUMP', 'Rs.1500 at SHREE PETROL PUMP', 'Car');
check('expense', 'INDIANOIL', 'Rs.2000 spent at INDIANOIL BLR', 'Car');
check('expense', 'GREENWOOD SCHOOL', 'Rs.25000 paid to GREENWOOD SCHOOL fees', 'Education');
check('expense', 'SRI BALAJI TRAVELS', 'Rs.1200 to SRI BALAJI TRAVELS', 'Travel');
check('expense', 'CITY GARMENTS', 'Rs.1600 to CITY GARMENTS', 'Clothing');
check('expense', 'MADHULOKA WINES', 'Rs.900 to MADHULOKA WINES', 'Alcohol');
check('expense', 'SRI RAM VETERINARY', 'Rs.600 to SRI RAM VETERINARY clinic', 'Pets');

console.log('\n-- bills keep beating the generic buckets --');
check('expense', 'AIRTEL XSTREAM', 'Rs.999 paid to AIRTEL XSTREAM broadband', 'Internet Bill');
check('expense', 'BESCOM', 'Rs.1450 paid to BESCOM electricity bill', 'Electricity Bill');
check('expense', 'MYJIO', 'Rs.239 recharge on MYJIO', 'Recharge');
check('expense', 'CULTFIT', 'Rs.2500 to CULTFIT membership', 'Gym Bill');
check('expense', 'HDFC LOAN', 'Rs.15000 EMI debited for HDFC home loan', 'EMI');
check('expense', 'SWIGGY INSTAMART', 'Rs.640 debited to SWIGGY INSTAMART', 'Groceries');
check('expense', 'OYO ROOMS', 'Rs.2100 paid to OYO ROOMS hotel booking', 'Travel');

console.log('\n-- jewellery --');
check('expense', 'TANISHQ', 'Rs.45000 spent on card at TANISHQ JEWELLERY BLR', 'Jewellery');
check('expense', 'kalyanjewellers', 'Rs.28000 debited to kalyanjewellers@okhdfcbank', 'Jewellery');
check('expense', 'MALABAR GOLD', 'Rs.62000 spent at MALABAR GOLD AND DIAMONDS', 'Jewellery');
check('expense', 'srilakshmijewellery', 'Rs.9500 paid to srilakshmijewellery@ybl', 'Jewellery');
check('expense', 'CITY GOLDSMITH', 'Rs.3200 to CITY GOLDSMITH', 'Jewellery');
check('expense', 'GRT', 'Rs.15500 spent at GRT JEWELLERS CHENNAI', 'Jewellery');
check('expense', 'newbanglestore', 'Rs.600 to newbanglestore@paytm', 'Jewellery');
check('expense', 'CARATLANE', 'Rs.7800 debited at CARATLANE A TATA PRODUCT', 'Jewellery');
// A gold loan is borrowing, and its lenders must stay with Loans.
check('expense', 'MUTHOOT FINANCE', 'Rs.5000 paid towards gold loan at MUTHOOT FINANCE', 'Loans');
check('expense', 'HDFC', 'Rs.12000 debited for gold loan repayment', 'Loans');
// A silk house is still clothing, and a jewel-named eatery is still food.
check('expense', 'NALLI SILKS', 'Rs.8500 spent at NALLI SILKS', 'Clothing');
check('expense', 'JEWEL RESTAURANT', 'Rs.740 paid to JEWEL RESTAURANT', 'Food');

console.log('\n-- must NOT be miscategorised --');
// "ATM/POS" is a card purchase tag, not cash out.
check('expense', 'CROMA', 'Rs.4500 spent on card at CROMA ATM/POS', 'Electronics');
// "/DR/" is the debit marker in a UPI reference, not a doctor.
check('expense', 'SOMEONE', 'Rs.500 debited UPI/DR/402913344/SOMEONE', null);
// The rail is a bank, not a recharge.
check('expense', 'AIRTEL PAYMENTS BANK', 'Rs.700 debited from AIRTEL PAYMENTS BANK a/c XX4412', null);
// A plain person-to-person transfer has no category to guess.
check('expense', 'RAHUL KUMAR', 'Rs.1000 sent to RAHUL KUMAR via UPI Ref 998877', null);

console.log('\n-- income --');
check('income', 'ACME PAYROLL', 'Rs.85000 credited SALARY for AUG', 'Salary');
check('income', 'ZERODHA', 'Rs.4200 credited from ZERODHA redemption', 'Investments');
check('income', 'AMAZONPAY', 'Rs.35 cashback credited to your account', 'Cashback');

console.log(failures ? `\n${failures} failing case(s)` : '\nall cases pass');
process.exit(failures ? 1 : 0);
