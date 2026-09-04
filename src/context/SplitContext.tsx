import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from './AppContext';
import { useFinance } from '../FinanceContext';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import {
  buildSharesForMode,
  computeSplitBalances,
  confirmSplitSettlement,
  cancelSplitSettlement,
  createSplitExpense,
  createSplitGroup as apiCreateSplitGroup,
  createSplitSettlement,
  deleteSplitGroup as apiDeleteSplitGroup,
  displaySplitName,
  fetchSplitExpenses,
  fetchSplitFriendships,
  fetchSplitGroups,
  fetchSplitProfiles,
  fetchSplitSettlements,
  findOpenSettlementWith,
  inviteSplitFriend,
  isSplitNeedDiamondsError,
  markShareFinanceTxn,
  normalizeSplitDate,
  normalizeSplitPaySource,
  removeSplitFriend,
  cancelSplitInvite,
  respondSplitInvite,
  resolveSplitFinanceCategory,
  updateSplitExpense,
  updateSplitGroup as apiUpdateSplitGroup,
} from '../lib/splitExpense';
import type {
  SplitBalanceRow,
  SplitExpense,
  SplitFriendship,
  SplitGroup,
  SplitMode,
  SplitPaySource,
  SplitProfile,
  SplitSettlement,
} from '../lib/splitTypes';
import { normalizeSplitMode } from '../lib/splitTypes';
import { todayStr, uid } from '../utils';
import { showAppInfo } from '../appDialog';
import { tr } from '../i18n/translations';
import { accountIdForSplitPaySource } from '../cashBooks';
import { buildSplitExpenseNote } from '../lib/splitFinanceNote';
import type { Transaction } from '../types';

const SETTLEMENT_POSTED_KEY = 'aio_split_settlement_finance_v1';
const SHARE_POSTED_KEY = 'aio_split_share_finance_v1';
const NOTIFIED_SETTLE_KEY = 'aio_split_settle_notified_v1';

function splitExpenseContentEqual(a: SplitExpense, b: SplitExpense): boolean {
  if (a.description !== b.description) return false;
  if (Math.abs(Number(a.amount) - Number(b.amount)) >= 0.01) return false;
  if (a.paid_by !== b.paid_by) return false;
  if (normalizeSplitPaySource(a.pay_source) !== normalizeSplitPaySource(b.pay_source)) return false;
  if (normalizeSplitDate(a.expense_date) !== normalizeSplitDate(b.expense_date)) return false;
  if (String(a.finance_category || '') !== String(b.finance_category || '')) return false;
  if (a.shares.length !== b.shares.length) return false;
  const other = new Map(b.shares.map((s) => [s.user_id, s]));
  for (const s of a.shares) {
    const o = other.get(s.user_id);
    if (!o || Math.abs(Number(s.share_amount) - Number(o.share_amount)) >= 0.01) {
      return false;
    }
  }
  return true;
}

/** Keep a just-saved split if a concurrent fetch still has the previous row. */
function mergeFetchedExpenses(
  fetched: SplitExpense[],
  pending: Map<string, SplitExpense>,
): SplitExpense[] {
  if (pending.size === 0) return fetched;
  const merged = fetched.map((e) => {
    const hold = pending.get(e.id);
    if (!hold) return e;
    if (splitExpenseContentEqual(e, hold)) {
      pending.delete(e.id);
      return e;
    }
    return hold;
  });
  const have = new Set(merged.map((e) => e.id));
  for (const hold of pending.values()) {
    if (!have.has(hold.id)) merged.unshift(hold);
  }
  return merged;
}

function findLinkedShareExpenseTxn(
  txns: Transaction[],
  financeTxnId: string | null | undefined,
  splitExpenseId: string,
): Transaction | undefined {
  const byId = financeTxnId ? txns.find((t) => t.id === financeTxnId) : undefined;
  if (byId && byId.kind === 'expense') return byId;
  return txns.find((t) => t.kind === 'expense' && t.splitExpenseId === splitExpenseId);
}

