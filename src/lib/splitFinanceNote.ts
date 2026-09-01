import type { TranslationKey } from '../i18n/translations';

/** Stored English — parse this; translate only when showing the row. */
export const SPLIT_PAID_FULL_SELF = 'You paid the full amount';
export const SPLIT_PAID_FULL_BY_PREFIX = 'Paid in full by ';

type TranslateFn = (key: TranslationKey, params?: Record<string, string | number>) => string;

function storedAmount(n: number): string {
  const r = Math.round(Number(n) * 100) / 100;
  if (!Number.isFinite(r) || r < 0) return '';
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
}

export function splitPaidInFullLine(
  iPaid: boolean,
  payerDisplayName: string,
  fullAmount?: number,
): string {
  const amt = fullAmount != null ? storedAmount(fullAmount) : '';
  if (iPaid) {
    return amt ? `You paid the full amount of ${amt}` : SPLIT_PAID_FULL_SELF;
  }
  const name = String(payerDisplayName || '').trim() || 'them';
  return amt ? `Paid ${amt} in full by ${name}` : `${SPLIT_PAID_FULL_BY_PREFIX}${name}`;
}

/** Description on the first line; who paid the bill (and how much) on the last. */
export function buildSplitExpenseNote(
  description: string,
  iPaid: boolean,
  payerDisplayName: string,
  fullAmount?: number,
): string {
  const desc = String(description || '').trim();
  const paid = splitPaidInFullLine(iPaid, payerDisplayName, fullAmount);
  return desc ? `${desc}\n${paid}` : paid;
}

function isPaidInFullLine(line: string): boolean {
  return (
    /^you paid the full amount(?: of [\d.]+)?$/i.test(line) ||
    /^paid [\d.]+ in full by .+/i.test(line) ||
    /^paid in full by .+/i.test(line)
  );
}

function canonicalPaidLine(line: string): string {
  const selfAmt = line.match(/^you paid the full amount of ([\d.]+)$/i);
  if (selfAmt) return `You paid the full amount of ${selfAmt[1]}`;
  if (/^you paid the full amount$/i.test(line)) return SPLIT_PAID_FULL_SELF;
  const byAmt = line.match(/^paid ([\d.]+) in full by (.+)$/i);
  if (byAmt) return `Paid ${byAmt[1]} in full by ${byAmt[2].trim()}`;
  const by = line.match(/^paid in full by (.+)$/i);
  if (by) return `${SPLIT_PAID_FULL_BY_PREFIX}${by[1].trim()}`;
  return line;
}

export function splitExpenseNoteParts(note: string | undefined | null): {
  body: string;
  paidInFull: string | null;
} {
  const raw = String(note || '').trim();
  if (!raw) return { body: '', paidInFull: null };

  const lines = raw.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1] || '';
  if (lines.length >= 1 && isPaidInFullLine(last)) {
    return {
      body: lines.length > 1 ? lines.slice(0, -1).join(' · ') : '',
      paidInFull: canonicalPaidLine(last),
    };
  }

  const youPaidFull = raw.match(
    /^(.*?)\s*·\s*You paid full(?:\s*·\s*your share\s+[\d.]+)?\s*$/i,
  );
  if (youPaidFull) {
    return { body: youPaidFull[1].trim(), paidInFull: SPLIT_PAID_FULL_SELF };
  }

  const someonePaid = raw.match(/^(.*?)\s*·\s*(.+?)\s+paid\s*$/i);
  if (someonePaid) {
    const name = someonePaid[2].trim();
    if (/^you$/i.test(name)) {
      return { body: someonePaid[1].trim(), paidInFull: SPLIT_PAID_FULL_SELF };
    }
    return {
      body: someonePaid[1].trim(),
      paidInFull: `${SPLIT_PAID_FULL_BY_PREFIX}${name}`,
    };
  }

  return { body: raw, paidInFull: null };
}

export function displayPaidInFull(
  line: string | null | undefined,
  t: TranslateFn,
  formatAmount?: (n: number) => string,
): string | null {
  if (!line) return null;
  const text = line.trim();

  const selfAmt = text.match(/^you paid the full amount of ([\d.]+)$/i);
  if (selfAmt) {
    const n = Number(selfAmt[1]);
    const amount = formatAmount && Number.isFinite(n) ? formatAmount(n) : selfAmt[1];
    return t('home.splitPaidFullSelfAmt', { amount });
  }
  if (/^you paid the full amount$/i.test(text)) {
    return t('home.splitPaidFullSelf');
  }

  const byAmt = text.match(/^paid ([\d.]+) in full by (.+)$/i);
  if (byAmt) {
    const n = Number(byAmt[1]);
    const amount = formatAmount && Number.isFinite(n) ? formatAmount(n) : byAmt[1];
    return t('home.splitPaidFullByAmt', { amount, name: byAmt[2].trim() });
  }
  const by = text.match(/^paid in full by (.+)$/i);
  if (by) return t('home.splitPaidFullBy', { name: by[1].trim() });
  return line;
}

export function flattenTxnNote(note: string | undefined | null): string {
  return String(note || '')
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' · ');
}
