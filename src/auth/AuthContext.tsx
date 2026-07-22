import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { makeRedirectUri } from 'expo-auth-session';
import {
  Profile,
  UserRole,
  isConfiguredAdminEmail,
  isSupabaseConfigured,
  supabase,
} from '../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

type AuthContextValue = {
  ready: boolean;
  configured: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: UserRole;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (fullName: string, email: string, password: string) => Promise<string | null>;
  signInWithGitHub: () => Promise<string | null>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.warn('profile fetch failed', error.message);
    return null;
  }
  return data as Profile | null;
}

async function ensureProfile(user: User): Promise<Profile | null> {
  const existing = await fetchProfile(user.id);
  if (existing) return existing;

  const email = user.email || '';
  const fullName =
    (user.user_metadata?.full_name as string | undefined) ||
    email.split('@')[0] ||
    'User';

  // Role is always 'user' from the client. Promote admins in Supabase SQL.
  const { error } = await supabase.from('profiles').upsert({
    id: user.id,
    email,
    full_name: fullName,
    role: 'user',
  });
  if (error) {
    console.warn('profile upsert failed', error.message);
  }
  return fetchProfile(user.id);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const refreshProfile = async () => {
    if (!session?.user) {
      setProfile(null);
      return;
    }
    const p = await ensureProfile(session.user);
    setProfile(p);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!isSupabaseConfigured) {
        if (mounted) setReady(true);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        setProfile(await ensureProfile(data.session.user));
      }
      setReady(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, next) => {
      setSession(next);
      if (next?.user) {
        setProfile(await ensureProfile(next.user));
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const role: UserRole = profile?.role || 'user';
    const isAdmin =
      role === 'admin' || isConfiguredAdminEmail(session?.user?.email);

    return {
      ready,
      configured: isSupabaseConfigured,
      session,
      user: session?.user ?? null,
      profile,
      role: isAdmin ? 'admin' : role,
      isAdmin,
      refreshProfile,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return error ? error.message : null;
      },
      signUp: async (fullName, email, password) => {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) return error.message;
        if (data.user) {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            email,
            full_name: fullName,
            role: 'user',
          });
        }
        return null;
      },
      signInWithGitHub: async () => {
        const redirectTo = makeRedirectUri({ scheme: 'financetracker' });
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'github',
          options: {
            redirectTo,
            skipBrowserRedirect: true,
          },
        });
        if (error) return error.message;
        if (!data.url) return 'Could not start GitHub login';

        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (result.type !== 'success' || !result.url) {
          return result.type === 'cancel' ? 'GitHub login cancelled' : 'GitHub login failed';
        }

        const url = Linking.parse(result.url);
        const access_token =
          (url.queryParams?.access_token as string | undefined) ||
          new URL(result.url).hash.match(/access_token=([^&]+)/)?.[1];
        const refresh_token =
          (url.queryParams?.refresh_token as string | undefined) ||
          new URL(result.url).hash.match(/refresh_token=([^&]+)/)?.[1];

        if (access_token && refresh_token) {
          const { error: setErr } = await supabase.auth.setSession({
            access_token: decodeURIComponent(access_token),
            refresh_token: decodeURIComponent(refresh_token),
          });
          return setErr ? setErr.message : null;
        }

        // PKCE / code flow
        const code =
          (url.queryParams?.code as string | undefined) ||
          new URL(result.url).searchParams.get('code') ||
          undefined;
        if (code) {
          const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
          return exchangeErr ? exchangeErr.message : null;
        }

        return 'Could not complete GitHub login';
      },
      signOut: async () => {
        await supabase.auth.signOut();
        setProfile(null);
      },
    };
  }, [ready, session, profile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
