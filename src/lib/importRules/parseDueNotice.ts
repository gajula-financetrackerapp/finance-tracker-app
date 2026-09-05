import { todayStr } from '../../utils';

export type CardDueNotice = {
  issuer: string;
  last4: string | null;
  cardKey: string;
  totalDue: number | null;
  minDue: number | null;
  dueDate: string | null;
  /** Calendar day the SMS arrived. Not the statement generation date. */
  smsDate: string;
  /**
   * Trusted statement-generation day only.
   * Null when the SMS landed close to the due date (a reminder, not gen day).
   */
  statementDate: string | null;
  fingerprint: string;
  /** A generated statement wins over a later overdue / please-pay nudge. */
  role: 'statement' | 'nudge';
  body?: string;
};

/** SMS within this many days of due is not the statement generation day. */
export const LATE_STATEMENT_LEAD_DAYS = 8;

/** A “statement generated” SMS may land a few days after the real generation day. */
export const LATE_STATEMENT_ARRIVAL_DAYS = 5;

export function daysBetweenIso(a: string, b: string): number {
  const ms = new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime();
  return Number.isFinite(ms) ? Math.round(ms / 86400000) : 0;
}

/** True when the SMS day is far enough before due to be the real generation day. */
export function isTrustedStatementGenerationDay(
  smsDate: string,
  dueDate: string | null,
): boolean {
  if (!dueDate || !smsDate) return true;
  return daysBetweenIso(smsDate, dueDate) > LATE_STATEMENT_LEAD_DAYS;
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const ISSUERS: Array<{ slug: string; label: string; needles: string[] }> = [
  { slug: 'hdfc', label: 'HDFC', needles: ['hdfc'] },
  { slug: 'sbi', label: 'SBI', needles: ['sbi', 'sbicrd', 'sbicard'] },
  { slug: 'icici', label: 'ICICI', needles: ['icici'] },
  { slug: 'axis', label: 'Axis', needles: ['axis'] },
  { slug: 'kotak', label: 'Kotak', needles: ['kotak'] },
  { slug: 'bob', label: 'BOB', needles: ['bobcard', 'bobcrd', 'baroda', 'bob'] },
  { slug: 'rbl', label: 'RBL', needles: ['rbl'] },
  { slug: 'yes', label: 'YES', needles: ['yesbnk', 'yesbank', 'yes bank'] },
  { slug: 'idfc', label: 'IDFC', needles: ['idfc'] },
  { slug: 'indusind', label: 'IndusInd', needles: ['indusind', 'indbk'] },
  { slug: 'amex', label: 'Amex', needles: ['amex', 'american express'] },
  { slug: 'citi', label: 'Citi', needles: ['citi'] },
  { slug: 'hsbc', label: 'HSBC', needles: ['hsbc'] },
  { slug: 'stanchart', label: 'StanChart', needles: ['stanchart', 'standard chartered', 'scbank'] },
  { slug: 'au', label: 'AU', needles: ['aubank', 'au bank'] },
  { slug: 'federal', label: 'Federal', needles: ['federal', 'fedbnk'] },
  { slug: 'dbs', label: 'DBS', needles: ['dbs'] },
  { slug: 'onecard', label: 'OneCard', needles: ['onecard', 'one card', 'onecrd'] },
];

export const CARD_ISSUER_LABELS = ISSUERS.map((r) => r.label);

const DUE_CUE =
  /statement\s+(?:is\s+)?generated|statement\s+(?:is\s+|has\s+been\s+)?sent|statement\s+for\s+(?:your\s+)?(?:credit\s+)?card|e-?statement|monthly\s+statement|card\s+statement|credit\s+card\s+statement|bill\s+generated|total\s+(?:amount\s+|amt\.?\s+|payment\s+|out(?:standing|\.?\s*amt)\s*)?due|total\s+of\s+(?:rs\.?|inr|₹)|total\s+(?:amount\s+)?payable|total\s+out(?:standing|\.?\s*amt)|min(?:imum)?\.?\s*due|payment\s+due(?:\s*date)?|amount\s+payable|is\s+due\s+by|\btad\b|\bmad\b|\bpdd\b/i;

const STATEMENT_CUE =
  /statement\s+(?:is\s+)?generated|statement\s+(?:is\s+|has\s+been\s+)?sent|statement\s+for\s+(?:your\s+)?(?:credit\s+)?card|statement\s+(?:date|dated)|e-?statement|monthly\s+statement|card\s+statement|credit\s+card\s+statement|bill\s+generated|your\s+statement\s+has\s+been|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[- ]?\d{2}\s+statement|\bstatement\s*:\s*(?:total|min)/i;

const CARD_CUE =
  /credit\s*card|\bcreditcard\b|\bcardmember\b|\bcr\.?\s*crd\b|\bcr\.?\s*card\b|\bbobcard\b|\bsbicard\b|\bonecard\b|\bcc\s+(?:ending|xx+)?\s*\d{4}\b|\bcard\s+(?:ending|no\.?|number|xx)|\bcard\s+\d{4}\b|\bending\s+\d{4}\b/i;

const MARKETING =
  /pre-?approved|loan\s+offer|apply\s+now|avail\s+instant|at\s+your\s+convenience|get\s+rewards|limited\s+period|click\s+to\s+avail/i;

function lower(s: string) {
  return (s || '').toLowerCase();
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function parseRupees(raw: string): number | null {
  const n = Number(String(raw).replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0 || n > 10_000_000) return null;
  return n;
}

function yearFrom(raw: string | undefined, smsYear: number): number {
  if (!raw) return smsYear;
  const n = Number(raw);
  if (!Number.isFinite(n)) return smsYear;
  if (n >= 100) return n;
  return 2000 + n;
}

export function addMonthsIso(iso: string, months: number): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso;
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  const dt = new Date(year, month - 1 + months, 1);
  const last = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
  return toIso(dt.getFullYear(), dt.getMonth() + 1, Math.min(day, last)) || iso;
}

function toIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(year, month - 1, day);
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) {
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function smsDay(date?: number | string): string {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)) return date.slice(0, 10);
  if (typeof date === 'number' && Number.isFinite(date) && date > 0) {
    const d = new Date(date);
    if (!Number.isNaN(d.getTime())) return todayStr(d);
  }
  return todayStr();
}

