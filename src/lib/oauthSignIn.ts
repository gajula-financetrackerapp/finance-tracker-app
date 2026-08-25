import { AppState, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { supabase, isSupabaseConfigured, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';
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

/** Always deep-link back into MoneyLit (not Expo Go / localhost). */
export function getOAuthRedirectTo(): string {
  return OAUTH_APP_REDIRECT;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function allowListHint(redirectTo: string): string {
  return (
    `\n\nFix in Supabase → Authentication → URL Configuration:\n` +
    `• Site URL = ${redirectTo}\n` +
    `• Additional Redirect URLs add:\n  ${redirectTo}\n  financetracker://**`
  );
}

function friendlyOAuthError(provider: OAuthProvider, message: string, redirectTo?: string): string {
  const label = provider === 'google' ? 'Google' : 'Apple';
  const lower = message.toLowerCase();
  const hint = redirectTo ? allowListHint(redirectTo) : '';

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
    return `${label} native sign-in needs this app’s SHA-1 in Google Cloud. Using browser sign-in instead failed too.${hint}`;
  }
  if (
    lower.includes('redirect') ||
    lower.includes('localhost') ||
    lower.includes('timed out') ||
    lower.includes('site can') ||
    lower.includes('refused')
  ) {
    return `${label} signed in, but could not return to the app (usually a missing redirect URL).${hint}`;
  }
  if (lower.includes('cancel') || lower.includes('dismiss')) {
    return `${label} sign-in was cancelled.`;
  }
  // Supabase says "invalid flow state, no valid flow state found" when the code
  // verifier for this attempt is gone — a stale or already-used callback.
  if (lower.includes('flow state') || lower.includes('code verifier')) {
    return `That ${label} sign-in link has expired. Please tap ${label} to sign in again.`;
  }
  if (lower.includes('network') || lower.includes('reach') || lower.includes('internet')) {
    return `Could not reach ${label}. Check this device’s internet connection and try again.`;
  }
  return message;
}

function looksLikeAuthCallback(url: string | null | undefined): url is string {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    lower.startsWith('financetracker://') ||
    lower.includes('auth/callback') ||
    lower.includes('access_token=') ||
    lower.includes('refresh_token=') ||
    /[?&#]code=/.test(url)
  );
}

/**
 * Callback URLs already handed to Supabase. The URL that opened the app stays
 * readable for the whole run, so without this a later sign-in would replay a
 * spent `?code=` and fail with "invalid flow state, no valid flow state found".
 */
const spentCallbackUrls = new Set<string>();

function retireCallbackUrl(url: string | null | undefined) {
  if (url) spentCallbackUrls.add(url);
}

function readCurrentLinkUrl(): string | null {
  try {
    const current = Linking.getLinkingURL();
    if (looksLikeAuthCallback(current) && !spentCallbackUrls.has(current)) {
      return current;
    }
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
  for (const wait of [0, 400, 1000, 2000, 3500, 5000]) {
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

/**
 * Open OAuth and wait for financetracker://auth/callback.
 * Android: system browser + Linking (Custom Tabs often drop the scheme return).
 * iOS: AuthSession Custom Tabs.
 */
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
      console.log('[oauth] got callback', url.slice(0, 96));
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
      setTimeout(() => {
        if (!settled) tryUrl(readCurrentLinkUrl());
      }, 2500);
    });

    const timer = setTimeout(() => {
      finish({ url: null, cancelled: false, timedOut: true });
    }, 120_000);

    void (async () => {
      try {
        // Whatever link is pending belongs to an earlier attempt — this one has
        // not opened a browser yet. Retire it so the checks below wait for the
        // real callback instead of replaying a code that is already spent.
        retireCallbackUrl(Linking.getLinkingURL());
        try {
          retireCallbackUrl(await Linking.getInitialURL());
        } catch {
          // ignore
        }

        if (Platform.OS === 'android') {
          await Linking.openURL(authUrl);
          return;
        }

        await WebBrowser.warmUpAsync().catch(() => undefined);
        const result = await WebBrowser.openAuthSessionAsync(authUrl, returnUrl, {
          preferEphemeralSession: true,
          showInRecents: true,
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
        }, 900);
      } catch (err) {
        if (!settled) {
          if (tryUrl(readCurrentLinkUrl())) return;
          const message = err instanceof Error ? err.message : String(err);
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
    retireCallbackUrl(callbackUrl);
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
    // One code, one exchange: the retry loops must not send this again.
    retireCallbackUrl(callbackUrl);
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
 * Native Google Sign-In — opt-in only (needs SHA-1 in Google Cloud).
 * Default path is browser OAuth + PKCE so sign-in works without native setup.
 * Set EXPO_PUBLIC_GOOGLE_NATIVE=1 to prefer native.
 */
async function signInWithNativeGoogle(): Promise<OAuthSignInResult | null> {
  if (isExpoGo()) return null;
  if (process.env.EXPO_PUBLIC_GOOGLE_NATIVE !== '1') return null;
  if (!GOOGLE_WEB_CLIENT_ID) {
    console.warn('[oauth] missing GOOGLE_WEB_CLIENT_ID — browser OAuth');
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
      console.warn('[oauth] native idToken failed, trying browser', error.message);
      return null;
    }
    const s = data.session;
    if (!s?.user?.id) return { session: null, error: 'Could not complete Google sign-in' };
    return { session: sessionFromSupabaseSession(s), error: null, closeBrowserHint: false };
  } catch (err: unknown) {
    const anyErr = err as { code?: string | number; message?: string };
    const message = anyErr?.message || String(err);
    try {
      const mod = await import('@react-native-google-signin/google-signin');
      if (anyErr?.code === mod.statusCodes.SIGN_IN_CANCELLED) {
        return { session: null, error: 'Google sign-in cancelled' };
      }
    } catch {
      // ignore
    }
    console.warn('[oauth] native Google failed, falling back to browser', message);
    return null;
  }
}

async function buildProviderAuthUrl(
  provider: OAuthProvider,
  redirectTo: string,
): Promise<{ url: string | null; error: string | null }> {
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
  if (error) return { url: null, error: error.message };
  if (data.url) {
    try {
      const u = new URL(data.url);
      u.searchParams.set('redirect_to', redirectTo);
      return { url: u.toString(), error: null };
    } catch {
      return { url: data.url, error: null };
    }
  }

  // Fallback: hit authorize directly (same as dashboard “Google” button).
  const url =
    `${SUPABASE_URL}/auth/v1/authorize?provider=${provider}` +
    `&redirect_to=${encodeURIComponent(redirectTo)}`;
  return { url, error: null };
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

  if (isExpoGo()) {
    return {
      session: null,
      error:
        'Sign-in needs the installed MoneyLit app (not Expo Go).\n\nOn the laptop run: npm run start:dev\nThen open MoneyLit and reload.',
    };
  }

  if (provider === 'google') {
    const native = await signInWithNativeGoogle();
    if (native) return native;
  }

  const redirectTo = getOAuthRedirectTo();
  const label = provider === 'google' ? 'Google' : 'Apple';
  console.log('[oauth] start', {
    provider,
    redirectTo,
    supabase: SUPABASE_URL,
    keyPrefix: SUPABASE_ANON_KEY.slice(0, 14),
  });

  const built = await buildProviderAuthUrl(provider, redirectTo);
  if (built.error) {
    return { session: null, error: friendlyOAuthError(provider, built.error, redirectTo) };
  }
  if (!built.url) return { session: null, error: `Could not start ${label} sign-in` };

  if (/localhost|127\.0\.0\.1|your[_-]?project[_-]?ref|YOUR_PROJECT/i.test(built.url)) {
    return {
      session: null,
      error:
        `Invalid auth URL (placeholder or localhost).\n\nApp Supabase host must be egbcgwqhwubiasiuxekr.supabase.co.\nAlso check Supabase → Authentication → URL Configuration Site URL is NOT https://your_project_ref.supabase.co`,
    };
  }

  // Surface the host so Metro logs prove which project the phone is using.
  try {
    console.log('[oauth] auth host =', new URL(built.url).host);
  } catch {
    // ignore
  }
  const opened = await openAuthAndWaitForRedirect(built.url, redirectTo);

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

  console.log('[oauth] callback', opened.url.slice(0, 80));
  try {
    const session = await sessionFromCallbackUrl(opened.url, provider, redirectTo);
    return { ...session, closeBrowserHint: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { session: null, error: friendlyOAuthError(provider, message, redirectTo) };
  }
}

/** Dev helper — confirms anon key is present (not logged). */
export function oauthDebugInfo() {
  return {
    redirectTo: OAUTH_APP_REDIRECT,
    supabaseHost: (() => {
      try {
        return new URL(SUPABASE_URL).host;
      } catch {
        return 'invalid';
      }
    })(),
    hasAnonKey: Boolean(SUPABASE_ANON_KEY),
    hasGoogleWebClientId: Boolean(GOOGLE_WEB_CLIENT_ID),
    expoGo: isExpoGo(),
  };
}
