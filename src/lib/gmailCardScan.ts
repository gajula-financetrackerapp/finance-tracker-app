import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { GOOGLE_WEB_CLIENT_ID } from '../config';
import {
  emailsMatch,
  GMAIL_CARD_QUERY,
  gmailMessagesToRaw,
  upsertGmailEmails,
  type GmailMessagePayload,
} from './gmailCardText';
import type { RawImportMessage } from './importRules/parseImportText';

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const STORE_ACCOUNTS = 'kashio_gmail_card_accounts_v2';
const STORE_EMAIL_LEGACY = 'kashio_gmail_card_email_v1';

type StoredGmail = { email: string; accessToken: string };

function isExpoGo(): boolean {
  return (
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
    Constants.appOwnership === 'expo'
  );
}

function hasGmailScope(scopes?: string[] | null): boolean {
  return (scopes || []).some((s) => s.includes('gmail.readonly'));
}

function mapGoogleError(err: unknown): string {
  const code = String((err as { code?: string | number })?.code || '');
  const message = String((err as { message?: string })?.message || '').toLowerCase();
  if (code === 'SIGN_IN_CANCELLED' || code === '12501') return 'GMAIL_DENIED';
  if (code === '10' || code === 'DEVELOPER_ERROR' || message.includes('developer_error')) {
    return 'GMAIL_SETUP';
  }
  if (code === '12500' || code === 'SIGN_IN_FAILED') return 'GMAIL_SCOPE';
  return 'GMAIL_SCOPE';
}

async function googleMod() {
  return import('@react-native-google-signin/google-signin');
}

async function configureGoogle() {
  const { GoogleSignin } = await googleMod();
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    offlineAccess: false,
    scopes: ['openid', 'email', 'profile'],
  });
  return GoogleSignin;
}

async function readStoredAccounts(): Promise<StoredGmail[]> {
  try {
    if (Platform.OS === 'web') return [];
    const raw = await SecureStore.getItemAsync(STORE_ACCOUNTS);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredGmail[];
      if (Array.isArray(parsed)) {
        return parsed.filter((a) => a?.email && a?.accessToken);
      }
    }
    const legacy = await SecureStore.getItemAsync(STORE_EMAIL_LEGACY);
    if (legacy) return [{ email: legacy.toLowerCase(), accessToken: '' }];
  } catch {
    /* ignore */
  }
  return [];
}

async function writeStoredAccounts(accounts: StoredGmail[]) {
  try {
    if (Platform.OS === 'web') return;
    if (!accounts.length) {
      await SecureStore.deleteItemAsync(STORE_ACCOUNTS);
      await SecureStore.deleteItemAsync(STORE_EMAIL_LEGACY);
      return;
    }
    await SecureStore.setItemAsync(STORE_ACCOUNTS, JSON.stringify(accounts));
    await SecureStore.deleteItemAsync(STORE_EMAIL_LEGACY);
  } catch {
    /* ignore */
  }
}

export async function readConnectedGmailEmails(): Promise<string[]> {
  return (await readStoredAccounts()).map((a) => a.email);
}

/** @deprecated use readConnectedGmailEmails */
export async function readConnectedGmailEmail(): Promise<string | null> {
  return (await readConnectedGmailEmails())[0] || null;
}

export async function isGmailCardScanConnected(): Promise<boolean> {
  return (await readConnectedGmailEmails()).length > 0;
}

export async function disconnectGmailCardScan(email?: string | null): Promise<string[]> {
  if (!email) {
    await writeStoredAccounts([]);
    return [];
  }
  const next = (await readStoredAccounts()).filter((a) => !emailsMatch(a.email, email));
  await writeStoredAccounts(next);
  return next.map((a) => a.email);
}

