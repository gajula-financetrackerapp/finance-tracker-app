/**
 * What counts as a transaction on a bank account.
 *
 * A bank's own SMS says money left or reached an account: "debited from A/c
 * XX1234", "credited to your Canara Bank account". A fund or an insurer saying
 * the money reached your NPS, your policy or your folio is reporting on its own
 * books instead — the payment that fed it left a bank account, and that leg
 * sends its own SMS, so importing the notice as well books the same rupees
 * twice and usually on the wrong side.
 *
 * The account wins over the instrument, though: "debited from A/c XX1234
 * towards LIC premium" is money that really did leave the bank, whatever it
 * was spent on.
 */

const glue = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const spaced = (s: string) =>
  ` ${(s || '').toLowerCase().replace(/[^a-z0-9&]+/g, ' ').replace(/\s+/g, ' ').trim()} `;

/** Below this length a name hides inside unrelated words, so it needs whole-word care. */
const MIN_LOOSE_LEN = 5;

/**
 * Banks whose name reaches an Indian phone: public sector, private, small
 * finance, payments banks, the foreign banks that retail here, and the larger
 * co-operatives. Short ones are matched whole-word in a message body, but
 * anywhere inside a sender id, where they run together — "AD-SBIINB", "VM-HDFCBK".
 */
const BANK_NAMES = [
  // Public sector
  'state bank of india', 'sbi', 'bank of baroda', 'baroda', 'bob',
  'punjab national bank', 'pnb', 'canara', 'canbnk', 'union bank', 'unionbank',
  'bank of india', 'boi', 'indian bank', 'indbnk', 'central bank of india',
  'central bank', 'indian overseas', 'iob', 'uco', 'bank of maharashtra',
  'mahabank', 'punjab & sind', 'punjab and sind', 'psb',
  // Private
  'hdfc', 'icici', 'axis', 'axisbk', 'kotak', 'indusind', 'yes bank', 'yesbnk',
  'idfc', 'idbi', 'federal bank', 'fedbnk', 'south indian bank', 'sib',
  'karur vysya', 'kvb', 'city union', 'cub', 'karnataka bank', 'ktkbnk',
  'tamilnad mercantile', 'tmb', 'rbl', 'bandhan', 'dcb', 'csb bank',
  'catholic syrian', 'jammu & kashmir', 'j&k', 'jkbank', 'dhanlaxmi',
  'nainital bank',
  // Small finance
  'au small finance', 'au bank', 'aubank', 'equitas', 'ujjivan',
  'jana small finance', 'suryoday', 'utkarsh', 'esaf', 'fincare',
  'capital small finance', 'unity small finance', 'shivalik',
  'north east small finance', 'slice small finance',
  // Payments banks and the post office
  'paytm payments bank', 'airtel payments bank', 'india post payments', 'ippb',
  'fino payments', 'jio payments', 'nsdl payments bank', 'post office savings',
  // Foreign banks retailing in India
  'citibank', 'citi bank', 'hsbc', 'standard chartered', 'stanchart', 'scb',
  'deutsche bank', 'dbs bank', 'barclays',
  // Co-operative and rural
  'saraswat', 'cosmos bank', 'svc bank', 'abhyudaya', 'tjsb', 'bharat co-op',
  'apna sahakari', 'kalupur', 'rajkot nagarik', 'co-operative bank',
  'cooperative bank', 'sahakari bank', 'gramin bank', 'grameen bank',
];

/**
 * Instruments that keep their own ledger and send their own SMS: pensions,
 * provident funds, insurance policies, mutual funds, demat holdings, small
 * savings. Short or risky names are matched whole-word.
 */
