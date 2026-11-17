import { sha256 } from 'js-sha256';
import type { CashBooksState, Transaction } from '../types';

export const IMPORT_FINGERPRINT_PREFIX = 'fp2:';

export function importFingerprintFromLegacyKey(value: string): string {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.startsWith(IMPORT_FINGERPRINT_PREFIX)) return normalized;
  return `${IMPORT_FINGERPRINT_PREFIX}${sha256(normalized)}`;
}

export function importFingerprint(
  ruleId: string,
  date: string,
  amount: number,
  address: string,
  body: string,
): string {
  const compactBody = String(body || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const sender = String(address || '').trim();
  return importFingerprintFromLegacyKey(`${ruleId}|${date}|${amount}|${sender}|${compactBody}`);
}

/** Only for one-time local repairs of rows written by older app versions. */
export function legacyImportBody(
  txn: Pick<Transaction, 'sourceText' | 'importKey'>,
): string {
  const source = String(txn.sourceText || '').trim();
  if (source) return source;
  const key = String(txn.importKey || '');
  if (!key || key.startsWith(IMPORT_FINGERPRINT_PREFIX)) return '';
  return key.split('|').slice(4).join('|').trim();
}

export function migrateCashBookImportFingerprints(state: CashBooksState): {
  state: CashBooksState;
  changed: boolean;
} {
  let changed = false;
  const books = state.books.map((book) => ({
    ...book,
    finance: {
      ...book.finance,
      transactions: book.finance.transactions.map((txn) => {
        if (!txn.importKey || txn.importKey.startsWith(IMPORT_FINGERPRINT_PREFIX)) return txn;
        changed = true;
        return { ...txn, importKey: importFingerprintFromLegacyKey(txn.importKey) };
      }),
    },
  }));
  return { state: changed ? { ...state, books } : state, changed };
}
