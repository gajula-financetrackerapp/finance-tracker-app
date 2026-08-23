import type { ExpenseReminder, Transaction } from '../types';
import { CARD_BILL_CATEGORY } from '../cashBooks';
import {
  isCardBillPayment,
  type RawImportMessage,
} from './importRules/parseImportText';
import {
  cardKeyOf,
  extractCardIssuer,
  extractCardLast4,
  parseDueNotice,
  type CardDueNotice,
} from './importRules/parseDueNotice';

export type CardBillPaymentEvent = {
  last4: string | null;
  issuer: string | null;
  amount: number;
  date: string;
  fingerprint: string;
};

function money(n: number) {
  return Math.round(n * 100) / 100;
}

function reminderName(notice: Pick<CardDueNotice, 'issuer' | 'last4'>) {
  return notice.last4 ? `${notice.issuer} Card ${notice.last4}` : `${notice.issuer} Card`;
}

function reminderDetail(totalDue: number | null, minDue: number | null) {
  const bits: string[] = ['Card bill'];
  if (totalDue != null) bits.push(`of ₹${Math.round(totalDue)}`);
  if (minDue != null) bits.push(`min ₹${Math.round(minDue)}`);
  return bits.join(' · ');
}

function paymentMatches(
  pay: CardBillPaymentEvent,
  card: { last4?: string | null; issuer?: string | null; cardKey?: string },
): boolean {
  if (pay.last4 && card.last4) return pay.last4 === card.last4;
  if (pay.last4 && card.cardKey) return card.cardKey.endsWith(`|${pay.last4}`);
  if (!pay.issuer || !card.issuer) return false;
  return pay.issuer.toLowerCase() === card.issuer.toLowerCase();
}

