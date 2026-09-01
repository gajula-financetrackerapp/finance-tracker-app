import type {
  AppConfig,
  CategoryBudget,
  ExpenseReminder,
  GeneralReminder,
  GroceryReminder,
  MedReminder,
  Transaction,
} from '../types';
import type { RootStackParamList } from '../navigation/types';
import type { SplitDeepLink } from './splitDeepLink';
import { translate, type TranslationKey } from '../i18n/translations';
import { isCardBillReminderLive } from './cardBills';

/**
 * What is waiting for the user, worked out from what is true right now.
 *
 * Deliberately not an event log. A stored list of things that happened drifts
 * out of step with the app — a bill marked paid or a reminder deleted leaves its
 * notification behind, still asking to be dealt with — and it starts out empty
 * for everyone who already had the app. Reading the state instead means the feed
 * cannot lie: a row is here because the bill is still due, and it leaves as soon
 * as that stops being so.
 *
 * The only thing worth remembering is which rows have been seen, which is what
 * notificationsSeen.ts keeps.
 *
 * This is not the alarm queue. Alarms ring once, respect snoozing and go quiet
 * when the user turns them off; this list stays until the thing itself is dealt
 * with, because a dismissed alarm does not pay a bill.
 */

export type FeedTone = 'late' | 'soon' | 'info';

/** Where a row leads. Stack screens may take an id so the tap opens that item. */
export type FeedRoute = Extract<
  keyof RootStackParamList,
  | 'Dashboard'
  | 'ExpenseReminder'
  | 'MedicineReminder'
  | 'GroceryReminder'
  | 'GeneralReminder'
  | 'ImportTransactions'
  | 'TxnList'
>;

export type FeedItem = {
  /** Stable across rebuilds, so "seen" sticks to the thing and not to the moment. */
  id: string;
  icon: string;
  title: string;
  body: string;
  tone: FeedTone;
  /** Sorts the list: overdue days first, then how soon, then recency. */
  rank: number;
  route?: FeedRoute;
  params?: {
    reminderId?: string;
    kind?: 'expense' | 'income';
    txnId?: string;
    splitExpenseId?: string;
    date?: string;
  };
  /** Split lives in the workspace overlay, not a stack screen. */
  split?: SplitDeepLink;
};

export type SplitInviteFeedItem = { id: string; name: string };
export type SplitExpenseFeedItem = {
  id: string;
  name: string;
  description: string;
  amount: string;
  txnId?: string;
  date?: string;
  createdAt: string;
};
export type SplitSettleFeedItem = {
  id: string;
  name: string;
  amount: string;
  kind: 'pay' | 'confirm' | 'wait';
};

export type FeedInputs = {
  config: AppConfig;
  today: string;
  expenseReminders: ExpenseReminder[];
  medReminders: MedReminder[];
  groceryReminders: GroceryReminder[];
  generalReminders: GeneralReminder[];
  transactions: Transaction[];
  categoryBudgets: CategoryBudget[];
  /** Friend requests waiting on this user. */
  splitInvites: number;
  /** Settlements a friend marked paid that need confirming. */
  splitToConfirm: number;
  splitInviteItems?: SplitInviteFeedItem[];
  splitSettleItems?: SplitSettleFeedItem[];
  /** Splits a friend added that booked this user's share. */
  splitExpenseItems?: SplitExpenseFeedItem[];
};

const DAY_MS = 86400000;

function dayDiff(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / DAY_MS);
}

function monthOf(dateStr: string): string {
  return (dateStr || '').slice(0, 7);
}

function money(amount: number, currencyCode: string): string {
  const locale = currencyCode === 'INR' ? 'en-IN' : 'en-US';
  return Math.abs(Math.round(amount)).toLocaleString(locale);
}

/**
 * Anything due within the widest offset the user set, since that is the point
 * they said they wanted to hear about a bill.
 */
function horizon(offsets: number[] | undefined, fallback: number): number {
  const list = (offsets || []).filter((n) => Number.isFinite(n));
  return list.length ? Math.max(...list, 0) : fallback;
}

