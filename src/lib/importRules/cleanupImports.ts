import type { CashBooksState } from '../../types';
import { isNonTxnNoise } from './parseImportText';

/**
 * Rows an older build made out of a message that was never a transaction.
 *
 * A biller writing to say it got your money — "Payment of Rs.683.27 for your
 * JioHome connection … has been received" — used to be read as money arriving,
 * turning a bill you had already paid into income. Today those are skipped, but
 * the rows they made are still sitting there, and no later import will revisit
 * them. The message itself is kept in the import key, so it can be put to the
 * rules again: where they now say it never was a transaction, the row goes.
 *
 * Only imported rows are read, and only the message decides. A row you typed
 * yourself is never touched.
 *
 * It sits here rather than beside the other repairs in cashBooks because it has
 * to ask the parser, and the parser already asks cashBooks.
 */
export function dropNoiseImports(state: CashBooksState): {
  state: CashBooksState;
  changed: boolean;
  dropped: number;
} {
  let dropped = 0;

  const books = state.books.map((book) => {
    const fin = book.finance;
    const gone = new Set(
      fin.transactions
        .filter((t) => {
          // ruleId|date|amount|address|body, and a body may hold bars of its own.
          const body = (t.importKey || '').split('|').slice(4).join('|');
          return body.length > 0 && isNonTxnNoise(body);
        })
        .map((t) => t.id),
    );
    if (!gone.size) return book;
    dropped += gone.size;
    return {
      ...book,
      finance: { ...fin, transactions: fin.transactions.filter((t) => !gone.has(t.id)) },
    };
  });

  return { state: dropped ? { ...state, books } : state, changed: dropped > 0, dropped };
}
