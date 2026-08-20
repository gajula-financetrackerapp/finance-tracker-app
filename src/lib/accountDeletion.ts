import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from './supabase';
import { forgetUserWorkspace } from '../storage';

/**
 * Asking for an account to be deleted.
 *
 * The app can turn an account off but not remove it: deleting a row in
 * auth.users is an admin's job, and handing that reach to a published anon key
 * would be handing it to everyone. So a request does two things — the account is
 * disabled at once, which is what the person leaving actually cares about, and it
 * joins a queue an admin works through in Supabase.
 *
 * See supabase/account_deletion.sql for the server half.
 */

export type DeletionReasonCode =
  | 'another_app'
  | 'missing_features'
  | 'too_many_bugs'
  | 'privacy'
  | 'too_expensive'
  | 'not_needed'
  | 'other';

export const DELETION_REASON_CODES: DeletionReasonCode[] = [
  'another_app',
  'missing_features',
  'too_many_bugs',
  'privacy',
  'too_expensive',
  'not_needed',
  'other',
];

const SQL_HINT = 'In Supabase SQL Editor, run the full file supabase/account_deletion.sql.';

function missingOnServer(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('could not find') ||
    lower.includes('schema cache') ||
    lower.includes('does not exist')
  );
}

export async function requestAccountDeletion(input: {
  reasonCode: DeletionReasonCode | 'unsaid';
  note?: string;
}): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured) return { error: 'Cloud is not configured.' };

  const { error } = await supabase.rpc('request_account_deletion', {
    reason_code: input.reasonCode || 'unsaid',
    note: (input.note || '').trim() || null,
  });
  if (!error) return { error: null };

  const msg = error.message || 'Could not send the request';
  if (missingOnServer(msg)) return { error: `${msg}\n\n${SQL_HINT}` };
  if (msg.toLowerCase().includes('last admin')) {
    return {
      error:
        'This is the only admin account, so it cannot be closed from here. Make another account an admin first.',
    };
  }
  return { error: msg };
}

/**
 * Whether this account has been turned off.
 *
 * Answered as "no" whenever the server cannot be reached or has not run the SQL
 * yet: a network blip is not grounds for throwing someone out of their own app.
 */
export async function isMyAccountDisabled(): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const { data, error } = await supabase.rpc('my_account_disabled');
  if (error) {
    if (!missingOnServer(error.message || '')) {
      console.warn('[account] disabled check failed', error.message);
    }
    return false;
  }
  return data === true;
}

export type DeletionRequest = {
  userId: string;
  email: string | null;
  fullName: string | null;
  reasonCode: string;
  note: string | null;
  wasPremium: boolean;
  requestedAt: string | null;
};

/** Admin: the queue of accounts waiting to be removed. */
export async function listDeletionRequests(): Promise<{
  requests: DeletionRequest[];
  error: string | null;
}> {
  if (!isSupabaseConfigured) return { requests: [], error: 'Cloud is not configured.' };
  const { data, error } = await supabase.rpc('admin_list_deletion_requests');
  if (error) {
    const msg = error.message || 'Could not load requests';
    return { requests: [], error: missingOnServer(msg) ? `${msg}\n\n${SQL_HINT}` : msg };
  }
  const rows = Array.isArray(data) ? data : [];
  return {
    error: null,
    requests: rows.map((row: Record<string, unknown>) => ({
      userId: String(row.user_id || ''),
      email: (row.email as string) || null,
      fullName: (row.full_name as string) || null,
      reasonCode: String(row.reason_code || 'unsaid'),
      note: (row.note as string) || null,
      wasPremium: !!row.was_premium,
      requestedAt: (row.requested_at as string) || null,
    })),
  };
}

/** Admin: put an account back, for a request made by mistake. */
export async function restoreAccount(userId: string): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured) return { error: 'Cloud is not configured.' };
  if (!userId) return { error: 'Missing user id.' };
  const { error } = await supabase.rpc('admin_restore_account', { target_id: userId });
  if (!error) return { error: null };
  const msg = error.message || 'Could not restore the account';
  return { error: missingOnServer(msg) ? `${msg}\n\n${SQL_HINT}` : msg };
}

/** Device-level bookkeeping that belongs to whoever was signed in. */
const PERSONAL_DEVICE_KEYS = [
  'ft_session_v1',
  '@pulse/import_seen_v1',
  '@pulse/sms_import_prompt_v1',
  '@pulse/auto_import_last_v1',
];

/**
 * Leave nothing of this account on the phone.
 *
 * The cloud copy waits for an admin, but the person asked to be gone, so the
 * device should not still be showing their money to whoever picks it up next.
 */
export async function wipeAccountFromDevice(userId: string): Promise<void> {
  await forgetUserWorkspace(userId);
  await Promise.all(
    [...PERSONAL_DEVICE_KEYS, userId ? `ft_data_v1_${userId}` : null]
      .filter((key): key is string => !!key)
      .map((key) => AsyncStorage.removeItem(key).catch(() => undefined)),
  );
}
