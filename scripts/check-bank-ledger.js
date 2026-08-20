#!/usr/bin/env node
/**
 * Prove that only money on a bank account imports as a bank transaction, and
 * that a fund's or an insurer's own notice does not.
 *
 * Compile first, since it is TypeScript:
 *   npx tsc src/lib/importRules/parseImportText.ts src/lib/importRules/builtinRules.ts \
 *     --outDir .tmp-bank --module commonjs --target es2019 --skipLibCheck --moduleResolution node
 *   BANK_OUT=.tmp-bank node scripts/check-bank-ledger.js
 */
const path = require('path');

const OUT = path.resolve(process.env.BANK_OUT || '/tmp/bankledger');
const P = require(path.join(OUT, 'lib', 'importRules', 'parseImportText.js'));
const R = require(path.join(OUT, 'lib', 'importRules', 'builtinRules.js'));

let failures = 0;

/** What the importer makes of one SMS: its kind, or null when it is skipped. */
function read(body, address = 'BANKSMS') {
  const rows = P.parseImportMessages(
    [{ id: body.slice(0, 24), address, body, date: '2026-08-18' }],
    R.BUILTIN_IMPORT_RULES,
  );
  if (!rows.length) return null;
  return { kind: rows[0].kind, pay: rows[0].paymentType };
}

function imports(label, body, address, wantKind) {
  const got = read(body, address);
  const ok = !!got && (!wantKind || got.kind === wantKind);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'BAD '}${label}`);
  if (!ok) console.log(`       got ${JSON.stringify(got)}, wanted ${wantKind || 'a row'}`);
}

function skips(label, body, address) {
  const got = read(body, address);
  const ok = got === null;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'BAD '}${label}`);
  if (!ok) console.log(`       imported as ${JSON.stringify(got)}, wanted no row`);
}

console.log('-- money on a bank account still imports --');
imports('SBI debit', 'Dear Customer, Rs.2500.00 debited from A/c XX3456 on 18-08-26 to SRI RAM STORES. -SBI', 'AD-SBIINB', 'expense');
imports('HDFC debit with no account named', 'Rs.480 debited towards purchase at RELIANCE FRESH. -HDFC Bank', 'VM-HDFCBK', 'expense');
imports('ICICI credit', 'INR 45,000.00 credited to your ICICI Bank Account XX8891 on 01-08-26 by NEFT. Info: SALARY', 'JD-ICICIB', 'income');
imports('Canara Bank credit', 'Rs.12,000 credited to your Canara Bank a/c XX7788 by IMPS from RAMESH', 'AX-CANBNK', 'income');
imports('Kotak debit, bank known only from the sender', 'Rs.310.00 spent using your account on 18-08-26 at CAFE COFFEE DAY', 'VM-KOTAKB', 'expense');
imports('AU Small Finance Bank', 'Rs.1,900 debited from your AU Small Finance Bank A/c XX1122 for BILLDESK', 'AD-AUBANK', 'expense');
imports('India Post Payments Bank', 'Rs.700 debited from your IPPB account XX4455 at SRI RAM STORES', 'AD-IPPBNK', 'expense');
imports('UPI debit with no bank name at all', 'Rs.150.00 debited on 18-08-26 to VPA chaiwala@ybl via UPI. Ref 553311220099', 'BANKSMS', 'expense');
imports('cheque clearing', 'Cheque no 445566 for Rs.20,000 debited from your Current A/c XX2211', 'AD-PNBSMS', 'expense');

console.log('\n-- the bank leg of an investment or a premium is still bank money --');
imports('LIC premium debited from the account', 'Rs.12,000 debited from A/c XX3456 towards LIC premium policy no 8899 by NACH. -Union Bank', 'AD-UNIONB', 'expense');
imports('NPS contribution debited from the account', 'Rs.5,000 debited from your Savings A/c XX3456 towards NPS contribution', 'AD-SBIINB', 'expense');
imports('SIP debited from the account', 'INR 10,000.00 debited from A/c XX3456 for SIP - AXIS BLUECHIP FUND', 'JD-AXISBK', 'expense');
imports('a fund payout that lands in the account', 'Rs.85,000 credited to your A/c XX3456 towards LIC maturity claim settlement', 'AD-SBIINB', 'income');

console.log('\n-- notices from a fund, an insurer or a scheme are skipped --');
skips('NPS contribution credited to the PRAN', 'Dear Subscriber, contribution of Rs.5,000 has been credited to your NPS account under PRAN 110012345678', 'AD-NSDLPB');
skips('NPS unit statement', 'Units worth Rs.5,000 allotted against your PRAN 110012345678. NAV Rs.42.31', 'AD-CRANPS');
skips('LIC premium received', 'Dear Policyholder, premium of Rs.12,000 received towards policy no 889900. Thank you. -LIC of India', 'AD-LICIND');
skips('insurance renewal receipt', 'We have received Rs.9,400 towards renewal premium for your HDFC Life term insurance policy', 'VM-HDFCLI');
skips('EPF credit', 'Rs.21,600 credited towards your EPF account. UAN 100987654321. -EPFO', 'AD-EPFOHO');
skips('mutual fund purchase', 'Rs.10,000 invested in Nippon India Mutual Fund. Units alloted for folio 445566', 'AD-CAMSMF');
skips('mutual fund redemption', 'Redemption of units worth Rs.30,000 processed for folio 445566. -KFintech', 'AD-KFINTC');
skips('demat holding statement', 'Securities worth Rs.75,000 credited to your demat account. -CDSL', 'AD-CDSLIN');
skips('PPF interest', 'Interest of Rs.7,200 credited to your PPF account for FY 2025-26', 'AD-SBIPPF');
skips('sovereign gold bond payout', 'Interest of Rs.1,800 paid for your Sovereign Gold Bond holding', 'AD-RBIGOV');
skips('chit fund note', 'Your chit fund subscription of Rs.5,000 has been received for group A12', 'AD-CHITCO');

