import type { ExpenseReminder, Transaction } from '../types';
import { CARD_BILL_CATEGORY } from '../cashBooks';
import {
  isCardBillPayment,
  isCreditLimitOrLoanOffer,
  type RawImportMessage,
} from './importRules/parseImportText';
import {
  addMonthsIso,
  cardKeyOf,
  daysBetweenIso,
  extractCardIssuer,
  extractCardLast4,
  issuerSlug,
  isCardDueNotice,
  isTrustedStatementGenerationDay,
  parseDueNotice,
  refineStatementDate,
  type CardDueNotice,
} from './importRules/parseDueNotice';

export type CardBillPaymentEvent = {
  last4: string | null;
  issuer: string | null;
  amount: number;
  date: string;
  fingerprint: string;
  body?: string;
};

export type CardSpendEvent = {
  last4: string | null;
  issuer: string | null;
  amount: number;
  date: string;
  fingerprint: string;
  body?: string;
};

export type StoredCardEvent = {
  amount: number;
  date: string;
  fingerprint: string;
  body?: string;
  last4?: string | null;
  issuer?: string | null;
};

export type CardBillEvent = {
  kind: 'statement' | 'due' | 'payment';
  amount: number;
  date: string;
  fingerprint: string;
  body?: string;
};

function looksLikeCardSpend(body: string): boolean {
  const h = body || '';
  if (isCreditLimitOrLoanOffer(h)) return false;
  if (
    /\b(spent on|used at|txn at|transaction at|txn of|transaction of|purchase at|debited from your (?:credit\s*)?card)\b/i.test(
      h,
    )
  ) {
    return !/\bused at your\s+convenience\b/i.test(h);
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

function issuerKey(label?: string | null): string {
  if (!label) return '';
  return issuerSlug(label);
}

export function identitiesMatch(
  event: { last4?: string | null; issuer?: string | null },
  card: { last4?: string | null; last4s?: string[] | null; issuer?: string | null; cardKey?: string },
): boolean {
  if (event.last4 && card.last4s?.includes(event.last4)) return true;
  if (event.last4 && card.last4) return event.last4 === card.last4;
  const eventIssuer = issuerKey(event.issuer);
  const cardIssuer = issuerKey(card.issuer);
  if (eventIssuer && cardIssuer && eventIssuer !== cardIssuer) return false;
  return !!(eventIssuer && cardIssuer);
}

/** Ledger notes without a last 4 only count when this card’s own spend SMS matches. */
export function txnNoteFitsCard(
  text: string,
  card: { last4?: string | null; last4s?: string[] | null; issuer?: string | null; cardKey?: string },
  opts?: { day?: string; amount?: number; spends?: StoredCardEvent[]; address?: string },
): boolean {
  if (textBelongsToCard(text, card, opts?.address)) return true;
  const last4 = extractCardLast4(text);
  const issuerLabel = extractCardIssuer(text, opts?.address);
  if (last4 || issuerLabel !== 'Card') return false;
  const day = opts?.day;
  const amount = opts?.amount;
  const spends = opts?.spends;
  if (!day || amount == null || !spends?.length) return false;
  const amt = Math.round((Math.abs(amount) || 0) * 100);
  return spends.some(
    (e) =>
      storedEventBelongsToCard(e, card) &&
      e.date === day &&
      Math.round((Math.abs(e.amount) || 0) * 100) === amt,
  );
}

/** A stored spend / SMS only counts for this card when it names the card. */
export function storedEventBelongsToCard(
  event: StoredCardEvent,
  card: { last4?: string | null; last4s?: string[] | null; issuer?: string | null; cardKey?: string },
): boolean {
  if (event.last4 || event.issuer) return identitiesMatch(event, card);
  if (event.body) return textBelongsToCard(event.body, card);
  return false;
}

function paymentMatches(
  pay: CardBillPaymentEvent,
  card: { last4?: string | null; issuer?: string | null; cardKey?: string },
): boolean {
  return identitiesMatch(pay, card);
}

/** True when SMS / note text names this card (last 4, else issuer). Generic "Card" text does not match. */
export function textBelongsToCard(
  text: string,
  card: { last4?: string | null; last4s?: string[] | null; issuer?: string | null; cardKey?: string },
  address?: string,
): boolean {
  const last4 = extractCardLast4(text);
  const issuerLabel = extractCardIssuer(text, address);
  const issuer = issuerLabel === 'Card' ? null : issuerLabel;
  return identitiesMatch({ last4, issuer }, card);
}

function noticeDay(notice: CardDueNotice): string {
  return notice.statementDate || notice.smsDate;
}

function isNewCycle(
  existing: ExpenseReminder | undefined,
  notice: CardDueNotice,
): boolean {
  if (!existing?.dueDate) return false;
  if (notice.dueDate && notice.dueDate > existing.dueDate) return true;
  const day = noticeDay(notice);
  if (notice.role === 'statement' && day && day > existing.dueDate) return true;
  if (
    notice.role === 'statement' &&
    existing.statementDate &&
    day &&
    daysBetweenIso(existing.statementDate, day) >= 20
  ) {
    return true;
  }
  return false;
}

export function isCardIsoDate(value?: string | null): boolean {
  return !!value && /^\d{4}-\d{2}-\d{2}/.test(value);
}

/**
 * A due date that was copied from the statement SMS day is not a real due date.
 * Statement generation and payment due stay two different fields.
 */
export function effectiveCardDueDate(
  r: Pick<ExpenseReminder, 'dueDate' | 'statementDate' | 'dueDateSource'>,
): string | null {
  if (!isCardIsoDate(r.dueDate)) return null;
  const due = r.dueDate!.slice(0, 10);
  if (
    r.dueDateSource !== 'sms' &&
    r.dueDateSource !== 'manual' &&
    isCardIsoDate(r.statementDate) &&
    due === r.statementDate!.slice(0, 10)
  ) {
    return null;
  }
  return due;
}

/** Statement day taken from a late “statement generated” SMS is not the gen date. */
export function effectiveCardStatementDate(
  r: Pick<ExpenseReminder, 'statementDate' | 'dueDate' | 'statementDateSource'>,
): string | null {
  if (!isCardIsoDate(r.statementDate)) return null;
  const stmt = r.statementDate!.slice(0, 10);
  if (r.statementDateSource === 'manual') return stmt;
  const due = isCardIsoDate(r.dueDate) ? r.dueDate!.slice(0, 10) : null;
  if (due && !isTrustedStatementGenerationDay(stmt, due)) return null;
  return stmt;
}

export function missingCardCycleDates(
  r: Pick<
    ExpenseReminder,
    'statementDate' | 'dueDate' | 'dueDateSource' | 'statementDateSource'
  >,
): { needStatement: boolean; needDue: boolean } {
  return {
    needStatement: !effectiveCardStatementDate(r),
    needDue: !effectiveCardDueDate(r),
  };
}

function resolveDueDate(
  notice: CardDueNotice,
  existing: ExpenseReminder | undefined,
  newCycle: boolean,
): string | null {
  if (notice.dueDate) return notice.dueDate;
  if (newCycle && isCardIsoDate(existing?.dueDate)) {
    return addMonthsIso(existing!.dueDate, 1);
  }
  return existing ? effectiveCardDueDate(existing) : null;
}

/** Payments belong to the billing cycle, not the day the latest SMS arrived. */
function paymentFromDate(
  notice: CardDueNotice,
  previous: { dueDate: string | null } | undefined,
  dueDate: string,
  existing?: ExpenseReminder,
): string {
  if (previous?.dueDate) return previous.dueDate;
  const cycleStart = dueDate ? addMonthsIso(dueDate, -1) : notice.statementDate || notice.smsDate;
  const stmtDay = notice.statementDate || existing?.statementDate || '';
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
  return { last4, issuer, amount, date, fingerprint, body: body || '' };
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
  return { last4, issuer, amount, date, fingerprint, body: body || '' };
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
      body: text,
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
    return next.role === 'statement' && daysBetweenIso(noticeDay(prev), noticeDay(next)) >= 20;
  }
  // Same cycle: a generated statement beats a please-pay nudge.
  if (next.role !== prev.role) return next.role === 'statement';
  if (noticeDay(next) !== noticeDay(prev)) return noticeDay(next) > noticeDay(prev);
  return next.totalDue != null && prev.totalDue == null;
}

function sameCycle(a: CardDueNotice, b: CardDueNotice): boolean {
  if (a.cardKey !== b.cardKey) return false;
  if (a.dueDate && b.dueDate) return a.dueDate === b.dueDate;
  return !a.dueDate && !b.dueDate && noticeDay(a) === noticeDay(b);
}

function enrichNotice(winner: CardDueNotice, notices: CardDueNotice[]): CardDueNotice {
  let totalDue = winner.totalDue;
  let minDue = winner.minDue;
  let dueDate = winner.dueDate;
  let last4 = winner.last4;
  let statementDate = winner.statementDate;
  for (const n of notices) {
    if (!sameCycle(winner, n)) continue;
    if (totalDue == null && n.totalDue != null) totalDue = n.totalDue;
    if (minDue == null && n.minDue != null) minDue = n.minDue;
    if (!dueDate && n.dueDate) dueDate = n.dueDate;
    if (!last4 && n.last4) last4 = n.last4;
    if (!statementDate && n.statementDate) statementDate = n.statementDate;
  }
  return { ...winner, totalDue, minDue, dueDate, last4, statementDate };
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
  const refined =
    notice.role === 'statement'
      ? refineStatementDate(notice, existing?.statementDate)
      : null;
  const statementDate = refined || existing?.statementDate;
  const dayOfMonth = dueDate
    ? parseInt(dueDate.split('-')[2], 10) || existing?.dayOfMonth || 1
    : existing?.dayOfMonth;
  const { remaining, applied } = applyPaymentsToRemaining(
    totalDue,
    { last4: notice.last4, issuer: notice.issuer, cardKey: notice.cardKey },
    payments,
    paymentFromDate(notice, previous, dueDate || '', existing),
    new Set(),
    previous,
  );
  const cleared = totalDue > 0.009 && remaining <= 0.009;
  return {
    id: existing?.id || `card-bill:${notice.cardKey}`,
    name: reminderName(notice),
    amount: remaining,
    dueDate: dueDate || '',
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
    statementDate: statementDate || undefined,
    statementDateSource: refined
      ? 'sms'
      : existing?.statementDateSource,
    dueDateSource: notice.dueDate
      ? 'sms'
      : dueDate
        ? existing?.dueDateSource
        : undefined,
    appliedPaymentKeys: applied,
    linkedTxnId: existing?.linkedTxnId ?? null,
    spendEvents: existing?.spendEvents,
    billEvents: existing?.billEvents,
    hidden: existing?.hidden,
  };
}

function attachSpends(
  reminders: ExpenseReminder[],
  spends: CardSpendEvent[],
): ExpenseReminder[] {
  return reminders.map((r) => {
    if (r.source !== 'card-bill') return r;
    const card = { last4: r.cardLast4, issuer: r.cardIssuer, cardKey: r.cardKey };
    const incoming = spends
      .filter((s) => paymentMatches(s, card))
      .map((s) => ({
        amount: s.amount,
        date: s.date,
        fingerprint: s.fingerprint,
        body: s.body,
        last4: s.last4,
        issuer: s.issuer,
      }));
    const kept = (r.spendEvents || []).filter((e) => storedEventBelongsToCard(e, card));
    if (!incoming.length && kept.length === (r.spendEvents || []).length) return r;
    const byFp = new Map(kept.map((e) => [e.fingerprint, e]));
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

function reminderMatchesCard(
  r: ExpenseReminder,
  card: { last4?: string | null; issuer?: string | null; cardKey?: string },
): boolean {
  if (r.source !== 'card-bill') return false;
  if (card.cardKey && r.cardKey === card.cardKey) return true;
  if (card.last4 && r.cardLast4 && card.last4 === r.cardLast4) return true;
  return false;
}

function sameIssuer(a?: string | null, b?: string | null): boolean {
  const left = issuerKey(a);
  const right = issuerKey(b);
  return !!(left && right && left === right);
}

/** One issuer-only notice may land on the only last-4 card of that bank. */
function noticeForReminder(r: ExpenseReminder, latest: CardDueNotice[]): CardDueNotice | undefined {
  const direct =
    latest.find((n) => n.cardKey === r.cardKey) ||
    (r.cardLast4 ? latest.find((n) => n.last4 === r.cardLast4) : undefined);
  if (direct) return direct;
  if (!r.cardLast4 || !r.cardIssuer) return undefined;
  const same = latest.filter(
    (n) => sameIssuer(n.issuer, r.cardIssuer) && (!n.last4 || n.last4 === r.cardLast4),
  );
  return same.length === 1 ? same[0] : undefined;
}

export function foldOrphanIssuerReminders(reminders: ExpenseReminder[]): ExpenseReminder[] {
  const bills = reminders.filter((r) => r.source === 'card-bill');
  const named = bills.filter((r) => r.cardLast4);
  const orphans = bills.filter((r) => !r.cardLast4);
  const folded = new Set<string>();
  const nextNamed = named.map((r) => {
    const siblings = named.filter((o) => sameIssuer(o.cardIssuer, r.cardIssuer));
    const orphan = orphans.find((o) => sameIssuer(o.cardIssuer, r.cardIssuer) && !folded.has(o.id));
    if (!orphan || siblings.length !== 1) return r;
    folded.add(orphan.id);
    return {
      ...r,
      amount: r.amount > 0.009 ? r.amount : orphan.amount,
      dueDate: r.dueDate || orphan.dueDate,
      paid: r.paid || orphan.paid,
      totalDue: r.totalDue || orphan.totalDue,
      minDue: r.minDue ?? orphan.minDue,
      statementDate: r.statementDate || orphan.statementDate,
      statementDateSource: r.statementDateSource || orphan.statementDateSource,
      dueDateSource: r.dueDateSource || orphan.dueDateSource,
      spendEvents: [...(orphan.spendEvents || []), ...(r.spendEvents || [])],
      billEvents: [...(orphan.billEvents || []), ...(r.billEvents || [])],
      hidden: !!(r.hidden || orphan.hidden),
      name: reminderName({ issuer: r.cardIssuer || orphan.cardIssuer || 'Card', last4: r.cardLast4 || null }),
    };
  });
  const leftoverOrphans = orphans.filter((o) => !folded.has(o.id));
  return [
    ...reminders.filter((r) => r.source !== 'card-bill'),
    ...nextNamed,
    ...leftoverOrphans,
  ];
}

function ensureRemindersForKnownCards(
  reminders: ExpenseReminder[],
  spends: CardSpendEvent[],
  payments: CardBillPaymentEvent[],
  offsets: number[],
): ExpenseReminder[] {
  const known = new Map<string, { last4: string | null; issuer: string; cardKey: string }>();
  for (const ev of [...spends, ...payments]) {
    if (!ev.last4) continue;
    const issuer = ev.issuer || 'Card';
    const cardKey = cardKeyOf(issuer, ev.last4);
    known.set(cardKey, { last4: ev.last4, issuer, cardKey });
  }
  const next = [...reminders];
  for (const card of known.values()) {
    if (next.some((r) => reminderMatchesCard(r, card))) continue;
    next.unshift({
      id: `card-bill:${card.cardKey}`,
      name: reminderName(card),
      amount: 0,
      dueDate: '',
      paid: false,
      offsets,
      mode: 'default',
      repeat: 'once',
      recurring: false,
      detail: 'Card bill',
      source: 'card-bill',
      cardKey: card.cardKey,
      cardLast4: card.last4 || undefined,
      cardIssuer: card.issuer === 'Card' ? undefined : card.issuer,
    });
  }
  return next;
}

function attachBillEvents(
  reminders: ExpenseReminder[],
  notices: CardDueNotice[],
  payments: CardBillPaymentEvent[],
): ExpenseReminder[] {
  return reminders.map((r) => {
    if (r.source !== 'card-bill') return r;
    const card = { last4: r.cardLast4, issuer: r.cardIssuer, cardKey: r.cardKey };
    const incoming: CardBillEvent[] = [];
    for (const n of notices) {
      if (noticeForReminder(r, [n]) !== n) continue;
      incoming.push({
        kind: n.role === 'statement' ? 'statement' : 'due',
        amount: n.totalDue ?? 0,
        date: noticeDay(n),
        fingerprint: n.fingerprint,
        body: n.body,
      });
    }
    for (const p of payments) {
      if (!paymentMatches(p, card)) continue;
      incoming.push({
        kind: 'payment',
        amount: p.amount,
        date: p.date,
        fingerprint: p.fingerprint,
        body: p.body,
      });
    }
    if (!incoming.length) return r;
    const byFp = new Map((r.billEvents || []).map((e) => [e.fingerprint, e]));
    for (const e of incoming) byFp.set(e.fingerprint, e);
    return { ...r, billEvents: [...byFp.values()] };
  });
}

function normalizeCopiedDue(r: ExpenseReminder): ExpenseReminder {
  if (r.source !== 'card-bill') return r;
  let next = r;
  if (isCardIsoDate(r.statementDate) && !effectiveCardStatementDate(r)) {
    next = { ...next, statementDate: undefined, statementDateSource: undefined };
  }
  if (effectiveCardDueDate(next)) return next;
  if (!isCardIsoDate(next.dueDate)) return next;
  return { ...next, dueDate: '' };
}

export function applyManualCardCycleDates(
  reminders: ExpenseReminder[],
  existing: ExpenseReminder | undefined,
  seed: { issuer: string; last4: string | null },
  dates: { statementDate?: string; dueDate?: string; totalDue?: number },
  offsets: number[],
): ExpenseReminder[] {
  const statementDate = isCardIsoDate(dates.statementDate)
    ? dates.statementDate!.slice(0, 10)
    : existing?.statementDate;
  const dueDate = isCardIsoDate(dates.dueDate)
    ? dates.dueDate!.slice(0, 10)
    : existing
      ? effectiveCardDueDate(existing) || ''
      : '';
  const manualDue =
    dates.totalDue != null && Number.isFinite(dates.totalDue) && dates.totalDue > 0
      ? Math.round(dates.totalDue * 100) / 100
      : undefined;
  const issuer = existing?.cardIssuer || seed.issuer || 'Card';
  const last4 = existing?.cardLast4 || seed.last4;
  const cardKey = existing?.cardKey || cardKeyOf(issuer, last4);
  const nextRow: ExpenseReminder = {
    id: existing?.id || `card-bill:${cardKey}`,
    name: existing?.name || reminderName({ issuer, last4 }),
    amount: manualDue ?? existing?.amount ?? 0,
    dueDate: dueDate || '',
    paid: existing?.paid ?? false,
    offsets: existing?.offsets?.length ? existing.offsets : offsets,
    mode: existing?.mode || 'default',
    customTime: existing?.customTime,
    alarmDurationSec: existing?.alarmDurationSec,
    repeat: existing?.repeat || 'once',
    recurring: false,
    dayOfMonth: dueDate
      ? parseInt(dueDate.split('-')[2], 10) || existing?.dayOfMonth
      : existing?.dayOfMonth,
    detail: existing?.detail || 'Card bill',
    source: 'card-bill',
    cardKey,
    cardLast4: last4 || undefined,
    cardIssuer: issuer === 'Card' ? existing?.cardIssuer : issuer,
    totalDue: manualDue ?? existing?.totalDue,
    minDue: existing?.minDue,
    statementDate: statementDate || undefined,
    statementDateSource: isCardIsoDate(dates.statementDate)
      ? 'manual'
      : existing?.statementDateSource,
    dueDateSource: isCardIsoDate(dates.dueDate) ? 'manual' : existing?.dueDateSource,
    appliedPaymentKeys: existing?.appliedPaymentKeys,
    linkedTxnId: existing?.linkedTxnId ?? null,
    spendEvents: existing?.spendEvents,
    billEvents: existing?.billEvents,
    hidden: existing?.hidden,
  };
  if (existing) return reminders.map((r) => (r.id === existing.id ? nextRow : r));
  return [nextRow, ...reminders];
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
    if (r.source !== 'card-bill' || (!r.cardKey && !r.cardLast4)) return r;
    const notice = noticeForReminder(r, latest);
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

  const withKnown = foldOrphanIssuerReminders(
    ensureRemindersForKnownCards(next, spends, payments, offsets),
  );
  const withPays = applyLonePayments(withKnown, payments, notices);
  const withSpends = attachSpends(withPays, spends);
  const withBills = attachBillEvents(withSpends, notices, payments).map(normalizeCopiedDue);
  const changed = JSON.stringify(withBills) !== JSON.stringify(reminders);
  return { next: withBills, changed };
}

/** Create or unhide a card the user typed. Dates and amount are optional. */
export function applyAddCreditCard(
  reminders: ExpenseReminder[],
  card: { issuer: string; last4: string; statementDate?: string; dueDate?: string; totalDue?: number },
  offsets: number[],
): ExpenseReminder[] {
  const last4 = (card.last4 || '').replace(/\D/g, '');
  if (!/^\d{4}$/.test(last4)) return reminders;
  const issuer = card.issuer || 'Card';
  const cardKey = cardKeyOf(issuer, last4);
  const existing = reminders.find(
    (r) =>
      r.source === 'card-bill' &&
      (r.cardKey === cardKey || (r.cardLast4 === last4 && sameIssuer(r.cardIssuer, issuer))),
  );
  const next = applyManualCardCycleDates(
    reminders,
    existing,
    { issuer, last4 },
    {
      statementDate: card.statementDate,
      dueDate: card.dueDate,
      totalDue: card.totalDue,
    },
    offsets,
  );
  return next.map((r) =>
    r.cardKey === cardKey || r.id === existing?.id
      ? { ...r, hidden: false, cardLast4: last4, cardIssuer: issuer === 'Card' ? r.cardIssuer : issuer }
      : r,
  );
}

export function hideCardReminder(
  reminders: ExpenseReminder[],
  card: {
    id?: string;
    reminderId?: string;
    reminderIds?: string[];
    last4?: string | null;
    last4s?: string[];
    issuer?: string | null;
  },
): ExpenseReminder[] {
  const ids = new Set([card.id, card.reminderId, ...(card.reminderIds || [])].filter(Boolean) as string[]);
  const last4s = new Set(
    [...(card.last4s || []), card.last4].filter((x): x is string => !!x),
  );
  return reminders.map((r) => {
    if (r.source !== 'card-bill') return r;
    if (ids.has(r.id)) return { ...r, hidden: true };
    if (r.cardLast4 && last4s.has(r.cardLast4) && sameIssuer(r.cardIssuer, card.issuer)) {
      return { ...r, hidden: true };
    }
    return r;
  });
}

export function cardKeyFromText(body: string, address?: string): string {
  return cardKeyOf(extractCardIssuer(body, address), extractCardLast4(body));
}
