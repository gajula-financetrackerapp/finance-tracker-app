import type { Account, ImportPaymentType, ImportSourceRule } from '../../types';
import { todayStr } from '../../utils';
import { looksLikeBankLedger, reportsOnAnotherLedger } from './bankLedger';
import { guessImportCategory } from './categoryGuess';
import {
  CARD_BILL_CATEGORY,
  CARD_BILL_LEG_DAYS,
  isCashAccount,
  isCoreBankAccount,
  isCoreCardAccount,
} from '../../cashBooks';

export type ParsedImportCandidate = {
  /** Stable key for dedupe within a scan */
  fingerprint: string;
  /**
   * A card bill is a transfer, not an expense: it has to leave the paying
   * account and land on the card in one movement, or the card keeps showing the
   * spends it just settled.
   */
  kind: 'expense' | 'income' | 'transfer';
  category: string;
  amount: number;
  date: string;
  note: string;
  ruleId: string;
  ruleName: string;
  sourceLabel: string;
  rawText: string;
  sender?: string;
  /** bank | card | upi — used to pick Paid with account */
  paymentType: ImportPaymentType;
  /** For a transfer: where the money lands. The paying side stays in paymentType. */
  toPaymentType?: ImportPaymentType;
  /**
   * Other SMS fingerprints collapsed into this row (same money movement),
   * e.g. "UPDATE: debited" + "PAYMENT ALERT! deducted".
   */
  relatedFingerprints?: string[];
  selected: boolean;
};

export type RawImportMessage = {
  id?: string;
  body: string;
  address?: string;
  /** Unix ms or ISO date string */
  date?: number | string;
  sourceLabel?: string;
};

const DEBIT_MARKERS = [
  'debited',
  'debit',
  'deducted',
  'deduct',
  'spent',
  'paid',
  'paying',
  'sent',
  'transferred',
  'transfer',
  'withdrawn',
  'withdrawal',
  'withdraw',
  'purchase',
  'used at',
  'cash withdrawn',
  'atm withdrawal',
];

/** Prefer strong verbs; bare "credit" is handled carefully (not "credit card"). */
const CREDIT_MARKERS = [
  'credited',
  'received',
  'deposited',
  'deposit',
  'credit',
  'refunded',
  'refund',
  'reversed',
  'reversal',
  'chargeback',
  'cash deposited',
  'cash deposit',
];

