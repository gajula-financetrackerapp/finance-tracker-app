import { AppState, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { supabase, isSupabaseConfigured } from './supabase';
import { GOOGLE_WEB_CLIENT_ID } from '../config';

WebBrowser.maybeCompleteAuthSession();

export type OAuthProvider = 'google' | 'apple';

export type OAuthSessionResult = {
  access_token: string;
  refresh_token: string;
  user: { id: string; email?: string };
};

export type OAuthSignInResult = {
  session: OAuthSessionResult | null;
  error: string | null;
  /** Browser may still be open after a successful deep link. */
  closeBrowserHint?: boolean;
};

/** Must be allow-listed in Supabase → Authentication → URL Configuration. */
export const OAUTH_APP_REDIRECT = 'financetracker://auth/callback';

function isExpoGo(): boolean {
  return (
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
    Constants.appOwnership === 'expo'
  );
}

/**
 * Always use the app scheme in dev-client / production builds.
 * Expo Go keeps the exp:// redirect so the Expo client can resume.
 */
export function getOAuthRedirectTo(): string {
  if (!isExpoGo()) return OAUTH_APP_REDIRECT;
  try {
    return makeRedirectUri({
      scheme: 'financetracker',
      path: 'auth/callback',
      native: OAUTH_APP_REDIRECT,
    });
  } catch {
    return OAUTH_APP_REDIRECT;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function friendlyOAuthError(provider: OAuthProvider, message: string, redirectTo?: string): string {
  const label = provider === 'google' ? 'Google' : 'Apple';
  const lower = message.toLowerCase();
  const allowHint = redirectTo
    ? `\n\nIn Supabase → Authentication → URL Configuration add:\n• ${redirectTo}\n• financetracker://**`
    : '';

  if (
    lower.includes('provider is not enabled') ||
    lower.includes('unsupported provider') ||
    lower.includes('validation_failed')
  ) {
    return `${label} sign-in is not enabled yet. Enable ${label} under Supabase → Authentication → Providers.`;
  }
  if (
    lower.includes('developer_error') ||
    lower.includes('code: 10') ||
    lower.includes('api_not_connected') ||
    lower.includes('sha')
  ) {
    return `${label} native sign-in is not configured for this app build (SHA-1 / OAuth client). ${allowHint}`;
  }
  if (lower.includes('redirect') || lower.includes('localhost') || lower.includes('timed out') || lower.includes('site can')) {
    return `${label} could not return to the app.${allowHint}`;
  }
  if (lower.includes('cancel') || lower.includes('dismiss')) {
    return `${label} sign-in was cancelled.`;
  }
  if (lower.includes('network') || lower.includes('reach') || lower.includes('internet')) {
    return `Could not reach ${label}. Check this device’s internet connection and try again.`;
  }
  return message;
}

function forceRedirectInAuthUrl(authUrl: string, redirectTo: string): string {
  try {
    const u = new URL(authUrl);
    u.searchParams.set('redirect_to', redirectTo);
    return u.toString();
  } catch {
    return authUrl;
  }
}

function looksLikeAuthCallback(url: string | null | undefined): url is string {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    lower.startsWith('financetracker://') ||
    lower.includes('auth/callback') ||
    lower.includes('access_token=') ||
    lower.includes('refresh_token=') ||
    /[?&#]code=/.test(url) ||
    (lower.startsWith('exp://') &&
      (lower.includes('access_token') || lower.includes('code=') || lower.includes('refresh_token')))
  );
}

function readCurrentLinkUrl(): string | null {
  try {
    const current = Linking.getLinkingURL();
    if (looksLikeAuthCallback(current)) return current;
  } catch {
    // ignore
  }
  return null;
}

function dismissAuthBrowser() {
  try {
    WebBrowser.dismissAuthSession();
  } catch {
    // ignore
  }
  try {
    WebBrowser.dismissBrowser();
  } catch {
    // ignore
  }
}

function sessionFromSupabaseSession(s: {
  access_token: string;
  refresh_token: string;
  user: { id: string; email?: string | null };
}): OAuthSessionResult {
  return {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    user: { id: s.user.id, email: s.user.email || undefined },
  };
}

async function recoverAfterBrowserClosed(
  provider: OAuthProvider,
  redirectTo: string,
): Promise<OAuthSignInResult | null> {
  for (const wait of [0, 400, 1000, 2000, 3500]) {
    if (wait) await sleep(wait);
    const late = readCurrentLinkUrl();
    if (late) {
      const session = await sessionFromCallbackUrl(late, provider, redirectTo);
      if (session.session) return { ...session, closeBrowserHint: false };
    }
    const { data } = await supabase.auth.getSession();
    if (data.session?.user?.id) {
      return {
        session: sessionFromSupabaseSession(data.session),
        error: null,
        closeBrowserHint: false,
      };
    }
  }
  return null;
}

type OpenResult = { url: string | null; cancelled: boolean; timedOut: boolean };

async function openAuthAndWaitForRedirect(
  authUrl: string,
  returnUrl: string,
): Promise<OpenResult> {
  return await new Promise((resolve) => {
    let settled = false;

    const finish = (payload: OpenResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sub.remove();
      appSub.remove();
      dismissAuthBrowser();
      resolve(payload);
    };

    const tryUrl = (url: string | null | undefined) => {
      if (!looksLikeAuthCallback(url)) return false;
      finish({ url, cancelled: false, timedOut: false });
      return true;
    };

    const sub = Linking.addEventListener('url', ({ url }) => {
      tryUrl(url);
    });

    const appSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || settled) return;
      if (tryUrl(readCurrentLinkUrl())) return;
      setTimeout(() => {
        if (!settled) tryUrl(readCurrentLinkUrl());
      }, 400);
      setTimeout(() => {
        if (!settled) tryUrl(readCurrentLinkUrl());
      }, 1200);
    });

    const timer = setTimeout(() => {
      finish({ url: null, cancelled: false, timedOut: true });
    }, 120_000);

    void (async () => {
      try {
        await WebBrowser.warmUpAsync().catch(() => undefined);
        const result = await WebBrowser.openAuthSessionAsync(authUrl, returnUrl, {
          ...(Platform.OS === 'android'
            ? {
                createTask: false,
                showInRecents: true,
              }
            : {
                preferEphemeralSession: true,
                showInRecents: true,
              }),
        });
        if (settled) return;
        if (result.type === 'success' && 'url' in result && tryUrl(result.url)) return;
        setTimeout(() => {
          if (settled) return;
          if (tryUrl(readCurrentLinkUrl())) return;
          finish({
            url: null,
            cancelled: result.type === 'cancel' || result.type === 'dismiss',
            timedOut: false,
          });
        }, 700);
      } catch (err) {
        if (!settled) {
          if (tryUrl(readCurrentLinkUrl())) return;
          const message = err instanceof Error ? err.message : String(err);
          // Surface browser/network failures instead of a silent dead-end.
          finish({ url: null, cancelled: /cancel|dismiss/i.test(message), timedOut: false });
        }
      }
    })();
  });
}

