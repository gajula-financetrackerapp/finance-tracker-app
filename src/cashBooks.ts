import { CashBook, CashBooksState, FinanceState, Transaction } from './types';
import { uid } from './utils';
import {
  accountBalance,
  accountOpening,
  accountTxnNet,
  reconcileAccountBalances,
} from './utils/accountBalance';

export const CASH_BOOK_ICONS = ['📒', '💼', '🏠', '✈️', '👨‍👩‍👧', '🛒', '🎓', '💪', '🚗', '💰'];

/** Stable id for the default Personal book — never regenerate on each normalize. */
export const PERSONAL_BOOK_ID = 'book_personal';

function financeDataScore(finance: FinanceState): number {
  return (
    (finance.transactions?.length || 0) * 1000 +
    (finance.categoryBudgets?.length || 0) * 10 +
    (finance.accounts || []).filter((a) => a.amount !== 0).length
  );
}

function isAutoPersonalBookName(name: string): boolean {
  const n = (name || '').trim().toLowerCase();
  return n === 'personal' || n === 'default' || n === '';
}

/** Merge secondary finance into primary (txn/budget/account union). */
export function mergeFinanceStates(primary: FinanceState, secondary: FinanceState): FinanceState {
  const accounts = [...(primary.accounts || [])];
  const accountIdMap = new Map<string, string>();
  for (const sa of secondary.accounts || []) {
    const key = sa.name.trim().toLowerCase();
    const match =
      accounts.find(
        (a) => a.name.trim().toLowerCase() === key && (a.type || '') === (sa.type || ''),
      ) || accounts.find((a) => a.name.trim().toLowerCase() === key);
    if (match) accountIdMap.set(sa.id, match.id);
    else {
      accounts.push(sa);
      accountIdMap.set(sa.id, sa.id);
    }
  }

  const remapId = (id?: string) => (id ? accountIdMap.get(id) || id : id);
  const primaryTxnIds = new Set(primary.transactions.map((t) => t.id));
  const extraTxns = (secondary.transactions || [])
    .filter((t) => !primaryTxnIds.has(t.id))
    .map((t) => ({
      ...t,
      accountId: remapId(t.accountId),
      fromAccountId: remapId(t.fromAccountId),
      toAccountId: remapId(t.toAccountId),
    }));

  const budgetKeys = new Set(
    (primary.categoryBudgets || []).map((b) => `${b.month}::${b.category}`),
  );
  const extraBudgets = (secondary.categoryBudgets || []).filter(
    (b) => !budgetKeys.has(`${b.month}::${b.category}`),
  );

  return normalizeFinanceState({
    accounts,
    transactions: [...primary.transactions, ...extraTxns],
    budget: Math.max(primary.budget || 0, secondary.budget || 0),
    categoryBudgets: [...(primary.categoryBudgets || []), ...extraBudgets],
    defaultAccountId: primary.defaultAccountId || secondary.defaultAccountId,
  });
}

/**
 * Collapse duplicate Personal/Default books created by unstable legacy ids.
 * Keeps intentionally named books (Business, Trip, …) as separate notebooks.
 */
export function consolidateCashBooks(
  state: CashBooksState,
  currency = 'INR',
): CashBooksState {
  if (!state.books.length) return defaultCashBooks(currency);

  const personalish = state.books.filter((b) => isAutoPersonalBookName(b.name));
  const others = state.books.filter((b) => !isAutoPersonalBookName(b.name));

  let books: CashBook[];

  if (personalish.length === 0) {
    books = [...others];
  } else if (personalish.length === 1) {
    const only = personalish[0];
    books = [
      {
        ...only,
        id: PERSONAL_BOOK_ID,
        name: 'Personal',
      },
      ...others,
    ];
  } else {
    const ranked = [...personalish].sort(
      (a, b) => financeDataScore(b.finance) - financeDataScore(a.finance),
    );
    let mergedFinance = ranked[0].finance;
    for (const extra of ranked.slice(1)) {
      mergedFinance = mergeFinanceStates(mergedFinance, extra.finance);
    }
    books = [
      {
        ...ranked[0],
        id: PERSONAL_BOOK_ID,
        name: 'Personal',
        icon: ranked[0].icon || '📒',
        archived: false,
        finance: mergedFinance,
      },
      ...others,
    ];
  }

  if (!books.length) return defaultCashBooks(currency);

  const byId = new Map(books.map((b) => [b.id, b]));
  let activeBookId = state.activeBookId;
  const active = byId.get(activeBookId);
  if (!active || active.archived || !bookHasData(active)) {
    const preferred =
      [...books]
        .filter((b) => !b.archived)
        .sort((a, b) => financeDataScore(b.finance) - financeDataScore(a.finance))[0] || books[0];
    activeBookId = preferred.id;
  }

  return { books, activeBookId };
}

