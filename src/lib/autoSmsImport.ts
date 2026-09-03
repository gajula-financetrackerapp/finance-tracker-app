import type { Account, ImportRulesConfig, Transaction } from '../types';
import { uid } from '../utils';
import {
  activeImportRules,
  DEFAULT_IMPORT_RULES,
  parseImportMessages,
  resolveImportAccountId,
  type ParsedImportCandidate,
} from './importRules';
import { loadSeenImportFingerprints, rememberImportFingerprints } from './importSeen';
import { makeDuplicateCheck } from './importDedupe';

/**
 * Parsing and writing, with no screen attached.
 *
 * Nothing here writes on its own. Rows reach the ledger only when the user has
 * seen them listed and pressed Import, which is the point: a transaction the
 * app invented while nobody was looking is one the user has to go and check.
 */

export type ImportCandidateRow = ParsedImportCandidate & { alreadyImported: boolean };

/** Fresh rows are the ones worth ticking by default: unsaved, and never seen before. */
export type FoundSms = {
  rows: ImportCandidateRow[];
  fresh: ImportCandidateRow[];
  duplicates: number;
  error: string | null;
};

export function importRulesFrom(config: ImportRulesConfig | undefined) {
  return activeImportRules(
    config || { enabled: true, smsMonthRange: DEFAULT_IMPORT_RULES.smsMonthRange, rules: [] },
  );
}

/** Parse already-read messages against the rules, and mark what is old news. */
export async function classifyImportMessages(
  messages: Parameters<typeof parseImportMessages>[0],
  opts: {
    rules: ReturnType<typeof activeImportRules>;
    knownCategories: Set<string>;
    transactions: Transaction[];
  },
): Promise<FoundSms> {
  if (!opts.rules.length) {
    return { rows: [], fresh: [], duplicates: 0, error: null };
  }
  // Two signals, deliberately different in strength. A transaction that is still
  // there proves the row was added, so that row is locked. The old fingerprint
  // list only says a scan once added it, and the transaction may since have been
  // edited or deleted, so it merely starts out unticked.
  const check = makeDuplicateCheck(opts.transactions);
  const seen = await loadSeenImportFingerprints();
  const wasSeen = (c: ParsedImportCandidate) =>
    seen.has(c.fingerprint) || (c.relatedFingerprints || []).some((fp) => seen.has(fp));

  const rows: ImportCandidateRow[] = parseImportMessages(
    messages,
    opts.rules,
    opts.knownCategories,
  ).map((c) => {
    const alreadyImported = check.isAlreadyImported(c);
    return { ...c, alreadyImported, selected: !alreadyImported && !wasSeen(c) };
  });

  return {
    rows,
    fresh: rows.filter((c) => !c.alreadyImported && !wasSeen(c)),
    duplicates: rows.filter((c) => c.alreadyImported).length,
    error: null,
  };
}

export type WriteResult = {
  added: number;
  /** Ledger ids written in this run, in order, for Undo. */
  addedIds: string[];
  /** Fingerprints of rows that were saved, plus the related ones they settle. */
  addedFingerprints: string[];
  /** Rows that turned out to be saved already by the time we got to them. */
  skippedFingerprints: string[];
};

/** Drop race marks so an undone batch can be imported again. */
export function forgetImportWriteMarks(fps: string[]) {
  for (const fp of fps) writtenByRun.delete(fp);
}

/** One write at a time, whoever asks, so runs also finish in the order they queued. */
let writeQueue: Promise<unknown> = Promise.resolve();
let runsStarted = 0;
let runsFinished = 0;

/** Fingerprint -> the run that wrote it, to spot writes a caller could not see. */
const writtenByRun = new Map<string, number>();

const RACE_MEMORY = 2000;

/**
 * Turn rows into transactions.
 *
 * Two presses can overlap — a slow batch still writing when the button is hit
 * again, or a second screen doing the same. Each arrives with its own snapshot
 * of what is saved, so neither duplicate check can see the other's work, and the
 * same SMS lands twice. Writes are therefore serialised, and a row is dropped
 * when the run that wrote its fingerprint had not finished by the time this
 * caller's list was drawn up: that is exactly the window its own check was blind
 * to. A scan started after that run finished is trusted, so deleting a
 * transaction and scanning again still re-imports it.
 */
