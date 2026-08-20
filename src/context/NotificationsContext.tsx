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
import { loadAutoImportRun } from '../lib/autoSmsImport';
import { todayStr } from '../utils';

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

/** The automatic import writes its result around launch, just after this mounts. */
const IMPORT_POLL_MS = 30_000;

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
  const [lastImport, setLastImport] = useState<{ at: number; added: number } | null>(null);
  // Rebuild across a date change so "due today" does not mean yesterday.
  const [today, setToday] = useState(todayStr());

  useEffect(() => {
    void loadSeenNotifications().then(setSeen);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      const run = await loadAutoImportRun();
      if (cancelled) return;
      setLastImport(run && run.added > 0 ? { at: run.at, added: run.added } : null);
      setToday(todayStr());
    };
    void read();
    const timer = setInterval(() => void read(), IMPORT_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const selfId = session?.user?.id || null;
  const splitToConfirm = useMemo(() => {
    if (!selfId) return 0;
    return split.settlements.filter(
      (s) =>
        s.status === 'open' && s.to_user_id === selfId && s.debtor_confirmed && !s.creditor_confirmed,
    ).length;
  }, [split.settlements, selfId]);

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
        lastImport,
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
      lastImport,
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