/** Book id that should receive Split / auto-posted finance (richest non-archived). */
export function preferredFinanceBookId(state: CashBooksState): string {
  const ranked = [...state.books]
    .filter((b) => !b.archived)
    .sort((a, b) => financeDataScore(b.finance) - financeDataScore(a.finance));
  return ranked[0]?.id || state.activeBookId || PERSONAL_BOOK_ID;
}

/** Normalize + migrate opening balances + backfill accountIds + sync live amounts. */
export function normalizeFinanceState(
  raw: Partial<FinanceState> | null | undefined,
  fallbackCurrency = 'INR',
): FinanceState {
  return reconcileAccountBalances(normalizeFinanceStateRaw(raw, fallbackCurrency));
}

export const CORE_BANK_NAME = 'Bank/Cash/Debit Card';
export const CORE_CARD_NAME = 'Credit Card';

/** Category on the transfer that settles a card bill, wherever it is booked from. */
export const CARD_BILL_CATEGORY = 'Credit Card Bill';

/**
 * How far apart the bank's debit and the card's "payment received" may sit and
 * still be the same bill. The bank posts at once; issuers can take the better
 * part of a week to acknowledge the credit, and a pair missed that way lands
 * twice — the bank emptied twice and the card credited twice.
 */
export const CARD_BILL_LEG_DAYS = 6;

/**
 * Core accounts are matched by type first, with names kept only as aliases for
 * books saved under older labels. Matching on the name alone is a trap now that
 * the bank is called "…Debit Card" — a loose /card/ test would capture it and
 * send credit-card spends to the wrong account.
 */
const BANK_ALIASES = new Set([
  'bank',
  'bank/cash/debit card',
  'bank / cash / debit card',
  'bank/cash/debit-card',
]);
const CARD_ALIASES = new Set(['card', 'credit card', 'cr.card', 'cr card', 'creditcard']);

const nameKeyOf = (a: { name?: string }) => (a.name || '').trim().toLowerCase();
const typeKeyOf = (a: { type?: string }) => (a.type || '').trim().toLowerCase();

export function isCoreBankAccount(a: { name?: string; type?: string }): boolean {
  if (CARD_ALIASES.has(nameKeyOf(a))) return false;
  return typeKeyOf(a) === 'bank' || BANK_ALIASES.has(nameKeyOf(a));
}

export function isCoreCardAccount(a: { name?: string; type?: string }): boolean {
  if (BANK_ALIASES.has(nameKeyOf(a))) return false;
  return typeKeyOf(a) === 'card' || CARD_ALIASES.has(nameKeyOf(a));
}

/** Ids of every credit card, for spotting money paid towards a card. */
export function creditCardAccountIds(accounts: { id: string; name?: string; type?: string }[]): Set<string> {
  return new Set(accounts.filter(isCoreCardAccount).map((a) => a.id));
}

/**
 * A bill payment is a transfer onto a card, and unlike moving money between
 * your own accounts it settles a debt — so it counts as money out of the
 * account that paid it. The spends it clears stay counted against the card's
 * limit rather than as expenses, so nothing is counted twice.
 */
export function isCardBillTransfer(txn: Transaction, cardIds: Set<string>): boolean {
  if (txn.kind !== 'transfer') return false;
  if (!txn.toAccountId || !cardIds.has(txn.toAccountId)) return false;
  return !!txn.fromAccountId && !cardIds.has(txn.fromAccountId);
}

/**
 * The money side of a period: what came in and went out of the accounts that
 * hold real money, card bills included. A card spend is deliberately absent —
 * it belongs to the limit figures below, so each rupee is counted once and the
 * two sets of figures add up to everything spent.
 */
export function bankSideTotals(
  accounts: FinanceState['accounts'],
  transactions: Transaction[],
  inPeriod: (txn: Transaction) => boolean,
): { expenses: number; income: number; balance: number } {
  const cardIds = creditCardAccountIds(accounts);
  const bankIds = new Set(
    accounts.filter((a) => !a.excluded && !cardIds.has(a.id)).map((a) => a.id),
  );
  let expenses = 0;
  let income = 0;
  for (const txn of transactions) {
    if (!inPeriod(txn)) continue;
    if (txn.kind === 'expense') {
      if (txn.accountId && bankIds.has(txn.accountId)) expenses += txn.amount;
    } else if (txn.kind === 'income') {
      if (txn.accountId && bankIds.has(txn.accountId)) income += txn.amount;
    } else if (isCardBillTransfer(txn, cardIds)) {
      // Settling the card empties the bank just like a spend does.
      if (txn.fromAccountId && bankIds.has(txn.fromAccountId)) expenses += txn.amount;
    }
  }
  return { expenses, income, balance: income - expenses };
}