function isYearLikeLast4(digits: string): boolean {
  const n = Number(digits);
  return Number.isFinite(n) && n >= 2019 && n <= 2039;
}

/**
 * True when these 4 digits are the bank account in the SMS, not a card PAN.
 * "A/c XX1739", "A/C *1739", "Bank AC X6178", "HDFC Bank XX9213".
 */
export function last4IsBankAccountMask(text: string, last4: string): boolean {
  if (!last4 || !/^\d{4}$/.test(last4)) return false;
  const digits = last4.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const accountLead =
    /(?:a\/c|acct(?:ount)?|account|savings|current|sb\s*a\/c|bank\s+a\/?c|\bac)\s*(?:no\.?\s*)?(?:xx+|x+|\*+|-+)?\s*/i;
  const bankLead = /\bbank\s+(?:xx+|x+|\*+)/i;
  return (
    new RegExp(`${accountLead.source}${digits}\\b`, 'i').test(text) ||
    new RegExp(`${bankLead.source}${digits}\\b`, 'i').test(text)
  );
}

export function extractCardLast4(text: string): string | null {
  const h = text || '';
  // Only digits next to a card cue. Bare XX1234 / *1234 is how banks mask an
  // a/c, and treating that as a PAN mints a credit-card face on Refresh.
  const nearCard = [
    /card(?:\s+(?:ending|no\.?|number))?(?:\s*(?:xx+|x+|\*+))?\s*(\d{4})\b/i,
    /\bending\s+(?:xx+|x+|\*+)?\s*(\d{4})\b/i,
    /\bcc\s+(?:ending\s+)?(?:xx+|x+|\*+)?\s*(\d{4})\b/i,
  ];
  for (const re of nearCard) {
    const m = h.match(re);
    const digits = m?.[1];
    if (digits && !isYearLikeLast4(digits) && !last4IsBankAccountMask(h, digits)) return digits;
  }
  return null;
}

function matchIssuer(hay: string): string | null {
  const h = (hay || '').toLowerCase();
  if (!h) return null;
  for (const row of ISSUERS) {
    if (row.needles.some((n) => h.includes(n))) return row.label;
  }
  return null;
}

export function extractCardIssuer(text: string, address?: string): string {
  const body = text || '';
  const last4Re = /(?:ending\s+(?:xx+|x+|\*)?\s*|card\s+(?:xx+|x+|\*)?)\s*\d{4}\b/i;
  const last4At = body.search(last4Re);
  if (last4At >= 0) {
    const tok = body.slice(last4At).match(last4Re);
    const end = last4At + (tok ? tok[0].length : 0);
    const near = body.slice(0, end);
    const fromCard = matchIssuer(near);
    if (fromCard) return fromCard;
    const fromAddress = matchIssuer(address || '');
    if (fromAddress) return fromAddress;
    return 'Card';
  }
  return matchIssuer(address || '') || matchIssuer(body) || 'Card';
}

export function issuerSlug(label: string): string {
  const found = ISSUERS.find((r) => r.label === label);
  if (found) return found.slug;
  const known = extractCardIssuer(label);
  if (known !== 'Card') {
    const mapped = ISSUERS.find((r) => r.label === known);
    if (mapped) return mapped.slug;
  }
  return label.toLowerCase().replace(/\s+/g, '');
}

