import type { ExpenseReminder, FeatureFlags, Transaction } from '../types';
import { isCardBillRemindersEnabled } from './appFeatures';
import { applyCardBillState, collectCardBillEvents } from './cardBills';
import { loadGmailCardMessages } from './gmailCardScan';
import { extractAmount, extractDate, type RawImportMessage } from './importRules/parseImportText';
import {
  hasSmsPermission,
  isSmsInboxSupported,
  listRecentSms,
  requestSmsPermission,
} from './smsInbox';

export function cardBillScanWindowMs(now = Date.now()): { minDateMs: number; maxDateMs: number } {
  return { minDateMs: now - 60 * 24 * 60 * 60 * 1000, maxDateMs: now + 24 * 60 * 60 * 1000 };
}

export type CardBillRefreshResult = {
  next: ExpenseReminder[] | null;
  updated: boolean;
  statementCount: number;
  paymentCount: number;
  emailCount: number;
  error: string | null;
};

export async function loadRecentCardBillMessages(): Promise<{
  messages: RawImportMessage[];
  error: string | null;
}> {
  if (!isSmsInboxSupported()) {
    return { messages: [], error: 'SMS_MODULE_MISSING' };
  }
  let allowed = await hasSmsPermission();
  if (!allowed) allowed = await requestSmsPermission();
  if (!allowed) return { messages: [], error: 'SMS_PERMISSION_DENIED' };
  const { minDateMs, maxDateMs } = cardBillScanWindowMs();
  const res = await listRecentSms(minDateMs, maxDateMs, 400);
  return { messages: res.messages || [], error: res.error };
}

export function mergeCardBillsFromMessages(
  reminders: ExpenseReminder[],
  messages: RawImportMessage[],
  transactions: Transaction[],
  offsets: number[],
): { next: ExpenseReminder[]; changed: boolean; statementCount: number; paymentCount: number } {
  const { notices, payments, spends } = collectCardBillEvents(
    messages,
    transactions,
    extractAmount,
    extractDate,
  );
  if (!notices.length && !payments.length && !spends.length) {
    return { next: reminders, changed: false, statementCount: 0, paymentCount: 0, emailCount: 0 };
  }
  const applied = applyCardBillState(reminders, notices, payments, offsets, spends);
  const emailCount = messages.filter((m) => m.sourceLabel === 'gmail' || (m.id || '').startsWith('gmail:'))
    .length;
  return {
    ...applied,
    statementCount: notices.length,
    paymentCount: payments.length,
    emailCount,
  };
}

/** Inbox read for statements and card-credit bill payments. Not used by Import. */
export async function refreshCardBillReminders(opts: {
  features: FeatureFlags;
  reminders: ExpenseReminder[];
  transactions: Transaction[];
  offsets: number[];
  loginEmail?: string | null;
}): Promise<CardBillRefreshResult> {
  if (!isCardBillRemindersEnabled(opts.features)) {
    return {
      next: null,
      updated: false,
      statementCount: 0,
      paymentCount: 0,
      emailCount: 0,
      error: 'FEATURE_OFF',
    };
  }
  const sms = await loadRecentCardBillMessages();
  const gmail = await loadGmailCardMessages(opts.loginEmail || null);
  const messages = [...sms.messages, ...gmail.messages];
  if (!messages.length) {
    const error = gmail.connected
      ? sms.error && sms.error !== 'SMS_MODULE_MISSING'
        ? sms.error
        : gmail.error
      : sms.error;
    return {
      next: null,
      updated: false,
      statementCount: 0,
      paymentCount: 0,
      emailCount: 0,
      error,
    };
  }
  const { next, changed, statementCount, paymentCount, emailCount } = mergeCardBillsFromMessages(
    opts.reminders,
    messages,
    opts.transactions,
    opts.offsets.length ? opts.offsets : [1, 0],
  );
  return {
    next: changed ? next : null,
    updated: changed,
    statementCount,
    paymentCount,
    emailCount,
    error: null,
  };
}