const OTHER_LEDGERS = [
  // Pension and provident fund
  'national pension', 'pension fund', 'pension scheme', 'atal pension',
  'provident fund', 'epfo', 'superannuation', 'annuity', 'gratuity',
  // Insurance
  'life insurance', 'insurance policy', 'health insurance', 'term insurance',
  'policy no', 'policy number', 'policyholder', 'policy holder', 'sum assured',
  'maturity claim', 'renewal premium', 'premium receipt', 'hdfc life',
  'sbi life', 'icici prudential', 'max life', 'bajaj allianz', 'tata aia',
  'star health', 'niva bupa', 'new india assurance', 'oriental insurance',
  'national insurance', 'pnb metlife', 'kotak life', 'aditya birla sun life',
  // Funds, demat and small savings
  'mutual fund', 'units allotted', 'units alloted', 'units redeemed',
  'redemption of units', 'folio no', 'consolidated account statement',
  'kfintech', 'karvy', 'demat', 'sovereign gold bond', 'chit fund', 'sukanya',
];

const OTHER_LEDGERS_STRICT = [
  'nps', 'pran', 'apy', 'epf', 'uan', 'ppf', 'lic', 'nav', 'sip', 'cams',
  'cdsl', 'isin', 'ulip', 'nfo', 'folio', 'sgb', 'nsc', 'kvp',
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compile(names: string[], extraStrict: string[] = []) {
  const loose: string[] = [];
  const strict: string[] = [...extraStrict];
  for (const name of names) {
    (glue(name).length >= MIN_LOOSE_LEN ? loose : strict).push(name);
  }
  const looseBody = loose.map((n) => esc(glue(n))).filter(Boolean).join('|');
  const strictBody = strict.map((n) => esc(n)).filter(Boolean).join('|');
  return {
    loose: looseBody ? new RegExp(looseBody, 'i') : null,
    strict: strictBody ? new RegExp(` (?:${strictBody}) `, 'i') : null,
    anywhere: new RegExp([...loose, ...strict].map((n) => esc(glue(n))).join('|'), 'i'),
  };
}

const BANKS = compile(BANK_NAMES);
const LEDGERS = compile(OTHER_LEDGERS, OTHER_LEDGERS_STRICT);

/** Names a bank. In a sender id the letters run together, so nothing is bounded there. */
export function namesBank(text: string, inASenderId = false): boolean {
  if (!text) return false;
  if (inASenderId) return BANKS.anywhere.test(glue(text));
  if (/\bbank(?:ing)?\b/i.test(text)) return true;
  return (
    (!!BANKS.loose && BANKS.loose.test(glue(text))) ||
    (!!BANKS.strict && BANKS.strict.test(spaced(text)))
  );
}

/**
 * Points at a bank account rather than at some other kind of account. "NPS
 * account 110012345678" says account too, hence the shapes only a bank uses.
 */
export function mentionsBankAccount(text: string): boolean {
  const h = (text || '').toLowerCase();
  return (
    /\ba\/?c\b/.test(h) ||
    /\bacct\b/.test(h) ||
    /\baccount\s+(?:ending|no\.?\s*x|xx)/.test(h) ||
    /\b(?:savings|current|salary|sb|od)\s+(?:a\/?c|account)\b/.test(h) ||
    /\bbank\s+a\/?c(?:count)?\b/.test(h)
  );
}

/** The rails a bank account moves on. A wallet or a card has its own payment type. */
function usesABankRail(text: string): boolean {
  return /\b(?:upi|vpa|imps|neft|rtgs|atm|net\s?banking|mobile\s?banking|debit\s*card|cheque|chq|nach|ecs)\b/i.test(
    text || '',
  );
}

/**
 * A fund or an insurer reporting on a ledger of its own, with no bank account
 * named. The money that fed it moved through a bank, and that message is the
 * one worth importing.
 */
export function reportsOnAnotherLedger(body: string): boolean {
  if (mentionsBankAccount(body)) return false;
  return (
    (!!LEDGERS.loose && LEDGERS.loose.test(glue(body))) ||
    (!!LEDGERS.strict && LEDGERS.strict.test(spaced(body)))
  );
}

/**
 * Whether the message describes money on a bank account: it names the account,
 * or the bank, or the rail the money took.
 */
export function looksLikeBankLedger(body: string, sender?: string): boolean {
  if (reportsOnAnotherLedger(body)) return false;
  return (
    mentionsBankAccount(body) ||
    namesBank(body) ||
    namesBank(sender || '', true) ||
    usesABankRail(body)
  );
}
