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
import { canAccessPremiumFeature } from '../lib/premiumFeatures';
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
import { normalizeSplitMode, SPLIT_PREMIUM_FEATURE } from '../lib/splitTypes';
import { todayStr, uid } from '../utils';
import { showAppInfo } from '../appDialog';
import { tr } from '../i18n/translations';
import { accountIdForSplitPaySource } from '../cashBooks';

const SETTLEMENT_POSTED_KEY = 'aio_split_settlement_finance_v1';
const SHARE_POSTED_KEY = 'aio_split_share_finance_v1';
const NOTIFIED_SETTLE_KEY = 'aio_split_settle_notified_v1';

type SplitContextValue = {
  loading: boolean;
  canUseSplit: boolean;
  profilesById: Record<string, SplitProfile>;
  friendships: SplitFriendship[];
  acceptedFriendIds: string[];
  /** Accepted friends with active Premium/Plus (can be added to new splits). */
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
  const { config, isPremiumMember, addTransaction, updateTransaction, finance, ready, expenseCategories } =
    useApp();
  const { session, isGuest, isAdmin } = useFinance();
  const selfId = session?.user?.id || null;

  const [loading, setLoading] = useState(false);
  const [profiles, setProfiles] = useState<SplitProfile[]>([]);
  const [friendships, setFriendships] = useState<SplitFriendship[]>([]);
  const [groups, setGroups] = useState<SplitGroup[]>([]);
  const [expenses, setExpenses] = useState<SplitExpense[]>([]);
  const [settlements, setSettlements] = useState<SplitSettlement[]>([]);
  const postingRef = useRef<Set<string>>(new Set());
  const profilesByIdRef = useRef<Record<string, SplitProfile>>({});
  const addTransactionRef = useRef(addTransaction);
  const updateTransactionRef = useRef(updateTransaction);
  const financeRef = useRef(finance);
  addTransactionRef.current = addTransaction;
  updateTransactionRef.current = updateTransaction;
  financeRef.current = finance;

  const moduleOn = config.features.splitExpense !== false;
  const premiumOk =
    isAdmin ||
    canAccessPremiumFeature(SPLIT_PREMIUM_FEATURE, isPremiumMember, config.premiumFeatures, config.features);
  const canUseSplit = !isGuest && !!selfId && moduleOn && premiumOk && isSupabaseConfigured;

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
      const p = profilesById[userId];
      // Missing flag (older SQL) → allow; server enforces after migration.
      if (!p || p.can_split === undefined) return true;
      return !!p.can_split;
    },
    [profilesById, selfId],
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
      const fullAmount = Math.round(Number(exp.amount) * 100) / 100;
      const amount = iPaid ? fullAmount : mine.share_amount;
      if (amount <= 0) continue;
      const paySource = normalizeSplitPaySource(exp.pay_source);
      const accountId = accountIdForSplitPaySource(
        financeRef.current.accounts,
        paySource,
        preferredByExpense?.[exp.id],
      );

      // Repair older payer rows that only booked the share, not the full cash out.
      if (mine.finance_txn_id && iPaid) {
        const existingTxn = financeRef.current.transactions.find((t) => t.id === mine.finance_txn_id);
        if (
          existingTxn &&
          existingTxn.kind === 'expense' &&
          Math.abs(Number(existingTxn.amount) - fullAmount) >= 0.01
        ) {
          const category = resolveSplitFinanceCategory(exp, expenseCatNamesRef.current);
          await updateTransactionRef.current({
            ...existingTxn,
            category,
            amount: fullAmount,
            date: normalizeSplitDate(exp.expense_date, todayStr()),
            note: `${exp.description} · You paid full · your share ${mine.share_amount}`,
            splitExpenseId: exp.id,
            accountId: existingTxn.accountId || accountId,
          });
        }
        continue;
      }

      if (mine.finance_txn_id) continue;
      const key = `${exp.id}:${uidSelf}`;
      if (postingRef.current.has(key)) continue;
      postingRef.current.add(key);
      try {
        const raw = await AsyncStorage.getItem(SHARE_POSTED_KEY);
        const posted: string[] = raw ? (JSON.parse(raw) as string[]) : [];
        if (posted.includes(key)) continue;

        const txnId = uid();
        const payerProfile = profilesByIdRef.current[exp.paid_by];
        const payerLabel = iPaid
          ? 'You paid'
          : `${displaySplitName(payerProfile, exp.paid_by, uidSelf)} paid`;
        const date = normalizeSplitDate(exp.expense_date, todayStr());
        const category = resolveSplitFinanceCategory(exp, expenseCatNamesRef.current);
        const note = iPaid
          ? `${exp.description} · You paid full · your share ${mine.share_amount}`
          : `${exp.description} · ${payerLabel}`;
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
    const key = `${s.id}:${uidSelf}`;
    if (postingRef.current.has(`settle:${key}`)) return;
    postingRef.current.add(`settle:${key}`);
    try {
      const raw = await AsyncStorage.getItem(SETTLEMENT_POSTED_KEY);
      const posted: string[] = raw ? (JSON.parse(raw) as string[]) : [];
      if (posted.includes(key)) return;

      // Only the person who receives money books income.
      // The payer already booked their share as an expense when the split was created —
      // booking another settlement expense would double-count.
      if (s.to_user_id !== uidSelf) return;

      const txnId = uid();
      await addTransactionRef.current({
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
      await AsyncStorage.setItem(
        SETTLEMENT_POSTED_KEY,
        JSON.stringify([...posted, key].slice(-200)),
      );
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
    if (!opts?.silent) setLoading(true);
    try {
      const settled = await Promise.allSettled([
        fetchSplitProfiles(),
        fetchSplitFriendships(),
        fetchSplitGroups(selfId),
        fetchSplitExpenses(),
        fetchSplitSettlements(),
      ]);
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
            'Split',
            friendsRes.reason instanceof Error
              ? friendsRes.reason.message
              : 'Could not load friend invites. Run split_expense_invite_fix.sql in Supabase.',
            '⚠️',
          );
        }
      }

      if (groupsRes.status === 'fulfilled') setGroups(groupsRes.value);
      else console.warn('[split] groups', groupsRes.reason);

      if (expensesRes.status === 'fulfilled') {
        setExpenses(expensesRes.value);
        await postMyShareExpenses(expensesRes.value, selfId);
      } else console.warn('[split] expenses', expensesRes.reason);

      if (settlementsRes.status === 'fulfilled') {
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
          'Split',
          `${fromName} marked a settlement paid. Open Balances → Confirm received.`,
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
        showAppInfo(tr('split.title'), tr('split.msgNeedPremium'), '👑');
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
        showAppInfo(
          'Split',
          'Friends without active Premium or Plus can’t be added to new splits.',
          '👑',
        );
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
        await postMyShareExpenses([created], selfId, {
          [created.id]: input.accountId,
        });
        await refresh();
        return true;
      } catch (e) {
        showAppInfo(tr('split.title'), e instanceof Error ? e.message : tr('split.msgExpenseSaveFailed'), '⚠️');
        return false;
      }
    },
    [selfId, canUseSplit, config.currency, refresh, canSplitWith, postMyShareExpenses],
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
        showAppInfo(
          'Split',
          'Friends without active Premium or Plus can’t be added to splits.',
          '👑',
        );
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
        const mine = updated.shares.find((s) => s.user_id === selfId);
        if (mine?.finance_txn_id) {
          const existingTxn = financeRef.current.transactions.find(
            (t) => t.id === mine.finance_txn_id,
          );
          if (existingTxn) {
            const payerProfile = profilesByIdRef.current[updated.paid_by];
            const iPaid = updated.paid_by === selfId;
            const payerLabel = iPaid
              ? 'You paid'
              : `${displaySplitName(payerProfile, updated.paid_by, selfId)} paid`;
            const category = resolveSplitFinanceCategory(
              updated,
              expenseCatNamesRef.current,
            );
            const amount = iPaid
              ? Math.round(Number(updated.amount) * 100) / 100
              : mine.share_amount;
            const note = iPaid
              ? `${updated.description} · You paid full · your share ${mine.share_amount}`
              : `${updated.description} · ${payerLabel}`;
            const accountId = accountIdForSplitPaySource(
              financeRef.current.accounts,
              normalizeSplitPaySource(updated.pay_source),
              input.accountId,
            );
            await updateTransactionRef.current({
              ...existingTxn,
              category,
              amount,
              date: normalizeSplitDate(updated.expense_date, todayStr()),
              note,
              splitExpenseId: updated.id,
              accountId: accountId || existingTxn.accountId,
            });
          }
        }
        await refresh();
        return true;
      } catch (e) {
        showAppInfo(tr('split.title'), e instanceof Error ? e.message : tr('split.msgExpenseUpdateFailed'), '⚠️');
        return false;
      }
    },
    [selfId, canUseSplit, refresh, expenses, canSplitWith],
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
          showAppInfo(
            'Split',
            'They already marked paid. Confirm received under Open settlements.',
            '🤝',
          );
        } else {
          showAppInfo(
            'Split',
            'A settlement with this friend is already pending. Check Open settlements below.',
            '⏳',
          );
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
          showAppInfo(
            'Split',
            'Settlement request sent. They must Mark paid; then you Confirm received.',
            '🤝',
          );
        }
        await refresh();
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not start settlement';
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