type SplitContextValue = {
  loading: boolean;
  canUseSplit: boolean;
  profilesById: Record<string, SplitProfile>;
  friendships: SplitFriendship[];
  acceptedFriendIds: string[];
  /** Accepted friends that can be added to a new split. */
  eligibleFriendIds: string[];
  pendingIncoming: SplitFriendship[];
  pendingOutgoing: SplitFriendship[];
  groups: SplitGroup[];
  expenses: SplitExpense[];
  settlements: SplitSettlement[];
  balances: SplitBalanceRow[];
  refresh: (opts?: { silent?: boolean }) => Promise<void>;
  inviteFriend: (email: string) => Promise<boolean>;
  respondInvite: (id: string, accept: boolean) => Promise<boolean>;
  removeFriend: (friendUserId: string) => Promise<boolean>;
  cancelInvite: (friendshipId: string) => Promise<boolean>;
  createGroup: (name: string, memberIds: string[]) => Promise<boolean>;
  updateGroup: (groupId: string, name: string, memberIds: string[]) => Promise<boolean>;
  deleteGroup: (groupId: string) => Promise<boolean>;
  canSplitWith: (userId: string) => boolean;
  addExpense: (input: {
    description: string;
    amount: number;
    paidBy: string;
    splitMode: SplitMode;
    expenseDate?: string;
    participantIds: string[];
    customShares?: Record<string, number>;
    financeCategory?: string | null;
    paySource?: SplitPaySource;
    accountId?: string | null;
  }) => Promise<boolean>;
  updateExpense: (input: {
    expenseId: string;
    description: string;
    amount: number;
    paidBy: string;
    splitMode: SplitMode;
    expenseDate: string;
    participantIds: string[];
    customShares?: Record<string, number>;
    financeCategory?: string | null;
    paySource?: SplitPaySource;
    accountId?: string | null;
  }) => Promise<boolean>;
  startSettlement: (otherUserId: string, amount: number) => Promise<boolean>;
  confirmSettlement: (settlementId: string) => Promise<boolean>;
  cancelSettlement: (settlementId: string) => Promise<boolean>;
  nameOf: (userId: string) => string;
};

const SplitContext = createContext<SplitContextValue | null>(null);

