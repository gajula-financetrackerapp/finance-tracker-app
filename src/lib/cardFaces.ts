import type { Account, ExpenseReminder, Transaction } from '../types';
import { CARD_BILL_CATEGORY, isCoreCardAccount } from '../cashBooks';
import { todayStr } from '../utils';
import {
  cardHasBillAmount,
  cardReminderIsBankAccount,
  effectiveCardDueDate,
  effectiveCardStatementDate,
  foldOrphanIssuerReminders,
  missingCardCycleDates,
  spendIsIgnored,
  storedEventBelongsToCard,
  txnNoteFitsCard,
} from './cardBills';
import { issuerSlug } from './importRules/parseDueNotice';

export type CardSkin = {
  from: string;
  to: string;
  ink: string;
  muted: string;
};

const SKINS: Record<string, CardSkin> = {
  hdfc: { from: '#003A70', to: '#0B1F3A', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.72)' },
  sbi: { from: '#1E4B9B', to: '#122A58', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.72)' },
  icici: { from: '#C41E3A', to: '#1A0A0C', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.78)' },
  axis: { from: '#6B1538', to: '#1C0A12', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.72)' },
  kotak: { from: '#C8102E', to: '#3B0A12', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.75)' },
  bob: { from: '#E85D04', to: '#3D1E08', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.78)' },
  rbl: { from: '#5B2C83', to: '#1A1028', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.75)' },
  yes: { from: '#0066B3', to: '#0A2540', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.75)' },
  idfc: { from: '#8B1E1E', to: '#2A0C0C', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.75)' },
  indusind: { from: '#9B1B30', to: '#2A0A12', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.75)' },
  amex: { from: '#006FCF', to: '#012A4A', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.75)' },
  citi: { from: '#003B70', to: '#011627', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.75)' },
  hsbc: { from: '#DB0011', to: '#3D0008', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.75)' },
  stanchart: { from: '#00A3E0', to: '#023047', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.8)' },
  au: { from: '#E87722', to: '#3D220C', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.8)' },
  federal: { from: '#004B87', to: '#011627', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.75)' },
  dbs: { from: '#E31C23', to: '#2A0A0C', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.75)' },
  onecard: { from: '#111111', to: '#2B2B2B', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.72)' },
  card: { from: '#2A3348', to: '#0E1118', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.7)' },
};

export function skinForIssuer(issuer?: string | null): CardSkin {
  const slug = issuerSlug(issuer || 'Card');
  return SKINS[slug] || SKINS.card;
}

export type CreditCardView = {
  id: string;
  issuer: string;
  last4: string | null;
  /** Other last-4s on the same statement / credit limit (add-on cards). */
  last4s?: string[];
  reminderIds?: string[];
  remaining: number | null;
  totalDue: number | null;
  minDue: number | null;
  dueDate: string | null;
  paid: boolean;
  reminderId?: string;
  accountId?: string;
  /** Live billed statement (generated, due date not yet passed). */
  phase: 'waiting' | 'stated';
  statementDate: string | null;
  nextStatementDate: string | null;
  spendFrom: string | null;
  spendTo: string | null;
  unbilledExpenses: number;
  needsStatementDate: boolean;
  needsDueDate: boolean;
  needsAmount: boolean;
};

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function dateOnDay(year: number, month: number, day: number): string {
  const last = new Date(year, month, 0).getDate();
  const use = Math.min(Math.max(1, day), last);
  return `${year}-${pad2(month)}-${pad2(use)}`;
}

/** Next statement-generation calendar day on or after `today`. */
export function nextStatementGenDate(lastGen: string | null, today: string): string | null {
  if (!lastGen || !/^\d{4}-\d{2}-\d{2}/.test(lastGen)) return null;
  const day = Number(lastGen.slice(8, 10));
  if (!day) return null;
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const thisMonth = dateOnDay(y, m, day);
  if (thisMonth >= today) return thisMonth;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return dateOnDay(ny, nm, day);
}

/**
 * Most recent statement-generation calendar day on or before `today`.
 * If a month was missed (no SMS), this is last month's day — not the stale stored date.
 */
export function latestStatementGenOnOrBefore(lastGen: string | null, today: string): string | null {
  if (!lastGen || !/^\d{4}-\d{2}-\d{2}/.test(lastGen)) return null;
  const day = Number(lastGen.slice(8, 10));
  if (!day) return null;
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const thisMonth = dateOnDay(y, m, day);
  if (thisMonth <= today) return thisMonth;
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return dateOnDay(py, pm, day);
}