async function sessionFromCallbackUrl(
  callbackUrl: string,
  provider: OAuthProvider,
  redirectTo: string,
): Promise<{ session: OAuthSessionResult | null; error: string | null }> {
  const label = provider === 'google' ? 'Google' : 'Apple';

  if (/localhost|127\.0\.0\.1/i.test(callbackUrl)) {
    return {
      session: null,
      error: friendlyOAuthError(provider, 'localhost', redirectTo),
    };
  }

  const { params, errorCode } = QueryParams.getQueryParams(callbackUrl);
  if (errorCode) {
    const desc =
      typeof params.error_description === 'string'
        ? params.error_description
        : String(errorCode);
    return { session: null, error: friendlyOAuthError(provider, desc, redirectTo) };
  }

  const access_token = params.access_token;
  const refresh_token = params.refresh_token;
  const code = params.code;

  if (access_token && refresh_token) {
    const { data: setData, error: setErr } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
    if (setErr) {
      return { session: null, error: friendlyOAuthError(provider, setErr.message, redirectTo) };
    }
    const s = setData.session;
    if (!s?.user?.id) return { session: null, error: `Could not complete ${label} sign-in` };
    return { session: sessionFromSupabaseSession(s), error: null };
  }

  if (code) {
    const { data: exData, error: exchangeErr } =
      await supabase.auth.exchangeCodeForSession(code);
    if (exchangeErr) {
      return {
        session: null,
        error: friendlyOAuthError(provider, exchangeErr.message, redirectTo),
      };
    }
    const s = exData.session;
    if (!s?.user?.id) return { session: null, error: `Could not complete ${label} sign-in` };
    return { session: sessionFromSupabaseSession(s), error: null };
  }

  return { session: null, error: `Could not complete ${label} sign-in` };
}

/**
 * Native Google Sign-In for dev-client / production.
 * Returns null to fall back to browser OAuth whenever native is unavailable
 * or misconfigured (missing Web client ID / SHA-1). Never block browser sign-in.
 */
