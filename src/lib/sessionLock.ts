import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { supabase, isSupabaseConfigured } from './supabase';
import { uid } from '../utils';

const SESSION_KEY = 'pulse_active_session_id_v1';

async function readLocalSessionId(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return localStorage.getItem(SESSION_KEY);
    return SecureStore.getItemAsync(SESSION_KEY);
  } catch {
    return null;
  }
}

async function writeLocalSessionId(id: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      localStorage.setItem(SESSION_KEY, id);
      return;
    }
    await SecureStore.setItemAsync(SESSION_KEY, id);
  } catch {
    /* ignore */
  }
}

export async function clearLocalSessionId(): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      localStorage.removeItem(SESSION_KEY);
      return;
    }
    await SecureStore.deleteItemAsync(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** Claim this device as the only active session (forces others out). */
export async function claimExclusiveSession(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const sessionId = uid() + uid();
  await writeLocalSessionId(sessionId);

  const { error } = await supabase.rpc('claim_session', { session_id: sessionId });
  if (error) {
    console.warn('[session] claim_session RPC failed', error.message);
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) return sessionId;
    const { error: upErr } = await supabase
      .from('profiles')
      .update({ active_session_id: sessionId, updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (upErr) console.warn('[session] fallback claim failed', upErr.message);
  }
  return sessionId;
}

/** Returns false if another device took over the session. */
export async function verifyExclusiveSession(): Promise<boolean> {
  if (!isSupabaseConfigured) return true;
  const localId = await readLocalSessionId();
  if (!localId) return true;

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return true;

  const { data, error } = await supabase
    .from('profiles')
    .select('active_session_id')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.warn('[session] verify failed', error.message);
    return true;
  }
  const remote = (data as { active_session_id?: string | null } | null)?.active_session_id;
  if (!remote) return true;
  return remote === localId;
}
