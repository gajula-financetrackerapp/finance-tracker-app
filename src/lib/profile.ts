import { supabase, isSupabaseConfigured, type Profile } from './supabase';

export async function fetchUserProfile(userId: string): Promise<Profile | null> {
  if (!isSupabaseConfigured || !userId) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.warn('[profile] fetch failed', error.message);
    return null;
  }
  return data as Profile | null;
}

/** Ensure a profiles row exists (covers signups before the DB trigger ran). */
export async function ensureUserProfile(input: {
  userId: string;
  email?: string | null;
  fullName?: string | null;
}): Promise<Profile | null> {
  const existing = await fetchUserProfile(input.userId);
  if (existing) return existing;

  const email = input.email || '';
  const fullName =
    input.fullName?.trim() || email.split('@')[0] || 'User';

  const { error } = await supabase.from('profiles').upsert({
    id: input.userId,
    email,
    full_name: fullName,
    role: 'user',
  });
  if (error) {
    console.warn('[profile] ensure failed', error.message);
    return null;
  }
  return fetchUserProfile(input.userId);
}

/** Update display name in `profiles` (+ auth metadata). Email is never changed. */
export async function updateUserFullName(
  userId: string,
  fullName: string,
): Promise<string | null> {
  const name = fullName.trim();
  if (!name) return 'Name is required';
  if (!isSupabaseConfigured) return 'Supabase is not configured';

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: name,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    console.warn('[profile] update failed', error.message);
    return error.message;
  }

  // Best-effort: keep auth user_metadata in sync (does not change login email).
  try {
    await supabase.auth.updateUser({ data: { full_name: name } });
  } catch (err) {
    console.warn('[profile] auth metadata update skipped', err);
  }

  return null;
}
