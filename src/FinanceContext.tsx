import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isConfiguredAdminEmail, SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import { supabase } from './lib/supabase';
import { ensureUserProfile } from './lib/profile';
import { claimExclusiveSession, clearLocalSessionId, verifyExclusiveSession } from './lib/sessionLock';
import { signInWithOAuthProvider, type OAuthProvider } from './lib/oauthSignIn';
import { showAppInfo } from './appDialog';
import { monthKey, uid } from './theme';
import { setAuthGate, setOpenAuth, setAdminChecker } from './authGate';
import type { Transaction } from './types';

/** Keep supabase-js session in sync so RLS cloud sync works. */
async function syncSupabaseSession(s: Session | null): Promise<boolean> {
  try {
    if (s?.access_token && s.refresh_token) {
      const { data, error } = await supabase.auth.setSession({
        access_token: s.access_token,
        refresh_token: s.refresh_token,
      });
      if (error) {
        console.warn('[auth] setSession failed', error.message);
        return false;
      }
      // Prefer refreshed tokens from Supabase
      if (data.session?.access_token) {
        s.access_token = data.session.access_token;
        if (data.session.refresh_token) s.refresh_token = data.session.refresh_token;
      }
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user?.id) {
        console.warn('[auth] session not usable', userErr?.message || 'no user');
        return false;
      }
      return true;
    }
    if (!s) {
      await supabase.auth.signOut();
    }
    return true;
  } catch (err) {
    console.warn('[auth] supabase session sync failed', err);
    return false;
  }
}

export type Txn = {
  id: string;
  kind: 'expense' | 'income';
  category: string;
  amount: number;
  date: string;
  note: string;
};

type Session = {
  access_token: string;
  refresh_token?: string;
  user: { id: string; email?: string };
};

type AuthMode = 'login' | 'signup';

