import type { Account, ExpenseReminder, Transaction } from '../types';
import { CARD_BILL_CATEGORY, isCoreCardAccount } from '../cashBooks';
import { todayStr } from '../utils';
import {
  effectiveCardDueDate,
  effectiveCardStatementDate,
  missingCardCycleDates,
} from './cardBills';
import { extractCardLast4, issuerSlug } from './importRules/parseDueNotice';

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
};

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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
  accountId: string | undefined,
  last4: string | null | undefined,
): boolean {
  if (txn.kind !== 'expense') return false;
  if (txn.category === CARD_BILL_CATEGORY) return false;
  const dayAccount = accountId && txn.accountId === accountId;
  const noteLast4 = last4 && (extractCardLast4(txn.note || '') === last4 || (txn.note || '').includes(last4));
  return !!(dayAccount || noteLast4);
}

function unbilledOnCard(
  transactions: Transaction[],
  accountId: string | undefined,
  last4: string | null | undefined,
  events: { amount: number; date: string; fingerprint: string }[] | undefined,
  from: string | null,
  to: string,
): number {
  if (!from) return 0;
  const seen = new Set<string>();
  let sum = 0;
  for (const e of events || []) {
    if (e.date < from || e.date > to) continue;
    const key = `${e.date}|${Math.round(e.amount * 100)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sum += Math.abs(e.amount) || 0;
  }
  for (const txn of transactions) {
    if (!txnMatchesCard(txn, accountId, last4)) continue;
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
> {
  if (!reminder) return emptyCycle(today);
  const lastGen = effectiveCardStatementDate(reminder);
  const stated = hasLiveStatement(reminder, today);
  const spendFrom = lastGen ? addDaysIso(lastGen, 1) : null;
  const missing = missingCardCycleDates(reminder);
  return {
    phase: stated ? 'stated' : 'waiting',
    statementDate: lastGen,
    nextStatementDate: stated ? null : nextStatementGenDate(lastGen, today),
    spendFrom,
    spendTo: today,
    unbilledExpenses: unbilledOnCard(
      transactions,
      accountId,
      reminder.cardLast4,
      reminder.spendEvents,
      spendFrom,
      today,
    ),
    needsStatementDate: missing.needStatement,
    needsDueDate: missing.needDue,
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
  const bills = reminders.filter((r) => r.source === 'card-bill');
  const cards = accounts.filter((a) => !a.excluded && isCoreCardAccount(a));
  const used = new Set<string>();
  const out: CreditCardView[] = [];

  for (const r of bills) {
    const account = cards.find((a) => accountMatchesReminder(a, r));
    if (account) used.add(account.id);
    const cycle = cycleForReminder(r, account?.id, transactions, today);
    out.push({
      id: r.id,
      issuer: r.cardIssuer || r.name.replace(/\s+Card.*$/i, '') || 'Card',
      last4: r.cardLast4 || null,
      remaining: r.paid ? 0 : r.amount,
      totalDue: r.totalDue ?? r.amount,
      minDue: r.minDue ?? null,
      dueDate: effectiveCardDueDate(r),
      paid: !!r.paid,
      reminderId: r.id,
      accountId: account?.id,
      ...cycle,
    });
  }

  for (const account of cards) {
    if (used.has(account.id)) continue;
    if (bills.length === 1 && cards.length === 1) {
      out[0].accountId = account.id;
      const cycle = cycleForReminder(
        bills[0],
        account.id,
        transactions,
        today,
      );
      Object.assign(out[0], cycle);
      used.add(account.id);
      continue;
    }
    out.push({
      id: account.id,
      issuer: account.name || 'Card',
      last4: null,
      remaining: null,
      totalDue: null,
      minDue: null,
      dueDate: null,
      paid: false,
      accountId: account.id,
      ...emptyCycle(today),
    });
  }

  return out.sort((a, b) => {
    if (a.phase !== b.phase) return a.phase === 'stated' ? -1 : 1;
    return (a.dueDate || a.nextStatementDate || '9999').localeCompare(
      b.dueDate || b.nextStatementDate || '9999',
    );
  });
}

const MONTH_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function openCardBillCount(cards: CreditCardView[]): number {
  return cards.filter((c) => !c.paid && (c.remaining || 0) > 0).length;
}

export function cardsMissingCycleDates(cards: CreditCardView[]): CreditCardView[] {
  return cards.filter((c) => c.needsStatementDate || c.needsDueDate);
}

export function formatCardDueShort(iso?: string | null): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const day = Number(iso.slice(8, 10));
  const month = Number(iso.slice(5, 7));
  if (!day || !month) return null;
  return `${day} ${MONTH_SHORT[month - 1]}`;
}
