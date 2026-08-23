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
];

const DUE_CUE =
  /statement\s+(?:is\s+)?generated|e-?statement|monthly\s+statement|card\s+statement|credit\s+card\s+statement|bill\s+generated|total\s+(?:amount\s+|amt\.?\s+|payment\s+|out(?:standing|\.?\s*amt)\s*)?due|total\s+(?:amount\s+)?payable|total\s+out(?:standing|\.?\s*amt)|min(?:imum)?\.?\s*due|payment\s+due(?:\s*date)?|amount\s+payable|\bpdd\b/i;

const STATEMENT_CUE =
  /statement\s+(?:is\s+)?generated|e-?statement|monthly\s+statement|card\s+statement|credit\s+card\s+statement|bill\s+generated|your\s+statement\s+has\s+been/i;

const CARD_CUE =
  /credit\s*card|\bcardmember\b|\bcr\.?\s*crd\b|\bcr\.?\s*card\b|\bcard\s+(?:ending|no\.?|number|xx)|\bcard\s+\d{4}\b|\bxx+\d{4}\b|\bending\s+\d{4}\b/i;

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

export function extractCardLast4(text: string): string | null {
  const h = text || '';
  const nearCard = [
    /card(?:\s+(?:ending|no\.?|number|xx+|x+))?\s*(\d{4})\b/i,
    /\bending\s+(?:xx+|x+)?\s*(\d{4})\b/i,
    /\bcard\s+xx+(\d{4})\b/i,
    /\bxx+(\d{4})\b/i,
  ];
  for (const re of nearCard) {
    const m = h.match(re);
    if (m?.[1] && m[1] !== '2026' && m[1] !== '2025' && m[1] !== '2024') return m[1];
  }
  return null;
}

export function extractCardIssuer(text: string, address?: string): string {
  const hay = `${address || ''} ${text || ''}`.toLowerCase();
  for (const row of ISSUERS) {
    if (row.needles.some((n) => hay.includes(n))) return row.label;
  }
  return 'Card';
}

export function issuerSlug(label: string): string {
  const found = ISSUERS.find((r) => r.label === label);
  return found?.slug || label.toLowerCase().replace(/\s+/g, '');
}

export function cardKeyOf(issuer: string, last4: string | null): string {
  return `${issuerSlug(issuer)}|${last4 || 'unknown'}`;
}

const DUE_DATE_LEAD =
  '(?:due\\s*(?:date|dt)|payment\\s*due(?:\\s*date)?|due\\s*on|due\\s*by|pay\\s*by|pdd|on\\s+or\\s+before|due\\s*date\\s+of)';

function extractDueDate(text: string, smsDate: string): string | null {
  const smsYear = Number(smsDate.slice(0, 4)) || new Date().getFullYear();
  const smsMonth = Number(smsDate.slice(5, 7)) || new Date().getMonth() + 1;

  const dmy = text.match(
    new RegExp(
      `${DUE_DATE_LEAD}\\s*(?:is|[:\\-])?\\s*(\\d{1,2})[\\/\\-.](\\d{1,2})(?:[\\/\\-.](\\d{2,4}))?`,
      'i',
    ),
  );
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = yearFrom(dmy[3], smsYear);
    if (!dmy[3] && month < smsMonth - 1) year += 1;
    const iso = toIso(year, month, day);
    if (iso) return iso;
  }

  const mon = text.match(
    new RegExp(
      `${DUE_DATE_LEAD}\\s*(?:is|[:\\-])?\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s*[-/\\s]?\\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?\\s*'?,?\\s*(\\d{2,4})?`,
      'i',
    ),
  );
  if (mon) {
    const day = Number(mon[1]);
    const month = MONTHS[mon[2].toLowerCase()];
    let year = yearFrom(mon[3], smsYear);
    if (!mon[3] && month < smsMonth - 1) year += 1;
    const iso = toIso(year, month, day);
    if (iso) return iso;
  }

  const flipped = text.match(
    new RegExp(
      `${DUE_DATE_LEAD}\\s*(?:is|[:\\-])?\\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?\\s*(\\d{1,2})(?:\\s*,?\\s*(\\d{2,4}))?`,
      'i',
    ),
  );
  if (flipped) {
    const month = MONTHS[flipped[1].toLowerCase()];
    const day = Number(flipped[2]);
    const year = yearFrom(flipped[3], smsYear);
    const iso = toIso(year, month, day);
    if (iso) return iso;
  }

  return null;
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
  if (/\b(spent on|used at|txn at|transaction at|debited from|debited)\b/.test(h)) {
    return false;
  }
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
    /total\s+(?:amount\s+|amt\.?\s+|payment\s+|out(?:standing|\.?\s*amt)\s*)?due|total\s+(?:amount\s+)?payable|total\s+out(?:standing|\.?\s*amt)|outstanding(?:\s+amt(?:ount)?)?|amt\.?\s*due|amount\s+due/,
  );
  const minDue = extractLabeledAmount(body, /min(?:imum)?\.?\s*(?:amt(?:ount)?\s*)?due|min\.?\s*amt/);
  let dueDate = extractDueDate(body, smsDate);
  // A new statement whose printed due is already behind the SMS is the next cycle.
  if (STATEMENT_CUE.test(body) && dueDate && dueDate < smsDate) {
    dueDate = addMonthsIso(dueDate, 1);
  }

  if (totalDue == null && dueDate == null) return null;

  const role: CardDueNotice['role'] = STATEMENT_CUE.test(body) ? 'statement' : 'nudge';
  const statementDate =
    role === 'statement' && isTrustedStatementGenerationDay(smsDate, dueDate) ? smsDate : null;
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
