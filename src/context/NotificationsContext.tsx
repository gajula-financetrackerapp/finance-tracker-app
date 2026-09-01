import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useApp } from './AppContext';
import { useSplit } from './SplitContext';
import { useFinance } from '../FinanceContext';
import { buildNotificationFeed, type FeedItem } from '../lib/notificationFeed';
import { loadSeenNotifications, rememberSeenNotifications } from '../lib/notificationsSeen';
import { todayStr } from '../utils';
import { fmt } from '../theme';
import { normalizeSplitDate } from '../lib/splitExpense';

/**
 * One reading of the feed for the whole app.
 *
 * The bell and the list have to agree — a badge showing three while the screen
 * shows two is worse than no badge — so both read from here rather than each
 * working it out.
 */

export type FeedRow = FeedItem & { unread: boolean };

type NotificationsValue = {
  rows: FeedRow[];
  unreadCount: number;
  markAllSeen: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsValue | null>(null);

/** Often enough that a feed left open crosses midnight with the day. */
const DAY_WATCH_MS = 30_000;

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const {
    config,
    expenseReminders,
    medReminders,
    groceryReminders,
    generalReminders,
    finance,
  } = useApp();
  const { session } = useFinance();
  const split = useSplit();
  const [seen, setSeen] = useState<Set<string>>(new Set());
  // Rebuild across a date change so "due today" does not mean yesterday.
  const [today, setToday] = useState(todayStr());

  useEffect(() => {
    void loadSeenNotifications().then(setSeen);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setToday(todayStr()), DAY_WATCH_MS);
    return () => clearInterval(timer);
  }, []);

  const selfId = session?.user?.id || null;
  const splitToConfirm = useMemo(() => {
    if (!selfId) return 0;
    return split.settlements.filter(
      (s) =>
        s.status === 'open' && s.to_user_id === selfId && s.debtor_confirmed && !s.creditor_confirmed,
    ).length;
  }, [split.settlements, selfId]);

  const splitInviteItems = useMemo(
    () =>
      split.pendingIncoming.map((f) => ({
        id: f.id,
        name: split.nameOf(f.requester_id),
      })),
    [split.pendingIncoming, split.nameOf],
  );

  const splitSettleItems = useMemo(() => {
    if (!selfId) return [];
    return split.settlements
      .filter((s) => s.status === 'open')
      .map((s) => {
        const otherId = s.from_user_id === selfId ? s.to_user_id : s.from_user_id;
        const kind =
          s.from_user_id === selfId && !s.debtor_confirmed
            ? ('pay' as const)
            : s.to_user_id === selfId && s.debtor_confirmed && !s.creditor_confirmed
              ? ('confirm' as const)
              : ('wait' as const);
        return {
          id: s.id,
          name: split.nameOf(otherId),
          amount: fmt(s.amount, s.currency || config.currency),
          kind,
        };
      });
  }, [split.settlements, split.nameOf, selfId, config.currency]);

  const splitExpenseItems = useMemo(() => {
    if (!selfId) return [];
    const rows: {
      id: string;
      name: string;
      description: string;
      amount: string;
      txnId?: string;
      date?: string;
      createdAt: string;
    }[] = [];
    for (const exp of split.expenses) {
      if (!exp.created_by || exp.created_by === selfId) continue;
      const mine = exp.shares.find((s) => s.user_id === selfId);
      if (!mine || !(mine.share_amount > 0)) continue;
      const linked = finance.transactions.find(
        (t) => t.kind === 'expense' && t.splitExpenseId === exp.id,
      );
      rows.push({
        id: exp.id,
        name: split.nameOf(exp.created_by),
        description: (exp.description || '').trim() || 'Split',
        amount: fmt(mine.share_amount, exp.currency || config.currency),
        txnId: linked?.id || mine.finance_txn_id || undefined,
        date: linked?.date || normalizeSplitDate(exp.expense_date),
        createdAt: normalizeSplitDate(exp.created_at, exp.expense_date),
      });
    }
    return rows;
  }, [split.expenses, split.nameOf, selfId, finance.transactions, config.currency]);

  const items = useMemo(
    () =>
      buildNotificationFeed({
        config,
        today,
        expenseReminders,
        medReminders,
        groceryReminders,
        generalReminders,
        transactions: finance.transactions,
        categoryBudgets: finance.categoryBudgets || [],
        splitInvites: split.pendingIncoming.length,
        splitToConfirm,
        splitInviteItems,
        splitSettleItems,
        splitExpenseItems,
      }),
    [
      config,
      today,
      expenseReminders,
      medReminders,
      groceryReminders,
      generalReminders,
      finance.transactions,
      finance.categoryBudgets,
      split.pendingIncoming.length,
      splitToConfirm,
      splitInviteItems,
      splitSettleItems,
      splitExpenseItems,
    ],
  );

  const rows = useMemo<FeedRow[]>(
    () => items.map((item) => ({ ...item, unread: !seen.has(item.id) })),
    [items, seen],
  );

  const unreadCount = useMemo(() => rows.filter((row) => row.unread).length, [rows]);

  const markAllSeen = useCallback(async () => {
    const live = new Set(items.map((item) => item.id));
    // Optimistic, so the badge clears under the finger rather than after a write.
    setSeen(new Set(live));
    setSeen(await rememberSeenNotifications([...live], live));
  }, [items]);

  const value = useMemo(
    () => ({ rows, unreadCount, markAllSeen }),
    [rows, unreadCount, markAllSeen],
  );

  return (
    <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider');
  return ctx;
}
