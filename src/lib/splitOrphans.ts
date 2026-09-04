/**
 * Which Home transactions belonged to a split that no longer exists.
 *
 * Only the person who added a split can delete it, but everyone in it is
 * holding a transaction for their own share. This is how the other phones find
 * out: the shared list they fetch no longer mentions the split, so a share
 * transaction pointing at it has nothing left to belong to. Being dropped from
 * a split by an edit looks the same from here, and should — the split lives on
 * but this person's part in it does not.
 *
 * It is a deletion, so the answer has to be certain. `liveExpenseIds` of null
 * means the list could not be read — a failed fetch, a signed-out session —
 * and every split transaction on the phone would otherwise look abandoned.
 * Not knowing is not the same as knowing they are gone.
 */

export type ShareTxnLike = {
  id: string;
  kind?: string;
  splitExpenseId?: string;
  splitSettlementId?: string;
};

export type OrphanShareTxns = {
  /** Transactions to delete. */
  txnIds: string[];
  /** The splits they belonged to, for forgetting the "already posted" marks. */
  expenseIds: string[];
};

export function findOrphanShareTxns(
  txns: readonly ShareTxnLike[],
  liveExpenseIds: readonly string[] | null | undefined,
): OrphanShareTxns {
  if (!liveExpenseIds) return { txnIds: [], expenseIds: [] };
  const live = new Set(liveExpenseIds);
  const txnIds: string[] = [];
  const expenseIds = new Set<string>();
  for (const t of txns) {
    const expenseId = t.splitExpenseId;
    if (!expenseId) continue;
    // A settlement transaction is money that changed hands. It is not a share,
    // and deleting the split it came from does not take the payment back.
    if (t.splitSettlementId) continue;
    if (live.has(expenseId)) continue;
    txnIds.push(t.id);
    expenseIds.add(expenseId);
  }
  return { txnIds, expenseIds: [...expenseIds] };
}