/**
 * Limit figures across every credit card, not just the default one — a limit
 * set on a second card would otherwise read as zero. The limit lives in the
 * opening balance, so the balance is what is left of it. These are running
 * totals: a limit is not a month of cash flow.
 *
 * Two cases have no limit to measure against. When none was entered and the
 * card is in credit — a bill paid for spends the app never saw — that credit is
 * the only headroom known, so it reads as the limit instead of as a negative
 * amount used. And however the numbers fall, used never goes below zero: owing
 * less than nothing is not a thing.
 *
 * Credit the card was carrying when its limit was entered is held aside, since
 * a real limit replaces that guess at the headroom rather than stacking on top
 * of it: with nothing spent, available reads as the limit and not as more.
 */
export function cardLimitFigures(
  card: FinanceState['accounts'][number],
  transactions: Transaction[],
): { total: number; used: number; available: number } {
  const limit = accountOpening(card, transactions);
  const available = accountBalance(card, transactions) - creditHeldAside(card);
  const total = limit > 0 ? limit : Math.max(0, available);
  return { total, used: Math.max(0, total - available), available };
}

function creditHeldAside(card: FinanceState['accounts'][number]): number {
  const held = Number(card.creditBeforeLimit) || 0;
  return held > 0 ? held : 0;
}

/**
 * The credit to hold aside when a limit is entered: whatever the card is in
 * credit by at that moment. Anything it owes is left alone, because that is
 * real spending the new limit has to show as used.
 */
export function creditToHoldAside(
  card: FinanceState['accounts'][number],
  transactions: Transaction[],
): number {
  return Math.max(0, accountTxnNet(transactions, card.id));
}

export type CardLimitAudit = {
  total: number;
  used: number;
  available: number;
  /** The limit as entered, or zero where none ever was. */
  limit: number;
  credits: number;
  charges: number;
  /** Of that credit, what the limit replaced rather than added to. */
  heldAside: number;
  /** Credit the card holds that no spend of its own answers for. */
  unexplained: number;
  /** What put the credit there, newest first. */
  creditRows: {
    id: string;
    date: string;
    amount: number;
    label: string;
    /** Another credit of the same amount sits a bill's window away from this one. */
    maybeDuplicate: boolean;
  }[];
};

/**
 * The workings behind a card's figures, for when the available limit reads
 * higher than the total and the reason is not obvious. Available is the balance
 * of the card, so it can only exceed the limit when the card has been credited
 * more than it has been charged — usually a bill counted twice, or spends that
 * never reached the card.
 */
export function cardLimitAudit(
  card: FinanceState['accounts'][number],
  transactions: Transaction[],
): CardLimitAudit {
  const figures = cardLimitFigures(card, transactions);
  let credits = 0;
  let charges = 0;
  const creditRows: CardLimitAudit['creditRows'] = [];

  for (const txn of transactions) {
    const amount = Math.abs(txn.amount) || 0;
    const arrives =
      txn.kind === 'transfer'
        ? txn.toAccountId === card.id
        : txn.kind === 'income' && txn.accountId === card.id;
    const leaves =
      txn.kind === 'transfer'
        ? txn.fromAccountId === card.id
        : txn.kind === 'expense' && txn.accountId === card.id;
    if (arrives) {
      credits += amount;
      creditRows.push({
        id: txn.id,
        date: txn.date,
        amount,
        label: (txn.note || txn.category || '').trim(),
        maybeDuplicate: false,
      });
    } else if (leaves) {
      charges += amount;
    }
  }

  for (const row of creditRows) {
    row.maybeDuplicate = creditRows.some(
      (other) =>
        other.id !== row.id &&
        other.amount === row.amount &&
        datesWithin(other.date, row.date, CARD_BILL_LEG_DAYS),
    );
  }
  creditRows.sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount);

  return {
    ...figures,
    limit: Math.max(0, accountOpening(card, transactions)),
    credits,
    charges,
    heldAside: creditHeldAside(card),
    unexplained: Math.max(0, figures.available - figures.total),
    creditRows,
  };
}

export function creditCardLimits(
  accounts: FinanceState['accounts'],
  transactions: Transaction[],
): { total: number; used: number; available: number; count: number } {
  const cards = accounts.filter((a) => !a.excluded && isCoreCardAccount(a));
  let total = 0;
  let used = 0;
  let available = 0;
  for (const card of cards) {
    const one = cardLimitFigures(card, transactions);
    total += one.total;
    used += one.used;
    available += one.available;
  }
  return { total, used, available, count: cards.length };
}

export function isCashAccount(a: { name?: string }): boolean {
  return nameKeyOf(a) === 'cash';
}

