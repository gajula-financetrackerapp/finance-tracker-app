import type { ImportSourceRule } from '../../types';
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

function lower(s: string) {
  return (s || '').toLowerCase();
}

function includesAny(hay: string, needles: string[]) {
  if (!needles.length) return true;
  const h = lower(hay);
  return needles.some((n) => h.includes(lower(n)));
}

function excludesAny(hay: string, needles?: string[]) {
  if (!needles?.length) return false;
  const h = lower(hay);
  return needles.some((n) => h.includes(lower(n)));
}

/** Prefer largest plausible INR amount in the message. */
export function extractAmount(text: string): number | null {
  const cleaned = text.replace(/,/g, '');
  const patterns = [
    /(?:rs\.?|inr|₹)\s*([0-9]+(?:\.[0-9]{1,2})?)/gi,
    /(?:debited|credited|spent|paid|sent|received|of)\s*(?:rs\.?|inr|₹)?\s*([0-9]+(?:\.[0-9]{1,2})?)/gi,
    /([0-9]+(?:\.[0-9]{1,2})?)\s*(?:rs\.?|inr|₹)/gi,
  ];
  let best: number | null = null;
  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(cleaned))) {
      const n = Number(m[1]);
      if (!Number.isFinite(n) || n <= 0 || n > 10_000_000) continue;
      if (best == null || n > best) best = n;
    }
  }
  return best;
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
  const rule = matchImportRule(msg, rules);
  if (!rule) return null;
  const amount = extractAmount(msg.body || '');
  if (amount == null) return null;
  const date = extractDate(msg.body || '', msg.date);
  const merchant = extractMerchant(msg.body || '', rule);
  const noteBits = [rule.notePrefix || rule.name, merchant !== rule.name ? merchant : '']
    .map((s) => s.trim())
    .filter(Boolean);
  const note = Array.from(new Set(noteBits)).join(' · ').slice(0, 120);
  const fp = fingerprintMessage(msg, amount, date, rule.id);
  return {
    fingerprint: fp,
    kind: rule.kind,
    category: rule.category,
    amount,
    date,
    note,
    ruleId: rule.id,
    ruleName: rule.name,
    sourceLabel: msg.sourceLabel || msg.address || rule.name,
    rawText: msg.body || '',
    sender: msg.address,
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
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount);
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
