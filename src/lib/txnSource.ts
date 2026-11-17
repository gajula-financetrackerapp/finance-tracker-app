import type { Transaction } from '../types';
import { legacyImportBody } from './importFingerprint';

/**
 * The bank SMS (or pasted alert) a transaction was made from.
 *
 * Newer imports store the full body on `sourceText`. Older rows only have a
 * truncated copy inside `importKey`, which is still enough to show something.
 */
export function txnSourceMessage(
  txn: Pick<Transaction, 'sourceText' | 'importKey'>,
): string | null {
  const stored = (txn.sourceText || '').trim();
  if (stored) return stored;
  const body = legacyImportBody(txn);
  return body || null;
}
