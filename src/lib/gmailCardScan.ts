import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { GOOGLE_WEB_CLIENT_ID } from '../config';
import {
  emailsMatch,
  GMAIL_CARD_QUERY,
  gmailMessagesToRaw,
  type GmailMessagePayload,
} from './gmailCardText';
import type { RawImportMessage } from './importRules/parseImportText';

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const STORE_EMAIL = 'kashio_gmail_card_email_v1';

function isExpoGo(): boolean {
  return (
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
    Constants.appOwnership === 'expo'
  );
}

async function googleMod() {
  return import('@react-native-google-signin/google-signin');
}

function configureGoogle() {
  return googleMod().then(({ GoogleSignin }) => {
    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      offlineAccess: true,
      scopes: ['email', 'profile', GMAIL_SCOPE],
    });
    return GoogleSignin;
  });
}

export async function readConnectedGmailEmail(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return null;
    return (await SecureStore.getItemAsync(STORE_EMAIL)) || null;
  } catch {
    return null;
  }
}

async function writeConnectedGmailEmail(email: string | null) {
  try {
    if (Platform.OS === 'web') return;
    if (email) await SecureStore.setItemAsync(STORE_EMAIL, email);
    else await SecureStore.deleteItemAsync(STORE_EMAIL);
  } catch {
    /* ignore */
  }
}

export async function isGmailCardScanConnected(): Promise<boolean> {
  return !!(await readConnectedGmailEmail());
}

export async function disconnectGmailCardScan(): Promise<void> {
  await writeConnectedGmailEmail(null);
}

export async function connectGmailCardScan(loginEmail: string | null): Promise<{
  email: string | null;
  error: string | null;
}> {
  if (!loginEmail) return { email: null, error: 'AUTH' };
  if (isExpoGo()) return { email: null, error: 'GMAIL_NEED_BUILD' };
  if (!GOOGLE_WEB_CLIENT_ID) return { email: null, error: 'GMAIL_NEED_BUILD' };
  try {
    const GoogleSignin = await configureGoogle();
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const already = await GoogleSignin.hasPreviousSignIn();
    if (!already) {
      const response = await GoogleSignin.signIn();
      const userEmail =
        (response as { data?: { user?: { email?: string } } })?.data?.user?.email ||
        (await GoogleSignin.getCurrentUser())?.user?.email ||
        null;
      if (!emailsMatch(loginEmail, userEmail)) {
        try {
          await GoogleSignin.signOut();
        } catch {
          /* ignore */
        }
        return { email: null, error: 'GMAIL_MISMATCH' };
      }
    } else {
      const current = await GoogleSignin.getCurrentUser();
      const userEmail = current?.user?.email || null;
      if (userEmail && !emailsMatch(loginEmail, userEmail)) {
        await GoogleSignin.signOut();
        return connectGmailCardScan(loginEmail);
      }
    }
    try {
      await GoogleSignin.addScopes({ scopes: [GMAIL_SCOPE] });
    } catch {
      /* already granted or prompt cancelled — tokens will tell */
    }
    const tokens = await GoogleSignin.getTokens();
    if (!tokens?.accessToken) return { email: null, error: 'GMAIL_DENIED' };
    const email =
      (await GoogleSignin.getCurrentUser())?.user?.email || loginEmail;
    if (!emailsMatch(loginEmail, email)) {
      await writeConnectedGmailEmail(null);
      return { email: null, error: 'GMAIL_MISMATCH' };
    }
    await writeConnectedGmailEmail(email.toLowerCase());
    return { email: email.toLowerCase(), error: null };
  } catch (err: unknown) {
    const code = (err as { code?: string | number })?.code;
    if (code === 'SIGN_IN_CANCELLED' || code === '12501') {
      return { email: null, error: 'GMAIL_DENIED' };
    }
    return { email: null, error: 'GMAIL_DENIED' };
  }
}

async function accessTokenFor(loginEmail: string | null): Promise<string | null> {
  const stored = await readConnectedGmailEmail();
  if (!stored || !emailsMatch(loginEmail, stored)) return null;
  if (isExpoGo()) return null;
  try {
    const GoogleSignin = await configureGoogle();
    if (!(await GoogleSignin.hasPreviousSignIn())) return null;
    const current = (await GoogleSignin.getCurrentUser())?.user?.email || stored;
    if (!emailsMatch(loginEmail, current)) {
      await writeConnectedGmailEmail(null);
      return null;
    }
    const tokens = await GoogleSignin.getTokens();
    return tokens?.accessToken || null;
  } catch {
    return null;
  }
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

export async function loadGmailCardMessages(loginEmail: string | null): Promise<{
  messages: RawImportMessage[];
  connected: boolean;
  error: string | null;
}> {
  const stored = await readConnectedGmailEmail();
  if (!stored) return { messages: [], connected: false, error: null };
  if (!emailsMatch(loginEmail, stored)) {
    await writeConnectedGmailEmail(null);
    return { messages: [], connected: false, error: 'GMAIL_MISMATCH' };
  }
  const token = await accessTokenFor(loginEmail);
  if (!token) return { messages: [], connected: true, error: 'GMAIL_DENIED' };
  const listed = await gmailGet(
    `messages?q=${encodeURIComponent(GMAIL_CARD_QUERY)}&maxResults=25`,
    token,
  );
  if (!listed) return { messages: [], connected: true, error: 'GMAIL_DENIED' };
  const ids = ((listed.messages as { id?: string }[]) || [])
    .map((m) => m.id)
    .filter((id): id is string => !!id);
  const payloads: GmailMessagePayload[] = [];
  for (const id of ids) {
    const full = await gmailGet(`messages/${id}?format=full`, token);
    if (full) payloads.push(full as GmailMessagePayload);
  }
  return { messages: gmailMessagesToRaw(payloads), connected: true, error: null };
}
