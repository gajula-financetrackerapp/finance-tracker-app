import type { TranslationKey } from '../i18n/translations';

/** Stored English — parse this; translate only when showing the row. */
export const SPLIT_PAID_FULL_SELF = 'You paid the full amount';
export const SPLIT_PAID_FULL_BY_PREFIX = 'Paid in full by ';

type TranslateFn = (key: TranslationKey, params?: Record<string, string | number>) => string;

export function splitPaidInFullLine(iPaid: boolean, payerDisplayName: string): string {
  if (iPaid) return SPLIT_PAID_FULL_SELF;
  const name = String(payerDisplayName || '').trim() || 'them';
  return `${SPLIT_PAID_FULL_BY_PREFIX}${name}`;
}

/** Description on the first line; who paid the bill on the last line. */
export function buildSplitExpenseNote(
  description: string,
  iPaid: boolean,
  payerDisplayName: string,
): string {
  const desc = String(description || '').trim();
  const paid = splitPaidInFullLine(iPaid, payerDisplayName);
  return desc ? `${desc}\n${paid}` : paid;
}

function isPaidInFullLine(line: string): boolean {
  return (
    /^you paid the full amount$/i.test(line) ||
    /^paid in full by\s+.+/i.test(line)
  );
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
      paidInFull: /^you paid the full amount$/i.test(last)
        ? SPLIT_PAID_FULL_SELF
        : last.replace(/^paid in full by\s+/i, SPLIT_PAID_FULL_BY_PREFIX),
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
): string | null {
  if (!line) return null;
  if (/^you paid the full amount$/i.test(line.trim())) {
    return t('home.splitPaidFullSelf');
  }
  const m = line.trim().match(/^paid in full by\s+(.+)$/i);
  if (m) return t('home.splitPaidFullBy', { name: m[1].trim() });
  return line;
}

export function flattenTxnNote(note: string | undefined | null): string {
  return String(note || '')
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' · ');
}