export function hasLiveStatement(
  reminder:
    | Pick<ExpenseReminder, 'dueDate' | 'statementDate' | 'totalDue' | 'amount' | 'dueDateSource'>
    | undefined,
  today: string,
): boolean {
  if (!reminder) return false;
  const due = effectiveCardDueDate(reminder);
  if (!due) return false;
  if (today > due) return false;
  const stmt = effectiveCardStatementDate(reminder);
  if (stmt) {
    if (today < stmt) return false;
    return true;
  }
  return (reminder.totalDue ?? reminder.amount ?? 0) > 0;
}

function txnMatchesCard(
  txn: Transaction,
  card: { last4?: string | null; last4s?: string[] | null; issuer?: string | null; cardKey?: string },
  spends?: { amount: number; date: string; fingerprint: string; body?: string; last4?: string | null; issuer?: string | null }[],
): boolean {
  if (txn.kind !== 'expense') return false;
  if (txn.category === CARD_BILL_CATEGORY) return false;
  return txnNoteFitsCard(`${txn.note || ''} ${txn.itemName || ''}`, card, {
    day: (txn.date || '').slice(0, 10),
    amount: Number(txn.amount),
    spends,
  });
}

function unbilledOnCard(
  transactions: Transaction[],
  card: { last4?: string | null; last4s?: string[] | null; issuer?: string | null; cardKey?: string },
  events: { amount: number; date: string; fingerprint: string }[] | undefined,
  from: string | null,
  to: string,
): number {
  if (!from) return 0;
  const seen = new Set<string>();
  let sum = 0;
  for (const e of events || []) {
    if (!storedEventBelongsToCard(e, card)) continue;
    if (e.date < from || e.date > to) continue;
    const fp = e.fingerprint || `${e.date}|${Math.round(e.amount * 100)}`;
    if (seen.has(fp)) continue;
    seen.add(fp);
    seen.add(`${e.date}|${Math.round(e.amount * 100)}`);
    sum += Math.abs(e.amount) || 0;
  }
  for (const txn of transactions) {
    if (txn.homeHidden) continue;
    if (!txnMatchesCard(txn, card, events)) continue;
    const day = (txn.date || '').slice(0, 10);
    if (day < from || day > to) continue;
    const key = `${day}|${Math.round((Math.abs(Number(txn.amount)) || 0) * 100)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sum += Math.abs(Number(txn.amount)) || 0;
  }
  return Math.round(sum * 100) / 100;
}

function emptyCycle(today: string): Pick<
  CreditCardView,
  | 'phase'
  | 'statementDate'
  | 'nextStatementDate'
  | 'spendFrom'
  | 'spendTo'
  | 'unbilledExpenses'
  | 'needsStatementDate'
  | 'needsDueDate'
  | 'needsAmount'
> {
  return {
    phase: 'waiting',
    statementDate: null,
    nextStatementDate: null,
    spendFrom: null,
    spendTo: today,
    unbilledExpenses: 0,
    needsStatementDate: true,
    needsDueDate: true,
    needsAmount: false,
  };
}

function cycleForReminder(
  reminder: ExpenseReminder | undefined,
  accountId: string | undefined,
  transactions: Transaction[],
  today: string,
): Pick<
  CreditCardView,
  | 'phase'
  | 'statementDate'
  | 'nextStatementDate'
  | 'spendFrom'
  | 'spendTo'
  | 'unbilledExpenses'
  | 'needsStatementDate'
  | 'needsDueDate'
  | 'needsAmount'
> {
  if (!reminder) return emptyCycle(today);
  const lastGen = effectiveCardStatementDate(reminder);
  const stated = hasLiveStatement(reminder, today);
  // Same-day spends often miss the generated bill (cutoff is earlier that day),
  // so the new cycle starts on the statement date, not the day after.
  // If a generation month was missed, roll forward so expenses cover one cycle.
  const spendFrom = latestStatementGenOnOrBefore(lastGen, today) || lastGen;
  const missing = missingCardCycleDates(reminder);
  return {
    phase: stated ? 'stated' : 'waiting',
    statementDate: lastGen,
    nextStatementDate: stated ? null : nextStatementGenDate(lastGen, today),
    spendFrom,
    spendTo: today,
    unbilledExpenses: unbilledOnCard(
      transactions,
      { last4: reminder.cardLast4, issuer: reminder.cardIssuer, cardKey: reminder.cardKey },
      (reminder.spendEvents || []).filter((e) => !spendIsIgnored(e, reminder.ignoredSpendKeys)),
      spendFrom,
      today,
    ),
    needsStatementDate: missing.needStatement,
    needsDueDate: missing.needDue,
    needsAmount: !cardHasBillAmount(reminder),
  };
}

function accountMatchesReminder(account: Account, r: ExpenseReminder): boolean {
  const name = (account.name || '').toLowerCase();
  if (r.cardLast4 && name.includes(r.cardLast4)) return true;
  if (r.cardIssuer && name.includes(r.cardIssuer.toLowerCase())) return true;
  return false;
}

/** Cards we can draw: one per statement reminder, plus leftover card accounts. */
export function listCreditCardViews(
  accounts: Account[],
  reminders: ExpenseReminder[],
  transactions: Transaction[] = [],
  today = todayStr(),
): CreditCardView[] {
  const bills = foldOrphanIssuerReminders(reminders).filter((r) => r.source === 'card-bill');
  const cards = accounts.filter((a) => !a.excluded && isCoreCardAccount(a));
  const used = new Set<string>();
  const out: CreditCardView[] = [];

  for (const r of bills) {
    if (r.hidden || !r.cardLast4) continue;
    if (cardReminderIsBankAccount(r)) continue;
    const account = cards.find((a) => accountMatchesReminder(a, r));
    if (account) used.add(account.id);
    const cycle = cycleForReminder(r, account?.id, transactions, today);
    const live = hasLiveStatement(r, today);
    const hasBill = cardHasBillAmount(r);
    out.push({
      id: r.id,
      issuer: r.cardIssuer || r.name.replace(/\s+Card.*$/i, '') || 'Card',
      last4: r.cardLast4,
      remaining: live && hasBill ? (r.paid ? 0 : r.amount) : null,
      totalDue: live && hasBill ? r.totalDue ?? r.amount : null,
      minDue: live && hasBill ? r.minDue ?? null : null,
      dueDate: live ? effectiveCardDueDate(r) : null,
      paid: live && hasBill && !!r.paid && (r.amount || 0) <= 0.009,
      reminderId: r.id,
      accountId: account?.id,
      ...cycle,
    });
  }

  for (const account of cards) {
    if (used.has(account.id)) continue;
    if (out.length === 1 && cards.length === 1) {
      out[0].accountId = account.id;
      const cycle = cycleForReminder(
        bills.find((r) => r.id === out[0].reminderId),
        account.id,
        transactions,
        today,
      );
      Object.assign(out[0], cycle);
      used.add(account.id);
    }
  }

  return mergeSharedStatementCards(out, bills, transactions, today).sort((a, b) => {
    if (a.phase !== b.phase) return a.phase === 'stated' ? -1 : 1;
    return (a.dueDate || a.nextStatementDate || '9999').localeCompare(
      b.dueDate || b.nextStatementDate || '9999',
    );
  });
}

/** Same issuer + same statement/due/total means one credit-limit account (add-on cards). */
function sharedStatementKey(card: CreditCardView): string | null {
  const slug = issuerSlug(card.issuer);
  const stmt = card.statementDate || '';
  const due = card.dueDate || '';
  const amt = Math.round((card.totalDue ?? 0) * 100);
  if (!slug || (!stmt && !due)) return null;
  return `${slug}|${stmt}|${due}|${amt}`;
}

function collapseCardGroup(
  group: CreditCardView[],
  reminders: ExpenseReminder[],
  transactions: Transaction[],
  today: string,
): CreditCardView {
  if (group.length === 1) return group[0];
  const last4s = [...new Set(group.map((c) => c.last4).filter((x): x is string => !!x))].sort();
  const reminderIds = group.map((c) => c.reminderId).filter((x): x is string => !!x);
  const spends = reminderIds.flatMap((id) => {
    const r = reminders.find((x) => x.id === id);
    return (r?.spendEvents || []).filter((e) => !spendIsIgnored(e, r?.ignoredSpendKeys));
  });
  const primary =
    [...group].sort((a, b) => {
      const score = (c: CreditCardView) =>
        (c.statementDate ? 2 : 0) + (c.dueDate ? 2 : 0) + ((c.totalDue || 0) > 0.009 ? 4 : 0);
      const delta = score(b) - score(a);
      if (delta) return delta;
      if (a.paid !== b.paid) return a.paid ? 1 : -1;
      return 0;
    })[0] || group[0];
  return {
    ...primary,
    last4: last4s[0] || primary.last4,
    last4s,
    reminderIds,
    paid: group.every((c) => c.paid) && ((primary.totalDue || 0) > 0.009 || (primary.remaining || 0) > 0.009),
    needsStatementDate: group.every((c) => c.needsStatementDate),
    needsDueDate: group.every((c) => c.needsDueDate),
    needsAmount: group.every(
      (c) => (c.totalDue || 0) <= 0.009 && (c.remaining || 0) <= 0.009,
    ),
    unbilledExpenses: unbilledOnCard(
      transactions,
      { last4: last4s[0] || null, last4s, issuer: primary.issuer },
      spends,
      primary.spendFrom,
      primary.spendTo || today,
    ),
  };
}

function mergeSharedStatementCards(
  cards: CreditCardView[],
  reminders: ExpenseReminder[],
  transactions: Transaction[],
  today: string,
): CreditCardView[] {
  const byId = new Map(reminders.filter((r) => r.source === 'card-bill').map((r) => [r.id, r]));
  const reminderOf = (card: CreditCardView) =>
    byId.get(card.reminderId || '') ||
    (card.reminderIds || []).map((id) => byId.get(id)).find(Boolean);

  const sharedBuckets = new Map<string, CreditCardView[]>();
  const rest: CreditCardView[] = [];
  for (const card of cards) {
    const reminder = reminderOf(card);
    if (reminder?.sharedCreditLimit === true) {
      const key = `limit|${issuerSlug(card.issuer)}`;
      const group = sharedBuckets.get(key) || [];
      group.push(card);
      sharedBuckets.set(key, group);
    } else {
      rest.push(card);
    }
  }

  const mergedShared = [...sharedBuckets.values()].map((group) =>
    collapseCardGroup(group, reminders, transactions, today),
  );

  const groups = new Map<string, CreditCardView[]>();
  const singles: CreditCardView[] = [];
  for (const card of rest) {
    const reminder = reminderOf(card);
    if (reminder?.sharedCreditLimit === false) {
      singles.push(card);
      continue;
    }
    const key = sharedStatementKey(card);
    if (!key) {
      singles.push(card);
      continue;
    }
    const group = groups.get(key) || [];
    group.push(card);
    groups.set(key, group);
  }
  const merged: CreditCardView[] = [];
  for (const group of groups.values()) {
    merged.push(collapseCardGroup(group, reminders, transactions, today));
  }
  return [...mergedShared, ...merged, ...singles];
}

const MONTH_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function remindersForCardView(
  card: CreditCardView,
  reminders: ExpenseReminder[],
): ExpenseReminder[] {
  const ids = new Set([card.reminderId, ...(card.reminderIds || [])].filter(Boolean) as string[]);
  return reminders.filter((r) => ids.has(r.id));
}

export function mergedReminderForCard(
  card: CreditCardView,
  reminders: ExpenseReminder[],
): ExpenseReminder | undefined {
  const rs = remindersForCardView(card, reminders);
  if (!rs.length) return undefined;
  if (rs.length === 1) return rs[0];
  return {
    ...rs[0],
    spendEvents: rs.flatMap((r) => r.spendEvents || []),
    billEvents: rs.flatMap((r) => r.billEvents || []),
    ignoredSpendKeys: [...new Set(rs.flatMap((r) => r.ignoredSpendKeys || []))],
    manualPayments: rs[0].manualPayments,
  };
}

export function openCardBillCount(cards: CreditCardView[]): number {
  return cards.filter((c) => !c.paid && (c.remaining || 0) > 0).length;
}

export function cardsMissingCycleDates(cards: CreditCardView[]): CreditCardView[] {
  return cards.filter((c) => c.needsStatementDate);
}

export function formatCardDueShort(iso?: string | null): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const day = Number(iso.slice(8, 10));
  const month = Number(iso.slice(5, 7));
  if (!day || !month) return null;
  return `${day} ${MONTH_SHORT[month - 1]}`;
}