function lower(s: string) {
  return (s || '').toLowerCase();
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Word-aware include; "credit" ignores the phrase "credit card". */
function bodyHasToken(hay: string, needle: string): boolean {
  const h = lower(hay);
  const n = lower(needle).trim();
  if (!n) return false;
  if (n === 'credit') {
    const stripped = h.replace(/credit\s*cards?/g, ' ');
    return /(?:^|[^a-z])credit(?:[^a-z]|$)/.test(stripped);
  }
  // Ledger Dr/Cr (A/c XX Dr 500 / Dr:Rs.500) — avoid matching random "dr" syllables.
  if (n === 'dr' || n.startsWith('dr ') || n.startsWith('dr:') || n.startsWith('dr.')) {
    return (
      /\bdr\s*[.:]?\s*(?:rs\.?|inr|₹|[0-9])/.test(h) ||
      /(?:a\/c|acct|account|xx\d{2,}).{0,24}\bdr\b/.test(h)
    );
  }
  if (n === 'cr' || n.startsWith('cr ') || n.startsWith('cr:') || n.startsWith('cr.')) {
    return (
      /\bcr\s*[.:]?\s*(?:rs\.?|inr|₹|[0-9])/.test(h) ||
      /(?:a\/c|acct|account|xx\d{2,}).{0,24}\bcr\b/.test(h)
    );
  }
  if (n.includes(' ')) return h.includes(n);
  return new RegExp(`(?:^|[^a-z0-9])${escapeRe(n)}(?:[^a-z0-9]|$)`, 'i').test(h);
}

function includesAny(hay: string, needles: string[]) {
  if (!needles.length) return true;
  return needles.some((n) => bodyHasToken(hay, n));
}

function excludesAny(hay: string, needles?: string[]) {
  if (!needles?.length) return false;
  return needles.some((n) => bodyHasToken(hay, n));
}

/** Loan offers, EMI/card due reminders, marketing — not a completed money movement. */
export function isNonTxnNoise(body: string): boolean {
  const h = lower(body);

  // Failed / declined with no reversal — money did not settle.
  if (
    /\b(txn failed|transaction failed|failed transaction|txn declined|transaction declined|declined|unsuccessful|insufficient balance|insufficient funds|not successful)\b/.test(
      h,
    )
  ) {
    if (!/\b(reversed|reversal|chargeback)\b/.test(h)) return true;
  }

  // Pending / future money movement.
  const pending = [
    'is due',
    'are due',
    'min due',
    'minimum due',
    'min.due',
    'min. due',
    'total due',
    'total amount due',
    'card statement',
    'credit card statement',
    'statement is generated',
    'statement generated',
    'bill generated',
    'payment due',
    'emi due',
    'emi reminder',
    'overdue',
    'ignore if paid',
    'ignore if already paid',
    'autopay reminder',
    'auto pay reminder',
    'auto-pay reminder',
    'will be deducted',
    'will be debited',
    'will be paid',
    'will be credited',
    'will be refunded',
    'refund initiated',
    'refund will be',
    'refund is being processed',
    'require consent',
    'requires consent',
    'consent to continue',
    'continue disbursement',
    'are available and require',
    'scheduled to be deducted',
    'scheduled for deduction',
    'scheduled for debit',
    'scheduled for a debit',
    'installment scheduled',
    'pre-approved',
    'pre approved',
    'loan offer',
    'personal loan offer',
    'instant personal loan',
    'apply now',
    'limited period offer',
    'get rewards',
    'you are eligible',
    'eligible for a loan',
    'preapproved',
    // Offer/availability blurbs: "Rs X is ready to be used at your convenience".
    'ready to be used',
    'ready to use',
    'ready for use',
    'ready to be disbursed',
    'at your convenience',
    // "Dear customer, Rs.X be used at your convenience with … Avail instantly"
    'be used at your convenience',
    'to be used at your convenience',
    'used at your convenience',
    'can be used at your convenience',
    'avail instantly',
    'avail instant',
    'avail now',
    'avail it instantly',
    'available instantly',
    'availinstant',
    'click to avail',
    'tap to avail',
  ];
  if (pending.some((p) => h.includes(p))) return true;

  // Same offers with awkward spacing / line breaks / truncated SMS.
  if (
    /be\s+used\s+at\s+your\s+convenience/.test(h) ||
    /(?:can\s+)?(?:be\s+)?used\s+at\s+your\s+convenience/.test(h) ||
    /avail(?:able)?\s*instant(?:ly)?/.test(h) ||
    /(?:rs\.?|inr|₹)\s*[\d,]+\s*(?:\/-)?\s*(?:is\s+)?(?:ready\s+to\s+)?be\s+used/.test(h) ||
    /dear\s+customer[\s\S]{0,120}(?:be\s+used|ready\s+to\s+be\s+used|avail\s*instant)/.test(h)
  ) {
    return true;
  }

  // Limit / loan offers that mention money but never actually moved it.
  if (isCreditLimitOrLoanOffer(h)) return true;

  // Cancel notices with no completed refund/credit yet.
  const cancelled =
    h.includes('order cancelled') ||
    h.includes('order was cancelled') ||
    h.includes('order is cancelled') ||
    h.includes('cancelled successfully');
  if (cancelled) {
    const completed =
      /\b(has been credited|has been refunded|refunded to|credited to)\b/.test(h) &&
      !/\bwill be (credited|refunded)\b/.test(h);
    if (!completed) return true;
  }

  return false;
}

/**
 * Marketing / credit-limit / personal-loan availability SMS.
 * "Rs.X be used at …" contains "used at", which otherwise looks like a card spend.
 */
function isCreditLimitOrLoanOffer(h: string): boolean {
  const offerCue =
    /personal\s*loan|credit\s*limit|pre-?approved|sanctioned|disburs|t&c|terms and conditions|at your convenience|avail(?:able)?\s*instant|ready to be used|ready for use|click to avail|loan of\s*(?:rs|inr|₹)/.test(
      h,
    );
  if (!offerCue) return false;
  // Real settled money movement — keep those.
  const moneyMoved =
    /\b(debited|credited|deducted|spent|withdrawn|deposited|refunded|reversed|purchase)\b/.test(h) ||
    /\b(paid to|sent to|received from|received in|txn of|transaction of)\b/.test(h) ||
    /\bused at (?!your\s+convenience)/.test(h);
  return !moneyMoved;
}

/** Prefer amount tied to the txn verb; avoid picking "Avl limit" / balance figures. */
export function extractAmount(text: string): number | null {
  const cleaned = text.replace(/,/g, '');
  const parseNum = (raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0 || n > 10_000_000) return null;
    return n;
  };

  const preferred = [
    /(?:rs\.?|inr|₹)\s*([0-9]+(?:\.[0-9]{1,2})?)\s*(?:was\s+)?(?:debited|credited|deducted|spent|paid|sent|reversed)/gi,
    /(?:debited|credited|deducted|deduct|spent|paid|sent|received|withdrawn|withdrawal|withdraw|deposited|deposit|reversed)\s*(?:with\s+)?(?:rs\.?|inr|₹)?\s*([0-9]+(?:\.[0-9]{1,2})?)/gi,
    /(?:payment\s+of|amt\.?|amount\s+of|txn\s+of|transaction\s+of|purchase\s+of)\s*(?:rs\.?|inr|₹)?\s*([0-9]+(?:\.[0-9]{1,2})?)/gi,
    /\b(?:dr|cr)\s*[.:]?\s*(?:rs\.?|inr|₹)?\s*([0-9]+(?:\.[0-9]{1,2})?)/gi,
    /(?:rs\.?|inr|₹)\s*([0-9]+(?:\.[0-9]{1,2})?)\s*(?:dr|cr)\b/gi,
  ];
  for (const re of preferred) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(cleaned))) {
      const n = parseNum(m[1]);
      if (n != null) return n;
    }
  }

  // Fallback: largest Rs/INR figure, but skip common balance keywords nearby.
  const fallback = /(?:rs\.?|inr|₹)\s*([0-9]+(?:\.[0-9]{1,2})?)/gi;
  let best: number | null = null;
  let m: RegExpExecArray | null;
  while ((m = fallback.exec(cleaned))) {
    const around = cleaned.slice(Math.max(0, m.index - 24), m.index + m[0].length + 24).toLowerCase();
    if (/\b(?:avl|available|limit|bal|balance|outstanding|due)\b/.test(around)) continue;
    const n = parseNum(m[1]);
    if (n == null) continue;
    if (best == null || n > best) best = n;
  }
  return best;
}