function makeAccount(
  name: 'Bank' | 'Card',
  currency: string,
): FinanceState['accounts'][number] {
  if (name === 'Card') {
    return {
      id: uid(),
      name: CORE_CARD_NAME,
      type: 'Card',
      currency,
      amount: 0,
      openingBalance: 0,
      icon: '💳',
      excluded: false,
    };
  }
  return {
    id: uid(),
    name: CORE_BANK_NAME,
    type: 'Bank',
    currency,
    amount: 0,
    openingBalance: 0,
    icon: '🏦',
    excluded: false,
  };
}

function starterAccounts(currency: string): FinanceState['accounts'] {
  return [makeAccount('Bank', currency), makeAccount('Card', currency)];
}

/** Only the account named Cash — never Card/Wallet/etc. */
function cashAccountId(accounts: FinanceState['accounts']): string | undefined {
  return accounts.find((a) => isCashAccount(a) && !a.excluded)?.id;
}

/** The core bank account: exact name wins, so a custom "Bank" type can't shadow it. */
export function bankAccountId(accounts: FinanceState['accounts']): string | undefined {
  const active = accounts.filter((a) => !a.excluded);
  return (
    active.find((a) => BANK_ALIASES.has(nameKeyOf(a)))?.id ||
    active.find(isCoreBankAccount)?.id
  );
}

/** The core credit-card account: exact name wins over any other Card-type account. */
export function cardAccountId(accounts: FinanceState['accounts']): string | undefined {
  const active = accounts.filter((a) => !a.excluded);
  return (
    active.find((a) => CARD_ALIASES.has(nameKeyOf(a)))?.id ||
    active.find(isCoreCardAccount)?.id
  );
}

function normalizeFinanceStateRaw(
  raw: Partial<FinanceState> | null | undefined,
  fallbackCurrency = 'INR',
): FinanceState {
  const rawAccounts = Array.isArray(raw?.accounts) ? raw!.accounts! : [];
  // Names already spelled the standard way. An account you added yourself and
  // called something like "Cr.Card" must not be relabelled onto one of these, or
  // you would end up with two accounts wearing the same name.
  const taken = new Set<string>(
    rawAccounts
      .map((a) => (a.name || '').trim())
      .filter((n) => n === CORE_BANK_NAME || n === CORE_CARD_NAME),
  );
  const claim = (canonical: string) => {
    if (taken.has(canonical)) return false;
    taken.add(canonical);
    return true;
  };
  let accounts =
    rawAccounts.length > 0
      ? rawAccounts.map((a) => {
          const n = (a.name || '').trim().toLowerCase();
          // Canonicalise the core accounts, which also renames books saved under
          // the older "Bank" / "Card" labels.
          if (n === 'cash') {
            return { ...a, name: 'Cash', type: 'Cash', icon: '💵' };
          }
          if (BANK_ALIASES.has(n) && claim(CORE_BANK_NAME)) {
            return { ...a, name: CORE_BANK_NAME, type: 'Bank', icon: '🏦' };
          }
          if (CARD_ALIASES.has(n) && claim(CORE_CARD_NAME)) {
            return { ...a, name: CORE_CARD_NAME, type: 'Card', icon: a.icon || '💳' };
          }
          return a;
        })
      : starterAccounts(fallbackCurrency);

  const currency = accounts[0]?.currency || fallbackCurrency;
  // Look for the core accounts by type, not by name. Asking for the stock names
  // would miss a bank you renamed to "HDFC" and hand you a second bank on every
  // load, so the rename would look like it never took.
  const hasBank = accounts.some(isCoreBankAccount);
  const hasCard = accounts.some(isCoreCardAccount);
  // Core accounts: Bank, Card — then any extras. Cash is no longer forced, so a
  // deleted Cash account stays deleted.
  if (!hasBank) accounts = [makeAccount('Bank', currency), ...accounts];
  if (!hasCard) accounts = [...accounts, makeAccount('Card', currency)];

  const defaultAccountId = bankAccountId(accounts) || cashAccountId(accounts) || accounts[0]?.id;

  return {
    accounts,
    transactions: Array.isArray(raw?.transactions) ? raw!.transactions! : [],
    budget: typeof raw?.budget === 'number' && !Number.isNaN(raw.budget) ? raw.budget : 0,
    categoryBudgets: Array.isArray(raw?.categoryBudgets) ? raw!.categoryBudgets! : [],
    defaultAccountId,
  };
}

/** Why an account cannot be removed, or null when it can. */
export type AccountDeleteBlock = 'lastBank' | 'lastCard' | 'lastAccount' | null;

/**
 * One bank and one credit card have to be left standing, whatever they are
 * called — the bank receives salary and UPI, the card keeps card spends out of
 * it. Spares are fair game, so with two banks either one can go.
 */