/** Note tag that later matching can read back: "HDFC ending 9562". */
export function cardIdentityTag(text: string, address?: string): string {
  const last4 = extractCardLast4(text);
  const issuer = extractCardIssuer(text, address);
  if (issuer !== 'Card' && last4) return `${issuer} ending ${last4}`;
  if (last4) return `ending ${last4}`;
  if (issuer !== 'Card') return issuer;
  return '';
}

export function cardKeyOf(issuer: string, last4: string | null): string {
  return `${issuerSlug(issuer)}|${last4 || 'unknown'}`;
}

/** Four digits, or null if the value is not a card ending. */
export function digits4(value?: string | null): string | null {
  const d = String(value || '').replace(/\D/g, '');
  return /^\d{4}$/.test(d) ? d : null;
}

const DUE_DATE_LEAD =
  '(?:due\\s*(?:date|dt)|payment\\s*due(?:\\s*date)?|due\\s*on|due\\s*by|pay\\s*by|pdd|on\\s+or\\s+before|due\\s*date\\s+of)';

const STATEMENT_DATE_LEAD =
  '(?:statement\\s+(?:date|dated|dt)|stmt\\.?\\s*(?:date|dt)|statement\\s+as\\s+on|e-?statement\\s+(?:date|dated)|statement\\s+(?:is\\s+)?generated\\s+on|bill\\s+generated\\s+on|generated\\s+on|period\\s+ending|statement\\s+of)';

function extractLabeledDate(
  text: string,
  smsDate: string,
  lead: string,
  kind: 'due' | 'statement',
): string | null {
  const smsYear = Number(smsDate.slice(0, 4)) || new Date().getFullYear();
  const smsMonth = Number(smsDate.slice(5, 7)) || new Date().getMonth() + 1;

  const finish = (day: number, month: number, rawYear?: string): string | null => {
    let year = yearFrom(rawYear, smsYear);
    if (!rawYear && kind === 'due' && month < smsMonth - 1) year += 1;
    let iso = toIso(year, month, day);
    if (kind === 'statement' && !rawYear && iso && iso > smsDate) {
      iso = toIso(year - 1, month, day);
    }
    return iso;
  };

  const dmy = text.match(
    new RegExp(`${lead}\\s*(?:is|[:\\-])?\\s*(\\d{1,2})[\\/\\-.](\\d{1,2})(?:[\\/\\-.](\\d{2,4}))?`, 'i'),
  );
  if (dmy) {
    const iso = finish(Number(dmy[1]), Number(dmy[2]), dmy[3]);
    if (iso) return iso;
  }

  const mon = text.match(
    new RegExp(
      `${lead}\\s*(?:is|[:\\-])?\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s*[-/\\s]?\\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?\\s*'?,?\\s*(\\d{2,4})?`,
      'i',
    ),
  );
  if (mon) {
    const iso = finish(Number(mon[1]), MONTHS[mon[2].toLowerCase()], mon[3]);
    if (iso) return iso;
  }

  const flipped = text.match(
    new RegExp(
      `${lead}\\s*(?:is|[:\\-])?\\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?\\s*(\\d{1,2})(?:\\s*,?\\s*(\\d{2,4}))?`,
      'i',
    ),
  );
  if (flipped) {
    const iso = finish(Number(flipped[2]), MONTHS[flipped[1].toLowerCase()], flipped[3]);
    if (iso) return iso;
  }

  return null;
}

function extractDueDate(text: string, smsDate: string): string | null {
  return extractLabeledDate(text, smsDate, DUE_DATE_LEAD, 'due');
}

function extractStatementDate(text: string, smsDate: string): string | null {
  return extractLabeledDate(text, smsDate, STATEMENT_DATE_LEAD, 'statement');
}

/**
 * Prefer the printed generation day, or last month’s day when the SMS landed late.
 * Do not move an already-correct this-cycle date to the SMS arrival day.
 */
export function refineStatementDate(
  notice: Pick<CardDueNotice, 'role' | 'statementDate' | 'smsDate' | 'dueDate'>,
  previousStatement?: string | null,
): string | null {
  const printed =
    notice.statementDate && notice.statementDate !== notice.smsDate ? notice.statementDate : null;
  if (printed && isTrustedStatementGenerationDay(printed, notice.dueDate)) return printed;

  if (notice.role !== 'statement') return notice.statementDate;

  const prev = (previousStatement || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(prev)) {
    const lateThisCycle = daysBetweenIso(prev, notice.smsDate);
    if (
      lateThisCycle >= 0 &&
      lateThisCycle <= LATE_STATEMENT_ARRIVAL_DAYS &&
      isTrustedStatementGenerationDay(prev, notice.dueDate)
    ) {
      return prev;
    }
    const expected = addMonthsIso(prev, 1);
    const lateNewCycle = daysBetweenIso(expected, notice.smsDate);
    if (
      lateNewCycle >= 0 &&
      lateNewCycle <= LATE_STATEMENT_ARRIVAL_DAYS &&
      isTrustedStatementGenerationDay(expected, notice.dueDate)
    ) {
      return expected;
    }
  }

  return notice.statementDate;
}

