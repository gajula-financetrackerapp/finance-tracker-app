import type { ParsedImportCandidate } from './importRules';
import type { Transaction } from '../types';

/**
 * Works out which parsed SMS have already been turned into transactions.
 *
 * A scan covers a whole calendar month, so most of what it finds on the second
 * run is what the first run already added. Deciding that from the transactions
 * themselves, rather than from a list of fingerprints kept to one side, means it
 * still holds after a reinstall, a restore from backup, or on a second phone,
 * and it stops being true if the transaction is deleted — which is what someone
 * who deleted it and scanned again would expect.
 */

/** Everything about a transaction that an SMS could have decided. */
function signature(kind: string, date: string, amount: number, note: string): string {
  return `${kind}|${date}|${Math.abs(amount)}|${(note || '').trim()}`;
}

export type DuplicateCheck = {
  /**
   * Whether this row is already saved. Call once per row, in the order shown:
   * each existing transaction can only account for one row, so two genuine
   * payments of the same amount to the same shop on the same day stay
   * importable once the first has been matched.
   */
  isAlreadyImported: (candidate: ParsedImportCandidate) => boolean;
};

export function makeDuplicateCheck(transactions: Transaction[]): DuplicateCheck {
  const keys = new Set<string>();
  // Transactions imported before the fingerprint was recorded, counted rather
  // than collected: two identical rows need two matches to both be duplicates.
  const unkeyed = new Map<string, number>();

  for (const txn of transactions) {
    if (txn.importKey) {
      keys.add(txn.importKey);
      continue;
    }
    const sig = signature(txn.kind, txn.date, txn.amount, txn.note);
    unkeyed.set(sig, (unkeyed.get(sig) || 0) + 1);
  }

  const isAlreadyImported = (candidate: ParsedImportCandidate): boolean => {
    const fingerprints = [candidate.fingerprint, ...(candidate.relatedFingerprints || [])];
    if (fingerprints.some((fp) => keys.has(fp))) return true;

    const sig = signature(candidate.kind, candidate.date, candidate.amount, candidate.note);
    const left = unkeyed.get(sig) || 0;
    if (left > 0) {
      unkeyed.set(sig, left - 1);
      return true;
    }
    return false;
  };

  return { isAlreadyImported };
}