/**
 * Paying a credit-card bill — card/issuer SMS: money was "credited to your card"
 * or "payment … received towards/into your credit card".
 * Import books this as Card income (pairs with the bank debit expense).
 */
export function isCardBillPayment(body: string): boolean {
  const h = lower(body);
  // Merchant refunds / cashback / rewards also say "credited to card" — not bill pay.
  if (/\b(refund|cashback|cash[\s-]?back|reward|reversed|reversal|chargeback)\b/.test(h)) {
    return false;
  }
  // Card purchases are not bill payments.
  if (/\b(spent on|used at|used for|purchase at|txn at|transaction at)\b/.test(h)) {
    return false;
  }
  return (
    /credited\s+to\s+your\s+card/.test(h) ||
    /credited\s+to\s+(?:your\s+)?credit\s*card/.test(h) ||
    /credited\s+to\s+card\s+ending/.test(h) ||
    /card\s+ending.{0,30}(?:has\s+been\s+)?credited/.test(h) ||
    /(?:credit\s*)?card.{0,20}credited\s+with/.test(h) ||
    (/towards\s+bill\s+payment/.test(h) && /\bcard\b/.test(h)) ||
    /payment\s+of.{0,40}received\s+towards\s+your\s+credit\s*card/.test(h) ||
    /received\s+towards\s+your\s+credit\s*card/.test(h) ||
    /payment.{0,40}towards\s+your\s+credit\s*card/.test(h) ||
    (/cardmember/.test(h) && /payment\s+of/.test(h) && /credit\s*card/.test(h)) ||
    // "Payment received into card / into your credit card"
    /received\s+into\s+(?:your\s+)?(?:credit\s*)?card/.test(h) ||
    /payment\s+(?:of.{0,40})?received\s+into/.test(h) ||
    /payment\s+received\s+into\s+card/.test(h) ||
    (/payment\s+of/.test(h) && /received/.test(h) && /credit\s*card/.test(h)) ||
    // Broader bank/card phrasings
    /payment.{0,50}received.{0,40}(?:credit\s*)?card/.test(h) ||
    /(?:credit\s*)?card.{0,40}payment.{0,30}received/.test(h) ||
    /received\s+for\s+your\s+(?:hdfc\s+bank\s+)?credit\s*card/.test(h) ||
    /has\s+been\s+received\s+for\s+your\s+credit\s*card/.test(h)
  );
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

export function extractDate(text: string, fallback?: number | string): string {
  if (typeof fallback === 'number' && Number.isFinite(fallback) && fallback > 0) {
    const d = new Date(fallback);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }
  }
  if (typeof fallback === 'string' && /^\d{4}-\d{2}-\d{2}/.test(fallback)) {
    return fallback.slice(0, 10);
  }

  const iso = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) {
    return `${iso[1]}-${pad2(Number(iso[2]))}-${pad2(Number(iso[3]))}`;
  }
  const dmy = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/);
  if (dmy) {
    return `${dmy[3]}-${pad2(Number(dmy[2]))}-${pad2(Number(dmy[1]))}`;
  }
  return todayStr();
}