async function signInWithNativeGoogle(): Promise<OAuthSignInResult | null> {
  if (isExpoGo()) return null;
  // Browser OAuth via Supabase does not need this. Native Google does.
  if (!GOOGLE_WEB_CLIENT_ID) {
    console.warn('[oauth] no EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID — using browser OAuth');
    return null;
  }
  try {
    const mod = await import('@react-native-google-signin/google-signin');
    const { GoogleSignin, isSuccessResponse } = mod;
    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      offlineAccess: false,
    });
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response) || !response.data.idToken) {
      return { session: null, error: 'Google sign-in was cancelled' };
    }
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: response.data.idToken,
    });
    if (error) {
      console.warn('[oauth] native idToken failed, trying browser OAuth', error.message);
      return null;
    }
    const s = data.session;
    if (!s?.user?.id) return { session: null, error: 'Could not complete Google sign-in' };
    return {
      session: sessionFromSupabaseSession(s),
      error: null,
      closeBrowserHint: false,
    };
  } catch (err: unknown) {
    const anyErr = err as { code?: string | number; message?: string };
    const message = anyErr?.message || String(err);
    try {
      const mod = await import('@react-native-google-signin/google-signin');
      if (anyErr?.code === mod.statusCodes.SIGN_IN_CANCELLED) {
        return { session: null, error: 'Google sign-in cancelled' };
      }
      if (anyErr?.code === mod.statusCodes.IN_PROGRESS) {
        return { session: null, error: 'Google sign-in already in progress' };
      }
    } catch {
      // ignore
    }
    // Module missing, DEVELOPER_ERROR (SHA-1), Play Services, etc. → browser OAuth
    console.warn('[oauth] native Google failed, falling back to browser', message);
    return null;
  }
}

/**
 * Opens Google / Apple sign-in and returns a Supabase session.
 */
export async function signInWithOAuthProvider(
  provider: OAuthProvider,
): Promise<OAuthSignInResult> {
  if (!isSupabaseConfigured) {
    return { session: null, error: 'Cloud sign-in is not configured yet.' };
  }

  if (provider === 'google') {
    const native = await signInWithNativeGoogle();
    // null → use browser OAuth. Non-null session/error → done (cancel / success).
    if (native) return native;
  }

  const redirectTo = getOAuthRedirectTo();
  const label = provider === 'google' ? 'Google' : 'Apple';
  // Always log — if you see exp:// here while using Pulse Wallet, Metro was started with --go.
  console.log('[oauth] redirectTo =', redirectTo, 'expoGo=', isExpoGo());
  if (isExpoGo()) {
    return {
      session: null,
      error:
        'Open the installed Pulse Wallet app (not Expo Go), and start Metro with: npm run start:dev',
    };
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: {
        prompt: 'select_account',
      },
    },
  });
  if (error) {
    return { session: null, error: friendlyOAuthError(provider, error.message, redirectTo) };
  }
  if (!data.url) return { session: null, error: `Could not start ${label} sign-in` };

  // Guard: never open a localhost / invalid auth URL in the system browser.
  if (/localhost|127\.0\.0\.1/i.test(data.url)) {
    return {
      session: null,
      error: friendlyOAuthError(provider, 'localhost', redirectTo),
    };
  }

  const authUrl = forceRedirectInAuthUrl(data.url, redirectTo);
  console.log('[oauth] authUrl host =', (() => {
    try {
      return new URL(authUrl).host;
    } catch {
      return 'invalid';
    }
  })());

  const opened = await openAuthAndWaitForRedirect(authUrl, redirectTo);

  if (opened.timedOut) {
    const recovered = await recoverAfterBrowserClosed(provider, redirectTo);
    if (recovered?.session) return recovered;
    return {
      session: null,
      error: friendlyOAuthError(provider, 'timed out', redirectTo),
    };
  }

  if (!opened.url) {
    const recovered = await recoverAfterBrowserClosed(provider, redirectTo);
    if (recovered?.session) return recovered;
    if (opened.cancelled) {
      return {
        session: null,
        error: friendlyOAuthError(provider, 'cancelled', redirectTo),
      };
    }
    return {
      session: null,
      error: friendlyOAuthError(provider, 'redirect', redirectTo),
    };
  }

  try {
    const session = await sessionFromCallbackUrl(opened.url, provider, redirectTo);
    return { ...session, closeBrowserHint: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { session: null, error: friendlyOAuthError(provider, message, redirectTo) };
  }
}
