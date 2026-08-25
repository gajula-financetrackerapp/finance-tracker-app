#!/usr/bin/env node
/**
 * Prove that only money on a bank account imports as a bank transaction, and
 * that a fund's or an insurer's own notice does not.
 *
 * Compile first, since it is TypeScript:
 *   npx tsc src/lib/importRules/parseImportText.ts src/lib/importRules/builtinRules.ts \
 *     --outDir .tmp-bank --module commonjs --target es2019 --skipLibCheck --moduleResolution node
 *   node scripts/check-bank-ledger.js .tmp-bank
 */
const path = require('path');

const OUT = path.resolve(process.argv[2] || process.env.BANK_OUT || '.tmp-bank');
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

function imports(label, body, address, wantKind, wantPay) {
  const got = read(body, address);
  const ok =
    !!got && (!wantKind || got.kind === wantKind) && (!wantPay || got.pay === wantPay);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'BAD '}${label}`);
  if (!ok) {
    const wanted = [wantKind || 'a row', wantPay ? `on ${wantPay}` : ''].filter(Boolean).join(' ');
    console.log(`       got ${JSON.stringify(got)}, wanted ${wanted}`);
  }
}

/** One pasted block should come apart into one message per alert, no more. */
function pastes(label, text, wantCount) {
  const got = P.splitPasteIntoMessages(text).length;
  const ok = got === wantCount;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'BAD '}${label}`);
  if (!ok) console.log(`       split into ${got}, wanted ${wantCount}`);
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
// The same thanks, worded without "for your <connection>" — it signs off in the
// service's own name instead, which is just as much a biller saying thank you.
skips('a JioFiber sign-off', 'Dear Customer, We have received your payment of Rs.683.27 through UPI. Continue enjoying JioFiber services. Team Jio', 'AD-JIOHOM');
// A body kept for a fingerprint is trimmed at 120 characters, which can cut the
// message off before it says the payment was received. What is left still names
// what you hold with the biller and no account of yours, so it still is one.
skips('the notice cut off before its verb', 'Dear Customer, Payment of Rs. 683.27 for your JioHome connection with JioFixedVoice Number +918672314451 through UPI Pay', 'AD-JIOHOM');
skips('a broadband notice cut the same way', 'Payment of Rs.1,299 for your Airtel Xstream Fiber connection with landline number 08041234567 through UPI Pay', 'AD-AIRTEL');
imports('a bank paying a bill still counts', 'Payment of Rs.683.27 for your JioHome connection debited from A/c XX1234', 'AD-HDFCBK', 'expense');
imports('and money reaching your account counts', 'Payment of Rs.683.27 for your invoice no 88 credited to your A/c XX1234', 'AD-HDFCBK', 'income');
skips('the same with no verb tying payment to received', 'Dear Customer, Payment of Rs.683.27 received via UPI. Pay your bills on time to continue enjoying JioFiber services.', 'AD-JIOHOM');
skips('an ID where the word your would go', 'Payment of Rs.683.27 has been received for JioFiber ID 123456789 through UPI Payments. Continue enjoying JioFiber services.', 'AD-JIOHOM');
skips('a thank-you with a due-date nudge', 'Thank you! Rs.683.27 payment received. Recharge before due date to continue enjoying JioFiber services.', 'AD-JIOHOM');
skips('the Airtel equivalent', 'We have received your payment of Rs.599 for Airtel Xstream Fiber. Continue enjoying Airtel services.', 'AD-AIRTEL');
// Money that reached an account of yours still counts, however it is worded.
imports('received into your own account', 'Rs.2,500 has been received in your A/c XX1234 towards your invoice no 88', 'AD-SBIINB', 'income');
skips('an electricity bill receipt', 'Payment received of Rs.2,340 towards your electricity bill for consumer number 1234567. Thank you. -BESCOM', 'AD-BESCOM');
skips('a gas booking receipt', 'We have received your payment of Rs.905 for order no 8899. Your cylinder will be delivered shortly.', 'AD-HPGAS');
// The same words, but the money landed with you — those stay.
imports('salary that quotes a payment received', 'INR 45,000.00 credited to your ICICI Bank Account XX8891. Payment received for your invoice no 4471', 'JD-ICICIB', 'income');