export function writeImportRows(
  rows: ImportCandidateRow[],
  opts: {
    accounts: Account[];
    fallbackAccountId?: string;
    transactions: Transaction[];
    addTransaction: (txn: Omit<Transaction, 'id'> & { id?: string }) => Promise<unknown>;
    billImageUri?: string;
    /** Called as each selected row is processed, so the Import button can count. */
    onProgress?: (current: number, total: number) => void;
  },
): Promise<WriteResult> {
  const settledWhenDecided = runsFinished;
  const next = writeQueue.then(
    () => writeRowsInTurn(rows, opts, settledWhenDecided),
    () => writeRowsInTurn(rows, opts, settledWhenDecided),
  );
  writeQueue = next.catch(() => undefined);
  return next;
}

async function writeRowsInTurn(
  rows: ImportCandidateRow[],
  opts: {
    accounts: Account[];
    fallbackAccountId?: string;
    transactions: Transaction[];
    addTransaction: (txn: Omit<Transaction, 'id'> & { id?: string }) => Promise<unknown>;
    billImageUri?: string;
    onProgress?: (current: number, total: number) => void;
  },
  settledWhenDecided: number,
): Promise<WriteResult> {
  const run = ++runsStarted;
  const fingerprintsOf = (c: ImportCandidateRow) => [
    c.fingerprint,
    ...(c.relatedFingerprints || []),
  ];
  /** Written by a run this caller could not have seen the results of. */
  const writtenBehindOurBack = (c: ImportCandidateRow) =>
    fingerprintsOf(c).some((fp) => (writtenByRun.get(fp) ?? 0) > settledWhenDecided);

  const check = makeDuplicateCheck(opts.transactions);
  let added = 0;
  const addedIds: string[] = [];
  const addedFingerprints: string[] = [];
  const skippedFingerprints: string[] = [];
  const total = rows.length;
  let processed = 0;

  for (const c of rows) {
    processed += 1;
    opts.onProgress?.(processed, total);
    if (opts.onProgress) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (writtenBehindOurBack(c) || check.isAlreadyImported(c)) {
      skippedFingerprints.push(c.fingerprint);
      continue;
    }
    try {
      const accountId =
        resolveImportAccountId(opts.accounts, c.paymentType) || opts.fallbackAccountId;
      const toAccountId = c.toPaymentType
        ? resolveImportAccountId(opts.accounts, c.toPaymentType)
        : undefined;
      // A card bill has to move money, not just leave the bank: as a transfer it
      // clears the card in the same stroke. Without a separate card account
      // there is nothing to move it to, so it falls back to a plain expense.
      const asTransfer = c.kind === 'transfer' && !!toAccountId && toAccountId !== accountId;
      const id = uid();
      await opts.addTransaction({
        id,
        kind: asTransfer ? 'transfer' : c.kind === 'transfer' ? 'expense' : c.kind,
        category: c.category,
        amount: c.amount,
        date: c.date,
        note: c.note,
        ...(asTransfer ? { fromAccountId: accountId, toAccountId } : { accountId }),
        importKey: c.fingerprint,
        sourceText: (c.rawText || '').trim() || undefined,
        billImageUri: opts.billImageUri,
      } as Omit<Transaction, 'id'> & { id?: string });
      added += 1;
      addedIds.push(id);
      added += 1;
      for (const fp of fingerprintsOf(c)) {
        addedFingerprints.push(fp);
        writtenByRun.set(fp, run);
      }
    } catch {
      // Leave the row behind rather than lose the rest of the batch.
    }
  }

  // Only recent writes can still be racing anyone, and the saved fingerprints
  // outlive this list anyway, so the oldest are dropped rather than kept for good.
  for (const fp of writtenByRun.keys()) {
    if (writtenByRun.size <= RACE_MEMORY) break;
    writtenByRun.delete(fp);
  }

  await rememberImportFingerprints(addedFingerprints);
  runsFinished = run;
  return { added, addedIds, addedFingerprints, skippedFingerprints };
}
