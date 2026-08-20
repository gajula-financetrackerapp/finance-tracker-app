import type { Account, ImportRulesConfig, Transaction } from '../types';
import {
  activeImportRules,
  DEFAULT_IMPORT_RULES,
  parseImportMessages,
  resolveImportAccountId,
  smsImportMonthBounds,
  type ParsedImportCandidate,
} from './importRules';
import { hasSmsPermission, isSmsInboxSupported, listRecentSms } from './smsInbox';
import { loadSeenImportFingerprints, rememberImportFingerprints } from './importSeen';
import { makeDuplicateCheck } from './importDedupe';

/**
 * The scan-and-write pipeline, with no screen attached.
 *
 * Both callers share this so an import nobody watched cannot behave differently
 * from one somebody reviewed: the Import screen for its list and its button, and
 * the app-open runner for the automatic pass.
 */

export type ImportCandidateRow = ParsedImportCandidate & { alreadyImported: boolean };

/** Fresh rows are what an automatic pass may write: unsaved, and never seen before. */
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

/**
 * Read the inbox for the configured month and classify what it finds.
 * `requirePermission: 'existing'` never raises the Android dialog, which is what
 * the app-open pass wants — asking for SMS access out of the blue on launch is
 * both startling and a poor way to get a yes.
 */
export async function findImportableSms(opts: {
  importRules: ImportRulesConfig | undefined;
  knownCategories: Set<string>;
  transactions: Transaction[];
  permission?: 'existing' | 'ask';
}): Promise<FoundSms> {
  if (!isSmsInboxSupported()) {
    return { rows: [], fresh: [], duplicates: 0, error: 'SMS_MODULE_MISSING' };
  }
  if ((opts.permission ?? 'ask') === 'existing' && !(await hasSmsPermission())) {
    return { rows: [], fresh: [], duplicates: 0, error: 'SMS_PERMISSION_DENIED' };
  }
  const range = opts.importRules?.smsMonthRange ?? DEFAULT_IMPORT_RULES.smsMonthRange;
  const { minDateMs, maxDateMs } = smsImportMonthBounds(range);
  const res = await listRecentSms(minDateMs, maxDateMs, 400);
  if (res.error) {
    return { rows: [], fresh: [], duplicates: 0, error: res.error };
  }
  return classifyImportMessages(res.messages, {
    rules: importRulesFrom(opts.importRules),
    knownCategories: opts.knownCategories,
    transactions: opts.transactions,
  });
}

export type WriteResult = {
  added: number;
  /** Fingerprints of rows that were saved, plus the related ones they settle. */
  addedFingerprints: string[];
  /** Rows that turned out to be saved already by the time we got to them. */
  skippedFingerprints: string[];
};

/**
 * Turn rows into transactions. The duplicate check is re-run here against what
 * is saved at this moment, so a second call while the first is still writing
 * cannot add the same SMS twice.
 */
export async function writeImportRows(
  rows: ImportCandidateRow[],
  opts: {
    accounts: Account[];
    fallbackAccountId?: string;
    transactions: Transaction[];
    addTransaction: (txn: Omit<Transaction, 'id'> & { id?: string }) => Promise<unknown>;
    billImageUri?: string;
  },
): Promise<WriteResult> {
  const check = makeDuplicateCheck(opts.transactions);
  let added = 0;
  const addedFingerprints: string[] = [];
  const skippedFingerprints: string[] = [];

  for (const c of rows) {
    if (check.isAlreadyImported(c)) {
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
      await opts.addTransaction({
        kind: asTransfer ? 'transfer' : c.kind === 'transfer' ? 'expense' : c.kind,
        category: c.category,
        amount: c.amount,
        date: c.date,
        note: c.note,
        ...(asTransfer ? { fromAccountId: accountId, toAccountId } : { accountId }),
        importKey: c.fingerprint,
        billImageUri: opts.billImageUri,
      } as Omit<Transaction, 'id'>);
      added += 1;
      addedFingerprints.push(c.fingerprint);
      for (const rel of c.relatedFingerprints || []) addedFingerprints.push(rel);
    } catch {
      // Leave the row behind rather than lose the rest of the batch.
    }
  }

  await rememberImportFingerprints(addedFingerprints);
  return { added, addedFingerprints, skippedFingerprints };
}