console.log('\n-- a bill paid through INDmoney still imports both legs --');
imports(
  'INDmoney confirmation for a card bill',
  'Payment of Rs.5,000 for your HDFC Credit Card bill has been received. Thank you. -INDmoney',
  'VM-INDMNY',
  'income',
  'card',
);
imports(
  'INDmoney success SMS without the word received',
  'Your payment of Rs.5000 to HDFC Bank Credit Card via INDmoney is successful',
  'AD-INDMNY',
  'income',
  'card',
);
imports(
  'the bank UPI that funded INDmoney still leaves the bank',
  'Rs.5000.00 debited from A/c XX1234 to VPA indmoney@axisb on 25-08-26',
  'VM-HDFCBK',
  'expense',
);
skips(
  'EMI converted on the card is not bill income',
  'Dear Customer, Txn of Rs.25000 on 12/08/2026 has been converted to EMI. Rs.25000 credited to your card ending 1234.',
  'VM-HDFCBK',
);
skips(
  'a loan posted onto the card is not bill income',
  'Personal loan of Rs.50000 has been credited to your HDFC Bank Credit Card XX1234',
  'VM-HDFCBK',
);
skips(
  'EMI auto-pay credited to the card is not bill income',
  'EMI of Rs.4500 has been credited to your credit card ending 9981',
  'VM-HDFCBK',
);
// Named as the destination, this is the card bill being settled — the card's
// own credit, not a transfer off the bank. Paid through INDmoney or CRED, the
// bank SMS is the one that left the account.
imports('a card bill payment reaching the card', 'Payment of Rs.5,000 received towards your HDFC Bank Credit Card bill. Thank you.', 'VM-HDFCBK', 'income', 'card');
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
imports(
  'a bill debit that still quotes total due',
  'Rs.3,000.00 debited from A/c XX1234 towards HDFC Bank Credit Card XX9981 bill payment. Total Amount Due Rs.7000.',
  'VM-HDFCBK',
  'transfer',
);
imports(
  'transferred from the account onto the card',
  'Rs.4,000 transferred from A/c XX1234 to HDFC BANK CREDIT CARD XX9981',
  'VM-HDFCBK',
  'transfer',
);
imports(
  'credited to your bank-named credit card',
  'INR 5,000.00 has been credited to your ICICI Bank Credit Card XX4321 on 08-08-26',
  'JD-ICICIB',
  'income',
  'card',
);
imports(
  'payment received that still quotes total due',
  'Payment of Rs.3,000 received towards your HDFC Bank Credit Card XX9999. Total Amount Due Rs.7000. Payment Due Date 18-09-2026.',
  'VM-HDFCBK',
  'income',
  'card',
);
imports(
  'PhonePe paid to the credit card itself',
  'You paid Rs.5,000 to HDFC BANK CREDIT CARD using PhonePe',
  'VM-PHONPE',
  'transfer',
);
imports('PhonePe payment', 'You paid Rs.250 to Sri Ram Tea Stall using PhonePe', 'VM-PHONPE', 'expense');
imports('a premium paid through a wallet is still a spend', 'You paid Rs.9,400 to LIC OF INDIA using PhonePe', 'VM-PHONPE', 'expense');

console.log('\n-- a card alert written without a verb is still a spend --');
// "Txn Rs.683.27 On HDFC Bank Card 9981 At jio@citibank by UPI ..." says neither
// debited nor credited, so nothing read a direction out of it and the rule that
// matched the sender got to choose — which filed a plain card spend as income.
const HDFC_ALERT = [
  'Txn Rs.683.27',
  'On HDFC Bank Card 9981',
  'At jio@citibank ',
  'by UPI 657918360150',
  'On 01-08',
  'Not You?',
  'Call 18002586161/SMS BLOCK CC 9981 to 7308080808',
].join('\n');
imports('the HDFC card alert', HDFC_ALERT, 'VM-HDFCBK', 'expense', 'card');
// The footer is the only place the words "CC" and "to <payee>" appear, and both
// were carrying the answer by accident.
imports(
  'the same alert without its Not You footer',
  HDFC_ALERT.split('\n').slice(0, 5).join('\n'),
  'VM-HDFCBK',
  'expense',
  'card',
);
imports(
  'a card spend riding the UPI rail stays on the card',
  'Txn Rs.1,200 on ICICI Bank Card XX4321 at SWIGGY by UPI 445566',
  'JD-ICICIB',
  'expense',
  'card',
);
// A debit card is the bank account under another name, so it stays with the bank.
imports(
  'a debit card purchase still draws on the bank',
  'Rs.850.00 debited for txn on your Debit Card XX1234 at MORE SUPERMARKET from A/c XX3456',
  'AD-SBIINB',
  'expense',
  'bank',
);

