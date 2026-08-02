import type { Account, ImportPaymentType, ImportSourceRule } from '../../types';
import { todayStr } from '../../utils';

export type ParsedImportCandidate = {
  /** Stable key for dedupe within a scan */
  fingerprint: string;
  kind: 'expense' | 'income';
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
    'apply now',
    'limited period offer',
    'get rewards',
    'you are eligible',
    'eligible for a loan',
    'preapproved',
  ];
  if (pending.some((p) => h.includes(p))) return true;

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
 * Paying a credit-card bill: bank says money was "credited to your card ending …"
 * or "payment … received towards/into your credit card".
 * That is money you paid (expense), not income — even though the verb is "credited"/"received".
 */
export function isCardBillPayment(body: string): boolean {
  const h = lower(body);
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
    (/payment\s+of/.test(h) && /received/.test(h) && /credit\s*card/.test(h))
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

  // Paying CC bill: "credited to your card" is money out, not income.
  if (isCardBillPayment(body)) return 'expense';

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

  const hasDebit = DEBIT_MARKERS.some((m) => bodyHasToken(body, m));
  const hasCredit = CREDIT_MARKERS.some((m) => bodyHasToken(body, m));

  // Party direction beats a weak footer ("if not received…") on debit SMS.
  const toParty =
    /\b(?:to\s+vpa|paid\s+to|sent\s+to|transferred\s+to|transfer\s+to|towards|used at)\b/i.test(
      body,
    ) ||
    /\bto\s+(?!your\b|a\/c\b|acct\b|account\b|bank\b|the\b)[a-z0-9][a-z0-9 .@_-]{1,40}/i.test(
      body,
    );
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
  if (
    /\bupi\b|upi-|@oksbi|@okhdfc|@okicici|@okaxis|@axl\b|phonepe|google pay|\bgpay\b|paytm|bhim/.test(
      h,
    )
  ) {
    return 'upi';
  }
  // Require an explicit card cue — do not treat bank "A/c XX1234" masks as card.
  if (
    /credit\s*card|\bdebit\s*card|\bcard\s*(ending|no\.?|number|xx)|card\s*xx/.test(h)
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
    const card = active.find(
      (a) =>
        (a.type || '').trim().toLowerCase() === 'card' || /\bcard\b/i.test(a.name || ''),
    );
    if (card) return card.id;
  }
  if (paymentType === 'upi') {
    const upi = active.find(
      (a) => /upi/i.test(a.name || '') || (a.type || '').trim().toLowerCase() === 'wallet',
    );
    if (upi) return upi.id;
  }
  const bank = active.find((a) => a.name.trim().toLowerCase() === 'bank');
  if (bank) return bank.id;
  const cash = active.find((a) => a.name.trim().toLowerCase() === 'cash');
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
): ParsedImportCandidate | null {
  if (isNonTxnNoise(msg.body || '')) return null;
  const rule = matchImportRule(msg, rules);
  if (!rule) return null;
  const amount = extractAmount(msg.body || '');
  if (amount == null) return null;
  const date = extractDate(msg.body || '', msg.date);
  const cardBill = isCardBillPayment(msg.body || '');
  const merchant = cardBill ? 'Card bill' : extractMerchant(msg.body || '', rule);
  // Card-bill "credited to card" is paid from bank/UPI; don't book as income on Card.
  let paymentType: ImportPaymentType =
    inferPaymentType(msg.body || '', msg.address) || rule.paymentType || 'bank';
  if (cardBill) {
    paymentType = /\bupi\b/i.test(msg.body || '') ? 'upi' : 'bank';
  }
  // Body verbs win over rule kind (fixes debit SMS matched as credit).
  const kind = inferTxnKind(msg.body || '') || rule.kind;
  const payLabel = paymentTypeLabel(paymentType);
  const noteBits = [
    payLabel,
    cardBill ? 'Card bill' : '',
    !cardBill && rule.notePrefix && rule.notePrefix !== payLabel ? rule.notePrefix : '',
    !cardBill && merchant !== rule.name && merchant !== rule.notePrefix ? merchant : '',
  ]
    .map((s) => s.trim())
    .filter(Boolean);
  const note = Array.from(new Set(noteBits)).join(' · ').slice(0, 120);
  const fp = fingerprintMessage(msg, amount, date, rule.id);
  return {
    fingerprint: fp,
    kind,
    category: rule.category,
    amount,
    date,
    note,
    ruleId: rule.id,
    ruleName: cardBill ? 'Card bill payment' : rule.name,
    sourceLabel: msg.sourceLabel || msg.address || rule.name,
    rawText: msg.body || '',
    sender: msg.address,
    paymentType,
    selected: true,
  };
}

