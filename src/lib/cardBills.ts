import type { ExpenseReminder, Transaction } from '../types';
import { CARD_BILL_CATEGORY } from '../cashBooks';
import {
  isCardBillPayment,
  type RawImportMessage,
} from './importRules/parseImportText';
import {
  addMonthsIso,
  cardKeyOf,
  extractCardIssuer,
  extractCardLast4,
  isCardDueNotice,
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

export type CardSpendEvent = {
  last4: string | null;
  issuer: string | null;
  amount: number;
  date: string;
  fingerprint: string;
};

function looksLikeCardSpend(body: string): boolean {
  const h = body || '';
  if (
    /\b(spent on|used at|txn at|transaction at|txn of|transaction of|purchase at|debited from your (?:credit\s*)?card)\b/i.test(
      h,
    )
  ) {
    return true;
  }
  return /\b(?:txn|transaction|purchase)\b/i.test(h) && /\bcard\b/i.test(h);
}

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
  if (pay.last4 && card.cardKey?.endsWith(`|${pay.last4}`)) return true;
  const payIssuer = (pay.issuer || '').toLowerCase();
  const cardIssuer = (card.issuer || '').toLowerCase();
  if (payIssuer && cardIssuer && payIssuer === cardIssuer) {
    if (!pay.last4 || !card.last4 || card.cardKey?.endsWith('|unknown')) return true;
  }
  return false;
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime();
  return Number.isFinite(ms) ? Math.round(ms / 86400000) : 0;
}

function isNewCycle(
  existing: ExpenseReminder | undefined,
  notice: CardDueNotice,
): boolean {
  if (!existing?.dueDate) return false;
  if (notice.dueDate && notice.dueDate > existing.dueDate) return true;
  if (notice.role === 'statement' && notice.statementDate > existing.dueDate) return true;
  if (
    notice.role === 'statement' &&
    existing.statementDate &&
    daysBetween(existing.statementDate, notice.statementDate) >= 20
  ) {
    return true;
  }
  return false;
}

function resolveDueDate(
  notice: CardDueNotice,
  existing: ExpenseReminder | undefined,
  newCycle: boolean,
): string {
  if (notice.dueDate) return notice.dueDate;
  if (newCycle && existing?.dueDate) return addMonthsIso(existing.dueDate, 1);
  return existing?.dueDate || notice.statementDate;
}