type FinanceContextValue = {
  ready: boolean;
  session: Session | null;
  isGuest: boolean;
  isAdmin: boolean;
  transactions: Txn[];
  budget: number;
  currentMonth: string;
  setCurrentMonth: (m: string) => void;
  monthSummary: { expenses: number; income: number; balance: number };
  requireAuthToSave: (actionLabel?: string) => boolean;
  addTransaction: (txn: Omit<Txn, 'id'>) => Promise<boolean>;
  setBudget: (n: number) => Promise<boolean>;
  deleteTransaction: (id: string) => Promise<boolean>;
  showAuth: boolean;
  setShowAuth: (v: boolean) => void;
  /** Styled “sign in required” chooser (replaces system Alert). */
  showAuthGate: boolean;
  setShowAuthGate: (v: boolean) => void;
  authGateLabel: string;
  showAdd: boolean;
  setShowAdd: (v: boolean) => void;
  /** When set, AddModal opens in edit mode for this transaction. */
  editingTxn: Transaction | null;
  setEditingTxn: (txn: Transaction | null) => void;
  authMode: AuthMode;
  setAuthMode: (m: AuthMode) => void;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (name: string, email: string, password: string) => Promise<string | null>;
  /** Google / Apple — provider-verified, no email confirmation step. */
  signInWithOAuth: (provider: OAuthProvider) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const FinanceContext = createContext<FinanceContextValue | null>(null);
const SESSION_KEY = 'ft_session_v1';
const DATA_PREFIX = 'ft_data_v1_';

function headers(token?: string) {
  return {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
  };
}

export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [transactions, setTransactions] = useState<Txn[]>([]);
  const [budget, setBudgetState] = useState(0);
  const [currentMonth, setCurrentMonth] = useState(monthKey());
  const [showAuth, setShowAuth] = useState(false);
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [authGateLabel, setAuthGateLabel] = useState('save data');
  const [showAdd, setShowAdd] = useState(false);
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  /** From Supabase profiles.role — complements EXPO_PUBLIC_ADMIN_EMAILS. */
  const [profileIsAdmin, setProfileIsAdmin] = useState(false);

  const isGuest = !session;
  const isAdmin =
    !!(session?.user?.email && isConfiguredAdminEmail(session.user.email)) || profileIsAdmin;

  const refreshAdminFlag = useCallback(async (s: Session | null) => {
    if (!s?.user?.id) {
      setProfileIsAdmin(false);
      return;
    }
    let fullName: string | undefined;
    try {
      const { data } = await supabase.auth.getUser();
      const meta = data.user?.user_metadata || {};
      fullName =
        (typeof meta.full_name === 'string' && meta.full_name) ||
        (typeof meta.name === 'string' && meta.name) ||
        undefined;
    } catch {
      // ignore
    }
    const profile = await ensureUserProfile({
      userId: s.user.id,
      email: s.user.email,
      fullName,
    });
    setProfileIsAdmin(
      profile?.role === 'admin' || isConfiguredAdminEmail(s.user.email),
    );
  }, []);

  const persist = useCallback(
    async (txns: Txn[], bud: number, userId?: string) => {
      if (!userId) return;
      await AsyncStorage.setItem(
        DATA_PREFIX + userId,
        JSON.stringify({ transactions: txns, budget: bud }),
      );
    },
    [],
  );

  useEffect(() => {
    (async () => {
      try {
        // Prefer Supabase's own persisted session (SecureStore) over AsyncStorage copy.
        const { data: live } = await supabase.auth.getSession();
        if (live.session?.access_token && live.session.user?.id) {
          const s: Session = {
            access_token: live.session.access_token,
            refresh_token: live.session.refresh_token || '',
            user: {
              id: live.session.user.id,
              email: live.session.user.email,
            },
          };
          await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s));
          setSession(s);
          await refreshAdminFlag(s);
          await claimExclusiveSession();
          const dataRaw = await AsyncStorage.getItem(DATA_PREFIX + s.user.id);
          if (dataRaw) {
            const data = JSON.parse(dataRaw);
            setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
            setBudgetState(typeof data.budget === 'number' ? data.budget : 0);
          } else {
            setTransactions([]);
            setBudgetState(0);
          }
          return;
        }

        const raw = await AsyncStorage.getItem(SESSION_KEY);
        if (raw) {
          const s = JSON.parse(raw) as Session;
          if (s?.access_token && s?.user?.id) {
            const ok = await syncSupabaseSession(s);
            if (!ok) {
              await AsyncStorage.removeItem(SESSION_KEY);
              setSession(null);
              setTransactions([]);
              setProfileIsAdmin(false);
              return;
            }
            await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s));
            setSession(s);
            await refreshAdminFlag(s);
            await claimExclusiveSession();
            const dataRaw = await AsyncStorage.getItem(DATA_PREFIX + s.user.id);
            if (dataRaw) {
              const data = JSON.parse(dataRaw);
              setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
              setBudgetState(typeof data.budget === 'number' ? data.budget : 0);
            } else {
              setTransactions([]);
              setBudgetState(0);
            }
            return;
          }
        }

        setTransactions([]);
        setProfileIsAdmin(false);
      } finally {
        setReady(true);
      }
    })();
  }, [refreshAdminFlag]);

  const monthSummary = useMemo(() => {
    let expenses = 0;
    let income = 0;
    transactions
      .filter((t) => t.date.startsWith(currentMonth))
      .forEach((t) => {
        if (t.kind === 'expense') expenses += t.amount;
        else income += t.amount;
      });
    return { expenses, income, balance: income - expenses };
  }, [transactions, currentMonth]);

  const requireAuthToSave = useCallback(
    (actionLabel = 'save data') => {
      if (session) return true;
      setAuthGateLabel(actionLabel);
      setShowAuthGate(true);
      return false;
    },
    [session],
  );

  useEffect(() => {
    setAuthGate(requireAuthToSave);
    setAdminChecker(() => isAdmin);
    setOpenAuth((mode) => {
      setAuthMode(mode);
      setShowAuth(true);
    });
    return () => {
      setAuthGate(null);
      setAdminChecker(null);
      setOpenAuth(null);
    };
  }, [requireAuthToSave, isAdmin]);

  const addTransaction = useCallback(
    async (txn: Omit<Txn, 'id'>) => {
      if (!requireAuthToSave('add transactions')) return false;
      const next = [{ ...txn, id: uid() }, ...transactions];
      setTransactions(next);
      await persist(next, budget, session!.user.id);
      return true;
    },
    [requireAuthToSave, transactions, budget, session, persist],
  );

  const deleteTransaction = useCallback(
    async (id: string) => {
      if (!requireAuthToSave('delete transactions')) return false;
      const next = transactions.filter((t) => t.id !== id);
      setTransactions(next);
      await persist(next, budget, session!.user.id);
      return true;
    },
    [requireAuthToSave, transactions, budget, session, persist],
  );

  const setBudget = useCallback(
    async (n: number) => {
      if (!requireAuthToSave('set a budget')) return false;
      setBudgetState(n);
      await persist(transactions, n, session!.user.id);
      return true;
    },
    [requireAuthToSave, transactions, session, persist],
  );

  const applySignedInSession = useCallback(
    async (s: Session) => {
      const ok = await syncSupabaseSession(s);
      if (!ok) {
        throw new Error('Could not establish a cloud session. Try signing in again.');
      }
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s));
      setSession(s);
      await refreshAdminFlag(s);
      await claimExclusiveSession();
      const dataRaw = await AsyncStorage.getItem(DATA_PREFIX + s.user.id);
      if (dataRaw) {
        const parsed = JSON.parse(dataRaw);
        setTransactions(Array.isArray(parsed.transactions) ? parsed.transactions : []);
        setBudgetState(typeof parsed.budget === 'number' ? parsed.budget : 0);
      } else {
        setTransactions([]);
        setBudgetState(0);
      }
      setShowAuth(false);
      setShowAuthGate(false);
    },
    [refreshAdminFlag],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) return data.error_description || data.msg || data.error || 'Login failed';
    const s: Session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user: { id: data.user.id, email: data.user.email },
    };
    try {
      await applySignedInSession(s);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Login failed';
    }
  }, [applySignedInSession]);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ email, password, data: { full_name: name } }),
    });
    const data = await res.json();
    if (!res.ok) return data.error_description || data.msg || data.error || 'Sign up failed';
    if (data.access_token && data.user) {
      const s: Session = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        user: { id: data.user.id, email: data.user.email },
      };
      try {
        await applySignedInSession(s);
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : 'Sign up failed';
      }
    }
    setAuthMode('login');
    return null;
  }, [applySignedInSession]);

  const signInWithOAuth = useCallback(
    async (provider: OAuthProvider) => {
      const { session: oauthSession, error } = await signInWithOAuthProvider(provider);
      if (error || !oauthSession) return error || 'Sign-in failed';
      const s: Session = {
        access_token: oauthSession.access_token,
        refresh_token: oauthSession.refresh_token,
        user: {
          id: oauthSession.user.id,
          email: oauthSession.user.email,
        },
      };
      await applySignedInSession(s);
      return null;
    },
    [applySignedInSession],
  );

  const signOut = useCallback(async () => {
    try {
      if (session?.access_token) {
        await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
          method: 'POST',
          headers: headers(session.access_token),
        });
      }
    } catch {
      // ignore
    }
    await syncSupabaseSession(null);
    await AsyncStorage.removeItem(SESSION_KEY);
    await clearLocalSessionId();
    setSession(null);
    setProfileIsAdmin(false);
    setTransactions([]);
    setBudgetState(0);
  }, [session]);

  /** Kick this device if another login claimed the session. */
  useEffect(() => {
    if (!session?.user?.id) return;
    let cancelled = false;
    const check = async () => {
      const ok = await verifyExclusiveSession();
      if (cancelled || ok) return;
      showAppInfo(
        'Signed in elsewhere',
        'Your account was opened on another device. You have been signed out here.',
        '🔐',
      );
      await signOut();
    };
    void check();
    const timer = setInterval(() => void check(), 12000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [session?.user?.id, signOut]);

  const value = useMemo(
    () => ({
      ready,
      session,
      isGuest,
      isAdmin,
      transactions,
      budget,
      currentMonth,
      setCurrentMonth,
      monthSummary,
      requireAuthToSave,
      addTransaction,
      setBudget,
      deleteTransaction,
      showAuth,
      setShowAuth,
      showAuthGate,
      setShowAuthGate,
      authGateLabel,
      showAdd,
      setShowAdd,
      editingTxn,
      setEditingTxn,
      authMode,
      setAuthMode,
      signIn,
      signUp,
      signInWithOAuth,
      signOut,
    }),
    [
      ready,
      session,
      isGuest,
      isAdmin,
      transactions,
      budget,
      currentMonth,
      monthSummary,
      requireAuthToSave,
      addTransaction,
      setBudget,
      deleteTransaction,
      showAuth,
      showAuthGate,
      authGateLabel,
      showAdd,
      editingTxn,
      authMode,
      signIn,
      signUp,
      signInWithOAuth,
      signOut,
    ],
  );

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance() {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error('useFinance must be used within FinanceProvider');
  return ctx;
}