function todayish(date?: number | string): string {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)) return date.slice(0, 10);
  if (typeof date === 'number' && Number.isFinite(date) && date > 0) {
    const d = new Date(date);
    if (!Number.isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  }
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

export function parseCardBillPayment(
  body: string,
  opts?: { address?: string; date?: number | string; amount?: number },
): CardBillPaymentEvent | null {
  if (!isCardBillPayment(body)) return null;
  const amount = opts?.amount;
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return null;
  const date = todayish(opts?.date);
  const last4 = extractCardLast4(body);
  const issuerLabel = extractCardIssuer(body, opts?.address);
  const issuer = issuerLabel === 'Card' ? null : issuerLabel;
  const fingerprint = `pay|${last4 || issuer || 'card'}|${date}|${amount}|${(body || '')
    .slice(0, 40)
    .toLowerCase()}`;
  return { last4, issuer, amount, date, fingerprint };
}

export function collectCardBillEvents(
  messages: RawImportMessage[],
  transactions: Transaction[],
  extractAmount: (body: string) => number | null,
  extractDate: (body: string, fallback?: number | string) => string,
): { notices: CardDueNotice[]; payments: CardBillPaymentEvent[] } {
  const notices: CardDueNotice[] = [];
  const payments: CardBillPaymentEvent[] = [];
  const seenPay = new Set<string>();

  for (const msg of messages) {
    const notice = parseDueNotice(msg.body || '', { address: msg.address, date: msg.date });
    if (notice) notices.push(notice);
    const amount = extractAmount(msg.body || '');
    const pay = parseCardBillPayment(msg.body || '', {
      address: msg.address,
      date: extractDate(msg.body || '', msg.date),
      amount: amount ?? undefined,
    });
    if (pay && !seenPay.has(pay.fingerprint)) {
      seenPay.add(pay.fingerprint);
      payments.push(pay);
    }
  }

  for (const txn of transactions) {
    const text = txn.note || '';
    const looksBill =
      txn.category === CARD_BILL_CATEGORY ||
      /card bill/i.test(text) ||
      isCardBillPayment(text);
    if (!looksBill || txn.amount <= 0) continue;
    const last4 = extractCardLast4(text);
    const issuerLabel = extractCardIssuer(text);
    const pay: CardBillPaymentEvent = {
      last4,
      issuer: issuerLabel === 'Card' ? null : issuerLabel,
      amount: txn.amount,
      date: (txn.date || '').slice(0, 10),
      fingerprint: txn.importKey || txn.id || `txn|${txn.date}|${txn.amount}`,
    };
    if (seenPay.has(pay.fingerprint)) continue;
    seenPay.add(pay.fingerprint);
    payments.push(pay);
  }

  return { notices, payments };
}

function latestNoticePerCard(notices: CardDueNotice[]): CardDueNotice[] {
  const byKey = new Map<string, CardDueNotice>();
  for (const n of notices) {
    const prev = byKey.get(n.cardKey);
    if (!prev) {
      byKey.set(n.cardKey, n);
      continue;
    }
    const newer =
      n.statementDate > prev.statementDate ||
      (n.statementDate === prev.statementDate && (n.dueDate || '') > (prev.dueDate || ''));
    if (newer) byKey.set(n.cardKey, n);
  }
  return [...byKey.values()];
}

function applyPaymentsToRemaining(
  start: number,
  card: { last4?: string | null; issuer?: string | null; cardKey?: string },
  payments: CardBillPaymentEvent[],
  fromDate: string,
  already: Set<string>,
): { remaining: number; applied: string[] } {
  const applied: string[] = [];
  let remaining = start;
  const ordered = [...payments].sort((a, b) => a.date.localeCompare(b.date));
  for (const pay of ordered) {
    if (already.has(pay.fingerprint) || applied.includes(pay.fingerprint)) continue;
    if (pay.date < fromDate) continue;
    if (!paymentMatches(pay, card)) continue;
    remaining = money(Math.max(0, remaining - pay.amount));
    applied.push(pay.fingerprint);
  }
  return { remaining, applied };
}

function upsertFromNotice(
  existing: ExpenseReminder | undefined,
  notice: CardDueNotice,
  payments: CardBillPaymentEvent[],
  offsets: number[],
): ExpenseReminder {
  const totalDue = notice.totalDue ?? existing?.totalDue ?? 0;
  const dueDate = notice.dueDate || existing?.dueDate || notice.statementDate;
  const dayOfMonth = parseInt(dueDate.split('-')[2], 10) || 1;
  const { remaining, applied } = applyPaymentsToRemaining(
    totalDue,
    { last4: notice.last4, issuer: notice.issuer, cardKey: notice.cardKey },
    payments,
    notice.statementDate,
    new Set(),
  );
  const paid = remaining <= 0.009;
  return {
    id: existing?.id || `card-bill:${notice.cardKey}`,
    name: reminderName(notice),
    amount: remaining,
    dueDate,
    paid,
    offsets: existing?.offsets?.length ? existing.offsets : offsets,
    mode: existing?.mode || 'default',
    customTime: existing?.customTime,
    alarmDurationSec: existing?.alarmDurationSec,
    repeat: 'once',
    recurring: false,
    dayOfMonth,
    detail: reminderDetail(totalDue, notice.minDue ?? existing?.minDue ?? null),
    source: 'card-bill',
    cardKey: notice.cardKey,
    cardLast4: notice.last4 || existing?.cardLast4,
    cardIssuer: notice.issuer,
    totalDue,
    minDue: notice.minDue ?? existing?.minDue,
    statementDate: notice.statementDate,
    appliedPaymentKeys: applied,
    linkedTxnId: existing?.linkedTxnId ?? null,
  };
}

function applyLonePayments(
  reminders: ExpenseReminder[],
  payments: CardBillPaymentEvent[],
): ExpenseReminder[] {
  return reminders.map((r) => {
    if (r.source !== 'card-bill') return r;
    const already = new Set(r.appliedPaymentKeys || []);
    const { remaining, applied } = applyPaymentsToRemaining(
      r.amount,
      { last4: r.cardLast4, issuer: r.cardIssuer, cardKey: r.cardKey },
      payments,
      r.statementDate || '0000-01-01',
      already,
    );
    if (!applied.length) return r;
    return {
      ...r,
      amount: remaining,
      paid: remaining <= 0.009,
      appliedPaymentKeys: [...already, ...applied],
    };
  });
}

/**
 * Fold statement SMS and card-credit payments into expense reminders.
 * One reminder per card. A new statement replaces the bill; later credits
 * reduce what is left. Manual reminders are left untouched.
 */
export function applyCardBillState(
  reminders: ExpenseReminder[],
  notices: CardDueNotice[],
  payments: CardBillPaymentEvent[],
  offsets: number[],
): { next: ExpenseReminder[]; changed: boolean } {
  const latest = latestNoticePerCard(notices);
  const used = new Set<string>();
  const next: ExpenseReminder[] = reminders.map((r) => {
    if (r.source !== 'card-bill' || !r.cardKey) return r;
    const notice = latest.find((n) => n.cardKey === r.cardKey);
    if (!notice) return r;
    used.add(notice.cardKey);
    return upsertFromNotice(r, notice, payments, offsets);
  });

  for (const notice of latest) {
    if (used.has(notice.cardKey)) continue;
    next.unshift(upsertFromNotice(undefined, notice, payments, offsets));
    used.add(notice.cardKey);
  }

  const withPays = applyLonePayments(next, payments);
  const changed = JSON.stringify(withPays) !== JSON.stringify(reminders);
  return { next: withPays, changed };
}

export function cardKeyFromText(body: string, address?: string): string {
  return cardKeyOf(extractCardIssuer(body, address), extractCardLast4(body));
}