/** Payments belong to the billing cycle, not the day the latest SMS arrived. */
function paymentFromDate(
  notice: CardDueNotice,
  previous: { dueDate: string | null } | undefined,
  dueDate: string,
  existing?: ExpenseReminder,
): string {
  if (previous?.dueDate) return previous.dueDate;
  const cycleStart = dueDate ? addMonthsIso(dueDate, -1) : notice.statementDate;
  const stmtDay =
    notice.role === 'statement' ? notice.statementDate : existing?.statementDate || '';
  if (stmtDay && stmtDay < cycleStart) return stmtDay;
  return cycleStart;
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

export function parseCardSpend(
  body: string,
  opts?: { address?: string; date?: number | string; amount?: number },
): CardSpendEvent | null {
  if (isCardDueNotice(body)) return null;
  if (isCardBillPayment(body)) return null;
  if (!looksLikeCardSpend(body || '')) return null;
  const amount = opts?.amount;
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return null;
  const last4 = extractCardLast4(body);
  const issuerLabel = extractCardIssuer(body, opts?.address);
  if (!last4 && issuerLabel === 'Card') return null;
  const date = todayish(opts?.date);
  const issuer = issuerLabel === 'Card' ? null : issuerLabel;
  const fingerprint = `spend|${last4 || issuer || 'card'}|${date}|${amount}|${(body || '')
    .slice(0, 40)
    .toLowerCase()}`;
  return { last4, issuer, amount, date, fingerprint };
}

export function parseCardBillPayment(
  body: string,
  opts?: { address?: string; date?: number | string; amount?: number },
): CardBillPaymentEvent | null {
  if (isCardDueNotice(body)) return null;
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
): { notices: CardDueNotice[]; payments: CardBillPaymentEvent[]; spends: CardSpendEvent[] } {
  const notices: CardDueNotice[] = [];
  const payments: CardBillPaymentEvent[] = [];
  const spends: CardSpendEvent[] = [];
  const seenPay = new Set<string>();
  const seenSpend = new Set<string>();

  for (const msg of messages) {
    const notice = parseDueNotice(msg.body || '', { address: msg.address, date: msg.date });
    if (notice) notices.push(notice);
    const amount = extractAmount(msg.body || '');
    const date = extractDate(msg.body || '', msg.date);
    const pay = parseCardBillPayment(msg.body || '', {
      address: msg.address,
      date,
      amount: amount ?? undefined,
    });
    if (pay && !seenPay.has(pay.fingerprint)) {
      seenPay.add(pay.fingerprint);
      payments.push(pay);
    }
    const spend = parseCardSpend(msg.body || '', {
      address: msg.address,
      date,
      amount: amount ?? undefined,
    });
    if (spend && !seenSpend.has(spend.fingerprint)) {
      seenSpend.add(spend.fingerprint);
      spends.push(spend);
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

  return { notices, payments, spends };
}

function noticeBeats(prev: CardDueNotice, next: CardDueNotice): boolean {
  const prevDue = prev.dueDate || '';
  const nextDue = next.dueDate || '';
  // The later due date is the current cycle, even if an overdue SMS arrived after it.
  if (nextDue && prevDue && nextDue !== prevDue) return nextDue > prevDue;
  if (nextDue && !prevDue) return true;
  if (!nextDue && prevDue) {
    return (
      next.role === 'statement' && daysBetween(prev.statementDate, next.statementDate) >= 20
    );
  }
  // Same cycle: a generated statement beats a please-pay nudge.
  if (next.role !== prev.role) return next.role === 'statement';
  if (next.statementDate !== prev.statementDate) return next.statementDate > prev.statementDate;
  return next.totalDue != null && prev.totalDue == null;
}

function sameCycle(a: CardDueNotice, b: CardDueNotice): boolean {
  if (a.cardKey !== b.cardKey) return false;
  if (a.dueDate && b.dueDate) return a.dueDate === b.dueDate;
  return !a.dueDate && !b.dueDate && a.statementDate === b.statementDate;
}

function enrichNotice(winner: CardDueNotice, notices: CardDueNotice[]): CardDueNotice {
  let totalDue = winner.totalDue;
  let minDue = winner.minDue;
  let dueDate = winner.dueDate;
  let last4 = winner.last4;
  for (const n of notices) {
    if (!sameCycle(winner, n)) continue;
    if (totalDue == null && n.totalDue != null) totalDue = n.totalDue;
    if (minDue == null && n.minDue != null) minDue = n.minDue;
    if (!dueDate && n.dueDate) dueDate = n.dueDate;
    if (!last4 && n.last4) last4 = n.last4;
  }
  return { ...winner, totalDue, minDue, dueDate, last4 };
}

function latestNoticePerCard(notices: CardDueNotice[]): CardDueNotice[] {
  const byKey = new Map<string, CardDueNotice>();
  for (const n of notices) {
    const prev = byKey.get(n.cardKey);
    if (!prev || noticeBeats(prev, n)) byKey.set(n.cardKey, n);
  }
  return [...byKey.values()].map((n) => enrichNotice(n, notices));
}

function previousCycle(
  notices: CardDueNotice[],
  current: CardDueNotice,
): { dueDate: string | null; totalDue: number | null } {
  let best: CardDueNotice | null = null;
  for (const n of notices) {
    if (n.cardKey !== current.cardKey || !n.dueDate || !current.dueDate) continue;
    if (n.dueDate >= current.dueDate) continue;
    if (!best || (n.dueDate || '') > (best.dueDate || '')) best = n;
  }
  return { dueDate: best?.dueDate ?? null, totalDue: best?.totalDue ?? null };
}

function paymentSettlesPrevious(
  pay: CardBillPaymentEvent,
  prevDue: string | null,
  prevTotal: number | null,
): boolean {
  if (prevDue && pay.date <= prevDue) return true;
  if (prevTotal != null && Math.abs(pay.amount - prevTotal) <= 1) return true;
  return false;
}

function applyPaymentsToRemaining(
  start: number,
  card: { last4?: string | null; issuer?: string | null; cardKey?: string },
  payments: CardBillPaymentEvent[],
  fromDate: string,
  already: Set<string>,
  previous?: { dueDate: string | null; totalDue: number | null },
): { remaining: number; applied: string[] } {
  const applied: string[] = [];
  let remaining = start;
  const ordered = [...payments].sort((a, b) => a.date.localeCompare(b.date));
  for (const pay of ordered) {
    if (already.has(pay.fingerprint) || applied.includes(pay.fingerprint)) continue;
    if (pay.date < fromDate) continue;
    if (paymentSettlesPrevious(pay, previous?.dueDate ?? null, previous?.totalDue ?? null)) {
      continue;
    }
    if (!paymentMatches(pay, card)) continue;
    remaining = money(Math.max(0, remaining - pay.amount));
    applied.push(pay.fingerprint);
  }
  return { remaining, applied };
}

/** Payment SMS that clear the remaining amount mark the bill paid. */

function upsertFromNotice(
  existing: ExpenseReminder | undefined,
  notice: CardDueNotice,
  payments: CardBillPaymentEvent[],
  offsets: number[],
  previous?: { dueDate: string | null; totalDue: number | null },
): ExpenseReminder {
  const newCycle = isNewCycle(existing, notice);
  const totalDue = notice.totalDue ?? (newCycle ? 0 : existing?.totalDue) ?? 0;
  const dueDate = resolveDueDate(notice, existing, newCycle);
  const dayOfMonth = parseInt(dueDate.split('-')[2], 10) || 1;
  const { remaining, applied } = applyPaymentsToRemaining(
    totalDue,
    { last4: notice.last4, issuer: notice.issuer, cardKey: notice.cardKey },
    payments,
    paymentFromDate(notice, previous, dueDate, existing),
    new Set(),
    previous,
  );
  const cleared = totalDue > 0.009 && remaining <= 0.009;
  return {
    id: existing?.id || `card-bill:${notice.cardKey}`,
    name: reminderName(notice),
    amount: remaining,
    dueDate,
    paid: newCycle ? cleared : cleared || existing?.paid === true,
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
    statementDate:
      notice.role === 'statement'
        ? notice.statementDate
        : existing?.statementDate || notice.statementDate,
    appliedPaymentKeys: applied,
    linkedTxnId: existing?.linkedTxnId ?? null,
    spendEvents: existing?.spendEvents,
  };
}

function attachSpends(
  reminders: ExpenseReminder[],
  spends: CardSpendEvent[],
): ExpenseReminder[] {
  if (!spends.length) return reminders;
  return reminders.map((r) => {
    if (r.source !== 'card-bill') return r;
    const card = { last4: r.cardLast4, issuer: r.cardIssuer, cardKey: r.cardKey };
    const incoming = spends
      .filter((s) => paymentMatches(s, card))
      .map((s) => ({ amount: s.amount, date: s.date, fingerprint: s.fingerprint }));
    if (!incoming.length) return r;
    const byFp = new Map((r.spendEvents || []).map((e) => [e.fingerprint, e]));
    for (const e of incoming) byFp.set(e.fingerprint, e);
    return { ...r, spendEvents: [...byFp.values()] };
  });
}

function applyLonePayments(
  reminders: ExpenseReminder[],
  payments: CardBillPaymentEvent[],
  notices: CardDueNotice[],
): ExpenseReminder[] {
  return reminders.map((r) => {
    if (r.source !== 'card-bill') return r;
    const already = new Set(r.appliedPaymentKeys || []);
    const current = notices.find(
      (n) => n.cardKey === r.cardKey && (!r.dueDate || !n.dueDate || n.dueDate === r.dueDate),
    );
    const previous = current
      ? previousCycle(notices, current)
      : { dueDate: null, totalDue: null };
    const { remaining, applied } = applyPaymentsToRemaining(
      r.amount,
      { last4: r.cardLast4, issuer: r.cardIssuer, cardKey: r.cardKey },
      payments,
      previous?.dueDate ||
        (r.statementDate && r.dueDate && r.statementDate < addMonthsIso(r.dueDate, -1)
          ? r.statementDate
          : r.dueDate
            ? addMonthsIso(r.dueDate, -1)
            : r.statementDate || '0000-01-01'),
      already,
      previous,
    );
    if (!applied.length) return r;
    const cleared = remaining <= 0.009 && (r.totalDue || r.amount) > 0.009;
    return {
      ...r,
      amount: remaining,
      paid: cleared || r.paid === true,
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
  spends: CardSpendEvent[] = [],
): { next: ExpenseReminder[]; changed: boolean } {
  const latest = latestNoticePerCard(notices);
  const used = new Set<string>();
  const next: ExpenseReminder[] = reminders.map((r) => {
    if (r.source !== 'card-bill' || !r.cardKey) return r;
    const notice = latest.find((n) => n.cardKey === r.cardKey);
    if (!notice) return r;
    used.add(notice.cardKey);
    return upsertFromNotice(r, notice, payments, offsets, previousCycle(notices, notice));
  });

  for (const notice of latest) {
    if (used.has(notice.cardKey)) continue;
    next.unshift(
      upsertFromNotice(undefined, notice, payments, offsets, previousCycle(notices, notice)),
    );
    used.add(notice.cardKey);
  }

  const withPays = applyLonePayments(next, payments, notices);
  const withSpends = attachSpends(withPays, spends);
  const changed = JSON.stringify(withSpends) !== JSON.stringify(reminders);
  return { next: withSpends, changed };
}

export function cardKeyFromText(body: string, address?: string): string {
  return cardKeyOf(extractCardIssuer(body, address), extractCardLast4(body));
}