console.log('\n-- a credit that landed with the payee is money going out --');
// Every payment credits somebody. Reading the payee's side of it as money in
// turned a paid bill into earnings.
imports(
  'credited to a VPA out of your account',
  'Rs.683.27 credited to jio@citibank from your A/c XX1234 on 01-08. -HDFC Bank',
  'VM-HDFCBK',
  'expense',
);
imports(
  'credited to a beneficiary',
  'INR 5,000.00 has been credited to the beneficiary account of RAMESH KUMAR from your A/c XX3456',
  'AD-SBIINB',
  'expense',
);
// Named as both, and until now it matched no rule at all and was dropped.
imports(
  'transferred out and credited to them',
  'Rs.2,000 transferred from A/c XX1234 and credited to ABC ENTERPRISES',
  'JD-ICICIB',
  'expense',
);
imports(
  'credited to a merchant on a mandate',
  'Amount of Rs.899 credited to SWIGGY LIMITED against your UPI mandate',
  'VM-HDFCBK',
  'expense',
);
// A payee's account is named too, so a masked number alone cannot mean yours.
imports(
  "credited to the payee's own masked account",
  'Rs.5,000 credited to beneficiary A/c XX9999 from your A/c XX1234',
  'AD-SBIINB',
  'expense',
);
// The same word, landing with you, is still income.
imports('salary credited to your account', 'INR 45,000.00 credited to your ICICI Bank Account XX8891 on 01-08', 'JD-ICICIB', 'income');
// Plenty of banks leave the word "your" out and still mean your account.
imports('the same without the word your', 'INR 45,000.00 credited to ICICI Bank Account XX8891 on 01-08', 'JD-ICICIB', 'income');
imports('credited to a savings account', 'Rs.9,000 credited to SB A/c XX1234 by NEFT from ACME PAYROLL', 'AD-SBIINB', 'income');
imports('credited to a masked A/c', 'Rs.12,000 credited to A/c XX3456 by NEFT from ACME PAYROLL', 'AD-SBIINB', 'income');
imports('money received over UPI', 'Rs.500 credited to your account from VPA ramesh@okhdfc via UPI', 'VM-HDFCBK', 'income');
imports('a refund coming back', 'Refund of Rs.799 has been credited to your A/c XX1234 from AMAZON', 'AD-AMAZON', 'income');
imports('interest on savings', 'Interest of Rs.320 credited to your Savings A/c XX9090', 'AD-SBIINB', 'income');

console.log('\n-- the name standing there says whose account it is --');
// A connection or a company with an account number next to it is a payee, and
// the number alone used to make it read as yours.
imports('a telecom account being paid', 'Rs.706.82 credited to Jio account 12345678 from your A/c XX1234', 'AD-HDFCBK', 'expense');
imports('a broadband account being paid', 'Rs.599 credited to Airtel Broadband account 98765 from your A/c XX1234', 'AD-HDFCBK', 'expense');
imports('a landline account being paid', 'Rs.1,200 credited to BSNL Landline Account No 4455 from your A/c XX3456', 'AD-SBIINB', 'expense');
imports('a DTH account being paid', 'Rs.450 credited to Tata Play account 5566 from your A/c XX1234', 'VM-HDFCBK', 'expense');
imports('an electricity account being paid', 'Rs.3,100 credited to BESCOM electricity account 778899 from A/c XX3456', 'AD-SBIINB', 'expense');
imports('a company account being paid', 'Rs.980 credited to XYZ TRADERS account 4321 from your A/c XX1234', 'AD-SBIINB', 'expense');
// But a telecom that banks for you holds money rather than billing you.
imports('a payments bank carrying a telecom name', 'Rs.900 credited to Airtel Payments Bank Account XX4455', 'AD-AIRTEL', 'income');
imports('the other payments bank', 'Rs.1,500 credited to Jio Payments Bank A/c XX7788 by NEFT', 'AD-JIOPAY', 'income');
// And a refund coming back from one is money in, not a payment out to it.
imports('a refund arriving from a telecom', 'Rs.399 credited to A/c XX1234 from AIRTEL as a refund', 'AD-HDFCBK', 'income');

