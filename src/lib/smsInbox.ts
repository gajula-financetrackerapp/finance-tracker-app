import { NativeModules, Platform, PermissionsAndroid } from 'react-native';
import type { RawImportMessage } from './importRules';

type SmsAndroidModule = {
  list: (
    filter: string,
    fail: (err: string) => void,
    success: (count: number, smsList: string) => void,
  ) => void;
};

function getSmsModule(): SmsAndroidModule | null {
  if (Platform.OS !== 'android') return null;
  const native = NativeModules.Sms as SmsAndroidModule | undefined;
  if (native && typeof native.list === 'function') return native;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-get-sms-android');
    const resolved = (mod?.default || mod) as SmsAndroidModule | null;
    if (resolved && typeof resolved.list === 'function') return resolved;
  } catch {
    // not linked in this binary
  }
  return null;
}

/** True only when the native SMS bridge is present in this installed APK. */
export function isSmsInboxSupported(): boolean {
  return Platform.OS === 'android' && !!getSmsModule();
}

export async function requestSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_SMS,
      {
        title: 'Read bank SMS',
        message:
          'Pulse Wallet reads credit and debit SMS on this phone to create transactions. Messages never leave your device.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

export async function hasSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
  } catch {
    return false;
  }
}

/**
 * Read Android SMS inbox from the last `lookbackDays` days.
 * Requires a development/production build that includes react-native-get-sms-android.
 */
export async function listRecentSms(lookbackDays = 14, maxCount = 400): Promise<{
  messages: RawImportMessage[];
  error: string | null;
}> {
  if (Platform.OS !== 'android') {
    return { messages: [], error: 'Automatic SMS import is available on Android only.' };
  }
  const SmsAndroid = getSmsModule();
  if (!SmsAndroid?.list) {
    return {
      messages: [],
      error: 'SMS_MODULE_MISSING',
    };
  }

  const allowed = (await hasSmsPermission()) || (await requestSmsPermission());
  if (!allowed) {
    return { messages: [], error: 'SMS permission was denied. Enable it in system Settings to import.' };
  }

  const minDate = Date.now() - Math.max(1, lookbackDays) * 24 * 60 * 60 * 1000;
  const filter = {
    box: 'inbox',
    maxCount: Math.min(800, Math.max(50, maxCount)),
    indexFrom: 0,
  };

  return new Promise((resolve) => {
    try {
      SmsAndroid.list(
        JSON.stringify(filter),
        (fail: string) => {
          resolve({ messages: [], error: fail || 'Could not read SMS.' });
        },
        (_count: number, smsList: string) => {
          try {
            const rows = JSON.parse(smsList || '[]') as Array<{
              _id?: string | number;
              address?: string;
              body?: string;
              date?: string | number;
            }>;
            const messages: RawImportMessage[] = [];
            for (const row of rows) {
              const dateMs = Number(row.date);
              if (Number.isFinite(dateMs) && dateMs > 0 && dateMs < minDate) continue;
              const body = String(row.body || '').trim();
              if (!body) continue;
              messages.push({
                id: row._id != null ? String(row._id) : undefined,
                body,
                address: String(row.address || ''),
                date: Number.isFinite(dateMs) && dateMs > 0 ? dateMs : undefined,
                sourceLabel: String(row.address || 'SMS'),
              });
            }
            resolve({ messages, error: null });
          } catch {
            resolve({ messages: [], error: 'Could not parse SMS list.' });
          }
        },
      );
    } catch (e) {
      resolve({
        messages: [],
        error: e instanceof Error ? e.message : 'SMS read failed.',
      });
    }
  });
}