export function accountDeleteBlock(
  accounts: FinanceState['accounts'],
  id: string,
): AccountDeleteBlock {
  const target = accounts.find((a) => a.id === id);
  if (!target) return null;
  const survives = (test: (a: FinanceState['accounts'][number]) => boolean) =>
    accounts.some((a) => a.id !== id && !a.excluded && test(a));
  if (isCoreBankAccount(target) && !survives(isCoreBankAccount)) return 'lastBank';
  if (isCoreCardAccount(target) && !survives(isCoreCardAccount)) return 'lastCard';
  if (accounts.length <= 1) return 'lastAccount';
  return null;
}

/**
 * The account already using this name, ignoring case and stray spaces. Pass the
 * id being saved so renaming an account to the name it already has is fine.
 * A hit means the save is refused: one name belongs to one account.
 */
export function accountNameClash<T extends { id: string; name: string }>(
  accounts: T[],
  name: string,
  selfId?: string,
): T | undefined {
  const key = (name || '').trim().toLowerCase();
  if (!key) return undefined;
  return accounts.find((a) => a.id !== selfId && (a.name || '').trim().toLowerCase() === key);
}

/** Label for account chips: "🏦 Bank", "💵 Cash", or "Bank-HDFC" for custom accounts. */
export function accountChipLabel(account: { name: string; type?: string; icon?: string }): string {
  const name = (account.name || '').trim() || 'Account';
  const type = (account.type || '').trim();
  const nameKey = name.toLowerCase();
  // Core accounts: fixed symbol + name (never "Bank-Cash").
  if (BANK_ALIASES.has(nameKey)) return `🏦 ${name}`;
  if (nameKey === 'cash') return `💵 ${name}`;
  if (CARD_ALIASES.has(nameKey)) return `💳 ${name}`;
  const icon = account.icon ? `${account.icon} ` : '';
  if (!type || type.toLowerCase() === nameKey) {
    return `${icon}${name}`;
  }
  return `${icon}${type}-${name}`;
}

/** New income / fallback account — prefer Bank (then Cash). */
export function resolveDefaultAccountId(finance: FinanceState): string | undefined {
  return (
    bankAccountId(finance.accounts) ||
    cashAccountId(finance.accounts) ||
    finance.defaultAccountId ||
    finance.accounts[0]?.id
  );
}

/** Paid with (expenses / groceries) defaults to Bank. */
export function resolvePaidWithAccountId(finance: FinanceState): string | undefined {
  return resolveDefaultAccountId(finance);
}

/** Stable display order: Bank, Cash, Card, then the rest (by name, not type). */
export function sortAccountsForDisplay<T extends { name: string; type?: string }>(
  accounts: T[],
): T[] {
  const rank = (a: T) => {
    const n = a.name.trim().toLowerCase();
    if (BANK_ALIASES.has(n)) return 0;
    if (n === 'cash') return 1;
    if (CARD_ALIASES.has(n)) return 2;
    return 3;
  };
  return [...accounts].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export function defaultCashBooks(currency = 'INR'): CashBooksState {
  const book: CashBook = {
    id: PERSONAL_BOOK_ID,
    name: 'Personal',
    icon: '📒',
    archived: false,
    finance: normalizeFinanceState(null, currency),
  };
  return { books: [book], activeBookId: PERSONAL_BOOK_ID };
}

function isLegacyFinance(raw: unknown): raw is FinanceState {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  return Array.isArray(o.accounts) && Array.isArray(o.transactions) && !Array.isArray(o.books);
}

function isCashBooksState(raw: unknown): raw is CashBooksState {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  return Array.isArray(o.books) && typeof o.activeBookId === 'string';
}

/** Accept legacy FinanceState or CashBooksState from storage/cloud/backup. */
/**
 * Retire the old Cash account by folding it into the bank account, which now
 * covers cash too. Records move rather than vanish, and Cash's opening balance
 * is added to the bank's so the overall total is unchanged.
 */
export function mergeCashIntoBank(state: CashBooksState): {
  state: CashBooksState;
  changed: boolean;
  movedTxns: number;
} {
  let changed = false;
  let movedTxns = 0;

  const books = state.books.map((book) => {
    const fin = book.finance;
    const cash = fin.accounts.find(isCashAccount);
    if (!cash || fin.accounts.length <= 1) return book;

    const targetId = bankAccountId(fin.accounts) || fin.accounts.find((a) => a.id !== cash.id)?.id;
    if (!targetId) return book;

    const accounts = fin.accounts
      .filter((a) => a.id !== cash.id)
      .map((a) =>
        a.id === targetId
          ? {
              ...a,
              openingBalance: Number(a.openingBalance || 0) + Number(cash.openingBalance || 0),
            }
          : a,
      );

    const transactions = fin.transactions
      .map((t) => {
        if (t.kind === 'transfer') {
          const fromAccountId = t.fromAccountId === cash.id ? targetId : t.fromAccountId;
          const toAccountId = t.toAccountId === cash.id ? targetId : t.toAccountId;
          // A Cash↔Bank transfer becomes a no-op once they are one account.
          if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) return null;
          if (fromAccountId !== t.fromAccountId || toAccountId !== t.toAccountId) movedTxns += 1;
          return { ...t, fromAccountId, toAccountId };
        }
        if (t.accountId === cash.id) {
          movedTxns += 1;
          return { ...t, accountId: targetId };
        }
        return t;
      })
      .filter((t): t is NonNullable<typeof t> => t != null);

    changed = true;
    return {
      ...book,
      finance: {
        ...fin,
        accounts,
        transactions,
        defaultAccountId:
          fin.defaultAccountId === cash.id ? targetId : fin.defaultAccountId,
      },
    };
  });

  return { state: changed ? { ...state, books } : state, changed, movedTxns };
}