function extractLabeledAmount(text: string, labels: RegExp): number | null {
  const cleaned = text.replace(/,/g, '');
  const label = `(?:${labels.source})`;
  const money = '(?:rs\\.?|inr|₹)?\\s*([0-9]+(?:\\.[0-9]{1,2})?)(?:\\s*/-)?';
  const after = new RegExp(`${label}\\s*(?:[:\\-]|is|of|for)?\\s*${money}`, 'i');
  const before = new RegExp(`${money}\\s+(?:is\\s+(?:the\\s+)?)?${label}`, 'i');
  const m = cleaned.match(after) || cleaned.match(before);
  const raw = m?.[1] || m?.[2];
  return raw ? parseRupees(raw) : null;
}

/** True when this SMS is a card statement / due notice, not a completed payment. */
export function isCardDueNotice(body: string): boolean {
  const h = lower(body);
  if (!h) return false;
  if (MARKETING.test(h)) return false;
  if (/\b(emi due|emi reminder|loan emi)\b/.test(h) && !CARD_CUE.test(h)) return false;
  // A spend alert often also prints outstanding / available limit — that is not a bill.
  if (/\b(spent on|spent at|used at|txn at|transaction at|debited from|debited)\b/.test(h)) {
    return false;
  }
  // "Payment received. Total amount due Rs.0" is the bill being settled, not a
  // new statement. Keep genuine "statement generated" SMS even if they also
  // thank you for a payment.
  const paidCue =
    /\bpayment\s+(?:of|received)\b/.test(h) ||
    /\bonline\s+payment\s+of\b/.test(h) ||
    /\bhas\s+been\s+received\b/.test(h) ||
    /\bcredited\s+(?:to|in|into|on)\s+(?:your\s+)?(?:[a-z0-9]+\s+){0,4}(?:credit\s*)?card\b/.test(h) ||
    /\bthank you for (?:your )?payment\b/.test(h) ||
    /\bwe have received (?:your )?payment\b/.test(h) ||
    /\bposted\s+to\s+your\b/.test(h);
  if (paidCue && !STATEMENT_CUE.test(h)) return false;
  return DUE_CUE.test(h) && CARD_CUE.test(h);
}

export function parseDueNotice(
  body: string,
  opts?: { address?: string; date?: number | string },
): CardDueNotice | null {
  if (!isCardDueNotice(body)) return null;
  const smsDate = smsDay(opts?.date);
  const last4 = extractCardLast4(body);
  const issuer = extractCardIssuer(body, opts?.address);
  if (!last4 && issuer === 'Card') return null;

  const totalDue = extractLabeledAmount(
    body,
    /total\s+(?:amount\s+|amt\.?\s+|payment\s+|out(?:standing|\.?\s*amt)\s*)?due|total\s+of|total\s+(?:amount\s+)?payable|total\s+out(?:standing|\.?\s*amt)|outstanding(?:\s+amt(?:ount)?)?|amt\.?\s*due|amount\s+due|\btad\b/,
  );
  const minDue = extractLabeledAmount(
    body,
    /min(?:imum)?\.?\s*(?:amt(?:ount)?\s*)?due|min(?:imum)?\s+of|min\.?\s*amt|\bmad\b/,
  );
  let dueDate = extractDueDate(body, smsDate);
  // A new statement whose printed due is already behind the SMS is the next cycle.
  if (STATEMENT_CUE.test(body) && dueDate && dueDate < smsDate) {
    dueDate = addMonthsIso(dueDate, 1);
  }

  if (totalDue == null && dueDate == null) return null;

  const role: CardDueNotice['role'] = STATEMENT_CUE.test(body) ? 'statement' : 'nudge';
  const printedStmt = extractStatementDate(body, smsDate);
  const statementDate =
    printedStmt && isTrustedStatementGenerationDay(printedStmt, dueDate)
      ? printedStmt
      : role === 'statement' && isTrustedStatementGenerationDay(smsDate, dueDate)
        ? smsDate
        : null;
  const cardKey = cardKeyOf(issuer, last4);
  const fingerprint = `due|${cardKey}|${dueDate || smsDate}|${totalDue ?? ''}|${(body || '')
    .slice(0, 48)
    .toLowerCase()}`;

  return {
    issuer,
    last4,
    cardKey,
    totalDue,
    minDue,
    dueDate,
    smsDate,
    statementDate,
    fingerprint,
    role,
    body: body || '',
  };
}
