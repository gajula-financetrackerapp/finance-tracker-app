import { NativeModules, Platform, PermissionsAndroid } from 'react-native';
import type { RawImportMessage } from './importRules';
import { tr } from '../i18n/translations';

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
        title: tr('import.smsPermTitle'),
        message: tr('import.smsPermBody'),
        buttonPositive: tr('common.allow'),
        buttonNegative: tr('common.deny'),
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

type InboxRow = {
  _id?: string | number;
  address?: string;
  body?: string;
  date?: string | number;
};

function listSmsChunk(
  SmsAndroid: SmsAndroidModule,
  indexFrom: number,
  maxCount: number,
): Promise<{ rows: InboxRow[]; error: string | null }> {
  return new Promise((resolve) => {
    try {
      SmsAndroid.list(
        JSON.stringify({ box: 'inbox', indexFrom, maxCount }),
        (fail: string) => {
          resolve({ rows: [], error: fail || tr('import.smsReadFailed') });
        },
        (_count: number, smsList: string) => {
          try {
            resolve({ rows: JSON.parse(smsList || '[]') as InboxRow[], error: null });
          } catch {
            resolve({ rows: [], error: tr('import.smsParseFailed') });
          }
        },
      );
    } catch (e) {
      resolve({
        rows: [],
        error: e instanceof Error ? e.message : tr('import.smsReadFailed'),
      });
    }
  });
}

/**
 * Read Android SMS inbox for a calendar time window.
 * Pages through the native inbox so older card SMS in the window are not dropped.
 * Requires a development/production build that includes react-native-get-sms-android.
 */
export async function listRecentSms(
  minDateMs: number,
  maxDateMs: number,
  maxCount = 400,
): Promise<{
  messages: RawImportMessage[];
  error: string | null;
}> {
  if (Platform.OS !== 'android') {
    return { messages: [], error: tr('import.smsAndroidOnly') };
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
    return { messages: [], error: 'SMS_PERMISSION_DENIED' };
  }

  const minDate = Number.isFinite(minDateMs) ? minDateMs : 0;
  const maxDate = Number.isFinite(maxDateMs) ? maxDateMs : Date.now();
  const pageSize = 250;
  const hardCap = Math.min(3000, Math.max(pageSize, maxCount));
  const messages: RawImportMessage[] = [];
  const seen = new Set<string>();
  let indexFrom = 0;
  let lastError: string | null = null;

  while (indexFrom < hardCap) {
    const take = Math.min(pageSize, hardCap - indexFrom);
    const page = await listSmsChunk(SmsAndroid, indexFrom, take);
    if (page.error) {
      lastError = page.error;
      break;
    }
    const rows = page.rows || [];
    if (!rows.length) break;
    let allOlderThanWindow = true;
    for (const row of rows) {
      const dateMs = Number(row.date);
      const hasDate = Number.isFinite(dateMs) && dateMs > 0;
      if (hasDate && dateMs >= minDate) allOlderThanWindow = false;
      if (hasDate && (dateMs < minDate || dateMs > maxDate)) continue;
      const body = String(row.body || '').trim();
      if (!body) continue;
      const id = row._id != null ? String(row._id) : `${row.address || ''}|${dateMs}|${body.slice(0, 24)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      messages.push({
        id: row._id != null ? String(row._id) : undefined,
        body,
        address: String(row.address || ''),
        date: hasDate ? dateMs : undefined,
        sourceLabel: String(row.address || 'SMS'),
      });
    }
    if (rows.length < take) break;
    if (allOlderThanWindow && rows.every((row) => Number(row.date) > 0)) break;
    indexFrom += rows.length;
  }

  return { messages, error: messages.length ? null : lastError };
}