/** The card posts a payment days after the bank, so dates match loosely. */
function datesWithin(a: string, b: string, days: number): boolean {
  if (a === b) return true;
  const pa = Date.parse(a);
  const pb = Date.parse(b);
  if (!Number.isFinite(pa) || !Number.isFinite(pb)) return false;
  return Math.abs(pa - pb) <= days * 24 * 60 * 60 * 1000;
}

/** An imported row that was a card bill payment, whichever leg the SMS was. */
function importedCardBillLeg(txn: Transaction): boolean {
  if (!txn.importKey) return false;
  return txn.category === CARD_BILL_CATEGORY || /card bill/i.test(txn.note || '');
}

/**
 * Whether the row came from the card's own "payment received" message, read off
 * the SMS text kept in the import key. It is what tells a doubled bill from two
 * real ones: only the card sends that message, while two bank debits of the
 * same amount days apart can be two genuine payments.
 */
function fromCardsOwnSms(txn: Transaction): boolean {
  const key = txn.importKey || '';
  return (
    /credited\s+to\s+(?:your\s+)?(?:credit\s*)?card/i.test(key) ||
    /card\s+ending.{0,30}credited/i.test(key) ||
    /received\s+towards\s+(?:your\s+)?credit\s*card/i.test(key) ||
    /payment.{0,40}received.{0,40}card/i.test(key)
  );
}

/**
 * Put right the two ways an imported card bill used to land wrong.
 *
 * The bank leg once saved as a plain expense, which emptied the bank but left
 * the card still showing the spends the payment had cleared. As a transfer it
 * does both ends.
 *
 * And where the bank's message and the card's "payment received" sat further
 * apart than the importer would match, each booked on its own, so the card was
 * credited twice and read as having more headroom than its limit. The card's
 * copy goes: the bank's leg is the one that knows where the money came from.
 */
export function repairImportedCardBills(state: CashBooksState): {
  state: CashBooksState;
  changed: boolean;
  fixed: number;
  dropped: number;
} {
  let fixed = 0;
  let dropped = 0;

  const books = state.books.map((book) => {
    const fin = book.finance;
    const cardIds = creditCardAccountIds(fin.accounts);
    if (cardIds.size === 0) return book;

    const bankLegs = fin.transactions.filter(
      (t) =>
        t.kind === 'expense' &&
        importedCardBillLeg(t) &&
        !!t.accountId &&
        !cardIds.has(t.accountId),
    );
    const cardLegs = fin.transactions.filter(
      (t) =>
        t.kind === 'income' &&
        importedCardBillLeg(t) &&
        !!t.accountId &&
        cardIds.has(t.accountId),
    );
    const billTransfers = fin.transactions.filter(
      (t) => !!t.importKey && isCardBillTransfer(t, cardIds),
    );

    // Each card credit can answer for one bank leg, so two bills of the same
    // amount in one month don't both claim the same credit.
    const claimed = new Set<string>();
    const partnerFor = (leg: Transaction): Transaction | undefined => {
      const hit = cardLegs.find(
        (c) =>
          !claimed.has(c.id) &&
          Math.abs(c.amount) === Math.abs(leg.amount) &&
          datesWithin(c.date, leg.date, CARD_BILL_LEG_DAYS),
      );
      if (hit) claimed.add(hit.id);
      return hit;
    };

    // A transfer already carries both ends, so a card credit sitting beside one
    // is the same payment counted a second time.
    for (const transfer of billTransfers) partnerFor(transfer);

    const toByLeg = new Map<string, string>();
    const fallbackCardId = cardAccountId(fin.accounts) || [...cardIds][0];
    for (const leg of bankLegs) {
      const partner = partnerFor(leg);
      const to = partner?.accountId || fallbackCardId;
      if (to && to !== leg.accountId) toByLeg.set(leg.id, to);
    }

    // Both messages saved as their own transfer: the bank was emptied twice and
    // the card credited twice.
    const doubled = new Set<string>();
    for (const t of billTransfers) {
      if (!fromCardsOwnSms(t) || doubled.has(t.id)) continue;
      const twin = billTransfers.find(
        (o) =>
          o.id !== t.id &&
          !doubled.has(o.id) &&
          !fromCardsOwnSms(o) &&
          o.toAccountId === t.toAccountId &&
          Math.abs(o.amount) === Math.abs(t.amount) &&
          datesWithin(o.date, t.date, CARD_BILL_LEG_DAYS),
      );
      if (twin) doubled.add(t.id);
    }

    const drop = new Set<string>([...claimed, ...doubled]);
    if (!toByLeg.size && !drop.size) return book;
    dropped += drop.size;

    const transactions = fin.transactions
      .map((t) => {
        const to = toByLeg.get(t.id);
        if (!to) return t;
        fixed += 1;
        return {
          ...t,
          kind: 'transfer' as const,
          category: CARD_BILL_CATEGORY,
          fromAccountId: t.accountId,
          toAccountId: to,
          accountId: undefined,
        };
      })
      .filter((t) => !drop.has(t.id));

    return { ...book, finance: { ...fin, transactions } };
  });

  const changed = fixed > 0 || dropped > 0;
  return { state: changed ? { ...state, books } : state, changed, fixed, dropped };
}

