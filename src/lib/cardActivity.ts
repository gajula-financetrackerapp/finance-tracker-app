import type { ExpenseReminder, Transaction } from '../types';
import { CARD_BILL_CATEGORY } from '../cashBooks';
import { addMonthsIso } from './importRules/parseDueNotice';
import {
  collectCardBillEvents,
  effectiveCardDueDate,
  effectiveCardStatementDate,
  identitiesMatch,
  storedEventBelongsToCard,
  textBelongsToCard,
  txnNoteFitsCard,
  type CardBillPaymentEvent,
  type CardSpendEvent,
} from './cardBills';
import type { CardDueNotice } from './importRules/parseDueNotice';
import type { CreditCardView } from './cardFaces';
import type { RawImportMessage } from './importRules/parseImportText';

export type CardActivityKind = 'statement' | 'expenses';

export type CardActivityRow = {
  id: string;
  channel: 'sms' | 'txn';
  source: 'spend' | 'statement' | 'due' | 'payment' | 'expense' | 'income' | 'transfer';
  date: string;
  amount: number;
  text: string;
};

function inRange(day: string, from: string | null, to: string | null): boolean {
  const d = (day || '').slice(0, 10);
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function cardOf(card: CreditCardView, reminder?: ExpenseReminder) {
  return {
    last4: card.last4 || reminder?.cardLast4 || null,
    issuer: card.issuer || reminder?.cardIssuer || null,
    cardKey: reminder?.cardKey,
  };
}

function eventFitsCard(
  event: { last4?: string | null; issuer?: string | null; body?: string },
  card: CreditCardView,
  reminder?: ExpenseReminder,
): boolean {
  const identity = cardOf(card, reminder);
  if (event.last4 || event.issuer) return identitiesMatch(event, identity);
  if (event.body) return textBelongsToCard(event.body, identity);
  return false;
}

function txnFitsCard(
  txn: Transaction,
  card: CreditCardView,
  reminder?: ExpenseReminder,
): boolean {
  const identity = cardOf(card, reminder);
  return txnNoteFitsCard(`${txn.note || ''} ${txn.itemName || ''}`, identity, {
    day: (txn.date || '').slice(0, 10),
    amount: Number(txn.amount),
    spends: reminder?.spendEvents,
  });
}

function sameSpendKey(row: Pick<CardActivityRow, 'date' | 'amount'>): string {
  return `${row.date.slice(0, 10)}|${Math.round((Math.abs(row.amount) || 0) * 100)}`;
}

function dedupeSmsAndTxn(rows: CardActivityRow[]): CardActivityRow[] {
  const smsKeys = new Set(
    rows.filter((r) => r.channel === 'sms').map((r) => sameSpendKey(r)),
  );
  return rows.filter((r) => r.channel === 'sms' || !smsKeys.has(sameSpendKey(r)));
}

function billedWindow(
  reminder: ExpenseReminder | undefined,
  card: CreditCardView,
): { from: string | null; to: string | null } {
  const stmt =
    (reminder ? effectiveCardStatementDate(reminder) : null) || card.statementDate;
  const due =
    (reminder ? effectiveCardDueDate(reminder) : null) || card.dueDate;
  const to = stmt || due;
  if (stmt) return { from: addMonthsIso(stmt, -1), to: stmt };
  if (due) return { from: addMonthsIso(due, -1), to: due };
  return { from: null, to: null };
}

function unbilledWindow(card: CreditCardView): { from: string | null; to: string | null } {
  return { from: card.spendFrom, to: card.spendTo };
}

export function listCardAmountActivity(opts: {
  kind: CardActivityKind;
  card: CreditCardView;
  reminder?: ExpenseReminder;
  transactions: Transaction[];
  notices?: CardDueNotice[];
  payments?: CardBillPaymentEvent[];
  spends?: CardSpendEvent[];
}): CardActivityRow[] {
  const { kind, card, reminder, transactions } = opts;
  const window = kind === 'expenses' ? unbilledWindow(card) : billedWindow(reminder, card);
  const rows: CardActivityRow[] = [];
  const seen = new Set<string>();

  const push = (row: CardActivityRow) => {
    const key = `${row.channel}|${row.date}|${Math.round(row.amount * 100)}|${(row.text || '')
      .slice(0, 24)
      .toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(row);
  };

  const identity = cardOf(card, reminder);
  const spends = [
    ...(reminder?.spendEvents || []).filter((e) => storedEventBelongsToCard(e, identity)),
    ...(opts.spends || [])
      .filter((s) => eventFitsCard(s, card, reminder))
      .map((s) => ({
        amount: s.amount,
        date: s.date,
        fingerprint: s.fingerprint,
        body: s.body,
        last4: s.last4,
        issuer: s.issuer,
      })),
  ];
  for (const e of spends) {
    if (!inRange(e.date, window.from, window.to) && (window.from || window.to)) continue;
    push({
      id: `sms-spend-${e.fingerprint}`,
      channel: 'sms',
      source: 'spend',
      date: e.date,
      amount: e.amount,
      text: e.body || '',
    });
  }

  if (kind === 'statement') {
    const bills = [
      ...(reminder?.billEvents || []),
      ...(opts.notices || [])
        .filter((n) => eventFitsCard({ last4: n.last4, issuer: n.issuer, body: n.body }, card, reminder))
        .map((n) => ({
          kind: (n.role === 'statement' ? 'statement' : 'due') as 'statement' | 'due',
          amount: n.totalDue ?? 0,
          date: n.statementDate || n.smsDate,
          fingerprint: n.fingerprint,
          body: n.body,
        })),
      ...(opts.payments || [])
        .filter((p) => eventFitsCard(p, card, reminder))
        .map((p) => ({
          kind: 'payment' as const,
          amount: p.amount,
          date: p.date,
          fingerprint: p.fingerprint,
          body: p.body,
        })),
    ];
    for (const e of bills) {
      if (!inRange(e.date, window.from, window.to) && (window.from || window.to)) {
        if (e.kind !== 'statement' && e.kind !== 'due') continue;
      }
      push({
        id: `sms-bill-${e.fingerprint}`,
        channel: 'sms',
        source: e.kind,
        date: e.date,
        amount: e.amount,
        text: e.body || '',
      });
    }
  }

  for (const txn of transactions) {
    if (!txnFitsCard(txn, card, reminder)) continue;
    const day = (txn.date || '').slice(0, 10);
    if (!inRange(day, window.from, window.to) && (window.from || window.to)) continue;
    const isBill =
      txn.category === CARD_BILL_CATEGORY || txn.kind === 'transfer' || txn.kind === 'income';
    if (kind === 'expenses') {
      if (txn.kind !== 'expense' || txn.category === CARD_BILL_CATEGORY) continue;
    } else if (kind === 'statement' && txn.kind === 'expense' && txn.category === CARD_BILL_CATEGORY) {
      // bill payment posted as income/transfer is included below
    }
    if (kind === 'expenses' && isBill) continue;
    push({
      id: `txn-${txn.id}`,
      channel: 'txn',
      source:
        txn.kind === 'transfer'
          ? 'transfer'
          : txn.kind === 'income' || txn.category === CARD_BILL_CATEGORY
            ? 'payment'
            : 'expense',
      date: day,
      amount: Math.abs(Number(txn.amount)) || 0,
      text: txn.note || txn.itemName || txn.category,
    });
  }

  return dedupeSmsAndTxn(rows).sort((a, b) =>
    a.date === b.date ? b.amount - a.amount : b.date.localeCompare(a.date),
  );
}

export function listCardAmountActivityFromMessages(
  kind: CardActivityKind,
  card: CreditCardView,
  reminder: ExpenseReminder | undefined,
  transactions: Transaction[],
  messages: RawImportMessage[],
  extractAmount: (body: string) => number | null,
  extractDate: (body: string, fallback?: number | string) => string,
): CardActivityRow[] {
  const extra = collectCardBillEvents(messages, transactions, extractAmount, extractDate);
  return listCardAmountActivity({
    kind,
    card,
    reminder,
    transactions,
    notices: extra.notices,
    payments: extra.payments,
    spends: extra.spends,
  });
}