export function buildNotificationFeed(input: FeedInputs): FeedItem[] {
  const { config, today } = input;
  const t = (key: TranslationKey) => translate(config.language, key);
  const fill = (key: TranslationKey, values: Record<string, string>) =>
    Object.entries(values).reduce(
      (text, [name, value]) => text.replace(`{${name}}`, value),
      t(key),
    );
  const items: FeedItem[] = [];

  const lateOrSoon = (days: number): FeedTone => (days < 0 ? 'late' : 'soon');
  // Overdue outranks upcoming, and the longer it is late the higher it sits.
  const rankForDays = (days: number) => (days < 0 ? 10_000 - days * 10 : 5_000 - days);

  const expenseHorizon = horizon(config.expenseOffsets, 1);
  for (const bill of input.expenseReminders) {
    if (bill.paid || !bill.dueDate) continue;
    if (bill.source === 'card-bill' && !isCardBillReminderLive(bill, today)) continue;
    const days = dayDiff(today, bill.dueDate);
    if (bill.source === 'card-bill') {
      if (!(bill.amount > 0.009)) continue;
      const offs =
        bill.mode === 'custom' && bill.offsets?.length ? bill.offsets : config.expenseOffsets;
      if (!offs.includes(days)) continue;
    } else if (days > Math.max(expenseHorizon, ...(bill.offsets || [0]))) {
      continue;
    }
    const amount = `${config.currency === 'INR' ? '₹' : ''}${money(bill.amount, config.currency)}`;
    items.push({
      id: `expense:${bill.id}:${bill.dueDate}`,
      icon: '💸',
      title: fill(
        days < 0 ? 'notifications.billLate' : 'notifications.billDue',
        { name: bill.name || t('reminders.expense'), amount },
      ),
      body:
        days < 0
          ? fill('notifications.lateByDays', { n: String(-days) })
          : days === 0
            ? t('notifications.dueToday')
            : fill('notifications.inDays', { n: String(days) }),
      tone: lateOrSoon(days),
      rank: rankForDays(days),
      route: 'ExpenseReminder',
      params: { reminderId: bill.id },
    });
  }

  const groceryHorizon = horizon(config.groceryOffsets, 2);
  for (const item of input.groceryReminders) {
    if (!item.expiryDate) continue;
    const days = dayDiff(today, item.expiryDate);
    if (days > Math.max(groceryHorizon, ...(item.offsets || [0]))) continue;
    items.push({
      id: `grocery:${item.id}:${item.expiryDate}`,
      icon: item.icon || '🥦',
      title: fill(
        days < 0 ? 'notifications.groceryExpired' : 'notifications.groceryExpiring',
        { name: item.item || t('reminders.grocery') },
      ),
      body:
        days < 0
          ? fill('notifications.lateByDays', { n: String(-days) })
          : days === 0
            ? t('notifications.dueToday')
            : fill('notifications.inDays', { n: String(days) }),
      tone: lateOrSoon(days),
      rank: rankForDays(days),
      route: 'GroceryReminder',
      params: { reminderId: item.id },
    });
  }

  // One row per medicine, not per missed slot: four reminders a day each would
  // bury everything else, and the answer to all of them is the same screen.
  for (const med of input.medReminders) {
    const doneToday = med.done?.[today] || {};
    const slots = (med.times || []).filter((slot) => !doneToday[slot]);
    if (!slots.length) continue;
    items.push({
      id: `medicine:${med.id}:${today}`,
      icon: '💊',
      title: fill('notifications.medicineDue', { name: med.name || t('reminders.medicine') }),
      body: fill('notifications.slotsLeft', { n: String(slots.length) }),
      tone: 'soon',
      rank: 4_000,
      route: 'MedicineReminder',
      params: { reminderId: med.id },
    });
  }

  for (const note of input.generalReminders) {
    if (!note.date) continue;
    if (note.repeat === 'once' && note.done) continue;
    if (note.repeat !== 'once' && note.doneDate === today) continue;
    const days = dayDiff(today, note.date);
    if (days > 0) continue;
    items.push({
      id: `general:${note.id}:${note.repeat === 'once' ? note.date : today}`,
      icon: '🔔',
      title: note.title || t('reminders.general'),
      body:
        days < 0
          ? fill('notifications.lateByDays', { n: String(-days) })
          : t('notifications.dueToday'),
      tone: lateOrSoon(days),
      rank: rankForDays(days),
      route: 'GeneralReminder',
      params: { reminderId: note.id },
    });
  }

  // Budgets, for this month only: last month's overspend is history, not a task.
  const month = monthOf(today);
  const spentByCategory = new Map<string, number>();
  for (const txn of input.transactions) {
    if (txn.kind !== 'expense' || monthOf(txn.date) !== month) continue;
    const key = txn.category || 'Others';
    spentByCategory.set(key, (spentByCategory.get(key) || 0) + Math.abs(txn.amount));
  }
  for (const budget of input.categoryBudgets) {
    if (budget.month !== month || !(budget.limit > 0)) continue;
    const spent = spentByCategory.get(budget.category) || 0;
    if (spent <= budget.limit) continue;
    const over = `${config.currency === 'INR' ? '₹' : ''}${money(spent - budget.limit, config.currency)}`;
    items.push({
      id: `budget:${month}:${budget.category}`,
      icon: '📊',
      title: fill('notifications.budgetOver', { category: budget.category }),
      body: fill('notifications.budgetOverBy', { amount: over }),
      tone: 'late',
      rank: 3_000,
      route: 'Dashboard',
    });
  }

  const addedItems = [...(input.splitExpenseItems || [])]
    .filter((row) => {
      const created = (row.createdAt || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(created)) return true;
      const age = dayDiff(created, today);
      return age >= 0 && age <= 14;
    })
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 10);
  addedItems.forEach((row, i) => {
    items.push({
      id: `split:expense:${row.id}`,
      icon: '💸',
      title: fill('notifications.splitAddedTitle', { name: row.name }),
      body: fill('notifications.splitAddedBody', {
        description: row.description,
        amount: row.amount,
      }),
      tone: 'info',
      rank: 2_600 - i,
      route: 'TxnList',
      params: {
        kind: 'expense',
        txnId: row.txnId,
        splitExpenseId: row.id,
        date: row.date,
      },
    });
  });

  const inviteItems = input.splitInviteItems || [];
  if (inviteItems.length) {
    inviteItems.forEach((invite, i) => {
      items.push({
        id: `split:invite:${invite.id}`,
        icon: '🤝',
        title: fill('notifications.splitInviteFrom', { name: invite.name }),
        body: t('notifications.splitInviteWait'),
        tone: 'soon',
        rank: 2_500 - i,
        split: { tab: 'friends', sub: 'new', highlightId: invite.id },
      });
    });
  } else if (input.splitInvites > 0) {
    items.push({
      id: `split:invites:${input.splitInvites}`,
      icon: '🤝',
      title: t('notifications.splitInvites'),
      body: fill('notifications.splitInvitesBody', { n: String(input.splitInvites) }),
      tone: 'soon',
      rank: 2_500,
      split: { tab: 'friends', sub: 'new' },
    });
  }

  const settleItems = input.splitSettleItems || [];
  if (settleItems.length) {
    settleItems.forEach((settle, i) => {
      const body =
        settle.kind === 'pay'
          ? fill('notifications.splitSettleMarkPaid', { amount: settle.amount })
          : settle.kind === 'confirm'
            ? fill('notifications.splitSettleConfirmAmt', { amount: settle.amount })
            : fill('notifications.splitSettleWaiting', { amount: settle.amount });
      items.push({
        id: `split:settle:${settle.id}`,
        icon: '✅',
        title: fill('notifications.splitSettleTitle', { name: settle.name }),
        body,
        tone: 'soon',
        rank: 2_400 - i,
        split: { tab: 'balances', sub: 'open', highlightId: settle.id },
      });
    });
  } else if (input.splitToConfirm > 0) {
    items.push({
      id: `split:confirm:${input.splitToConfirm}`,
      icon: '✅',
      title: t('notifications.splitConfirm'),
      body: fill('notifications.splitConfirmBody', { n: String(input.splitToConfirm) }),
      tone: 'soon',
      rank: 2_400,
      split: { tab: 'balances', sub: 'open' },
    });
  }

  return items.sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id));
}