export async function connectGmailCardScan(_loginEmail?: string | null): Promise<{
  email: string | null;
  emails: string[];
  error: string | null;
}> {
  if (isExpoGo()) return { email: null, emails: await readConnectedGmailEmails(), error: 'GMAIL_NEED_BUILD' };
  if (!GOOGLE_WEB_CLIENT_ID) {
    return { email: null, emails: await readConnectedGmailEmails(), error: 'GMAIL_NEED_BUILD' };
  }
  try {
    const { isSuccessResponse, statusCodes } = await googleMod();
    const GoogleSignin = await configureGoogle();
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    // Drop the last Google session so the picker lists every account on the phone.
    if (GoogleSignin.hasPreviousSignIn()) {
      try {
        await GoogleSignin.signOut();
      } catch {
        /* still show the picker */
      }
    }

    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) {
      return { email: null, emails: await readConnectedGmailEmails(), error: 'GMAIL_DENIED' };
    }
    let user = response.data;

    if (!hasGmailScope(user.scopes)) {
      try {
        const scoped = await GoogleSignin.addScopes({ scopes: [GMAIL_SCOPE] });
        if (scoped && !isSuccessResponse(scoped)) {
          return { email: null, emails: await readConnectedGmailEmails(), error: 'GMAIL_DENIED' };
        }
        user = (scoped && isSuccessResponse(scoped) ? scoped.data : GoogleSignin.getCurrentUser()) || user;
      } catch (scopeErr: unknown) {
        const code = String((scopeErr as { code?: string })?.code || '');
        if (code === statusCodes.SIGN_IN_CANCELLED || code === '12501') {
          return { email: null, emails: await readConnectedGmailEmails(), error: 'GMAIL_DENIED' };
        }
        if (code !== 'ios_only_SCOPES_ALREADY_GRANTED') {
          return { email: null, emails: await readConnectedGmailEmails(), error: mapGoogleError(scopeErr) };
        }
        user = GoogleSignin.getCurrentUser() || user;
      }
    }

    if (!hasGmailScope(user.scopes) && !hasGmailScope(GoogleSignin.getCurrentUser()?.scopes)) {
      return { email: null, emails: await readConnectedGmailEmails(), error: 'GMAIL_SCOPE' };
    }

    const tokens = await GoogleSignin.getTokens();
    if (!tokens?.accessToken) {
      return { email: null, emails: await readConnectedGmailEmails(), error: 'GMAIL_DENIED' };
    }

    const email = (GoogleSignin.getCurrentUser()?.user.email || user.user.email || '').toLowerCase();
    if (!email) {
      return { email: null, emails: await readConnectedGmailEmails(), error: 'GMAIL_DENIED' };
    }

    const probe = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    if (probe.status === 401 || probe.status === 403) {
      return { email: null, emails: await readConnectedGmailEmails(), error: 'GMAIL_SCOPE' };
    }

    const existing = await readStoredAccounts();
    const next = [
      ...existing.filter((a) => !emailsMatch(a.email, email)),
      { email, accessToken: tokens.accessToken },
    ];
    await writeStoredAccounts(next);
    return { email, emails: next.map((a) => a.email), error: null };
  } catch (err: unknown) {
    return { email: null, emails: await readConnectedGmailEmails(), error: mapGoogleError(err) };
  }
}

async function tokenForAccount(account: StoredGmail): Promise<string | null> {
  if (isExpoGo()) return account.accessToken || null;
  try {
    const GoogleSignin = await configureGoogle();
    const current = GoogleSignin.getCurrentUser()?.user?.email;
    if (emailsMatch(current, account.email)) {
      if (!hasGmailScope(GoogleSignin.getCurrentUser()?.scopes)) {
        try {
          await GoogleSignin.addScopes({ scopes: [GMAIL_SCOPE] });
        } catch {
          /* use stored token */
        }
      }
      const tokens = await GoogleSignin.getTokens();
      if (tokens?.accessToken) {
        const all = await readStoredAccounts();
        await writeStoredAccounts(
          all.map((a) =>
            emailsMatch(a.email, account.email) ? { ...a, accessToken: tokens.accessToken } : a,
          ),
        );
        return tokens.accessToken;
      }
    }
  } catch {
    /* use stored token */
  }
  return account.accessToken || null;
}

async function gmailGet(
  path: string,
  token: string,
): Promise<Record<string, unknown> | null> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) return null;
  return (await res.json()) as Record<string, unknown>;
}

async function messagesForToken(token: string): Promise<RawImportMessage[]> {
  const listed = await gmailGet(
    `messages?q=${encodeURIComponent(GMAIL_CARD_QUERY)}&maxResults=25`,
    token,
  );
  if (!listed) return [];
  const ids = ((listed.messages as { id?: string }[]) || [])
    .map((m) => m.id)
    .filter((id): id is string => !!id);
  const payloads: GmailMessagePayload[] = [];
  for (const id of ids) {
    const full = await gmailGet(`messages/${id}?format=full`, token);
    if (full) payloads.push(full as GmailMessagePayload);
  }
  return gmailMessagesToRaw(payloads);
}

export async function loadGmailCardMessages(_loginEmail?: string | null): Promise<{
  messages: RawImportMessage[];
  connected: boolean;
  error: string | null;
}> {
  const accounts = await readStoredAccounts();
  if (!accounts.length) return { messages: [], connected: false, error: null };
  const seen = new Set<string>();
  const messages: RawImportMessage[] = [];
  for (const account of accounts) {
    const token = await tokenForAccount(account);
    if (!token) continue;
    for (const msg of await messagesForToken(token)) {
      const key = msg.id || `${msg.date}|${(msg.body || '').slice(0, 40)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      messages.push(msg);
    }
  }
  return { messages, connected: true, error: null };
}

export { upsertGmailEmails };
