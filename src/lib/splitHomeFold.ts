import type { FinanceState, Transaction } from '../types';
import { splitExpenseNoteParts } from './splitFinanceNote';

/** Skip folded settlement income on Home, Txn lists, and money totals. */
export function isHiddenOnHome(txn: Transaction | null | undefined): boolean {
  return !!txn?.homeHidden;
}

export function visibleOnHome(txns: Transaction[]): Transaction[] {
  return txns.filter((t) => !isHiddenOnHome(t));
}

export function nextSplitSettleToAsk(txns: Transaction[]): Transaction | null {
  const pending = txns.filter(
    (t) =>
      t.kind === 'income' &&
      !!t.splitSettlementId &&
      !t.splitSettleAsked &&
      !t.homeHidden,
  );
  if (!pending.length) return null;
  pending.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return pending[0];
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Share stored on a “you paid full” split expense note, or the booked amount once the row is share-only. */
export function paidFullShareOf(txn: Transaction): number | null {
  if (txn.kind !== 'expense' || !txn.splitExpenseId) return null;
  const m = String(txn.note || '').match(/your share\s+([\d.]+)/i);
  if (m) {
    const share = roundMoney(Number(m[1]));
    return Number.isFinite(share) && share >= 0 ? share : null;
  }
  if (splitExpenseNoteParts(txn.note).paidInFull) {
    return roundMoney(txn.amount);
  }
  return null;
}

/** Bills I paid that include the friend who just settled (FIFO uses this set). */
export function paidFullExpenseIdsForSettlement(
  income: Transaction,
  split: {
    selfId?: string | null;
    expenses: Array<{ id: string; paid_by: string; shares: Array<{ user_id: string }> }>;
    settlements: Array<{ id: string; from_user_id: string }>;
  },
): Set<string> | undefined {
  const selfId = split.selfId;
  if (!selfId || !income.splitSettlementId) return undefined;
  const settle = split.settlements.find((s) => s.id === income.splitSettlementId);
  if (!settle) return undefined;
  const ids = split.expenses
    .filter(
      (e) =>
        e.paid_by === selfId && e.shares.some((sh) => sh.user_id === settle.from_user_id),
    )
    .map((e) => e.id);
  return ids.length ? new Set(ids) : undefined;
}

/**
 * Apply a settlement income to “I paid the bill” expenses (oldest first), then
 * hide that income on Home. Split rows are not touched.
 */
export async function foldSplitSettleIntoHomeExpenses(
  income: Transaction,
  transactions: Transaction[],
  updateTransaction: (txn: Transaction) => Promise<unknown>,
  friendExpenseIds?: Set<string>,
): Promise<void> {
  let remaining = roundMoney(Math.abs(Number(income.amount) || 0));
  const bills = transactions
    .filter((t) => {
      if (isHiddenOnHome(t) || t.kind !== 'expense' || !t.splitExpenseId) return false;
      if (friendExpenseIds && !friendExpenseIds.has(t.splitExpenseId)) return false;
      const share = paidFullShareOf(t);
      if (share == null) return false;
      return roundMoney(t.amount) - share > 0.009;
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  for (const bill of bills) {
    if (remaining <= 0.009) break;
    const share = paidFullShareOf(bill);
    if (share == null) continue;
    const extra = roundMoney(Math.max(0, roundMoney(bill.amount) - share));
    if (extra <= 0.009) continue;
    const take = roundMoney(Math.min(remaining, extra));
    const nextAmount = roundMoney(bill.amount - take);
    const note = String(bill.note || '');
    await updateTransaction({
      ...bill,
      amount: nextAmount,
      note: /settled/i.test(note) ? note : `${note} · settled`.trim(),
    });
    remaining = roundMoney(remaining - take);
  }

  const appliedAll = remaining <= 0.009;
  await updateTransaction({
    ...income,
    splitSettleAsked: true,
    homeHidden: appliedAll,
    amount: appliedAll ? income.amount : roundMoney(Math.max(0, remaining)),
  });
}

/**
 * Always show split settlement as income. Undoes a folded “real share” hide.
 * Returns the same object when nothing is hidden.
 */
export function revealSplitSettlementIncome(finance: FinanceState): FinanceState {
  const txns = finance.transactions || [];
  if (!txns.some((t) => t.kind === 'income' && !!t.splitSettlementId && t.homeHidden)) {
    return finance;
  }

  const next = txns.map((t) => ({ ...t }));
  const byId = new Map(next.map((t) => [t.id, t]));
  const hidden = next
    .filter((t) => t.kind === 'income' && !!t.splitSettlementId && t.homeHidden)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  for (const income of hidden) {
    let remaining = roundMoney(Math.abs(Number(income.amount) || 0));
    const bills = next
      .filter((t) => {
        if (t.kind !== 'expense' || !t.splitExpenseId) return false;
        if (paidFullShareOf(t) == null) return false;
        return /\bsettled\b/i.test(String(t.note || ''));
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

    for (const bill of bills) {
      if (remaining <= 0.009) break;
      const live = byId.get(bill.id) || bill;
      const share = paidFullShareOf(live);
      if (share == null) continue;
      if (roundMoney(live.amount) - share > 0.009) continue;
      const nextAmount = roundMoney(live.amount + remaining);
      const note = String(live.note || '')
        .replace(/\s*·\s*settled\s*/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const updated = { ...live, amount: nextAmount, note };
      byId.set(updated.id, updated);
      remaining = 0;
    }

    const liveInc = byId.get(income.id) || income;
    byId.set(income.id, { ...liveInc, homeHidden: false, splitSettleAsked: true });
  }

  return { ...finance, transactions: next.map((t) => byId.get(t.id) || t) };
}

/**
 * Put a folded settlement back on Income and undo the bill reduction.
 * Used to undo an accidental “show my share” choice.
 */
export async function restoreHiddenSplitSettlements(
  transactions: Transaction[],
  updateTransaction: (txn: Transaction) => Promise<unknown>,
): Promise<number> {
  const hidden = transactions
    .filter((t) => t.kind === 'income' && !!t.splitSettlementId && isHiddenOnHome(t))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  if (!hidden.length) return 0;

  let txns = transactions.map((t) => ({ ...t }));
  const liveOf = (id: string) => txns.find((t) => t.id === id);

  for (const income of hidden) {
    let remaining = roundMoney(Math.abs(Number(income.amount) || 0));
    const bills = txns
      .filter((t) => {
        if (t.kind !== 'expense' || !t.splitExpenseId) return false;
        if (paidFullShareOf(t) == null) return false;
        return /\bsettled\b/i.test(String(t.note || ''));
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

    for (const bill of bills) {
      if (remaining <= 0.009) break;
      const live = liveOf(bill.id) || bill;
      const share = paidFullShareOf(live);
      if (share == null) continue;
      // Still sitting at “my share” — this is the bill the fold reduced.
      if (roundMoney(live.amount) - share > 0.009) continue;
      const nextAmount = roundMoney(live.amount + remaining);
      const note = String(live.note || '')
        .replace(/\s*·\s*settled\s*/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const next = { ...live, amount: nextAmount, note };
      await updateTransaction(next);
      txns = txns.map((t) => (t.id === next.id ? next : t));
      remaining = 0;
    }

    const liveInc = liveOf(income.id) || income;
    const nextInc = { ...liveInc, homeHidden: false, splitSettleAsked: true };
    await updateTransaction(nextInc);
    txns = txns.map((t) => (t.id === nextInc.id ? nextInc : t));
  }

  return hidden.length;
}
