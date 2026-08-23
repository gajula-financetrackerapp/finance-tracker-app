import type { ExpenseReminder, FeatureFlags, Transaction } from '../types';
import { isCardBillRemindersEnabled } from './appFeatures';
import { applyCardBillState, collectCardBillEvents } from './cardBills';
import { extractAmount, extractDate, type RawImportMessage } from './importRules/parseImportText';
import { hasSmsPermission, isSmsInboxSupported, listRecentSms } from './smsInbox';

const SCAN_GAP_MS = 15 * 60 * 1000;
let lastScanAt = 0;

export function cardBillScanWindowMs(now = Date.now()): { minDateMs: number; maxDateMs: number } {
  return { minDateMs: now - 60 * 24 * 60 * 60 * 1000, maxDateMs: now + 24 * 60 * 60 * 1000 };
}

export async function loadRecentCardBillMessages(): Promise<RawImportMessage[]> {
  if (!isSmsInboxSupported()) return [];
  const allowed = await hasSmsPermission();
  if (!allowed) return [];
  const { minDateMs, maxDateMs } = cardBillScanWindowMs();
  const res = await listRecentSms(minDateMs, maxDateMs, 400);
  return res.messages || [];
}

export function mergeCardBillsFromMessages(
  reminders: ExpenseReminder[],
  messages: RawImportMessage[],
  transactions: Transaction[],
  offsets: number[],
): { next: ExpenseReminder[]; changed: boolean } {
  const { notices, payments } = collectCardBillEvents(
    messages,
    transactions,
    extractAmount,
    extractDate,
  );
  if (!notices.length && !payments.length) {
    return { next: reminders, changed: false };
  }
  return applyCardBillState(reminders, notices, payments, offsets);
}

export async function refreshCardBillReminders(opts: {
  features: FeatureFlags;
  reminders: ExpenseReminder[];
  transactions: Transaction[];
  offsets: number[];
  messages?: RawImportMessage[];
  ignoreThrottle?: boolean;
}): Promise<ExpenseReminder[] | null> {
  if (!isCardBillRemindersEnabled(opts.features)) return null;
  const now = Date.now();
  if (!opts.ignoreThrottle && now - lastScanAt < SCAN_GAP_MS && !opts.messages) {
    return null;
  }
  const messages = opts.messages ?? (await loadRecentCardBillMessages());
  lastScanAt = now;
  const { next, changed } = mergeCardBillsFromMessages(
    opts.reminders,
    messages,
    opts.transactions,
    opts.offsets.length ? opts.offsets : [1, 0],
  );
  return changed ? next : null;
}