export function SplitProvider({ children }: { children: React.ReactNode }) {
  const { config, addTransaction, updateTransaction, finance, cashBooks, ready, expenseCategories, refreshDiamonds } =
    useApp();
  const { session, isGuest } = useFinance();
  const selfId = session?.user?.id || null;

  const [loading, setLoading] = useState(false);
  const [profiles, setProfiles] = useState<SplitProfile[]>([]);
  const [friendships, setFriendships] = useState<SplitFriendship[]>([]);
  const [groups, setGroups] = useState<SplitGroup[]>([]);
  const [expenses, setExpenses] = useState<SplitExpense[]>([]);
  const [settlements, setSettlements] = useState<SplitSettlement[]>([]);
  const postingRef = useRef<Set<string>>(new Set());
  const refreshGenRef = useRef(0);
  const mutatingRef = useRef(0);
  const pendingExpensesRef = useRef<Map<string, SplitExpense>>(new Map());
  const profilesByIdRef = useRef<Record<string, SplitProfile>>({});
  const addTransactionRef = useRef(addTransaction);
  const updateTransactionRef = useRef(updateTransaction);
  const financeRef = useRef(finance);
  const cashBooksRef = useRef(cashBooks);
  addTransactionRef.current = addTransaction;
  updateTransactionRef.current = updateTransaction;
  financeRef.current = finance;
  cashBooksRef.current = cashBooks;

  const moduleOn = config.features.splitExpense !== false;
  const canUseSplit = !isGuest && !!selfId && moduleOn && isSupabaseConfigured;

  const profilesById = useMemo(() => {
    const map: Record<string, SplitProfile> = {};
    for (const p of profiles) map[p.id] = p;
    return map;
  }, [profiles]);
  profilesByIdRef.current = profilesById;

  const acceptedFriendIds = useMemo(() => {
    if (!selfId) return [];
    const ids = new Set<string>();
    for (const f of friendships) {
      if (f.status !== 'accepted') continue;
      ids.add(f.requester_id === selfId ? f.addressee_id : f.requester_id);
    }
    return [...ids];
  }, [friendships, selfId]);

  const canSplitWith = useCallback(
    (userId: string) => {
      if (selfId && userId === selfId) return true;
      return acceptedFriendIds.includes(userId);
    },
    [acceptedFriendIds, selfId],
  );

  const eligibleFriendIds = useMemo(
    () => acceptedFriendIds.filter((id) => canSplitWith(id)),
    [acceptedFriendIds, canSplitWith],
  );

  const pendingIncoming = useMemo(() => {
    if (!selfId) return [];
    return friendships.filter((f) => f.status === 'pending' && f.addressee_id === selfId);
  }, [friendships, selfId]);

  const pendingOutgoing = useMemo(() => {
    if (!selfId) return [];
    return friendships.filter((f) => f.status === 'pending' && f.requester_id === selfId);
  }, [friendships, selfId]);

  const balances = useMemo(() => {
    if (!selfId) return [];
    return computeSplitBalances(selfId, expenses, settlements, config.currency);
  }, [selfId, expenses, settlements, config.currency]);

  const nameOf = useCallback(
    (userId: string) => displaySplitName(profilesById[userId], userId, selfId),
    [profilesById, selfId],
  );

  const expenseCatNamesRef = useRef<string[]>([]);
  expenseCatNamesRef.current = (expenseCategories || []).map((c) => c.name);

  const postMyShareExpenses = useCallback(async (
    list: SplitExpense[],
    uidSelf: string,
    preferredByExpense?: Record<string, string | null | undefined>,
  ) => {
    // Never write Split→Finance until workspace hydration finished — avoids
    // persisting onto an empty guest/default book and wiping the stash.
    if (!ready) return;
    for (const exp of list) {
      const mine = exp.shares.find((s) => s.user_id === uidSelf);
      if (!mine || mine.share_amount <= 0) continue;

      const iPaid = exp.paid_by === uidSelf;
      const amount = Math.round(Number(mine.share_amount) * 100) / 100;
      if (amount <= 0) continue;
      const paySource = normalizeSplitPaySource(exp.pay_source);
      const accountId = accountIdForSplitPaySource(
        financeRef.current.accounts,
        paySource,
        preferredByExpense?.[exp.id],
      );
      const payerName = displaySplitName(
        profilesByIdRef.current[exp.paid_by],
        exp.paid_by,
        uidSelf,
      );
      const note = buildSplitExpenseNote(exp.description, iPaid, payerName, exp.amount);
      const date = normalizeSplitDate(exp.expense_date, todayStr());
      const category = resolveSplitFinanceCategory(exp, expenseCatNamesRef.current);

      // Book each person's share (including the payer). Older rows stored the
      // full bill for the payer — bring those down to the share and refresh the note.
      // Match by stored finance_txn_id or splitExpenseId so an edit still finds the row
      // if the cloud share lost its link.
      const existingTxn = findLinkedShareExpenseTxn(
        financeRef.current.transactions,
        mine.finance_txn_id,
        exp.id,
      );
      if (existingTxn && existingTxn.kind === 'expense') {
        const nextAccountId = existingTxn.accountId || accountId;
        if (
          Math.abs(Number(existingTxn.amount) - amount) >= 0.01 ||
          existingTxn.note !== note ||
          existingTxn.category !== category ||
          existingTxn.date !== date ||
          existingTxn.splitExpenseId !== exp.id ||
          existingTxn.accountId !== nextAccountId
        ) {
          await updateTransactionRef.current({
            ...existingTxn,
            category,
            amount,
            date,
            note,
            splitExpenseId: exp.id,
            accountId: nextAccountId,
          });
        }
        if (!mine.finance_txn_id) {
          try {
            await markShareFinanceTxn(exp.id, uidSelf, existingTxn.id);
            mine.finance_txn_id = existingTxn.id;
          } catch (markErr) {
            console.warn('[split] mark finance txn failed', markErr);
          }
        }
        continue;
      }
      const key = `${exp.id}:${uidSelf}`;
      if (postingRef.current.has(key)) continue;
      postingRef.current.add(key);
      try {
        const raw = await AsyncStorage.getItem(SHARE_POSTED_KEY);
        const posted: string[] = raw ? (JSON.parse(raw) as string[]) : [];
        if (posted.includes(key)) continue;

        const txnId = uid();
        await addTransactionRef.current({
          id: txnId,
          kind: 'expense',
          category,
          amount,
          date,
          note,
          splitExpenseId: exp.id,
          accountId,
        });
        // Persist local dedupe before cloud mark so refresh cannot double-post.
        await AsyncStorage.setItem(
          SHARE_POSTED_KEY,
          JSON.stringify([...posted, key].slice(-400)),
        );
        try {
          await markShareFinanceTxn(exp.id, uidSelf, txnId);
          mine.finance_txn_id = txnId;
        } catch (markErr) {
          console.warn('[split] mark finance txn failed (local txn kept)', markErr);
        }
      } catch (e) {
        console.warn('[split] finance share post failed', e);
        postingRef.current.delete(key);
      }
    }
  }, [ready]);

  const postSettlementFinance = useCallback(async (s: SplitSettlement, uidSelf: string) => {
    if (!ready) return;
    if (s.status !== 'completed') return;
    if (!s.debtor_confirmed || !s.creditor_confirmed) return;
    // Only the person who receives money books income.
    if (s.to_user_id !== uidSelf) return;

    const alreadyBooked = cashBooksRef.current.books.some((b) =>
      (b.finance.transactions || []).some(
        (t) => t.kind === 'income' && t.splitSettlementId === s.id,
      ),
    );
    if (alreadyBooked) return;

    const key = `${s.id}:${uidSelf}`;
    if (postingRef.current.has(`settle:${key}`)) return;
    postingRef.current.add(`settle:${key}`);
    try {
      const txnId = uid();
      const result = await addTransactionRef.current({
        id: txnId,
        kind: 'income',
        category: 'Split settle',
        amount: s.amount,
        date: todayStr(),
        note: `Settlement from ${displaySplitName(
          profilesByIdRef.current[s.from_user_id],
          s.from_user_id,
          uidSelf,
        )}`,
        splitSettlementId: s.id,
      });
      if (result?.imageError === tr('auth.gateTitle')) {
        postingRef.current.delete(`settle:${key}`);
        return;
      }
      const raw = await AsyncStorage.getItem(SETTLEMENT_POSTED_KEY);
      const posted: string[] = raw ? (JSON.parse(raw) as string[]) : [];
      if (!posted.includes(key)) {
        await AsyncStorage.setItem(
          SETTLEMENT_POSTED_KEY,
          JSON.stringify([...posted, key].slice(-200)),
        );
      }
    } catch (e) {
      console.warn('[split] settle finance post failed', e);
      postingRef.current.delete(`settle:${key}`);
    }
  }, []);

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    if (!canUseSplit || !selfId) {
      setProfiles([]);
      setFriendships([]);
      setGroups([]);
      setExpenses([]);
      setSettlements([]);
      return;
    }
    const gen = ++refreshGenRef.current;
    if (!opts?.silent) setLoading(true);
    try {
      const settled = await Promise.allSettled([
        fetchSplitProfiles(),
        fetchSplitFriendships(),
        fetchSplitGroups(selfId),
        fetchSplitExpenses(),
        fetchSplitSettlements(),
      ]);
      // A newer refresh or an in-progress save owns the list — don't replay a stale fetch
      // over a split the user just edited (that was restoring the old Home transaction).
      if (gen !== refreshGenRef.current || mutatingRef.current > 0) return;

      const profilesRes = settled[0];
      const friendsRes = settled[1];
      const groupsRes = settled[2];
      const expensesRes = settled[3];
      const settlementsRes = settled[4];

      if (profilesRes.status === 'fulfilled') setProfiles(profilesRes.value);
      else console.warn('[split] profiles', profilesRes.reason);

      if (friendsRes.status === 'fulfilled') setFriendships(friendsRes.value);
      else {
        console.warn('[split] friendships', friendsRes.reason);
        if (!opts?.silent) {
          showAppInfo(
            tr('split.title'),
            friendsRes.reason instanceof Error
              ? friendsRes.reason.message
              : tr('split.msgInvitesLoadFailed'),
            '⚠️',
          );
        }
      }

      if (groupsRes.status === 'fulfilled') setGroups(groupsRes.value);
      else console.warn('[split] groups', groupsRes.reason);

      if (expensesRes.status === 'fulfilled') {
        if (gen !== refreshGenRef.current || mutatingRef.current > 0) return;
        const list = mergeFetchedExpenses(expensesRes.value, pendingExpensesRef.current);
        setExpenses(list);
        if (gen !== refreshGenRef.current || mutatingRef.current > 0) return;
        await postMyShareExpenses(list, selfId);
      } else console.warn('[split] expenses', expensesRes.reason);

      if (settlementsRes.status === 'fulfilled') {
        if (gen !== refreshGenRef.current || mutatingRef.current > 0) return;
        setSettlements(settlementsRes.value);
        for (const st of settlementsRes.value) {
          if (st.status === 'completed') await postSettlementFinance(st, selfId);
        }
      } else console.warn('[split] settlements', settlementsRes.reason);
    } catch (err) {
      console.warn('[split] refresh failed', err);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [canUseSplit, selfId, postMyShareExpenses, postSettlementFinance, ready]);

  // Only re-fetch when access/user/hydration changes — not when refresh identity churns.
  useEffect(() => {
    if (!ready) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: avoid update-depth loop
  }, [canUseSplit, selfId, ready]);

  // Friend Mark-paid / Confirm must show on the other phone without restarting the app.
  useEffect(() => {
    if (!canUseSplit || !selfId || !ready) return;

    const onAppState = (next: AppStateStatus) => {
      if (next === 'active') void refresh({ silent: true });
    };
    const sub = AppState.addEventListener('change', onAppState);

    let channel: ReturnType<typeof supabase.channel> | null = null;
    if (isSupabaseConfigured) {
      channel = supabase
        .channel(`split-live-${selfId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'split_settlements' },
          () => {
            void refresh({ silent: true });
          },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'split_expenses' },
          () => {
            void refresh({ silent: true });
          },
        )
        .subscribe();
    }

    const poll = setInterval(() => {
      void refresh({ silent: true });
    }, 15_000);

    return () => {
      sub.remove();
      clearInterval(poll);
      if (channel) void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh on access only
  }, [canUseSplit, selfId, ready]);

  // Alert creditor when friend has marked paid and confirmation is needed.
  useEffect(() => {
    if (!selfId || !canUseSplit) return;
    const waiting = settlements.filter(
      (s) =>
        s.status === 'open' &&
        s.to_user_id === selfId &&
        s.debtor_confirmed &&
        !s.creditor_confirmed,
    );
    if (waiting.length === 0) return;
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(NOTIFIED_SETTLE_KEY);
        const seen: string[] = raw ? (JSON.parse(raw) as string[]) : [];
        const fresh = waiting.filter((s) => !seen.includes(s.id));
        if (fresh.length === 0) return;
        const first = fresh[0];
        const fromName = displaySplitName(
          profilesByIdRef.current[first.from_user_id],
          first.from_user_id,
          selfId,
        );
        showAppInfo(
          tr('split.title'),
          tr('split.msgFriendMarkedPaid').replace('{name}', fromName),
          '🤝',
        );
        await AsyncStorage.setItem(
          NOTIFIED_SETTLE_KEY,
          JSON.stringify([...seen, ...fresh.map((s) => s.id)].slice(-100)),
        );
      } catch {
        // ignore notify errors
      }
    })();
  }, [settlements, selfId, canUseSplit]);

  const inviteFriend = useCallback(
    async (email: string) => {
      if (!canUseSplit) {
        showAppInfo(tr('split.title'), tr('split.signInBody'), '👥');
        return false;
      }
      try {
        await inviteSplitFriend(email);
        await refresh();
        showAppInfo(tr('split.title'), tr('split.msgInviteSent'), '✉️');
        return true;
      } catch (e) {
        showAppInfo(tr('split.title'), e instanceof Error ? e.message : tr('split.msgInviteFailed'), '⚠️');
        return false;
      }
    },
    [canUseSplit, refresh],
  );

  const respondInvite = useCallback(
    async (id: string, accept: boolean) => {
      try {
        await respondSplitInvite(id, accept);
        await refresh();
        return true;
      } catch (e) {
        showAppInfo(tr('split.title'), e instanceof Error ? e.message : tr('split.msgInviteUpdateFailed'), '⚠️');
        return false;
      }
    },
    [refresh],
  );

  const removeFriend = useCallback(
    async (friendUserId: string) => {
      try {
        await removeSplitFriend(friendUserId);
        await refresh();
        showAppInfo(tr('split.title'), tr('split.msgFriendRemoved'), '👋');
        return true;
      } catch (e) {
        showAppInfo(tr('split.title'), e instanceof Error ? e.message : tr('split.msgFriendRemoveFailed'), '⚠️');
        return false;
      }
    },
    [refresh],
  );

  const cancelInvite = useCallback(
    async (friendshipId: string) => {
      try {
        await cancelSplitInvite(friendshipId);
        await refresh();
        return true;
      } catch (e) {
        showAppInfo(tr('split.title'), e instanceof Error ? e.message : tr('split.msgInviteCancelFailed'), '⚠️');
        return false;
      }
    },
    [refresh],
  );

  const createGroup = useCallback(
    async (name: string, memberIds: string[]) => {
      if (!selfId || !canUseSplit) return false;
      try {
        await apiCreateSplitGroup({ name, memberIds, ownerId: selfId });
        await refresh();
        return true;
      } catch (e) {
        showAppInfo(tr('split.title'), e instanceof Error ? e.message : tr('split.msgGroupCreateFailed'), '⚠️');
        return false;
      }
    },
    [selfId, canUseSplit, refresh],
  );

  const updateGroup = useCallback(
    async (groupId: string, name: string, memberIds: string[]) => {
      if (!selfId || !canUseSplit) return false;
      try {
        await apiUpdateSplitGroup({ groupId, name, memberIds, ownerId: selfId });
        await refresh();
        return true;
      } catch (e) {
        showAppInfo(tr('split.title'), e instanceof Error ? e.message : tr('split.msgGroupUpdateFailed'), '⚠️');
        return false;
      }
    },
    [selfId, canUseSplit, refresh],
  );

  const deleteGroup = useCallback(
    async (groupId: string) => {
      if (!selfId || !canUseSplit) return false;
      try {
        await apiDeleteSplitGroup(groupId);
        await refresh();
        showAppInfo(tr('split.title'), tr('split.msgGroupDeleted'), '🗑️');
        return true;
      } catch (e) {
        showAppInfo(tr('split.title'), e instanceof Error ? e.message : tr('split.msgGroupDeleteFailed'), '⚠️');
        return false;
      }
    },
    [selfId, canUseSplit, refresh],
  );

  const addExpense = useCallback(
    async (input: {
      description: string;
      amount: number;
      paidBy: string;
      splitMode: SplitMode;
      expenseDate?: string;
      participantIds: string[];
      customShares?: Record<string, number>;
      financeCategory?: string | null;
      paySource?: SplitPaySource;
      accountId?: string | null;
    }) => {
      if (!selfId || !canUseSplit) return false;
      const requested = [...new Set(input.participantIds.filter((id) => id && id !== selfId))];
      const blocked = requested.filter((id) => !canSplitWith(id));
      if (blocked.length) {
        showAppInfo(tr('split.title'), tr('split.msgNeedAcceptedFriend'), '👥');
        return false;
      }
      const participantIds = [...new Set([selfId, ...requested])];
      if (participantIds.length < 2) {
        showAppInfo(tr('split.title'), tr('split.msgNeedFriend'), '👥');
        return false;
      }
      const mode = normalizeSplitMode(input.splitMode);
      const shares = buildSharesForMode(
        mode,
        input.amount,
        participantIds,
        input.customShares || {},
      );
      if (mode === 'percentage') {
        const pctSum = participantIds.reduce(
          (a, id) => a + Number(input.customShares?.[id] || 0),
          0,
        );
        if (Math.abs(pctSum - 100) > 0.05) {
          showAppInfo(tr('split.title'), tr('split.msgPercentSum').replace('{pct}', pctSum.toFixed(1)), '%');
          return false;
        }
      }
      if (mode === 'shares') {
        const wSum = participantIds.reduce(
          (a, id) => a + Number(input.customShares?.[id] || 0),
          0,
        );
        if (!(wSum > 0)) {
          showAppInfo(tr('split.title'), tr('split.msgNeedWeight'), '📊');
          return false;
        }
      }
      if (shares.some((s) => s.shareAmount < -0.001)) {
        showAppInfo(tr('split.title'), tr('split.msgNegativeShare'), '⚠️');
        return false;
      }
      mutatingRef.current += 1;
      try {
        const created = await createSplitExpense({
          createdBy: selfId,
          description: input.description,
          amount: input.amount,
          currency: config.currency,
          paidBy: input.paidBy,
          splitMode: mode,
          expenseDate: normalizeSplitDate(input.expenseDate, todayStr()),
          shares,
          financeCategory: input.financeCategory || null,
          paySource: normalizeSplitPaySource(input.paySource),
        });
        refreshGenRef.current += 1;
        pendingExpensesRef.current.set(created.id, created);
        setExpenses((prev) => [created, ...prev.filter((e) => e.id !== created.id)]);
        await postMyShareExpenses([created], selfId, {
          [created.id]: input.accountId,
        });
      } catch (e) {
        showAppInfo(
          tr('split.title'),
          isSplitNeedDiamondsError(e)
            ? tr('split.msgNeedDiamonds')
            : e instanceof Error
              ? e.message
              : tr('split.msgExpenseSaveFailed'),
          isSplitNeedDiamondsError(e) ? '💎' : '⚠️',
        );
        return false;
      } finally {
        mutatingRef.current = Math.max(0, mutatingRef.current - 1);
      }
      await refresh();
      void refreshDiamonds();
      return true;
    },
    [selfId, canUseSplit, config.currency, refresh, canSplitWith, postMyShareExpenses, refreshDiamonds],
  );

  const updateExpense = useCallback(
    async (input: {
      expenseId: string;
      description: string;
      amount: number;
      paidBy: string;
      splitMode: SplitMode;
      expenseDate: string;
      participantIds: string[];
      customShares?: Record<string, number>;
      financeCategory?: string | null;
      paySource?: SplitPaySource;
      accountId?: string | null;
    }) => {
      if (!selfId || !canUseSplit) return false;
      const existing = expenses.find((e) => e.id === input.expenseId);
      const existingIds = new Set((existing?.shares || []).map((s) => s.user_id));
      const requested = [...new Set(input.participantIds.filter((id) => id && id !== selfId))];
      const blockedNew = requested.filter((id) => !existingIds.has(id) && !canSplitWith(id));
      if (blockedNew.length) {
        showAppInfo(tr('split.title'), tr('split.msgNeedAcceptedFriend'), '👥');
        return false;
      }
      const participantIds = [...new Set([selfId, ...requested])];
      if (participantIds.length < 2) {
        showAppInfo(tr('split.title'), tr('split.msgNeedFriend'), '👥');
        return false;
      }
      const mode = normalizeSplitMode(input.splitMode);
      const shares = buildSharesForMode(
        mode,
        input.amount,
        participantIds,
        input.customShares || {},
      );
      if (mode === 'percentage') {
        const pctSum = participantIds.reduce(
          (a, id) => a + Number(input.customShares?.[id] || 0),
          0,
        );
        if (Math.abs(pctSum - 100) > 0.05) {
          showAppInfo(tr('split.title'), tr('split.msgPercentSum').replace('{pct}', pctSum.toFixed(1)), '%');
          return false;
        }
      }
      if (mode === 'shares') {
        const wSum = participantIds.reduce(
          (a, id) => a + Number(input.customShares?.[id] || 0),
          0,
        );
        if (!(wSum > 0)) {
          showAppInfo(tr('split.title'), tr('split.msgNeedWeight'), '📊');
          return false;
        }
      }
      if (shares.some((s) => s.shareAmount < -0.001)) {
        showAppInfo(tr('split.title'), tr('split.msgNegativeShare'), '⚠️');
        return false;
      }
      mutatingRef.current += 1;
      try {
        const updated = await updateSplitExpense({
          expenseId: input.expenseId,
          description: input.description,
          amount: input.amount,
          paidBy: input.paidBy,
          splitMode: mode,
          expenseDate: normalizeSplitDate(input.expenseDate, todayStr()),
          shares,
          financeCategory:
            input.financeCategory !== undefined
              ? input.financeCategory
              : existing?.finance_category ?? null,
          paySource:
            input.paySource !== undefined
              ? normalizeSplitPaySource(input.paySource)
              : existing?.pay_source ?? 'bank',
        });
        // Drop any fetch that started before this write committed — those still
        // have the old shares and were rewriting Home back to the original txn.
        refreshGenRef.current += 1;
        if (updated.shares.length >= 2) {
          pendingExpensesRef.current.set(updated.id, updated);
          setExpenses((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
        }
        await postMyShareExpenses([updated], selfId, {
          [updated.id]: input.accountId,
        });
      } catch (e) {
        showAppInfo(tr('split.title'), e instanceof Error ? e.message : tr('split.msgExpenseUpdateFailed'), '⚠️');
        return false;
      } finally {
        mutatingRef.current = Math.max(0, mutatingRef.current - 1);
      }
      await refresh();
      return true;
    },
    [selfId, canUseSplit, refresh, expenses, canSplitWith, postMyShareExpenses],
  );

  const startSettlement = useCallback(
    async (otherUserId: string, amount: number) => {
      if (!selfId || !canUseSplit) return false;
      // Always re-fetch first — the other person may have already started/marked paid.
      await refresh({ silent: true });
      const latestSettlements = await fetchSplitSettlements().catch(() => settlements);
      if (findOpenSettlementWith(selfId, otherUserId, latestSettlements)) {
        setSettlements(latestSettlements);
        const pending = findOpenSettlementWith(selfId, otherUserId, latestSettlements);
        if (pending?.debtor_confirmed && pending.to_user_id === selfId) {
          showAppInfo(tr('split.title'), tr('split.msgTheyMarkedPaid'), '🤝');
        } else {
          showAppInfo(tr('split.title'), tr('split.msgSettlePending'), '⏳');
        }
        return false;
      }
      const row = balances.find((b) => b.userId === otherUserId);
      if (!row || Math.abs(row.amount) < 0.01) {
        showAppInfo(tr('split.title'), tr('split.msgNothingToSettle'), 'ℹ️');
        return false;
      }
      // Debtor pays creditor. Positive balance = they owe you → they are debtor.
      const fromUserId = row.amount > 0 ? otherUserId : selfId;
      const toUserId = row.amount > 0 ? selfId : otherUserId;
      try {
        const created = await createSplitSettlement({
          fromUserId,
          toUserId,
          amount: Math.abs(amount),
          currency: config.currency,
          createdBy: selfId,
        });
        // Debtor can immediately mark paid when they start it
        if (fromUserId === selfId) {
          await confirmSplitSettlement(created.id, 'debtor');
          showAppInfo(tr('split.title'), tr('split.msgMarkedPaid'), '🤝');
        } else {
          showAppInfo(tr('split.title'), tr('split.msgSettleRequested'), '🤝');
        }
        await refresh();
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : tr('split.msgSettleStartFailed');
        // Race: friend marked paid while we were creating — pull and surface it.
        await refresh();
        showAppInfo(tr('split.title'), msg, '⚠️');
        return false;
      }
    },
    [selfId, canUseSplit, balances, settlements, config.currency, refresh],
  );

  const confirmSettlement = useCallback(
    async (settlementId: string) => {
      if (!selfId) return false;
      const s = settlements.find((x) => x.id === settlementId);
      if (!s || s.status !== 'open') return false;
      const role = s.from_user_id === selfId ? 'debtor' : 'creditor';
      try {
        const updated = await confirmSplitSettlement(settlementId, role);
        if (updated.status === 'completed') {
          await postSettlementFinance(updated, selfId);
          showAppInfo(tr('split.title'), tr('split.msgSettleComplete'), '✅');
        } else {
          showAppInfo(tr('split.title'), tr('split.msgSettleWaiting'), '⏳');
        }
        await refresh();
        return true;
      } catch (e) {
        showAppInfo(tr('split.title'), e instanceof Error ? e.message : tr('split.msgConfirmFailed'), '⚠️');
        return false;
      }
    },
    [selfId, settlements, postSettlementFinance, refresh],
  );

  const cancelSettlement = useCallback(
    async (settlementId: string) => {
      if (!selfId) return false;
      try {
        await cancelSplitSettlement(settlementId);
        showAppInfo(tr('split.title'), tr('split.msgSettleCancelled'), '↩️');
        await refresh();
        return true;
      } catch (e) {
        showAppInfo(tr('split.title'), e instanceof Error ? e.message : tr('split.msgCancelFailed'), '⚠️');
        return false;
      }
    },
    [selfId, refresh],
  );

  const value = useMemo(
    () => ({
      loading,
      canUseSplit,
      profilesById,
      friendships,
      acceptedFriendIds,
      eligibleFriendIds,
      pendingIncoming,
      pendingOutgoing,
      groups,
      expenses,
      settlements,
      balances,
      refresh,
      inviteFriend,
      respondInvite,
      removeFriend,
      cancelInvite,
      createGroup,
      updateGroup,
      deleteGroup,
      canSplitWith,
      addExpense,
      updateExpense,
      startSettlement,
      confirmSettlement,
      cancelSettlement,
      nameOf,
    }),
    [
      loading,
      canUseSplit,
      profilesById,
      friendships,
      acceptedFriendIds,
      eligibleFriendIds,
      pendingIncoming,
      pendingOutgoing,
      groups,
      expenses,
      settlements,
      balances,
      refresh,
      inviteFriend,
      respondInvite,
      removeFriend,
      cancelInvite,
      createGroup,
      updateGroup,
      deleteGroup,
      canSplitWith,
      addExpense,
      updateExpense,
      startSettlement,
      confirmSettlement,
      cancelSettlement,
      nameOf,
    ],
  );

  return <SplitContext.Provider value={value}>{children}</SplitContext.Provider>;
}

export function useSplit() {
  const ctx = useContext(SplitContext);
  if (!ctx) throw new Error('useSplit must be used within SplitProvider');
  return ctx;
}
