import type { Transaction } from '../types';

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
  const key = txn.importKey || '';
  const body = key.split('|').slice(4).join('|').trim();
  return body || null;
}