export function extractMerchant(text: string, rule: ImportSourceRule): string {
  const patterns = [
    /(?:to|at|towards)\s+([A-Za-z0-9 &._-]{2,40})/i,
    /(?:from)\s+([A-Za-z0-9 &._-]{2,40})/i,
    /(?:paid to|sent to)\s+([A-Za-z0-9 &._-]{2,40})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const name = m[1].replace(/\s+/g, ' ').trim();
      if (name && !/^(rs|inr|upi|a\/c|acct)/i.test(name)) return name;
    }
  }
  return rule.notePrefix || rule.name;
}

/**
 * Debit → expense; credit/deposit → income.
 * HDFC/UPI often says "to VPA …" on money-out and "from VPA …" on money-in
 * even when the verb is missing or a footer says "not received".
 */
export function inferTxnKind(body: string): 'expense' | 'income' | null {
  const h = lower(body);

  // Card bill: money credited into the card → income on Card (pairs with bank expense).
  if (isCardBillPayment(body)) return 'income';

  // Failed txn reversed / chargeback → money back in.
  if (/\b(reversed|reversal|chargeback)\b/.test(h)) return 'income';

  // Completed refund → income (merchant cancel SMS or bank credit).
  if (/\b(has been refunded|refunded to|refund of)\b/.test(h) && !/\bwill be refunded\b/.test(h)) {
    if (/\b(credited|refunded)\b/.test(h)) return 'income';
  }

  // Explicit DR/CR codes in UPI ref lines + ledger A/c Dr|Cr.
  if (/upi[\s\/\-]*dr|dr[\s\/\-]*upi|\/dr\//.test(h)) return 'expense';
  if (/upi[\s\/\-]*cr|cr[\s\/\-]*upi|\/cr\//.test(h)) return 'income';
  if (
    /\bdr\s*[.:]?\s*(?:rs\.?|inr|₹|[0-9])/.test(h) ||
    /(?:a\/c|acct|account|xx\d{2,}).{0,24}\bdr\b/.test(h)
  ) {
    return 'expense';
  }
  if (
    /\bcr\s*[.:]?\s*(?:rs\.?|inr|₹|[0-9])/.test(h) ||
    /(?:a\/c|acct|account|xx\d{2,}).{0,24}\bcr\b/.test(h)
  ) {
    return 'income';
  }

  // IMPS / NEFT / RTGS direction when verb is weak.
  if (/\b(imps|neft|rtgs)\b/.test(h)) {
    if (/\b(credited|received|received in|has been credited)\b/.test(h)) return 'income';
    if (/\b(from your|debited|sent to|transferred to|paid to)\b/.test(h)) return 'expense';
  }

  const hasDebit = DEBIT_MARKERS.some((m) => {
    // Offer SMS: "Rs.X be used at your convenience" contains "used at" but is not a spend.
    if (m === 'used at' && /(?:be\s+)?used\s+at\s+your\s+convenience/.test(h)) return false;
    return bodyHasToken(body, m);
  });
  const hasCredit = CREDIT_MARKERS.some((m) => bodyHasToken(body, m));

  // Party direction beats a weak footer ("if not received…") on debit SMS.
  // Ignore "used at your convenience" (loan/limit offer), keep real "used at MERCHANT".
  const toParty =
    (/\b(?:to\s+vpa|paid\s+to|sent\s+to|transferred\s+to|transfer\s+to|towards)\b/i.test(body) ||
      (/\bused at\b/i.test(body) && !/\bused at your convenience\b/i.test(body)) ||
      /\bto\s+(?!your\b|a\/c\b|acct\b|account\b|bank\b|the\b)[a-z0-9][a-z0-9 .@_-]{1,40}/i.test(
        body,
      )) &&
    !/(?:be\s+)?used\s+at\s+your\s+convenience/i.test(body);
  const fromParty =
    /\b(?:from\s+vpa|received\s+from|credited\s+from)\b/i.test(body) ||
    (/\bfrom\s+(?!a\/c\b|acct\b|account\b|your\b|bank\b)[a-z0-9][a-z0-9 .@_-]{1,40}/i.test(body) &&
      !/\bdebited\s+from\b/i.test(body));

  if (hasDebit) return 'expense';
  if (/\b(txn of|transaction of)\b/.test(h) && !hasCredit) return 'expense';
  if (toParty && !hasCredit) return 'expense';
  if (hasCredit && !toParty) return 'income';
  if (fromParty && !hasDebit) return 'income';
  if (hasCredit) return 'income';
  if (toParty) return 'expense';
  return null;
}

export function inferPaymentType(body: string, address?: string): ImportPaymentType {
  const h = lower(`${address || ''} ${body}`);
  const creditCardCue = /credit\s*card|\bcredit\s*crd\b|\bcc\b\s*(?:no\.?|xx|\d{3,6})|\bblock\s+cc\b/.test(h);
  // RuPay credit cards spend over the UPI rail, so the SMS names both. The
  // credit line is what is drawn, so the card outranks the UPI mention. Paying
  // a card bill from a bank account is the reverse, and parseImportMessage
  // forces that leg back to the bank.
  if (creditCardCue) {
    return 'card';
  }
  if (
    /\bupi\b|upi-|@oksbi|@okhdfc|@okicici|@okaxis|@axl\b|phonepe|google pay|\bgpay\b|paytm|bhim/.test(
      h,
    )
  ) {
    return 'upi';
  }
  // A debit card draws straight from the bank account, so it is a bank expense.
  if (
    !creditCardCue &&
    /\bdebit\s*card|\bdebit\s*crd\b|\batm\s*card\b|\bblock\s+dc\b/.test(h)
  ) {
    return 'bank';
  }
  // Require an explicit card cue — do not treat bank "A/c XX1234" masks as card.
  if (
    creditCardCue ||
    /\bcard\s*(ending|no\.?|number|xx)|card\s*xx/.test(h) ||
    // "HDFC Bank Card 1234", "Card **1234", "on card 1234"
    /\bcard\s*\**x*\s*\d{3,6}\b/.test(h) ||
    /\bbank\s+card\b/.test(h)
  ) {
    return 'card';
  }
  return 'bank';
}

export function paymentTypeLabel(pt: ImportPaymentType): string {
  if (pt === 'upi') return 'UPI';
  if (pt === 'card') return 'Card';
  return 'Bank';
}

/** Map payment type → Cash book account (Card / UPI wallet / Bank). */
export function resolveImportAccountId(
  accounts: Account[],
  paymentType: ImportPaymentType,
): string | undefined {
  const active = accounts.filter((a) => !a.excluded);
  if (paymentType === 'card') {
    // The bank account is named "…Debit Card", so a loose /card/ match would
    // steal credit-card spends. Only the real card account may answer here.
    const card =
      active.find(isCoreCardAccount) ||
      active.find((a) => !isCoreBankAccount(a) && /\bcard\b/i.test(a.name || ''));
    if (card) return card.id;
  }
  if (paymentType === 'upi') {
    const upi = active.find(
      (a) => /upi/i.test(a.name || '') || (a.type || '').trim().toLowerCase() === 'wallet',
    );
    if (upi) return upi.id;
  }
  const bank = active.find(isCoreBankAccount);
  if (bank) return bank.id;
  const cash = active.find(isCashAccount);
  if (cash) return cash.id;
  return active[0]?.id;
}

export function matchImportRule(
  msg: RawImportMessage,
  rules: ImportSourceRule[],
): ImportSourceRule | null {
  const body = msg.body || '';
  const address = msg.address || '';
  let best: ImportSourceRule | null = null;
  for (const rule of rules) {
    if (rule.enabled === false) continue;
    const senderOk =
      !rule.senders.length || includesAny(address, rule.senders) || includesAny(body, rule.senders);
    if (!senderOk) continue;
    if (!includesAny(body, rule.bodyIncludes)) continue;
    if (excludesAny(body, rule.bodyExcludes)) continue;
    if (!best || (rule.priority || 0) > (best.priority || 0)) best = rule;
  }
  return best;
}

export function fingerprintMessage(
  msg: RawImportMessage,
  amount: number,
  date: string,
  ruleId: string,
): string {
  const body = (msg.body || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const addr = (msg.address || '').trim();
  return `${ruleId}|${date}|${amount}|${addr}|${body}`;
}

export function parseImportMessage(
  msg: RawImportMessage,
  rules: ImportSourceRule[],
  /** Names the user actually has, so a guess can't create an orphan category. */
  knownCategories?: Set<string>,
): ParsedImportCandidate | null {
  if (isNonTxnNoise(msg.body || '')) return null;
  const rule = matchImportRule(msg, rules);
  if (!rule) return null;
  const amount = extractAmount(msg.body || '');
  if (amount == null) return null;
  const date = extractDate(msg.body || '', msg.date);
  const body = msg.body || '';
  const cardCredited = isCardBillPayment(body);
  const cardBillBankDebit = looksLikeCardBillBankDebit(body);
  const merchant =
    cardCredited || cardBillBankDebit ? 'Card bill' : extractMerchant(body, rule);

  const isCardBill = cardCredited || cardBillBankDebit;

  let paymentType: ImportPaymentType =
    inferPaymentType(body, msg.address) || rule.paymentType || 'bank';
  // Either SMS describes the same movement: money leaves an account and lands on
  // the card. The card's own "payment received" SMS never names who paid, so the
  // bank account answers for it.
  if (isCardBill) {
    paymentType = cardBillBankDebit && /\bupi\b/i.test(body) ? 'upi' : 'bank';
  }

  // Body verbs win over rule kind (fixes debit SMS matched as credit).
  let kind: ParsedImportCandidate['kind'] = inferTxnKind(body) || rule.kind;
  if (isCardBill) kind = 'transfer';

  if (!isCardBill) {
    // Money arriving in an NPS account, a policy or a fund folio is that
    // provider reporting on its own books. The payment behind it moved through a
    // bank, and the bank's SMS is the one to import, so taking the notice too
    // would count the same rupees a second time as income.
    if (kind === 'income' && reportsOnAnotherLedger(body)) return null;
    // A bank transaction has to be money on a bank account: the account named,
    // or the bank, or the rail it travelled. Wallets and cards prove themselves
    // through their own payment type.
    if (paymentType === 'bank' && !looksLikeBankLedger(body, msg.address)) return null;
  }

  // Bank/UPI rules ship as "Others" because the sender says nothing about the
  // spend, so fall back to the merchant. A rule with a real category wins.
  const ruleCategory = (rule.category || '').trim();
  const guessed = isCardBill
    ? CARD_BILL_CATEGORY
    : ruleCategory && ruleCategory.toLowerCase() !== 'others'
      ? ruleCategory
      : guessImportCategory(kind === 'income' ? 'income' : 'expense', merchant, body) ||
        'Others';
  // A bill keeps its category even if the user deleted it from the picker: the
  // row is a transfer, so the name is a label rather than a choice.
  const category =
    isCardBill || !knownCategories || knownCategories.has(guessed) ? guessed : 'Others';
  const payLabel = paymentTypeLabel(paymentType);
  const noteBits = [
    payLabel,
    isCardBill ? 'Card bill' : '',
    !isCardBill && rule.notePrefix && rule.notePrefix !== payLabel ? rule.notePrefix : '',
    !isCardBill && merchant !== rule.name && merchant !== rule.notePrefix ? merchant : '',
  ]
    .map((s) => s.trim())
    .filter(Boolean);
  const note = Array.from(new Set(noteBits)).join(' · ').slice(0, 120);
  const fp = fingerprintMessage(msg, amount, date, rule.id);
  return {
    fingerprint: fp,
    kind,
    category,
    amount,
    date,
    note,
    ruleId: rule.id,
    ruleName: cardCredited
      ? 'Card bill (card credit)'
      : cardBillBankDebit
        ? 'Card bill (bank debit)'
        : rule.name,
    sourceLabel: msg.sourceLabel || msg.address || rule.name,
    rawText: body,
    sender: msg.address,
    paymentType,
    toPaymentType: isCardBill ? 'card' : undefined,
    selected: true,
  };
}

export function parseImportMessages(
  messages: RawImportMessage[],
  rules: ImportSourceRule[],
  knownCategories?: Set<string>,
): ParsedImportCandidate[] {
  const out: ParsedImportCandidate[] = [];
  const seen = new Set<string>();
  for (const msg of messages) {
    const parsed = parseImportMessage(msg, rules, knownCategories);
    if (!parsed) continue;
    if (seen.has(parsed.fingerprint)) continue;
    seen.add(parsed.fingerprint);
    out.push(parsed);
  }
  return dedupeSameMoneyMovement(out).sort(
    (a, b) => b.date.localeCompare(a.date) || b.amount - a.amount,
  );
}

const MERCHANT_RULE_IDS = new Set([
  'zepto',
  'blinkit',
  'swiggy',
  'zomato',
  'amazon',
  'flipkart',
  'phonepe',
  'paytm',
  'gpay',
]);

function isBankLedgerAlert(c: ParsedImportCandidate): boolean {
  if (MERCHANT_RULE_IDS.has(c.ruleId)) return false;
  if (
    c.ruleName === 'Card bill payment' ||
    isCardBillPayment(c.rawText) ||
    looksLikeCardBillBankDebit(c.rawText)
  ) {
    return true;
  }
  const h = lower(c.rawText);
  return /\b(debited|deducted|credited|withdrawn|withdrawal|paid)\b/.test(h);
}

function looksLikeLoanOrAutopay(text: string): boolean {
  return /\b(emi|loan|installment|instalment|autopay|auto[\s-]?pay|payment alert|update:)\b/i.test(
    text,
  );
}

function looksLikeCardBillAlert(text: string): boolean {
  return isCardBillPayment(text);
}

/** Bank leg of a credit-card bill payment (cash left the bank/UPI account). */
function looksLikeCardBillBankDebit(text: string): boolean {
  const h = lower(text);
  // Card purchases ("spent on your credit card at …") are not bill payments.
  if (
    /\b(spent on|used at|used for|purchase at|txn at|transaction at)\b/.test(h) ||
    /\bon\s+your\s+(?:credit\s*)?card\b/.test(h)
  ) {
    return false;
  }
  // Money must leave the bank (not a card-ledger "spent" alert).
  if (
    !/\b(debited|deducted|sent|paid|paying|dr|payment)\b/.test(h) &&
    !/\bdr\s*[.:]?\s*(?:rs|inr|₹|[0-9])/.test(h)
  ) {
    return false;
  }
  // A bill payment debits an *account*; when the card itself is the thing
  // debited it is a purchase on that card. RuPay credit cards spending over UPI
  // read "ICICI Bank Credit Card debited for INR 850 … for UPI".
  const cardIsDebited =
    /(?:credit\s*)?card[^.]{0,40}\b(?:is\s+|has\s+been\s+|was\s+)?debited\b/.test(h);
  const accountIsDebited =
    /\b(?:a\/c|acct|account|savings|current)\b[^.]{0,40}\bdebited\b/.test(h) ||
    /\bdebited\b[^.]{0,40}\bfrom\b[^.]{0,30}\b(?:a\/c|acct|account|savings|current)\b/.test(h);
  if (cardIsDebited && !accountIsDebited) {
    return false;
  }
  return (
    /credit\s*card/.test(h) ||
    /\bcc\b/.test(h) ||
    /\bcard\s+payment\b/.test(h) ||
    /\bcard\s+bill\b/.test(h) ||
    /towards\s+(?:your\s+)?(?:credit\s*)?card/.test(h) ||
    /for\s+(?:your\s+)?(?:credit\s*)?card/.test(h) ||
    /paid\s+to.{0,40}card/.test(h) ||
    /paying.{0,40}(?:credit\s*)?card/.test(h)
  );
}

function looksLikeP2pUpi(text: string): boolean {
  // Don't treat card-bill bank SMS ("paid to … CREDIT CARD") as P2P.
  if (looksLikeCardBillAlert(text) || looksLikeCardBillBankDebit(text)) return false;
  return /\b(to\s+vpa|from\s+vpa|sent\s+to|paid\s+to)\b/i.test(text);
}

function moneyMovementKey(c: ParsedImportCandidate): string {
  const amt = Math.round(c.amount * 100) / 100;
  // Amount-only key; date matched loosely when merging card-bill pairs.
  return `${amt}`;
}

function datesNear(a: string, b: string, maxDayDiff = 2): boolean {
  if (a === b) return true;
  const pa = Date.parse(a);
  const pb = Date.parse(b);
  if (!Number.isFinite(pa) || !Number.isFinite(pb)) return false;
  return Math.abs(pa - pb) <= maxDayDiff * 24 * 60 * 60 * 1000;
}

function preferLedgerCandidate(
  a: ParsedImportCandidate,
  b: ParsedImportCandidate,
): ParsedImportCandidate {
  const score = (c: ParsedImportCandidate) => {
    const t = `${c.rawText} ${c.note}`;
    let s = (c.note || '').length;
    if (looksLikeLoanOrAutopay(t)) s += 40;
    if (looksLikeCardBillAlert(c.rawText) || /card bill/i.test(c.note)) s += 35;
    if (/payment alert/i.test(t)) s += 25;
    // Prefer the bank "debited" leg as the cash outflow source of truth.
    if (/\bdebited\b/i.test(t)) s += 30;
    if (/\bdeducted\b/i.test(t)) s += 10;
    if (looksLikeCardBillBankDebit(c.rawText)) s += 20;
    return s;
  };
  return score(b) > score(a) ? b : a;
}

/**
 * Whether two alerts for the same amount describe one movement.
 *
 * The two ends of a bill — the bank's debit and the card's own "payment
 * received" — get the long window: only one message in a pair can come from the
 * card, so a match that wide cannot be two separate bills. Alerts from the same
 * side arrive together, so they keep a short one, and two real bills of the
 * same amount a week apart stay two rows.
 */
function ledgerPairKind(
  prev: ParsedImportCandidate,
  next: ParsedImportCandidate,
): 'cardBill' | 'loan' | null {
  const a = prev.rawText;
  const b = next.rawText;
  const aFromCard = looksLikeCardBillAlert(a);
  const bFromCard = looksLikeCardBillAlert(b);
  const isCardBillLeg =
    aFromCard ||
    bFromCard ||
    looksLikeCardBillBankDebit(a) ||
    looksLikeCardBillBankDebit(b) ||
    prev.ruleName.startsWith('Card bill') ||
    next.ruleName.startsWith('Card bill');

  if (isCardBillLeg) {
    const twoEnds =
      (aFromCard && !bFromCard && looksLikeCardBillBankDebit(b)) ||
      (bFromCard && !aFromCard && looksLikeCardBillBankDebit(a));
    return datesNear(prev.date, next.date, twoEnds ? CARD_BILL_LEG_DAYS : 2)
      ? 'cardBill'
      : null;
  }

  const loanPair =
    datesNear(prev.date, next.date, 1) &&
    (looksLikeLoanOrAutopay(a) ||
      looksLikeLoanOrAutopay(b) ||
      (/\bdebited\b/i.test(a) && /\bdeducted\b/i.test(b)) ||
      (/\bdeducted\b/i.test(a) && /\bdebited\b/i.test(b)));
  return loanPair ? 'loan' : null;
}

/**
 * Collapse duplicate bank alerts for one money movement
 * (e.g. UPDATE debited + PAYMENT ALERT deducted for the same EMI).
 * A card bill's two SMS collapse too: both describe one transfer off the bank
 * and onto the card, so one row books both ends.
 * Does not merge distinct UPI P2P payments of the same amount.
 */
export function dedupeSameMoneyMovement(
  list: ParsedImportCandidate[],
): ParsedImportCandidate[] {
  const kept: ParsedImportCandidate[] = [];
  // Every row of a given amount stays open to a partner. Holding one per amount
  // would leave a fixed monthly bill with only its first pair ever merged: each
  // later month would fail the window against January and then never be looked
  // at again, so both its SMS would book.
  const openByAmount = new Map<string, ParsedImportCandidate[]>();

  for (const c of list) {
    if (!isBankLedgerAlert(c) || looksLikeP2pUpi(c.rawText)) {
      kept.push(c);
      continue;
    }
    const key = moneyMovementKey(c);
    const open = openByAmount.get(key) || [];
    openByAmount.set(key, open);

    let pairKind: 'cardBill' | 'loan' | null = null;
    let at = -1;
    for (let i = 0; i < open.length; i += 1) {
      const kind = ledgerPairKind(open[i], c);
      if (kind) {
        pairKind = kind;
        at = i;
        break;
      }
    }
    if (at < 0) {
      open.push({ ...c, relatedFingerprints: [...(c.relatedFingerprints || [])] });
      continue;
    }
    const prev = open[at];
    const winner = preferLedgerCandidate(prev, c);
    const loser = winner.fingerprint === prev.fingerprint ? c : prev;
    open[at] = {
      ...winner,
      relatedFingerprints: [
        ...new Set([
          ...(winner.relatedFingerprints || []),
          loser.fingerprint,
          ...(loser.relatedFingerprints || []),
        ]),
      ],
      note:
        winner.note +
        (loser.note && !winner.note.includes('(+1 SMS)') ? ' · (+1 SMS)' : ''),
      ruleName:
        pairKind === 'cardBill'
          ? 'Card bill (both SMS)'
          : looksLikeLoanOrAutopay(winner.rawText) || looksLikeLoanOrAutopay(loser.rawText)
            ? 'Loan / AutoPay (merged)'
            : winner.ruleName,
    };
  }

  return [...kept, ...Array.from(openByAmount.values()).flat()];
}

/** Split pasted block into message-like chunks (blank-line separated). */
export function splitPasteIntoMessages(text: string): RawImportMessage[] {
  const trimmed = (text || '').trim();
  if (!trimmed) return [];
  const chunks = trimmed
    .split(/\n\s*\n+/)
    .map((c) => c.trim())
    .filter(Boolean);
  if (chunks.length <= 1) {
    // Also try line-based if many short SMS-like lines
    const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length > 3 && lines.every((l) => l.length < 280)) {
      return lines.map((body, i) => ({ body, sourceLabel: `Paste #${i + 1}` }));
    }
    return [{ body: trimmed, sourceLabel: 'Paste' }];
  }
  return chunks.map((body, i) => ({ body, sourceLabel: `Paste #${i + 1}` }));
}