console.log('\n-- a card is a card whatever the issuer calls it --');
// Issuers brand the word in: BOBCARD, SBICARD, ONECARD. There is no boundary in
// front of "card" to anchor a pattern to, and these alerts often name the UPI
// rail as well, so the spend used to book against the bank.
imports(
  'a BOBCARD spend, UPI payee and all',
  'ALERT: INR 110.00 is spent on your BOBCARD ending 3100 at Upi-ms Sahithi  Batraj on 21-08-2026. Available credit limit is Rs 214,380.00, Current outstanding is Rs 400.00. Not you?  Call 18002090 (toll-free)',
  'VM-BOBCRD',
  'expense',
  'card',
);
imports(
  'an SBICARD spend',
  'Rs.500 spent on SBICARD ending 1234 at AMAZON on 21-08-26. Avl credit limit Rs.50,000',
  'VM-SBICRD',
  'expense',
  'card',
);
imports(
  'a ONECARD spend with no limit quoted',
  'INR 250 spent on your ONECARD 9012 at Swiggy on 21-08-26',
  'VM-ONECRD',
  'expense',
  'card',
);
// A credit limit is a card's alone — an account has a balance. But the word
// "card" glued to a brand must not drag a debit card onto the card ledger.
imports(
  'a debit card written as one word stays on the bank',
  'Rs.300 spent using Debitcard ending 5678 at BigBazaar from A/c XX1234',
  'VM-HDFCBK',
  'expense',
  'bank',
);
skips(
  'an offer quoting a credit limit is still noise',
  'Get BOBCARD now with available credit limit up to Rs 3,00,000. T&C apply',
  'VM-BOBCRD',
);

console.log('\n-- pasting one alert makes one row, not one per line --');
pastes('the HDFC alert is a single message', HDFC_ALERT, 1);
pastes(
  'a list of one-line alerts still comes apart',
  [
    'Rs.250 spent on your HDFC Bank Credit Card XX9999 at CAFE COFFEE DAY',
    'Rs.1,100 debited from A/c XX3456 to SWIGGY by UPI',
    'Rs.500 spent on your HDFC Bank Credit Card XX9999 at BOOKMYSHOW',
    'Rs.99 debited from A/c XX3456 to NETFLIX by UPI',
  ].join('\n'),
  4,
);

// An admin's rule reaches every phone through shared settings, so a rule that
// narrows on nothing would re-file the whole inbox on every install.
console.log('\n-- a custom rule has to narrow on something --');

function claims(label, rule, body, address, wantMatch) {
  const hit = P.matchImportRule({ id: label, address, body, date: '2026-08-18' }, [
    { id: 'r', name: 'r', enabled: true, senders: [], bodyIncludes: [], kind: 'expense', category: 'Others', ...rule },
  ]);
  const ok = wantMatch ? !!hit : hit === null;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'BAD '}${label}`);
  if (!ok) console.log(`       ${hit ? 'matched' : 'did not match'}, wanted the opposite`);
}

const ANY_SMS = 'Rs.2500.00 debited from A/c XX3456 on 18-08-26 to SRI RAM STORES';
claims('neither senders nor body words claims nothing', {}, ANY_SMS, 'AD-SBIINB', false);
claims('senders alone is still a real rule', { senders: ['SBIINB'] }, ANY_SMS, 'AD-SBIINB', true);
claims('body words alone is still a real rule', { bodyIncludes: ['debited'] }, ANY_SMS, 'BANKSMS', true);
claims('senders alone ignores another bank', { senders: ['SBIINB'] }, ANY_SMS, 'VM-HDFCBK', false);

const wideOpen = R.BUILTIN_IMPORT_RULES.filter(
  (r) => !r.senders.length && !(r.bodyIncludes || []).length,
);
const builtinsOk = wideOpen.length === 0;
if (!builtinsOk) failures++;
console.log(`${builtinsOk ? 'ok  ' : 'BAD '}every built-in narrows on a sender or a body word`);
if (!builtinsOk) console.log(`       ${wideOpen.map((r) => r.id).join(', ')} would match everything`);

console.log(failures ? `\n${failures} failing case(s)` : '\nall cases pass');
process.exit(failures ? 1 : 0);
