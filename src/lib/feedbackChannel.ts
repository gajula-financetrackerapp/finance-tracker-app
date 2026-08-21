import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase, isSupabaseConfigured } from './supabase';
import type { TranslationKey } from '../i18n/translations';

/**
 * One way out of the app for everything a user tells us — the Feedback screen
 * and the Report / Request sheets on Home all hand their text to this.
 *
 * The message is stored on the server and read by an admin inside the app. It
 * used to be handed to a mailto: link, which meant Submit only opened Gmail and
 * left the actual sending to the user; a message they never posted was a message
 * we never had.
 *
 * The write goes through submit_feedback, which is the only door into the table:
 * see supabase/feedback.sql. The caller supplies the topic and the words, and
 * nothing else — the account, the time and the status are the server's to decide.
 */
export type FeedbackTopic = 'bug' | 'idea' | 'other';

export type FeedbackSendResult =
  | 'sent'
  | 'notSignedIn'
  | 'tooShort'
  | 'tooMany'
  | 'notConfigured'
  | 'failed';

const SQL_HINT = 'In Supabase SQL Editor, run the full file supabase/feedback.sql.';

function missingOnServer(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('could not find') ||
    lower.includes('schema cache') ||
    lower.includes('does not exist')
  );
}

export async function sendFeedbackMessage(input: {
  topic: FeedbackTopic;
  message: string;
}): Promise<FeedbackSendResult> {
  const text = (input.message || '').trim();
  if (text.length < 5) return 'tooShort';
  if (!isSupabaseConfigured) return 'notConfigured';

  const version = Constants.expoConfig?.version || Constants.nativeAppVersion || '1.0.0';

  const { error } = await supabase.rpc('submit_feedback', {
    p_topic: input.topic,
    p_message: text,
    p_app_version: version,
    p_platform: `${Platform.OS} ${Platform.Version}`,
  });
  if (!error) return 'sent';

  const msg = (error.message || '').toLowerCase();
  if (msg.includes('not authenticated')) return 'notSignedIn';
  if (msg.includes('too many')) return 'tooMany';
  if (msg.includes('too short')) return 'tooShort';
  if (missingOnServer(msg)) {
    console.warn(`[feedback] server is not ready. ${SQL_HINT}`);
    return 'notConfigured';
  }
  console.warn('[feedback] could not send', error.message);
  return 'failed';
}

/** What to tell the user when the message did not go. */
export function feedbackFailureKey(result: FeedbackSendResult): TranslationKey {
  if (result === 'notSignedIn') return 'feedback.signInFirst';
  if (result === 'tooShort') return 'feedback.tooShort';
  if (result === 'tooMany') return 'feedback.tooMany';
  if (result === 'notConfigured') return 'feedback.notConfigured';
  return 'feedback.sendFailed';
}

export type FeedbackMessage = {
  id: number;
  userId: string | null;
  email: string | null;
  fullName: string | null;
  topic: FeedbackTopic;
  message: string;
  appVersion: string | null;
  platform: string | null;
  status: 'new' | 'done';
  createdAt: string | null;
};

/** How many messages each filter would hold. */
export type FeedbackCounts = {
  total: number;
  unread: number;
  done: number;
  bug: number;
  idea: number;
  other: number;
};

export const EMPTY_FEEDBACK_COUNTS: FeedbackCounts = {
  total: 0,
  unread: 0,
  done: 0,
  bug: 0,
  idea: 0,
  other: 0,
};

/** One page of the inbox, newest first. */
export async function listFeedbackMessages(query?: {
  status?: 'new' | 'done';
  topic?: FeedbackTopic;
  /** Ask for what comes after the oldest row already held. */
  beforeId?: number;
  limit?: number;
}): Promise<{
  messages: FeedbackMessage[];
  error: string | null;
}> {
  if (!isSupabaseConfigured) return { messages: [], error: 'Cloud is not configured.' };
  const { data, error } = await supabase.rpc('admin_list_feedback', {
    p_limit: query?.limit ?? 50,
    p_status: query?.status ?? null,
    p_topic: query?.topic ?? null,
    p_before_id: query?.beforeId ?? null,
  });
  if (error) {
    const msg = error.message || 'Could not load messages';
    return { messages: [], error: missingOnServer(msg) ? `${msg}\n\n${SQL_HINT}` : msg };
  }
  const rows = Array.isArray(data) ? data : [];
  return {
    error: null,
    messages: rows.map((row: Record<string, unknown>) => ({
      id: Number(row.id || 0),
      userId: (row.user_id as string) || null,
      email: (row.email as string) || null,
      fullName: (row.full_name as string) || null,
      topic: (row.topic as FeedbackTopic) || 'other',
      message: String(row.message || ''),
      appVersion: (row.app_version as string) || null,
      platform: (row.platform as string) || null,
      status: row.status === 'done' ? 'done' : 'new',
      createdAt: (row.created_at as string) || null,
    })),
  };
}

/** Admin: the numbers on the filter chips. */
export async function feedbackCounts(): Promise<{
  counts: FeedbackCounts;
  error: string | null;
}> {
  if (!isSupabaseConfigured) {
    return { counts: EMPTY_FEEDBACK_COUNTS, error: 'Cloud is not configured.' };
  }
  const { data, error } = await supabase.rpc('admin_feedback_counts');
  if (error) {
    const msg = error.message || 'Could not count messages';
    return {
      counts: EMPTY_FEEDBACK_COUNTS,
      error: missingOnServer(msg) ? `${msg}\n\n${SQL_HINT}` : msg,
    };
  }
  const row = (data || {}) as Record<string, unknown>;
  const num = (value: unknown) => Number(value || 0);
  return {
    error: null,
    counts: {
      total: num(row.total),
      unread: num(row.unread),
      done: num(row.done),
      bug: num(row.bug),
      idea: num(row.idea),
      other: num(row.other),
    },
  };
}

/** Admin: dealt with, or back to new. */
export async function setFeedbackStatus(
  id: number,
  status: 'new' | 'done',
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured) return { error: 'Cloud is not configured.' };
  const { error } = await supabase.rpc('admin_set_feedback_status', {
    p_id: id,
    p_status: status,
  });
  return { error: error ? error.message || 'Could not update the message' : null };
}

/** Admin: throw one away. */
export async function deleteFeedbackMessage(id: number): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured) return { error: 'Cloud is not configured.' };
  const { error } = await supabase.rpc('admin_delete_feedback', { p_id: id });
  return { error: error ? error.message || 'Could not delete the message' : null };
}