export function parseImportMessages(
  messages: RawImportMessage[],
  rules: ImportSourceRule[],
): ParsedImportCandidate[] {
  const out: ParsedImportCandidate[] = [];
  const seen = new Set<string>();
  for (const msg of messages) {
    const parsed = parseImportMessage(msg, rules);
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
  if (c.ruleName === 'Card bill payment' || isCardBillPayment(c.rawText)) return true;
  const h = lower(c.rawText);
  return /\b(debited|deducted|credited|withdrawn|withdrawal)\b/.test(h);
}

function looksLikeLoanOrAutopay(text: string): boolean {
  return /\b(emi|loan|installment|instalment|autopay|auto[\s-]?pay|payment alert|update:)\b/i.test(
    text,
  );
}

function looksLikeCardBillAlert(text: string): boolean {
  return isCardBillPayment(text);
}

function looksLikeP2pUpi(text: string): boolean {
  return /\b(to\s+vpa|from\s+vpa|sent\s+to|paid\s+to)\b/i.test(text);
}

function moneyMovementKey(c: ParsedImportCandidate): string {
  const amt = Math.round(c.amount * 100) / 100;
  // Omit kind so bank-debit (expense) can merge with a misread card "received" (income).
  return `${amt}|${c.date}`;
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
    return s;
  };
  return score(b) > score(a) ? b : a;
}

/**
 * Collapse duplicate bank alerts for one money movement
 * (e.g. UPDATE debited + PAYMENT ALERT deducted for the same EMI,
 * or bank debited + card "payment received towards credit card").
 * Does not merge distinct UPI P2P payments of the same amount.
 */
export function dedupeSameMoneyMovement(
  list: ParsedImportCandidate[],
): ParsedImportCandidate[] {
  const kept: ParsedImportCandidate[] = [];
  const ledgerByKey = new Map<string, ParsedImportCandidate>();

  for (const c of list) {
    if (!isBankLedgerAlert(c) || looksLikeP2pUpi(c.rawText)) {
      kept.push(c);
      continue;
    }
    const key = moneyMovementKey(c);
    const prev = ledgerByKey.get(key);
    if (!prev) {
      ledgerByKey.set(key, { ...c, relatedFingerprints: [...(c.relatedFingerprints || [])] });
      continue;
    }
    const a = prev.rawText;
    const b = c.rawText;
    const cardBillPair =
      (looksLikeCardBillAlert(a) && /\b(debited|deducted|sent)\b/i.test(b)) ||
      (looksLikeCardBillAlert(b) && /\b(debited|deducted|sent)\b/i.test(a));
    const shouldMerge =
      looksLikeLoanOrAutopay(a) ||
      looksLikeLoanOrAutopay(b) ||
      cardBillPair ||
      (/\bdebited\b/i.test(a) && /\bdeducted\b/i.test(b)) ||
      (/\bdeducted\b/i.test(a) && /\bdebited\b/i.test(b));
    if (!shouldMerge) {
      kept.push(c);
      continue;
    }
    const winner = preferLedgerCandidate(prev, c);
    const loser = winner.fingerprint === prev.fingerprint ? c : prev;
    const isCardBillMerge = cardBillPair;
    const mergedPay: ImportPaymentType = isCardBillMerge
      ? /\bupi\b/i.test(`${winner.rawText} ${loser.rawText}`)
        ? 'upi'
        : 'bank'
      : winner.paymentType;
    ledgerByKey.set(key, {
      ...winner,
      // Bill pay is always an expense (cash left the bank), even if one SMS said "received".
      kind: isCardBillMerge ? 'expense' : winner.kind,
      relatedFingerprints: [
        ...new Set([
          ...(winner.relatedFingerprints || []),
          loser.fingerprint,
          ...(loser.relatedFingerprints || []),
        ]),
      ],
      note: isCardBillMerge
        ? `${paymentTypeLabel(mergedPay)} · Card bill · (+1 SMS)`.slice(0, 120)
        : winner.note +
          (loser.note && !winner.note.includes('(+1 SMS)') ? ' · (+1 SMS)' : ''),
      ruleName: isCardBillMerge
        ? 'Card bill payment (merged)'
        : looksLikeLoanOrAutopay(winner.rawText) || looksLikeLoanOrAutopay(loser.rawText)
          ? 'Loan / AutoPay (merged)'
          : winner.ruleName,
      paymentType: mergedPay,
    });
  }

  return [...kept, ...Array.from(ledgerByKey.values())];
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