/**
 * Hold aside credit that a card was already carrying before its limit was
 * typed in.
 *
 * Without a limit the app reads any credit on a card as the only headroom it
 * knows of, so that credit was showing as the total limit. Entering the real
 * limit was then adding to it instead of replacing it, and the card claimed
 * more headroom than it has. A card that owes money is untouched: that is
 * spending the limit has to show as used.
 */
export function absorbCreditBeforeLimit(state: CashBooksState): {
  state: CashBooksState;
  changed: boolean;
  cards: number;
} {
  let cards = 0;

  const books = state.books.map((book) => {
    const fin = book.finance;
    let touched = false;
    const accounts = fin.accounts.map((account) => {
      if (!isCoreCardAccount(account)) return account;
      if (typeof account.creditBeforeLimit === 'number') return account;
      if (accountOpening(account, fin.transactions) <= 0) return account;
      const held = creditToHoldAside(account, fin.transactions);
      if (held <= 0) return account;
      touched = true;
      cards += 1;
      return { ...account, creditBeforeLimit: held };
    });
    return touched ? { ...book, finance: { ...fin, accounts } } : book;
  });

  const changed = cards > 0;
  return { state: changed ? { ...state, books } : state, changed, cards };
}

export function normalizeCashBooks(
  raw: unknown,
  currency = 'INR',
): CashBooksState {
  if (isCashBooksState(raw) && raw.books.length > 0) {
    const books = raw.books.map((b, i) => ({
      id: b.id || uid(),
      name: (b.name || `Book ${i + 1}`).trim() || `Book ${i + 1}`,
      icon: b.icon || '📒',
      archived: !!b.archived,
      finance: normalizeFinanceState(b.finance, currency),
    }));
    // Starter book was briefly named Default — restore Personal.
    if (books.length === 1 && books[0].name === 'Default') {
      books[0] = { ...books[0], name: 'Personal' };
    }
    const activeBookId = books.some((b) => b.id === raw.activeBookId)
      ? raw.activeBookId
      : books.find((b) => !b.archived)?.id || books[0].id;
    return consolidateCashBooks({ books, activeBookId }, currency);
  }

  if (isLegacyFinance(raw)) {
    const book: CashBook = {
      id: PERSONAL_BOOK_ID,
      name: 'Personal',
      icon: '📒',
      archived: false,
      finance: normalizeFinanceState(raw, currency),
    };
    return { books: [book], activeBookId: PERSONAL_BOOK_ID };
  }

  return defaultCashBooks(currency);
}

export function getActiveBook(state: CashBooksState): CashBook {
  return (
    state.books.find((b) => b.id === state.activeBookId) ||
    state.books.find((b) => !b.archived) ||
    state.books[0]
  );
}

export function getActiveFinance(state: CashBooksState): FinanceState {
  return getActiveBook(state).finance;
}

export function withActiveFinance(state: CashBooksState, finance: FinanceState): CashBooksState {
  const activeId = getActiveBook(state).id;
  return {
    ...state,
    books: state.books.map((b) => (b.id === activeId ? { ...b, finance } : b)),
  };
}