console.log('\n-- a biller thanking you for a bill you paid is skipped --');
// The card or bank SMS already booked the expense; this is the same rupees seen
// from the biller's end, and reading its "received" as money in makes it income.
skips(
  'the JioFiber receipt',
  'Dear Customer, Payment of Rs. 706.82 for your JioHome connection with JioFixedVoice Number +918672314451 through UPI Payments has been received on 20-Aug-26. Thank You! Now setup JioAutoPay and enjoy the convenience of automatic bill payments. To register for JioAutoPay, click http://tiny.jio.com/JioPay Team JioHome',
  'AD-JIOHOM',
);
skips('a card named as the method, not the destination', 'Payment of Rs.1,299 for your Airtel Broadband connection through Credit Card has been received. Thank you.', 'AD-AIRTEL');
skips('an electricity bill receipt', 'Payment received of Rs.2,340 towards your electricity bill for consumer number 1234567. Thank you. -BESCOM', 'AD-BESCOM');
skips('a gas booking receipt', 'We have received your payment of Rs.905 for order no 8899. Your cylinder will be delivered shortly.', 'AD-HPGAS');
// The same words, but the money landed with you — those stay.
imports('salary that quotes a payment received', 'INR 45,000.00 credited to your ICICI Bank Account XX8891. Payment received for your invoice no 4471', 'JD-ICICIB', 'income');
// Named as the destination, this is the card bill being settled: bank down, card up.
imports('a card bill payment reaching the card', 'Payment of Rs.5,000 received towards your HDFC Bank Credit Card bill. Thank you.', 'VM-HDFCBK', 'transfer');
imports('a bank debit whose footer mentions payment received', 'Rs.706.82 debited from A/c XX3456 for your JioHome connection bill. If payment received notice is not shown, call us.', 'AD-SBIINB', 'expense');

console.log('\n-- cash out of an ATM is skipped --');
// The account holds the bank balance and the cash in hand alike, so drawing cash
// moves nothing out of it. What the cash buys is the expense worth recording.
skips('an ATM withdrawal', 'Rs.5000 withdrawn at ATM on 18-08-26 from A/c XX9090. Avl Bal Rs.14,300', 'BANKSMS');
skips('a withdrawal with no ATM named', 'Rs.700 withdrawn from your IPPB account XX4455', 'AD-IPPBNK');
skips('the WDL code banks use for it', 'Rs.2000 debited ATM WDL HDFC BANK KORAMANGALA on 18-08-26', 'AD-HDFCBK');
skips('the ATW code', 'Rs.1500 debited ATW SBI ATM KORAMANGALA A/c XX9090', 'AD-SBIINB');
skips('cardless cash', 'Rs.3000 cardless cash dispensed at ICICI Bank ATM from A/c XX8891', 'JD-ICICIB');
skips('a self withdrawal at the branch', 'Rs.10,000 self withdrawal from your A/c XX3456. -Union Bank', 'AD-UNIONB');
skips('a debit card cash withdrawal', 'Rs.4000 withdrawn using your Debit Card XX1234 at HDFC Bank ATM', 'VM-HDFCBK');
// Drawing cash on a credit card is borrowing: the money really does leave the card.
imports('a cash advance on a credit card', 'Rs.5,000 withdrawn at ATM using your HDFC Bank Credit Card XX9999', 'VM-HDFCBK', 'expense');
// "ATM/POS" tags a card purchase, so the word ATM alone must not skip a spend.
imports('an ATM/POS card purchase', 'Rs.4,500 spent on your HDFC Bank Credit Card XX9999 at CROMA ATM/POS', 'VM-HDFCBK', 'expense');

console.log('\n-- cards and wallets are untouched by the account rule --');
imports('credit card spend', 'Rs.2,150.00 spent on your HDFC Bank Credit Card XX9999 at BIG BAZAAR on 18-08-26', 'VM-HDFCBK', 'expense');
imports('credit card spend at an insurer', 'Rs.9,400 spent on your ICICI Bank Credit Card XX4321 at HDFC LIFE INSURANCE', 'JD-ICICIB', 'expense');
imports('card bill payment', 'Rs.2,500.00 debited from A/c XX1234 towards HDFC Bank Credit Card XX9999 bill payment', 'VM-HDFCBK', 'transfer');
imports('PhonePe payment', 'You paid Rs.250 to Sri Ram Tea Stall using PhonePe', 'VM-PHONPE', 'expense');
imports('a premium paid through a wallet is still a spend', 'You paid Rs.9,400 to LIC OF INDIA using PhonePe', 'VM-PHONPE', 'expense');

console.log(failures ? `\n${failures} failing case(s)` : '\nall cases pass');
process.exit(failures ? 1 : 0);