export function stripBillImagesFromBooks(state: CashBooksState): CashBooksState {
  return {
    ...state,
    books: state.books.map((b) => ({
      ...b,
      finance: {
        ...b.finance,
        transactions: b.finance.transactions.map((t) => {
          const { billImageUri: _omit, ...rest } = t;
          return rest;
        }),
      },
    })),
  };
}

/**
 * Keep transactions / category budgets on or after `sinceDate` (YYYY-MM-DD).
 * When `sinceDate` is null (admin / no retention window), sync everything —
 * callers already gate Free users out of cloud push.
 */
export function filterCashBooksSince(
  state: CashBooksState,
  sinceDate: string | null,
): CashBooksState {
  if (!sinceDate) return state;
  const sinceMonth = sinceDate.slice(0, 7);
  return {
    ...state,
    books: state.books.map((b) => ({
      ...b,
      finance: {
        ...b.finance,
        transactions: b.finance.transactions.filter((t) => (t.date || '') >= sinceDate),
        categoryBudgets: (b.finance.categoryBudgets || []).filter(
          (cb) => (cb.month || '') >= sinceMonth,
        ),
      },
    })),
  };
}

/** Merge cloud (premium-era) into local without dropping older local-only txns. */
export function mergeCloudIntoLocalBooks(
  local: CashBooksState,
  cloud: CashBooksState,
): CashBooksState {
  const localByBook = new Map(local.books.map((b) => [b.id, b]));
  const cloudIds = new Set(cloud.books.map((b) => b.id));
  const mergedBooks = cloud.books.map((cb) => {
    const lb = localByBook.get(cb.id);
    if (!lb) return cb;
    const cloudTxnIds = new Set(cb.finance.transactions.map((t) => t.id));
    const olderLocal = lb.finance.transactions.filter((t) => !cloudTxnIds.has(t.id));
    return {
      ...cb,
      finance: {
        ...cb.finance,
        accounts: cb.finance.accounts.length ? cb.finance.accounts : lb.finance.accounts,
        transactions: [...olderLocal, ...cb.finance.transactions],
        budget: cb.finance.budget,
        categoryBudgets: cb.finance.categoryBudgets?.length
          ? cb.finance.categoryBudgets
          : lb.finance.categoryBudgets,
        defaultAccountId: cb.finance.defaultAccountId || lb.finance.defaultAccountId,
      },
    };
  });
  // Keep local-only books that never synced.
  for (const lb of local.books) {
    if (!cloudIds.has(lb.id)) mergedBooks.push(lb);
  }

  // Prefer cloud active book only when it actually has data (or local has none).
  // Avoid switching onto an empty cloud book and hiding a local book full of txns/budgets.
  const cloudActive = mergedBooks.find((b) => b.id === cloud.activeBookId);
  const localActive = mergedBooks.find((b) => b.id === local.activeBookId);
  let activeBookId = cloud.activeBookId || local.activeBookId;
  if (cloudActive && localActive && cloudActive.id !== localActive.id) {
    const cloudOk = bookHasData(cloudActive);
    const localOk = bookHasData(localActive);
    if (!cloudOk && localOk) activeBookId = localActive.id;
  }

  const currency =
    mergedBooks[0]?.finance.accounts[0]?.currency ||
    local.books[0]?.finance.accounts[0]?.currency ||
    'INR';
  return consolidateCashBooks(
    {
      books: mergedBooks,
      activeBookId: mergedBooks.some((b) => b.id === activeBookId)
        ? activeBookId
        : mergedBooks[0]?.id,
    },
    currency,
  );
}

export function mergeLocalBillImagesIntoBooks(
  cloud: CashBooksState,
  local: CashBooksState | null | undefined,
): CashBooksState {
  if (!local?.books?.length) return cloud;
  const byId = new Map<string, string>();
  for (const book of local.books) {
    for (const t of book.finance.transactions) {
      if (t.billImageUri) byId.set(t.id, t.billImageUri);
    }
  }
  if (byId.size === 0) return cloud;
  return {
    ...cloud,
    books: cloud.books.map((b) => ({
      ...b,
      finance: {
        ...b.finance,
        transactions: b.finance.transactions.map((t) => {
          const uri = byId.get(t.id);
          return uri ? { ...t, billImageUri: uri } : t;
        }),
      },
    })),
  };
}

export function bookHasData(book: CashBook): boolean {
  return (
    book.finance.transactions.length > 0 ||
    book.finance.accounts.some((a) => a.amount !== 0) ||
    (book.finance.categoryBudgets?.length || 0) > 0
  );
}

export function cashBooksHaveData(state: CashBooksState): boolean {
  return state.books.some(bookHasData);
}

export type { Transaction };
